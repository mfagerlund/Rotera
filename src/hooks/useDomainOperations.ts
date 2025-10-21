import { Project } from '../entities/project'
import { WorldPoint } from '../entities/world-point'
import { Line, LineDirection } from '../entities/line'
import { Viewpoint } from '../entities/viewpoint'
import { ImagePoint } from '../entities/imagePoint'
import { Constraint } from '../entities/constraints'
import type { OptimizationExportDto } from '../types/optimization-export'
import { DistanceConstraint } from '../entities/constraints/distance-constraint'
import { AngleConstraint } from '../entities/constraints/angle-constraint'

export interface WorldPointOptions {
  lockedXyz?: [number | null, number | null, number | null]
  color?: string
  isVisible?: boolean
}

export interface LineOptions {
  name?: string
  color?: string
  isVisible?: boolean
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
  isVisible?: boolean
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

  // Viewpoints (Images)
  addImage: (file: File) => Promise<void>
  renameImage: (viewpoint: Viewpoint, name: string) => void
  deleteImage: (viewpoint: Viewpoint) => void
  getImagePointCount: (viewpoint: Viewpoint) => number

  // Image Points
  addImagePointToWorldPoint: (worldPoint: WorldPoint, viewpoint: Viewpoint, u: number, v: number) => void
  moveImagePoint: (imagePoint: ImagePoint, u: number, v: number) => void
  getSelectedPointsInImage: (viewpoint: Viewpoint) => WorldPoint[]
  copyPointsFromImageToImage: (fromViewpoint: Viewpoint, toViewpoint: Viewpoint) => void

  // Constraints
  addConstraint: (constraint: Constraint) => void
  updateConstraint: (constraint: Constraint, updates: ConstraintUpdates) => void
  deleteConstraint: (constraint: Constraint) => void
  toggleConstraint: (constraint: Constraint) => void

  // Project
  clearProject: () => void
  exportOptimizationDto: () => OptimizationExportDto | null
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
      options?.name || 'Line',
      pointA,
      pointB,
      options
    )

    project.addLine(line)
    return line
  }

  const updateLine = (line: Line, updates: LineUpdates) => {
    if (!project) return
    if (updates.name) line.name = updates.name
    if (updates.color) line.color = updates.color
    if (updates.isVisible !== undefined) line.isVisible = updates.isVisible
  }

  const deleteLine = (line: Line) => {
    if (!project) return
    line.cleanup()
    project.removeLine(line)
  }

  const addImage = async (file: File) => {
    if (!project) return

    const reader = new FileReader()
    const dataUrl = await new Promise<string>((resolve) => {
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.readAsDataURL(file)
    })

    const viewpoint = Viewpoint.create(
      file.name,
      file.name,
      dataUrl,
      1920,
      1080
    )

    project.addViewpoint(viewpoint)
  }

  const renameImage = (viewpoint: Viewpoint, name: string) => {
    if (!project) return
    viewpoint.name = name
  }

  const deleteImage = (viewpoint: Viewpoint) => {
    if (!project) return

    Array.from(viewpoint.imagePoints).forEach(imagePoint => {
      (imagePoint.worldPoint as WorldPoint).removeImagePoint(imagePoint)
      project.removeImagePoint(imagePoint)
    })

    project.removeViewpoint(viewpoint)
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

  const getSelectedPointsInImage = (viewpoint: Viewpoint): WorldPoint[] => {
    // TODO: Implement selection tracking
    return []
  }

  const copyPointsFromImageToImage = (fromViewpoint: Viewpoint, toViewpoint: Viewpoint) => {
    // TODO: Implement point copying
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
    // TODO: Implement proper export
    return null
  }

  return {
    createWorldPoint,
    renameWorldPoint,
    deleteWorldPoint,
    createLine,
    updateLine,
    deleteLine,
    addImage,
    renameImage,
    deleteImage,
    getImagePointCount,
    addImagePointToWorldPoint,
    moveImagePoint,
    getSelectedPointsInImage,
    copyPointsFromImageToImage,
    addConstraint,
    updateConstraint,
    deleteConstraint,
    toggleConstraint,
    clearProject,
    exportOptimizationDto
  }
}
