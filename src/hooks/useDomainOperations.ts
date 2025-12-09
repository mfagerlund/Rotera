import { Project } from '../entities/project'
import { WorldPoint } from '../entities/world-point'
import { Line, LineDirection } from '../entities/line'
import { Viewpoint } from '../entities/viewpoint'
import { ImagePoint } from '../entities/imagePoint'
import { Constraint } from '../entities/constraints'
import type { OptimizationExportDto } from '../types/optimization-export'
import { DistanceConstraint } from '../entities/constraints/distance-constraint'
import { AngleConstraint } from '../entities/constraints/angle-constraint'
import { Serialization } from '../entities/Serialization'
import { VanishingLine } from '../entities/vanishing-line'
import { ImageUtils } from '../utils/imageUtils'

export interface WorldPointOptions {
  lockedXyz?: [number | null, number | null, number | null]
  color?: string
  isVisible?: boolean
}

export interface LineOptions {
  name?: string
  color?: string
  isConstruction?: boolean
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  thickness?: number
  direction?: LineDirection
  targetLength?: number
  tolerance?: number
}

export interface LineUpdates {
  name?: string
  color?: string
  isConstruction?: boolean
  direction?: LineDirection
  targetLength?: number
  tolerance?: number
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  thickness?: number
}

export interface ConstraintUpdates {
  name?: string
  isEnabled?: boolean
  parameters?: Record<string, unknown>
}

export interface DomainOperations {
  // World Points
  createWorldPoint: (name: string, xyz: [number, number, number], options?: WorldPointOptions) => WorldPoint
  renameWorldPoint: (worldPoint: WorldPoint, name: string) => void
  deleteWorldPoint: (worldPoint: WorldPoint) => void

  // Lines
  createLine: (pointA: WorldPoint, pointB: WorldPoint, options?: LineOptions) => Line
  updateLine: (line: Line, updates: LineUpdates) => void
  deleteLine: (line: Line) => void

  // Vanishing Lines
  deleteVanishingLine: (vanishingLine: VanishingLine) => void

  // Viewpoints (Images)
  addImage: (file: File) => Promise<Viewpoint | undefined>
  renameImage: (viewpoint: Viewpoint, name: string) => void
  deleteImage: (viewpoint: Viewpoint) => void
  getImagePointCount: (viewpoint: Viewpoint) => number

  // Image Points
  addImagePointToWorldPoint: (worldPoint: WorldPoint, viewpoint: Viewpoint, u: number, v: number) => void
  moveImagePoint: (imagePoint: ImagePoint, u: number, v: number) => void
  deleteImagePointFromViewpoint: (worldPoint: WorldPoint, viewpoint: Viewpoint) => boolean
  getSelectedPointsInImage: (viewpoint: Viewpoint) => WorldPoint[]
  copyPointsFromImageToImage: (fromViewpoint: Viewpoint, toViewpoint: Viewpoint) => void

  // Constraints
  addConstraint: (constraint: Constraint) => void
  updateConstraint: (constraint: Constraint, updates: ConstraintUpdates) => void
  deleteConstraint: (constraint: Constraint) => void
  toggleConstraint: (constraint: Constraint) => void

  // Project
  clearProject: () => void
  exportOptimizationDto: () => any | null  // Returns ProjectDto (full serialization)
  removeDuplicateImagePoints: () => number  // Returns number of duplicates removed
}

function cleanupConstraintReferences(constraint: Constraint): void {
  if (constraint instanceof DistanceConstraint) {
    constraint.pointA.removeReferencingConstraint(constraint)
    constraint.pointB.removeReferencingConstraint(constraint)
  } else if (constraint instanceof AngleConstraint) {
    constraint.pointA.removeReferencingConstraint(constraint)
    constraint.vertex.removeReferencingConstraint(constraint)
    constraint.pointC.removeReferencingConstraint(constraint)
  }
}

