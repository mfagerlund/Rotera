// Serialization boundary - DTOs ↔ Entities
// DTOs are ONLY used here for load/save

import { EntityProject } from '../types/project-entities'
import { WorldPoint } from '../entities/world-point/WorldPoint'
import { Line } from '../entities/line/Line'
import { Camera } from '../entities/camera'
import { ProjectionConstraint } from '../entities/constraints/projection-constraint'
import { convertAllConstraints } from './constraint-entity-converter'
import { Quaternion } from '../optimization/Quaternion'

// Simple repositories for entity creation
class SimpleCameraRepo {
  getImagesByCamera() { return []; }
  entityExists() { return true; }
}

class SimpleConstraintRepo {
  getPoint() { return undefined; }
  getLine() { return undefined; }
  getPlane() { return undefined; }
  entityExists() { return true; }
  pointExists() { return true; }
  lineExists() { return true; }
  planeExists() { return true; }
}

const cameraRepo = new SimpleCameraRepo()
const constraintRepo = new SimpleConstraintRepo()

/**
 * Load project from JSON DTO → Entity model
 * THIS IS THE ONLY PLACE DTOs ARE TOUCHED FOR LOADING
 */
export function deserializeProject(json: any): EntityProject {
  const worldPoints = new Map<string, WorldPoint>()
  const lines = new Map<string, Line>()
  const cameras = new Map<string, Camera>()

  // Convert world points
  const wpData = json.worldPoints || {}
  Object.values(wpData).forEach((wp: any) => {
    // Provide randomized initial guess if xyz undefined (for photogrammetry)
    // Spread points in a cube around origin to give solver different starting points
    let xyz = wp.xyz

    if (!xyz || xyz.every((v: number | null) => v === null || v === undefined)) {
      // Random position in [-5, 5] cube at z ~ 10
      xyz = [
        (Math.random() - 0.5) * 10,  // -5 to 5
        (Math.random() - 0.5) * 10,  // -5 to 5
        8 + Math.random() * 4         // 8 to 12
      ] as [number, number, number]
      console.log(`[deserializeProject] WorldPoint ${wp.name}: randomized initial position ${JSON.stringify(xyz)}`)
    }

    // Handle null values in xyz
    if (Array.isArray(xyz)) {
      xyz = [
        xyz[0] ?? (Math.random() - 0.5) * 10,
        xyz[1] ?? (Math.random() - 0.5) * 10,
        xyz[2] ?? (8 + Math.random() * 4)
      ] as [number, number, number]
    }

    // Validate no NaN values
    if (xyz.some((v: number) => isNaN(v))) {
      console.error(`[deserializeProject] WorldPoint ${wp.name} has NaN in xyz! Original: ${JSON.stringify(wp.xyz)}`)
    }

    console.log(`[deserializeProject] WorldPoint ${wp.name}: xyz=${JSON.stringify(xyz)}`)

    const entity = WorldPoint.create(wp.id, wp.name, {
      xyz,
      color: wp.color,
      isVisible: wp.isVisible ?? true,
      isLocked: wp.isLocked ?? false
    })
    worldPoints.set(wp.id, entity)
  })

  // Convert lines (need to resolve point references)
  const lineData = json.lines || {}
  Object.values(lineData).forEach((line: any) => {
    const pointA = worldPoints.get(line.pointA)
    const pointB = worldPoints.get(line.pointB)

    if (pointA && pointB) {
      const entity = Line.create(
        line.id,
        line.name || 'Line',
        pointA,
        pointB,
        {
          color: line.color,
          isConstruction: line.isConstruction ?? false,
          ...(line.constraints?.direction && line.constraints?.tolerance ? {
            constraints: {
              direction: line.constraints.direction,
              targetLength: line.constraints.targetLength,
              tolerance: line.constraints.tolerance
            }
          } : {})
        }
      )
      lines.set(line.id, entity)
    }
  })

  // Check if any points are locked - if so, we don't need to lock a camera
  const hasLockedPoints = Array.from(worldPoints.values()).some(wp => wp.isLocked())

  // Convert cameras (handle both array and Record formats from JSON)
  const camerasData = Array.isArray(json.cameras)
    ? json.cameras
    : Object.values(json.cameras || {})

  let cameraIndex = 0
  camerasData.forEach((cam: any) => {
    // Handle different camera data formats
    const focalLength = cam.focalLength || cam.intrinsics?.fx || 1000
    const imageWidth = cam.imageWidth || cam.width || 1920
    const imageHeight = cam.imageHeight || cam.height || 1080

    // Provide initial camera positions in a circle around origin
    // Cameras at z=-5, looking toward points at z=10 (15 units away)
    let position = cam.position || cam.extrinsics?.translation
    if (!position || position.every((v: number) => v === 0)) {
      const angle = (cameraIndex * 2 * Math.PI) / Math.max(1, camerasData.length)
      const radius = 20  // Cameras in circle of radius 20
      position = [
        radius * Math.cos(angle),
        radius * Math.sin(angle),
        -5  // Behind the scene, looking forward toward z=10
      ]
      console.log(`[deserializeProject] Camera ${cam.name}: initial position ${JSON.stringify(position)}`)
    }

    // Camera rotation: point camera toward origin (approximately toward the scene at z=10)
    let rotation = cam.rotation || cam.extrinsics?.rotation
    if (!rotation || rotation.length === 0) {
      // Compute rotation to look at origin from camera position
      // Camera looking along +Z axis by default, need to rotate to point at origin
      const camPos = position as [number, number, number]

      // Direction from camera to scene center (origin)
      const toCenter = [-camPos[0], -camPos[1], 10 - camPos[2]]
      const dist = Math.sqrt(toCenter[0]**2 + toCenter[1]**2 + toCenter[2]**2)
      toCenter[0] /= dist
      toCenter[1] /= dist
      toCenter[2] /= dist

      // Default camera looks along +Z, compute rotation needed
      // Simplified: just use identity rotation for now (cameras along XY plane looking at +Z)
      // This is a simplification - proper camera orientation would need look-at matrix → quaternion
      rotation = [1, 0, 0, 0]  // Identity quaternion
      console.log(`[deserializeProject] Camera ${cam.name}: identity rotation (looking along +Z)`)
    } else if (rotation.length === 3) {
      // Convert Euler to quaternion
      const quat = Quaternion.fromEuler(rotation[0], rotation[1], rotation[2])
      rotation = [quat.w.data, quat.x.data, quat.y.data, quat.z.data]
    }

    // Validate no NaN values
    if (position.some((v: number) => isNaN(v))) {
      console.error(`[deserializeProject] Camera ${cam.name} has NaN in position!`)
    }
    if (rotation.some((v: number) => isNaN(v))) {
      console.error(`[deserializeProject] Camera ${cam.name} has NaN in rotation!`)
    }
    if (isNaN(focalLength)) {
      console.error(`[deserializeProject] Camera ${cam.name} has NaN focal length!`)
    }

    // Fix the first camera's pose to remove gauge freedom (prevent drift/rotation/scale ambiguity)
    // BUT only if there are no locked points - can't lock both!
    const isPoseLocked = !hasLockedPoints && cameraIndex === 0
    if (isPoseLocked) {
      console.log(`[deserializeProject] Camera ${cam.name}: LOCKED (gauge fixing)`)
    } else if (cameraIndex === 0 && hasLockedPoints) {
      console.log(`[deserializeProject] Camera ${cam.name}: NOT LOCKED (points are locked instead)`)
    }

    console.log(`[deserializeProject] Camera ${cam.name}: position=${JSON.stringify(position)}, rotation=${JSON.stringify(rotation)}, focal=${focalLength}`)
    cameraIndex++

    const entity = Camera.create(
      cam.id,
      cam.name || `Camera_${cam.id.substring(0, 8)}`,
      focalLength,
      imageWidth,
      imageHeight,
      cameraRepo,
      {
        position: position as [number, number, number],
        rotation: rotation as [number, number, number, number],
        principalPointX: cam.principalPointX || (imageWidth / 2),
        principalPointY: cam.principalPointY || (imageHeight / 2),
        aspectRatio: cam.aspectRatio || 1.0,
        skewCoefficient: cam.skewCoefficient || 0,
        radialDistortion: cam.radialDistortion || [0, 0, 0],
        tangentialDistortion: cam.tangentialDistortion || [0, 0],
        isPoseLocked: isPoseLocked  // Lock first camera to fix gauge (only if no points locked)
      }
    )
    cameras.set(cam.id, entity)
  })

  // Convert explicit constraints
  const pointArray = Array.from(worldPoints.values())
  const lineArray = Array.from(lines.values())
  const explicitConstraints = convertAllConstraints(
    json.constraints || [],
    pointArray,
    lineArray
  )

  // Create projection constraints from image observations
  // Note: ImagePoints can be stored either on worldPoints OR on images (cameras)
  const projectionConstraints: ProjectionConstraint[] = []

  console.log(`[deserializeProject] Creating projection constraints`)

  // Convert images array to Record for easier lookup
  const imagesArray = Array.isArray(json.images) ? json.images : Object.values(json.images || {})

  // Iterate over images (cameras) and their imagePoints
  imagesArray.forEach((image: any) => {
    if (!image.imagePoints) return

    const imagePoints = Array.isArray(image.imagePoints)
      ? image.imagePoints
      : Object.values(image.imagePoints)

    console.log(`[deserializeProject] Image/Camera ${image.name || image.id.substring(0, 8)}: ${imagePoints.length} imagePoints`)

    imagePoints.forEach((imgPt: any) => {
      if (imgPt.worldPointId && typeof imgPt.u === 'number' && typeof imgPt.v === 'number') {
        // cameras and images are SYNONYMOUS - use the image's cameraId directly
        const cameraId = image.cameraId || image.id

        const constraintId = `proj_${image.id}_${imgPt.worldPointId}`
        const projConstraint = ProjectionConstraint.create(
          constraintId,
          `Proj_${image.name || 'img'}_${imgPt.worldPointId.substring(0, 8)}`,
          imgPt.worldPointId,
          cameraId,
          imgPt.u,
          imgPt.v,
          constraintRepo,
          { tolerance: 1.0, isDriving: true }
        )
        projectionConstraints.push(projConstraint)
      }
    })
  })

  console.log(`[deserializeProject] Created ${projectionConstraints.length} projection constraints`)

  const allConstraints = [...explicitConstraints, ...projectionConstraints]

  console.log(`[deserializeProject] Total constraints: ${allConstraints.length} (${explicitConstraints.length} explicit + ${projectionConstraints.length} projection)`)

  return {
    id: json.id || crypto.randomUUID(),
    name: json.name || 'Untitled Project',
    worldPoints,
    lines,
    cameras,
    constraints: allConstraints,
    settings: json.settings || getDefaultSettings(),
    createdAt: json.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

/**
 * Save project from Entity model → JSON DTO
 * THIS IS THE ONLY PLACE DTOs ARE TOUCHED FOR SAVING
 */
export function serializeProject(project: EntityProject): any {
  // Convert entities back to DTOs using their toDTO() methods
  const worldPointsDto: any = {}
  project.worldPoints.forEach((wp, id) => {
    worldPointsDto[id] = wp.toDTO()
  })

  const linesDto: any = {}
  project.lines.forEach((line, id) => {
    const dto = line.toDTO()
    // Convert entity references to IDs
    linesDto[id] = {
      ...dto,
      pointA: line.pointA.getId(),
      pointB: line.pointB.getId()
    }
  })

  const camerasDto: any = {}
  project.cameras.forEach((camera, id) => {
    camerasDto[id] = camera.toDTO()
  })

  // Note: Images would be stored separately, not in project
  // Constraints are ephemeral (recreated from observations)

  return {
    id: project.id,
    name: project.name,
    worldPoints: worldPointsDto,
    lines: linesDto,
    cameras: camerasDto,
    images: {}, // TODO: Implement image storage
    constraints: [], // Recreated from observations
    settings: project.settings,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  }
}

function getDefaultSettings() {
  return {
    showPointNames: true,
    autoSave: true,
    theme: 'dark' as const,
    measurementUnits: 'meters' as const,
    precisionDigits: 3,
    showConstraintGlyphs: true,
    showMeasurements: true,
    autoOptimize: false,
    gridVisible: true,
    snapToGrid: false,
    defaultWorkspace: 'image' as const,
    showConstructionGeometry: true,
    enableSmartSnapping: true,
    constraintPreview: true,
    visualFeedbackLevel: 'standard' as const
  }
}
