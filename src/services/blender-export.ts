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

import type { Project } from '../entities/project'
import type { WorldPoint } from '../entities/world-point'
import type { Line } from '../entities/line'
import type { Viewpoint } from '../entities/viewpoint'

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
 * Convert Pictorigo Y-up coordinates to Blender Z-up coordinates
 */
function toBlenderCoords(xyz: [number, number, number], scale: number): [number, number, number] {
  // Pictorigo: [X, Y, Z] with Y up
  // Blender:   [X, Z, Y] with Z up (swap Y and Z, negate new Y for right-handedness)
  return [xyz[0] * scale, -xyz[2] * scale, xyz[1] * scale]
}

/**
 * Convert Pictorigo quaternion (Y-up) to Blender quaternion (Z-up)
 * Input quaternion is [w, x, y, z] representing rotation in Y-up system
 */
function toBlenderQuaternion(quat: [number, number, number, number]): [number, number, number, number] {
  const [w, x, y, z] = quat
  // Convert rotation from Y-up to Z-up coordinate system
  // This is equivalent to: R_blender = R_convert * R_pictorigo * R_convert^-1
  // Where R_convert rotates 90° around X axis
  // Simplified: swap y and z components, negate the new y
  return [w, x, -z, y]
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
    const coords = toBlenderCoords(wp.optimizedXyz!, scale)
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

    # Add custom properties for point names
    for i, name in enumerate(point_names):
        mesh.vertices[i]["pictorigo_name"] = name

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

    for (const vp of viewpoints) {
      const pos = toBlenderCoords(vp.position, scale)
      const rot = toBlenderQuaternion(vp.rotation)

      // Calculate sensor dimensions for Blender
      // Blender uses sensor_width in mm and focal length in mm
      // We'll use a standard 36mm sensor width and calculate focal length accordingly
      const sensorWidth = 36.0  // mm (full frame equivalent)
      const focalLengthMm = (vp.focalLength / vp.imageWidth) * sensorWidth

      scriptParts.push(`    {
        "name": "${escapeString(vp.name)}",
        "filename": "${escapeString(vp.filename)}",
        "position": (${pos[0].toFixed(6)}, ${pos[1].toFixed(6)}, ${pos[2].toFixed(6)}),
        "rotation": (${rot[0].toFixed(6)}, ${rot[1].toFixed(6)}, ${rot[2].toFixed(6)}, ${rot[3].toFixed(6)}),
        "focal_length": ${focalLengthMm.toFixed(4)},
        "sensor_width": ${sensorWidth.toFixed(1)},
        "image_width": ${vp.imageWidth},
        "image_height": ${vp.imageHeight},
        "principal_point_x": ${(vp.principalPointX / vp.imageWidth).toFixed(6)},
        "principal_point_y": ${(vp.principalPointY / vp.imageHeight).toFixed(6)},
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
        cam.sensor_fit = 'HORIZONTAL'

        # Set principal point offset (shift)
        # Blender's shift is normalized: 0 = center, 1 = full sensor width/height offset
        cam.shift_x = cam_data["principal_point_x"] - 0.5
        cam.shift_y = cam_data["principal_point_y"] - 0.5

        # Create camera object
        cam_obj = bpy.data.objects.new(cam_data["name"], cam)
        pictorigo_collection.objects.link(cam_obj)

        # Set position
        cam_obj.location = cam_data["position"]

        # Set rotation from quaternion
        # Blender quaternion is (w, x, y, z)
        quat = Quaternion(cam_data["rotation"])

        # Pictorigo camera looks down -Z in camera space
        # Blender camera looks down -Z in camera space too
        # But we need to account for the coordinate system change
        # Apply a 180° rotation around local X to flip the camera right-side up
        correction = Quaternion((0, 1, 0, 0))  # 180° around X
        cam_obj.rotation_mode = 'QUATERNION'
        cam_obj.rotation_quaternion = quat @ correction

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

# Frame all objects in view
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        for region in area.regions:
            if region.type == 'WINDOW':
                with bpy.context.temp_override(area=area, region=region):
                    bpy.ops.view3d.view_all(center=True)
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
 * Download the Blender script as a .py file
 */
export function downloadBlenderScript(project: Project, options: BlenderExportOptions = {}): void {
  const script = generateBlenderScript(project, options)
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
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-z0-9\-_\s]/gi, '_').trim()
}
