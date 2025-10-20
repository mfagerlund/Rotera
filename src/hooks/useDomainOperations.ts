import { Project } from '../entities/project'
import { WorldPoint } from '../entities/world-point'
import { Line, LineDirection } from '../entities/line'
import { Viewpoint } from '../entities/viewpoint'
import { ImagePoint } from '../entities/imagePoint'
import { Constraint } from '../entities/constraints'
import type { OptimizationExportDto } from '../types/optimization-export'

export interface WorldPointOptions {
  lockedXyz?: [number | null, number | null, number | null]
  color?: string
  isVisible?: boolean
  isOrigin?: boolean
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
    setProject({ ...project } as Project)
    return point
  }

  const renameWorldPoint = (worldPoint: WorldPoint, name: string) => {
    if (!project) return
    worldPoint.name = name
    setProject({ ...project } as Project)
  }

  const deleteWorldPoint = (worldPoint: WorldPoint) => {
    if (!project) return
    project.removeWorldPoint(worldPoint)
    setProject({ ...project } as Project)
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
    setProject({ ...project } as Project)
    return line
  }

  const updateLine = (line: Line, updates: LineUpdates) => {
    if (!project) return
    if (updates.name) line.name = updates.name
    if (updates.color) line.color = updates.color
    if (updates.isVisible !== undefined) line.isVisible = updates.isVisible
    setProject({ ...project } as Project)
  }

  const deleteLine = (line: Line) => {
    if (!project) return
    line.cleanup()
    project.removeLine(line)
    setProject({ ...project } as Project)
  }

  const addImage = async (file: File) => {
    if (!project) return

    console.log('addImage: Starting to load file:', file.name)

    const reader = new FileReader()
    const dataUrl = await new Promise<string>((resolve) => {
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.readAsDataURL(file)
    })

    console.log('addImage: File loaded, dataUrl length:', dataUrl.length)

    const viewpoint = Viewpoint.create(
      file.name,
      file.name,
      dataUrl,
      1920,
      1080
    )

    console.log('addImage: Created viewpoint:', viewpoint.getName())

    project.addViewpoint(viewpoint)
    console.log('addImage: Added to project, viewpoint count:', project.viewpoints.size)
    setProject({ ...project } as Project)
    console.log('addImage: Project updated')
  }

  const renameImage = (viewpoint: Viewpoint, name: string) => {
    if (!project) return
    viewpoint.name = name
    setProject({ ...project } as Project)
  }

  const deleteImage = (viewpoint: Viewpoint) => {
    if (!project) return
    project.removeViewpoint(viewpoint)
    setProject({ ...project } as Project)
  }

  const getImagePointCount = (viewpoint: Viewpoint): number => {
    return viewpoint.imagePoints.size
  }

  const addImagePointToWorldPoint = (worldPoint: WorldPoint, viewpoint: Viewpoint, u: number, v: number) => {
    if (!project) return

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
    setProject({ ...project } as Project)
  }

  const moveImagePoint = (imagePoint: ImagePoint, u: number, v: number) => {
    if (!project) return
    imagePoint.setPosition(u, v)
    setProject({ ...project } as Project)
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
    setProject({ ...project } as Project)
  }

  const updateConstraint = (constraint: Constraint, updates: ConstraintUpdates) => {
    if (!project) return
    // TODO: Implement constraint updates
    setProject({ ...project } as Project)
  }

  const deleteConstraint = (constraint: Constraint) => {
    if (!project) return
    project.removeConstraint(constraint)
    setProject({ ...project } as Project)
  }

  const toggleConstraint = (constraint: Constraint) => {
    if (!project) return
    constraint.isEnabled = !constraint.isEnabled
    setProject({ ...project } as Project)
  }

  const clearProject = () => {
    if (!project) return
    project.clear()
    setProject({ ...project } as Project)
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
