/**
 * Blender Export Module
 *
 * Exports Pictorigo projects to a Blender Python script that recreates:
 * - World points as mesh vertices
 * - Lines as mesh edges
 * - Cameras with correct pose and intrinsics
 * - Background images for each camera
 *
 * Coordinate system conversion:
 * - Pictorigo: Y-up, XZ ground plane (right-handed)
 * - Blender: Z-up, XY ground plane (right-handed)
 * - Conversion: swap Y and Z axes
 */

import JSZip from 'jszip'
import type { Project } from '../entities/project'
import type { WorldPoint } from '../entities/world-point'
import type { Line } from '../entities/line'
import type { Viewpoint } from '../entities/viewpoint'
import { showToast } from '../utils/toast'
import { checkAxisSigns } from '../optimization/coordinate-transforms'

interface BlenderExportOptions {
  /** Include construction geometry lines */
  includeConstructionLines?: boolean
  /** Export cameras */
  exportCameras?: boolean
  /** Export background images for cameras */
  exportBackgroundImages?: boolean
  /** Base path for image files (relative paths in Blender) */
  imageBasePath?: string
  /** Scale factor for the scene */
  scaleFactor?: number
}

const DEFAULT_OPTIONS: BlenderExportOptions = {
  includeConstructionLines: false,
  exportCameras: true,
  exportBackgroundImages: true,
  imageBasePath: '//',
  scaleFactor: 1.0
}

/**
 * Convert Pictorigo Y-up coordinates to Blender Z-up coordinates.
 * Conversion: [x, y, z] → [x, z, -y]
 */
function toBlenderCoords(
  xyz: [number, number, number],
  scale: number,
  flips: { flipX: boolean; flipY: boolean; flipZ: boolean }
): [number, number, number] {
  // Apply axis flips first (correct for inverted axes in optimization result)
  let [x, y, z] = xyz
  if (flips.flipX) x = -x
  if (flips.flipY) y = -y
  if (flips.flipZ) z = -z

  // Pictorigo: [X, Y, Z] with Y up
  // Blender:   [X, Y, Z] with Z up
  // Conversion: X stays, Z→Y (forward), -Y→Z (up negated due to handedness)
  return [x * scale, z * scale, -y * scale]
}

/**
 * Convert Pictorigo camera quaternion to Blender camera quaternion.
 *
 * Uses direction-vector approach:
 * 1. Extract look and up directions from Pictorigo quaternion
 * 2. Convert directions to Blender coordinate system
 * 3. Build Blender rotation matrix from these directions
 * 4. Convert to quaternion
 *
 * @param quat The stored quaternion [w, x, y, z] (world→camera in Y-up)
 * @param isZReflected If true, camera convention is different (currently unused but reserved)
 * @param flips Axis flips detected from optimization
 */
function toBlenderCameraQuaternion(
  quat: [number, number, number, number],
  isZReflected: boolean,
  flips: { flipX: boolean; flipY: boolean; flipZ: boolean }
): [number, number, number, number] {
  // Apply axis flips to quaternion components first
  let [w, x, y, z] = quat
  if (flips.flipX) x = -x
  if (flips.flipY) y = -y
  if (flips.flipZ) z = -z

  // Invert quaternion (world→camera becomes camera→world)
  const qInv: [number, number, number, number] = [w, -x, -y, -z]

  // Extract look direction: Q^(-1) * (0, 0, -1) - camera looks at -Z
  const lookPict = rotateVectorByQuaternion([0, 0, -1], qInv)

  // Extract up direction: Q^(-1) * (0, 1, 0)
  const upPict = rotateVectorByQuaternion([0, 1, 0], qInv)

  // Convert directions to Blender coordinates: [x, y, z] → [x, z, -y]
  // But for up vector, don't negate Y - the -y is a reflection that would flip camera upside down
  const lookBlend: [number, number, number] = [lookPict[0], lookPict[2], -lookPict[1]]
  const upBlend: [number, number, number] = [upPict[0], upPict[2], upPict[1]]  // No negation for up

  // Build rotation matrix for Blender camera
  const forward = normalize(lookBlend)

  // Orthogonalize: right = forward × up
  let right = cross(forward, upBlend)
  const rightLen = length(right)
  if (rightLen < 0.001) {
    // Degenerate case: use fallback up
    right = cross(forward, [0, 0, 1])
    if (length(right) < 0.001) {
      right = cross(forward, [0, 1, 0])
    }
  }
  right = normalize(right)

  // Recompute up to be perpendicular
  const up = normalize(cross(right, forward))

  // Build rotation matrix and convert to quaternion
  // Matrix columns: X=right, Y=up, Z=-forward
  // For Blender camera: local -Z becomes 'forward' in world space
  return matrixToQuaternion(right, up, [-forward[0], -forward[1], -forward[2]])
}