export function useDomainOperations(
  project: Project | null,
  setProject: (project: Project) => void
): DomainOperations {

  const maybeDeleteOrphanWorldPoint = (worldPoint: WorldPoint) => {
    if (!project) return
    if (worldPoint.imagePoints.size > 0) return
    if (!project.worldPoints.has(worldPoint)) return

    deleteWorldPoint(worldPoint)
  }

  const createWorldPoint = (name: string, xyz: [number, number, number], options?: WorldPointOptions): WorldPoint => {
    if (!project) throw new Error('No project')

    const point = WorldPoint.create(name, {
      lockedXyz: xyz,
      optimizedXyz: xyz,
      ...options
    })

    project.addWorldPoint(point)
    return point
  }

  const renameWorldPoint = (worldPoint: WorldPoint, name: string) => {
    if (!project) return
    worldPoint.name = name
  }

  const deleteWorldPoint = (worldPoint: WorldPoint) => {
    if (!project) return

    Array.from(worldPoint.connectedLines).forEach(line => {
      (line as Line).cleanup()
      project.removeLine(line as Line)
    })

    Array.from(worldPoint.imagePoints).forEach(imagePoint => {
      (imagePoint.viewpoint as Viewpoint).removeImagePoint(imagePoint)
      project.removeImagePoint(imagePoint)
    })

    Array.from(worldPoint.referencingConstraints).forEach(constraint => {
      cleanupConstraintReferences(constraint as Constraint)
      project.removeConstraint(constraint as Constraint)
    })

    project.removeWorldPoint(worldPoint)
  }

  const createLine = (pointA: WorldPoint, pointB: WorldPoint, options?: LineOptions): Line => {
    if (!project) throw new Error('No project')

    const line = Line.create(
      options?.name ?? '',
      pointA,
      pointB,
      options
    )

    project.addLine(line)
    return line
  }

  const updateLine = (line: Line, updates: LineUpdates) => {
    if (!project) return
    if ('name' in updates) line.name = updates.name!
    if ('color' in updates) line.color = updates.color!
    if ('isConstruction' in updates) line.isConstruction = updates.isConstruction!
    if ('direction' in updates) line.direction = updates.direction!
    if ('targetLength' in updates) line.targetLength = updates.targetLength
    if ('tolerance' in updates) line.tolerance = updates.tolerance
    if ('lineStyle' in updates) line.lineStyle = updates.lineStyle!
    if ('thickness' in updates) line.thickness = updates.thickness!
  }

  const deleteLine = (line: Line) => {
    if (!project) return
    line.cleanup()
    project.removeLine(line)
  }

  const deleteVanishingLine = (vanishingLine: VanishingLine) => {
    if (!project) return
    vanishingLine.viewpoint.removeVanishingLine(vanishingLine)
  }

  const addImage = async (file: File): Promise<Viewpoint | undefined> => {
    if (!project) return

    const imageLoadResult = await ImageUtils.loadImageFile(file)

    const viewpoint = Viewpoint.create(
      imageLoadResult.name,
      file.name,
      imageLoadResult.url,
      imageLoadResult.imageWidth,
      imageLoadResult.imageHeight
    )

    project.addViewpoint(viewpoint)
    return viewpoint
  }

  const renameImage = (viewpoint: Viewpoint, name: string) => {
    if (!project) return
    viewpoint.name = name
  }

  const deleteImage = (viewpoint: Viewpoint) => {
    if (!project) return

    const affectedWorldPoints = new Set<WorldPoint>()

    Array.from(viewpoint.imagePoints).forEach(imagePoint => {
      const wp = imagePoint.worldPoint as WorldPoint
      affectedWorldPoints.add(wp)
      wp.removeImagePoint(imagePoint)
      project.removeImagePoint(imagePoint)
    })

    project.removeViewpoint(viewpoint)

    affectedWorldPoints.forEach(maybeDeleteOrphanWorldPoint)
  }

  const getImagePointCount = (viewpoint: Viewpoint): number => {
    return viewpoint.imagePoints.size
  }

  const addImagePointToWorldPoint = (worldPoint: WorldPoint, viewpoint: Viewpoint, u: number, v: number) => {
    if (!project) return

    if (!project.viewpoints.has(viewpoint)) {
      console.error('Viewpoint not in project, adding it now', viewpoint.name)
      project.addViewpoint(viewpoint)
    }

    if (!project.worldPoints.has(worldPoint)) {
      console.error('WorldPoint not in project, adding it now', worldPoint.name)
      project.addWorldPoint(worldPoint)
    }

    // Check if this world point already has an image point on this viewpoint
    const existingImagePoints = viewpoint.getImagePointsForWorldPoint(worldPoint)
    if (existingImagePoints.length > 0) {
      console.warn(`WorldPoint "${worldPoint.name}" already has an image point on viewpoint "${viewpoint.name}". Moving existing point instead.`)
      // Move the existing point to the new location
      const existingImagePoint = existingImagePoints[0] as ImagePoint
      moveImagePoint(existingImagePoint, u, v)
      return
    }

    const imagePoint = ImagePoint.create(
      worldPoint,
      viewpoint,
      u,
      v,
      {
        isVisible: true,
        confidence: 1.0
      }
    )

    viewpoint.addImagePoint(imagePoint)
    worldPoint.addImagePoint(imagePoint)
    project.addImagePoint(imagePoint)
  }

  const moveImagePoint = (imagePoint: ImagePoint, u: number, v: number) => {
    if (!project) return
    imagePoint.setPosition(u, v)
  }

  const deleteImagePointFromViewpoint = (worldPoint: WorldPoint, viewpoint: Viewpoint): boolean => {
    if (!project) return false

    const imagePoints = viewpoint.getImagePointsForWorldPoint(worldPoint)
    if (imagePoints.length === 0) return false

    const imagePoint = imagePoints[0] as ImagePoint

    viewpoint.removeImagePoint(imagePoint)
    worldPoint.removeImagePoint(imagePoint)
    project.removeImagePoint(imagePoint)

    maybeDeleteOrphanWorldPoint(worldPoint)

    return true
  }

  const getSelectedPointsInImage = (viewpoint: Viewpoint): WorldPoint[] => {
    // TODO: Implement selection tracking
    return []
  }

  const copyPointsFromImageToImage = (fromViewpoint: Viewpoint, toViewpoint: Viewpoint) => {
    if (!project) return

    // Get all image points from source viewpoint
    const sourceImagePoints = Array.from(fromViewpoint.imagePoints)

    // For each image point in source, create corresponding point in target
    sourceImagePoints.forEach((sourceImagePoint) => {
      const worldPoint = sourceImagePoint.worldPoint as WorldPoint

      // Check if this world point already has an image point in the target viewpoint
      const existingImagePointInTarget = toViewpoint.getImagePointsForWorldPoint(worldPoint)[0]

      if (!existingImagePointInTarget) {
        // Create new image point in target viewpoint with same UV coordinates
        addImagePointToWorldPoint(
          worldPoint,
          toViewpoint,
          sourceImagePoint.u,
          sourceImagePoint.v
        )
      }
    })
  }

  const addConstraint = (constraint: Constraint) => {
    if (!project) return
    project.addConstraint(constraint)
  }

  const updateConstraint = (constraint: Constraint, updates: ConstraintUpdates) => {
    if (!project) return
    // TODO: Implement constraint updates
  }

  const deleteConstraint = (constraint: Constraint) => {
    if (!project) return
    cleanupConstraintReferences(constraint)
    project.removeConstraint(constraint)
  }

  const toggleConstraint = (constraint: Constraint) => {
    if (!project) return
    constraint.isEnabled = !constraint.isEnabled
  }

  const clearProject = () => {
    if (!project) return
    project.clear()
  }

  const exportOptimizationDto = (): OptimizationExportDto | null => {
    if (!project) return null

    // Use the full project serialization (ProjectDto format)
    // The caller (MainToolbar) will filter out image blobs if needed
    const json = Serialization.serialize(project)
    return JSON.parse(json) as any as OptimizationExportDto
  }

  const removeDuplicateImagePoints = (): number => {
    if (!project) return 0

    let removedCount = 0

    // For each viewpoint, check each world point
    for (const viewpoint of project.viewpoints) {
      for (const worldPoint of project.worldPoints) {
        const imagePoints = viewpoint.getImagePointsForWorldPoint(worldPoint)

        // If there are multiple image points for this world point on this viewpoint
        if (imagePoints.length > 1) {
          console.warn(`Found ${imagePoints.length} image points for WorldPoint "${worldPoint.name}" on Viewpoint "${viewpoint.name}". Keeping only the first one.`)

          // Keep the first one, remove the rest
          for (let i = 1; i < imagePoints.length; i++) {
            const duplicateImagePoint = imagePoints[i] as ImagePoint
            viewpoint.removeImagePoint(duplicateImagePoint)
            worldPoint.removeImagePoint(duplicateImagePoint)
            project.removeImagePoint(duplicateImagePoint)
            removedCount++
          }
        }
      }
    }

    // Removed duplicates if any

    return removedCount
  }

  return {
    createWorldPoint,
    renameWorldPoint,
    deleteWorldPoint,
    createLine,
    updateLine,
    deleteLine,
    deleteVanishingLine,
    addImage,
    renameImage,
    deleteImage,
    getImagePointCount,
    addImagePointToWorldPoint,
    moveImagePoint,
    deleteImagePointFromViewpoint,
    getSelectedPointsInImage,
    copyPointsFromImageToImage,
    addConstraint,
    updateConstraint,
    deleteConstraint,
    toggleConstraint,
    clearProject,
    exportOptimizationDto,
    removeDuplicateImagePoints
  }
}
