import { Project } from '../entities/project'
import { WorldPoint, AxisLock } from '../entities/world-point'
import { Line, LineConstraintSettings } from '../entities/line'
import { Viewpoint } from '../entities/viewpoint'
import { Constraint } from '../entities/constraints'
import type { OptimizationExportDto } from '../types/optimization-export'

export interface WorldPointOptions {
  xyz?: [number | null, number | null, number | null]
  color?: string
  isVisible?: boolean
  isOrigin?: boolean
  lockedAxes?: AxisLock
  group?: string
  tags?: string[]
}

export interface LineOptions {
  name?: string
  color?: string
  isVisible?: boolean
  isConstruction?: boolean
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  thickness?: number
  constraints?: LineConstraintSettings
  group?: string
  tags?: string[]
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
  moveImagePoint: (worldPoint: WorldPoint, viewpoint: Viewpoint, u: number, v: number) => void
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

    const id = `wp-${crypto.randomUUID()}`
    const point = WorldPoint.create(name, {
      id,
      xyz,
      ...options
    })

    project.addWorldPoint(point)
    setProject(project)
    return point
  }

  const renameWorldPoint = (worldPoint: WorldPoint, name: string) => {
    if (!project) return
    // Mutation via private field access (entity doesn't expose setters)
    (worldPoint as any)._name = name
    ;(worldPoint as any)._updatedAt = new Date().toISOString()
    setProject(project)
  }

  const deleteWorldPoint = (worldPoint: WorldPoint) => {
    if (!project) return
    project.removeWorldPoint(worldPoint)
    setProject(project)
  }

  const createLine = (pointA: WorldPoint, pointB: WorldPoint, options?: LineOptions): Line => {
    if (!project) throw new Error('No project')

    const id = `line-${crypto.randomUUID()}`
    const line = Line.create(id, options?.name || 'Line', pointA, pointB, {
      ...options
    })

    project.addLine(line)
    setProject(project)
    return line
  }

  const updateLine = (line: Line, updates: LineUpdates) => {
    if (!project) return
    // Mutation via private field access (entity doesn't expose setters)
    if (updates.name) (line as any)._name = updates.name
    if (updates.color) (line as any)._color = updates.color
    if (updates.isVisible !== undefined) (line as any)._isVisible = updates.isVisible
    ;(line as any)._updatedAt = new Date().toISOString()
    setProject(project)
  }

  const deleteLine = (line: Line) => {
    if (!project) return
    project.removeLine(line)
    setProject(project)
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

    const id = `vp-${crypto.randomUUID()}`
    const viewpoint = Viewpoint.create(
      file.name,
      file.name,
      dataUrl,
      1920,
      1080,
      { id }
    )

    console.log('addImage: Created viewpoint:', viewpoint.id, viewpoint.getName())

    project.addViewpoint(viewpoint)
    console.log('addImage: Added to project, viewpoint count:', project.viewpoints.size)
    setProject(project.clone())
    console.log('addImage: Project updated')
  }

  const renameImage = (viewpoint: Viewpoint, name: string) => {
    if (!project) return
    // Mutation via private field access (entity doesn't expose setters)
    (viewpoint as any)._data.name = name
    ;(viewpoint as any)._data.updatedAt = new Date().toISOString()
    setProject(project)
  }

  const deleteImage = (viewpoint: Viewpoint) => {
    if (!project) return
    project.removeViewpoint(viewpoint)
    setProject(project)
  }

  const getImagePointCount = (viewpoint: Viewpoint): number => {
    return Object.keys(viewpoint.imagePoints).length
  }

  const addImagePointToWorldPoint = (worldPoint: WorldPoint, viewpoint: Viewpoint, u: number, v: number) => {
    if (!project) return

    const imagePoint = {
      id: `ip-${crypto.randomUUID()}`,
      worldPointId: worldPoint.id,
      u,
      v,
      isVisible: true,
      isManuallyPlaced: true,
      confidence: 1.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    viewpoint.addImagePoint(imagePoint)
    setProject(project.clone())
  }

  const moveImagePoint = (worldPoint: WorldPoint, viewpoint: Viewpoint, u: number, v: number) => {
    if (!project) return

    const existingImagePoints = viewpoint.getImagePointsForWorldPoint(worldPoint.id)
    if (existingImagePoints.length > 0) {
      const imagePoint = existingImagePoints[0]
      viewpoint.updateImagePoint(imagePoint.id, { u, v })
      setProject(project.clone())
    }
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
    setProject(project)
  }

  const updateConstraint = (constraint: Constraint, updates: ConstraintUpdates) => {
    if (!project) return
    // TODO: Implement constraint updates
    setProject(project)
  }

  const deleteConstraint = (constraint: Constraint) => {
    if (!project) return
    project.removeConstraint(constraint)
    setProject(project)
  }

  const toggleConstraint = (constraint: Constraint) => {
    if (!project) return
    constraint.isEnabled = !constraint.isEnabled
    setProject(project)
  }

  const clearProject = () => {
    if (!project) return
    project.clear()
    setProject(project)
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