// Vector math helpers
type Vec3 = [number, number, number]

function rotateVectorByQuaternion(v: Vec3, q: [number, number, number, number]): Vec3 {
  const [w, qx, qy, qz] = q
  const [vx, vy, vz] = v

  // Quaternion rotation: q * v * q^(-1)
  // Using the formula: v' = v + 2*w*(q_xyz × v) + 2*(q_xyz × (q_xyz × v))
  const cx = qy * vz - qz * vy
  const cy = qz * vx - qx * vz
  const cz = qx * vy - qy * vx

  const cx2 = qy * cz - qz * cy
  const cy2 = qz * cx - qx * cz
  const cz2 = qx * cy - qy * cx

  return [
    vx + 2 * (w * cx + cx2),
    vy + 2 * (w * cy + cy2),
    vz + 2 * (w * cz + cz2)
  ]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
}

function length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
}

function normalize(v: Vec3): Vec3 {
  const len = length(v)
  if (len < 0.0001) return [0, 0, 1]
  return [v[0] / len, v[1] / len, v[2] / len]
}

function matrixToQuaternion(col0: Vec3, col1: Vec3, col2: Vec3): [number, number, number, number] {
  // Convert 3x3 rotation matrix to quaternion
  // Matrix columns are: col0=X, col1=Y, col2=Z
  const m00 = col0[0], m10 = col0[1], m20 = col0[2]
  const m01 = col1[0], m11 = col1[1], m21 = col1[2]
  const m02 = col2[0], m12 = col2[1], m22 = col2[2]

  const trace = m00 + m11 + m22

  let w: number, x: number, y: number, z: number

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0)
    w = 0.25 / s
    x = (m21 - m12) * s
    y = (m02 - m20) * s
    z = (m10 - m01) * s
  } else if (m00 > m11 && m00 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22)
    w = (m21 - m12) / s
    x = 0.25 * s
    y = (m01 + m10) / s
    z = (m02 + m20) / s
  } else if (m11 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22)
    w = (m02 - m20) / s
    x = (m01 + m10) / s
    y = 0.25 * s
    z = (m12 + m21) / s
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11)
    w = (m10 - m01) / s
    x = (m02 + m20) / s
    y = (m12 + m21) / s
    z = 0.25 * s
  }

  // Normalize
  const len = Math.sqrt(w * w + x * x + y * y + z * z)
  return [w / len, x / len, y / len, z / len]
}

/**
 * Generate Blender Python script for importing a Pictorigo project
 */
export function generateBlenderScript(project: Project, options: BlenderExportOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const scale = opts.scaleFactor!

  // Collect world points with valid coordinates
  const worldPoints = Array.from(project.worldPoints).filter(wp => wp.optimizedXyz)
  const pointIndexMap = new Map<WorldPoint, number>()
  worldPoints.forEach((wp, idx) => pointIndexMap.set(wp, idx))

  // Detect axis flips from optimization result
  const flips = checkAxisSigns(worldPoints)

  // Collect lines (optionally filter out construction lines)
  const lines = Array.from(project.lines).filter(line => {
    if (!opts.includeConstructionLines && line.isConstruction) return false
    return pointIndexMap.has(line.pointA) && pointIndexMap.has(line.pointB)
  })

  // Collect viewpoints
  const viewpoints = opts.exportCameras ? Array.from(project.viewpoints) : []

  // Build the Python script
  const scriptParts: string[] = []

  // Header
  scriptParts.push(`"""
Pictorigo Export for Blender
Project: ${escapeString(project.name)}
Generated: ${new Date().toISOString()}

Axis flips detected: X=${flips.flipX}, Y=${flips.flipY}, Z=${flips.flipZ}

This script imports a photogrammetry reconstruction from Pictorigo.
Run this script in Blender to recreate the 3D model and camera setup.

Usage:
1. Open Blender
2. Go to Scripting workspace
3. Open or paste this script
4. Run the script (Alt+P or click "Run Script")

The script will create:
- A mesh object with vertices (world points) and edges (lines)
- Camera objects with background images
- A collection to organize everything
"""

import bpy
import math
from mathutils import Vector, Quaternion, Matrix

# Clear existing Pictorigo data (optional - comment out to keep existing)
def clear_pictorigo_data():
    # Remove existing Pictorigo collection if it exists
    if "Pictorigo" in bpy.data.collections:
        collection = bpy.data.collections["Pictorigo"]
        for obj in collection.objects:
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(collection)

clear_pictorigo_data()

# Create a new collection for the imported data
pictorigo_collection = bpy.data.collections.new("Pictorigo")
bpy.context.scene.collection.children.link(pictorigo_collection)

`)

  // World points data
  scriptParts.push(`# ============================================================================
# World Points
# ============================================================================

world_points = [
`)

  for (const wp of worldPoints) {
    const coords = toBlenderCoords(wp.optimizedXyz!, scale, flips)
    scriptParts.push(`    # ${escapeString(wp.name)}
    (${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}, ${coords[2].toFixed(6)}),
`)
  }

  scriptParts.push(`]

point_names = [
`)

  for (const wp of worldPoints) {
    scriptParts.push(`    "${escapeString(wp.name)}",
`)
  }

  scriptParts.push(`]

point_colors = [
`)

  for (const wp of worldPoints) {
    const color = hexToRgb(wp.color)
    scriptParts.push(`    (${color[0].toFixed(3)}, ${color[1].toFixed(3)}, ${color[2].toFixed(3)}),
`)
  }

  scriptParts.push(`]

`)

  // Lines data
  scriptParts.push(`# ============================================================================
# Lines (Edges)
# ============================================================================

edges = [
`)

  for (const line of lines) {
    const idxA = pointIndexMap.get(line.pointA)!
    const idxB = pointIndexMap.get(line.pointB)!
    scriptParts.push(`    # ${escapeString(line.name)}
    (${idxA}, ${idxB}),
`)
  }

  scriptParts.push(`]

line_names = [
`)

  for (const line of lines) {
    scriptParts.push(`    "${escapeString(line.name)}",
`)
  }

  scriptParts.push(`]

`)

  // Create mesh
  scriptParts.push(`# ============================================================================
# Create Mesh
# ============================================================================

def create_mesh():
    # Create mesh data
    mesh = bpy.data.meshes.new("Pictorigo_Mesh")
    mesh.from_pydata(world_points, edges, [])
    mesh.update()

    # Create object
    obj = bpy.data.objects.new("Pictorigo_Model", mesh)
    pictorigo_collection.objects.link(obj)

    # Create vertex groups for each point (useful for rigging/animation)
    for i, name in enumerate(point_names):
        vg = obj.vertex_groups.new(name=name)
        vg.add([i], 1.0, 'REPLACE')

    return obj

model_obj = create_mesh()

# Create empties at each world point (for easier selection/manipulation)
def create_point_empties():
    empties = []
    for i, (pos, name, color) in enumerate(zip(world_points, point_names, point_colors)):
        empty = bpy.data.objects.new(f"WP_{name}", None)
        empty.empty_display_type = 'SPHERE'
        empty.empty_display_size = 0.1
        empty.location = pos
        # Store color as custom property
        empty["color"] = color
        pictorigo_collection.objects.link(empty)
        empties.append(empty)
    return empties

point_empties = create_point_empties()

`)

  // Cameras
  if (viewpoints.length > 0) {
    scriptParts.push(`# ============================================================================
# Cameras
# ============================================================================

cameras_data = [
`)

    // Add real cameras
    for (const vp of viewpoints) {
      const pos = toBlenderCoords(vp.position, scale, flips)
      const rot = toBlenderCameraQuaternion(vp.rotation, vp.isZReflected, flips)

      // Calculate sensor dimensions for Blender
      // Blender uses sensor_width in mm and focal length in mm
      // We'll use a standard 36mm sensor width and calculate focal length accordingly
      const sensorWidth = 36.0  // mm (full frame equivalent)
      const sensorHeight = sensorWidth * (vp.imageHeight / vp.imageWidth)  // Match image aspect ratio
      const focalLengthMm = (vp.focalLength / vp.imageWidth) * sensorWidth

      // Principal point: convert from pixel coords to Blender shift
      // Image Y goes down (0=top), Blender shift_y goes up (positive = up)
      // shift = (pp / size) - 0.5, but Y needs to be flipped
      const shiftX = (vp.principalPointX / vp.imageWidth) - 0.5
      const shiftY = 0.5 - (vp.principalPointY / vp.imageHeight)  // Flipped for Y-down to Y-up

      scriptParts.push(`    {
        "name": "${escapeString(vp.name)}",
        "filename": "${escapeString(vp.filename)}",
        "position": (${pos[0].toFixed(6)}, ${pos[1].toFixed(6)}, ${pos[2].toFixed(6)}),
        "rotation": (${rot[0].toFixed(6)}, ${rot[1].toFixed(6)}, ${rot[2].toFixed(6)}, ${rot[3].toFixed(6)}),
        "focal_length": ${focalLengthMm.toFixed(4)},
        "sensor_width": ${sensorWidth.toFixed(1)},
        "sensor_height": ${sensorHeight.toFixed(4)},
        "image_width": ${vp.imageWidth},
        "image_height": ${vp.imageHeight},
        "shift_x": ${shiftX.toFixed(6)},
        "shift_y": ${shiftY.toFixed(6)},
${opts.exportBackgroundImages ? `        "image_path": "${escapeString(opts.imageBasePath + vp.filename)}",
` : ''}    },
`)
    }

    scriptParts.push(`]

def create_cameras():
    cameras = []
    for cam_data in cameras_data:
        # Create camera data
        cam = bpy.data.cameras.new(cam_data["name"])
        cam.lens = cam_data["focal_length"]
        cam.sensor_width = cam_data["sensor_width"]
        cam.sensor_height = cam_data["sensor_height"]
        cam.sensor_fit = 'AUTO'  # Let Blender choose based on aspect ratio

        # Set principal point offset (shift)
        # Pre-computed with correct Y-flip for image coords -> Blender coords
        cam.shift_x = cam_data["shift_x"]
        cam.shift_y = cam_data["shift_y"]

        # Create camera object
        cam_obj = bpy.data.objects.new(cam_data["name"], cam)
        pictorigo_collection.objects.link(cam_obj)

        # Set position
        cam_obj.location = cam_data["position"]

        # Set rotation from quaternion
        # Blender quaternion is (w, x, y, z)
        cam_obj.rotation_mode = 'QUATERNION'
        cam_obj.rotation_quaternion = cam_data["rotation"]

        # Set render resolution to match this camera's image (for texture extraction)
        # This ensures the background image aligns perfectly with the render
        bpy.context.scene.render.resolution_x = cam_data["image_width"]
        bpy.context.scene.render.resolution_y = cam_data["image_height"]
        bpy.context.scene.render.resolution_percentage = 100

`)

    if (opts.exportBackgroundImages) {
      scriptParts.push(`        # Set up background image
        if "image_path" in cam_data:
            cam.show_background_images = True
            bg = cam.background_images.new()

            # Try to load the image
            image_path = cam_data["image_path"]
            try:
                # Check if image already loaded
                img = bpy.data.images.get(cam_data["filename"])
                if img is None:
                    img = bpy.data.images.load(image_path)
                bg.image = img
                bg.alpha = 0.5
                bg.display_depth = 'BACK'
                bg.frame_method = 'FIT'
            except Exception as e:
                print(f"Could not load background image: {image_path}")
                print(f"Error: {e}")
                print(f"You can manually set the background image in Camera Properties > Background Images")

`)
    }

    scriptParts.push(`        cameras.append(cam_obj)

    return cameras

camera_objects = create_cameras()

`)
  }

  // Final setup
  scriptParts.push(`# ============================================================================
# Final Setup
# ============================================================================

# Select the model object
bpy.context.view_layer.objects.active = model_obj
model_obj.select_set(True)

# Frame all objects in view (compatible with Blender 2.8+)
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        for region in area.regions:
            if region.type == 'WINDOW':
                override = {'area': area, 'region': region}
                try:
                    # Blender 3.2+
                    with bpy.context.temp_override(**override):
                        bpy.ops.view3d.view_all(center=True)
                except AttributeError:
                    # Blender 2.8 - 3.1
                    bpy.ops.view3d.view_all(override, center=True)
                break
        break

print("=" * 60)
print("Pictorigo import complete!")
print(f"  - {len(world_points)} world points")
print(f"  - {len(edges)} edges")
${viewpoints.length > 0 ? `print(f"  - {len(cameras_data)} cameras")` : ''}
print("=" * 60)
`)

  // Add helper functions section
  scriptParts.push(`
# ============================================================================
# Helper Functions (for use in Blender console)
# ============================================================================

def select_point(name):
    """Select a world point empty by name"""
    for obj in point_empties:
        if name in obj.name:
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            return obj
    print(f"Point '{name}' not found")
    return None

def look_through_camera(name):
    """Set viewport to look through a camera by name"""
    for obj in camera_objects:
        if name in obj.name:
            for area in bpy.context.screen.areas:
                if area.type == 'VIEW_3D':
                    area.spaces[0].region_3d.view_perspective = 'CAMERA'
                    bpy.context.scene.camera = obj
                    return obj
    print(f"Camera '{name}' not found")
    return None

def list_points():
    """List all world point names"""
    for i, name in enumerate(point_names):
        print(f"{i}: {name}")

def list_cameras():
    """List all camera names"""
    for cam in cameras_data:
        print(cam["name"])

# Usage examples (run in Blender Python console):
# select_point("WP1")
# look_through_camera("Camera1")
# list_points()
# list_cameras()
`)

  return scriptParts.join('')
}

/**
 * Convert hex color to RGB tuple (0-1 range)
 */
function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (result) {
    return [
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255
    ]
  }
  return [1, 1, 1]  // Default white
}

/**
 * Escape string for Python
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
}

/**
 * Download the Blender script as a .py file (no images)
 */
export function downloadBlenderScript(project: Project, options: BlenderExportOptions = {}): void {
  const scriptOptions: BlenderExportOptions = {
    ...options,
    exportBackgroundImages: false
  }
  const script = generateBlenderScript(project, scriptOptions)
  const blob = new Blob([script], { type: 'text/x-python' })
  const filename = `${sanitizeFilename(project.name || 'project')}_blender.py`

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  showToast(`Blender script downloaded: ${filename}`)
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-z0-9\-_\s]/gi, '_').trim()
}

/**
 * Fetch image as blob from URL (handles blob URLs and data URLs)
 */
async function fetchImageAsBlob(url: string): Promise<Blob | null> {
  try {
    const response = await fetch(url)
    return await response.blob()
  } catch (e) {
    console.error(`Failed to fetch image: ${url}`, e)
    return null
  }
}

/**
 * Export Blender script and images.
 * Uses File System Access API if available (Chrome/Edge), otherwise falls back to zip download.
 */
export async function downloadBlenderToFolder(project: Project, options: BlenderExportOptions = {}): Promise<void> {
  const projectName = sanitizeFilename(project.name || 'project')
  const viewpoints = Array.from(project.viewpoints)

  // Try File System Access API first (Chrome/Edge)
  if ('showDirectoryPicker' in window) {
    try {
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads'
      })

      // Create images subdirectory
      const imagesDir = await dirHandle.getDirectoryHandle('images', { create: true })

      // Write images
      for (const vp of viewpoints) {
        if (!vp.url) continue
        const blob = await fetchImageAsBlob(vp.url)
        if (blob) {
          const fileHandle = await imagesDir.getFileHandle(vp.filename, { create: true })
          const writable = await fileHandle.createWritable()
          await writable.write(blob)
          await writable.close()
        }
      }

      // Generate and write script
      const scriptOptions: BlenderExportOptions = {
        ...options,
        imageBasePath: '//images/',
        exportBackgroundImages: true
      }
      const script = generateBlenderScript(project, scriptOptions)
      const scriptHandle = await dirHandle.getFileHandle(`${projectName}_blender.py`, { create: true })
      const scriptWritable = await scriptHandle.createWritable()
      await scriptWritable.write(script)
      await scriptWritable.close()

      const imageCount = viewpoints.filter(vp => vp.url).length
      showToast(`Blender export saved to "${dirHandle.name}" (${imageCount} images)`)
      return
    } catch (e) {
      // User cancelled - don't fall through to zip
      if (e instanceof DOMException && e.name === 'AbortError') {
        return
      }
      // Other error - fall through to zip
      console.log('Directory picker failed, falling back to zip:', e)
    }
  }

  // Fallback: download as zip
  const zip = new JSZip()
  const imagesFolder = zip.folder('images')

  // Add images to zip
  for (const vp of viewpoints) {
    if (!vp.url) continue
    const blob = await fetchImageAsBlob(vp.url)
    if (blob && imagesFolder) {
      imagesFolder.file(vp.filename, blob)
    }
  }

  // Generate and add script
  const scriptOptions: BlenderExportOptions = {
    ...options,
    imageBasePath: '//images/',
    exportBackgroundImages: true
  }
  const script = generateBlenderScript(project, scriptOptions)
  zip.file(`${projectName}_blender.py`, script)

  // Download zip
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${projectName}_blender.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  const imageCount = viewpoints.filter(vp => vp.url).length
  showToast(`Blender export downloaded as zip (${imageCount} images)`)
}

/**
 * Export project as .rotera file for import into Blender via the Rotera add-on.
 * Images are embedded as base64 data URLs, so everything is in one file.
 */
export async function downloadRoteraProject(project: Project): Promise<void> {
  const { Serialization } = await import('../entities/Serialization')
  const json = Serialization.serialize(project, { excludeImages: false })  // Include embedded images
  const blob = new Blob([json], { type: 'application/json' })
  const filename = `${sanitizeFilename(project.name || 'project')}.rotera`

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  showToast(`Rotera project exported: ${filename}`)
}

/**
 * Export project as .rotera file with images in a folder.
 * Uses File System Access API if available, otherwise falls back to zip.
 */
export async function downloadRoteraWithImages(project: Project): Promise<void> {
  const { Serialization } = await import('../entities/Serialization')
  const projectName = sanitizeFilename(project.name || 'project')
  const viewpoints = Array.from(project.viewpoints)

  // Try File System Access API first (Chrome/Edge)
  if ('showDirectoryPicker' in window) {
    try {
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads'
      })

      // Create images subdirectory
      const imagesDir = await dirHandle.getDirectoryHandle('images', { create: true })

      // Write images
      for (const vp of viewpoints) {
        if (!vp.url) continue
        const blob = await fetchImageAsBlob(vp.url)
        if (blob) {
          const fileHandle = await imagesDir.getFileHandle(vp.filename, { create: true })
          const writable = await fileHandle.createWritable()
          await writable.write(blob)
          await writable.close()
        }
      }

      // Write .rotera file
      const json = Serialization.serialize(project, { excludeImages: true })
      const roteraHandle = await dirHandle.getFileHandle(`${projectName}.rotera`, { create: true })
      const roteraWritable = await roteraHandle.createWritable()
      await roteraWritable.write(json)
      await roteraWritable.close()

      const imageCount = viewpoints.filter(vp => vp.url).length
      showToast(`Rotera project saved to "${dirHandle.name}" (${imageCount} images)`)
      return
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return
      }
      console.log('Directory picker failed, falling back to zip:', e)
    }
  }

  // Fallback: download as zip
  const zip = new JSZip()
  const imagesFolder = zip.folder('images')

  // Add images to zip
  for (const vp of viewpoints) {
    if (!vp.url) continue
    const blob = await fetchImageAsBlob(vp.url)
    if (blob && imagesFolder) {
      imagesFolder.file(vp.filename, blob)
    }
  }

  // Add .rotera file
  const json = Serialization.serialize(project, { excludeImages: true })
  zip.file(`${projectName}.rotera`, json)

  // Download zip
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${projectName}_rotera.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  const imageCount = viewpoints.filter(vp => vp.url).length
  showToast(`Rotera project downloaded as zip (${imageCount} images)`)
}
