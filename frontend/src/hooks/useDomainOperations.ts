// Domain operations for EntityProject - CLEAN, NO LEGACY
import { EntityProject } from '../types/project-entities'
import { WorldPoint } from '../entities/world-point'
import { Line } from '../entities/line'
import { Viewpoint } from '../entities/viewpoint'

export interface DomainOperations {
  // World Points
  createWorldPoint: (name: string, xyz: [number, number, number], options?: any) => WorldPoint
  renameWorldPoint: (worldPoint: WorldPoint, name: string) => void
  deleteWorldPoint: (worldPoint: WorldPoint) => void

  // Lines
  createLine: (pointA: WorldPoint, pointB: WorldPoint, options?: any) => Line
  updateLine: (line: Line, updates: any) => void
  deleteLine: (line: Line) => void

  // Viewpoints (Images)
  addImage: (file: File) => Promise<void>
  renameImage: (viewpoint: Viewpoint, name: string) => void
  deleteImage: (viewpoint: Viewpoint) => void
  getImagePointCount: (viewpoint: Viewpoint) => number

  // Image Points
  addImagePointToWorldPoint: (worldPoint: WorldPoint, viewpoint: Viewpoint, u: number, v: number) => void
  getSelectedPointsInImage: (viewpoint: Viewpoint) => any[]
  copyPointsFromImageToImage: (fromViewpoint: Viewpoint, toViewpoint: Viewpoint) => void

  // Constraints
  addConstraint: (constraint: any) => void
  updateConstraint: (constraint: any, updates: any) => void
  deleteConstraint: (constraint: any) => void
  toggleConstraint: (constraint: any) => void

  // Project
  clearProject: () => void
  exportOptimizationDto: () => any
}

export function useDomainOperations(
  project: EntityProject | null,
  setProject: (project: EntityProject) => void
): DomainOperations {

  const createWorldPoint = (name: string, xyz: [number, number, number], options?: any): WorldPoint => {
    if (!project) throw new Error('No project')

    const id = `wp-${crypto.randomUUID()}`
    const point = WorldPoint.create(id, name, {
      xyz,
      ...options
    })

    project.worldPoints.set(id, point)
    setProject({ ...project })
    return point
  }

  const renameWorldPoint = (worldPoint: WorldPoint, name: string) => {
    if (!project) return
    // Mutation via private field access (entity doesn't expose setters)
    (worldPoint as any)._name = name
    ;(worldPoint as any)._updatedAt = new Date().toISOString()
    setProject({ ...project })
  }

  const deleteWorldPoint = (worldPoint: WorldPoint) => {
    if (!project) return
    project.worldPoints.delete(worldPoint.getId())
    // TODO: Remove constraints referencing this point
    setProject({ ...project })
  }

  const createLine = (pointA: WorldPoint, pointB: WorldPoint, options?: any): Line => {
    if (!project) throw new Error('No project')

    const id = `line-${crypto.randomUUID()}`
    const line = Line.create(id, options?.name || 'Line', pointA, pointB, {
      ...options
    })

    project.lines.set(id, line)
    setProject({ ...project })
    return line
  }

  const updateLine = (line: Line, updates: any) => {
    if (!project) return
    // Mutation via private field access (entity doesn't expose setters)
    if (updates.name) (line as any)._name = updates.name
    if (updates.color) (line as any)._color = updates.color
    if (updates.isVisible !== undefined) (line as any)._isVisible = updates.isVisible
    ;(line as any)._updatedAt = new Date().toISOString()
    setProject({ ...project })
  }

  const deleteLine = (line: Line) => {
    if (!project) return
    project.lines.delete(line.getId())
    setProject({ ...project })
  }

  const addImage = async (file: File) => {
    if (!project) return

    // Read file as data URL
    const reader = new FileReader()
    const dataUrl = await new Promise<string>((resolve) => {
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.readAsDataURL(file)
    })

    const id = `vp-${crypto.randomUUID()}`
    const viewpoint = Viewpoint.create(
      id,
      file.name,
      file.name,
      dataUrl,
      1920, // Default width, TODO: get from image
      1080, // Default height
      {}
    )

    project.viewpoints.set(id, viewpoint)
    setProject({ ...project })
  }

  const renameImage = (viewpoint: Viewpoint, name: string) => {
    if (!project) return
    // Mutation via private field access (entity doesn't expose setters)
    (viewpoint as any)._data.name = name
    ;(viewpoint as any)._data.updatedAt = new Date().toISOString()
    setProject({ ...project })
  }

  const deleteImage = (viewpoint: Viewpoint) => {
    if (!project) return
    project.viewpoints.delete(viewpoint.getId())
    setProject({ ...project })
  }

  const getImagePointCount = (viewpoint: Viewpoint): number => {
    return viewpoint.getImagePoints().length
  }

  const addImagePointToWorldPoint = (worldPoint: WorldPoint, viewpoint: Viewpoint, u: number, v: number) => {
    if (!project) return

    const imagePoint = {
      id: `ip-${crypto.randomUUID()}`,
      worldPointId: worldPoint.getId(),
      u,
      v,
      isVisible: true,
      isManuallyPlaced: true,
      confidence: 1.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    viewpoint.addImagePoint(imagePoint)
    setProject({ ...project })
  }

  const getSelectedPointsInImage = (viewpoint: Viewpoint): any[] => {
    // TODO: Implement selection tracking
    return []
  }

  const copyPointsFromImageToImage = (fromViewpoint: Viewpoint, toViewpoint: Viewpoint) => {
    // TODO: Implement point copying
  }

  const addConstraint = (constraint: any) => {
    if (!project) return
    project.constraints.push(constraint)
    setProject({ ...project })
  }

  const updateConstraint = (constraint: any, updates: any) => {
    if (!project) return
    // TODO: Update constraint properties
    setProject({ ...project })
  }

  const deleteConstraint = (constraint: any) => {
    if (!project) return
    project.constraints = project.constraints.filter(c => c.getId() !== constraint.getId())
    setProject({ ...project })
  }

  const toggleConstraint = (constraint: any) => {
    if (!project) return
    constraint.isEnabled = !constraint.isEnabled
    setProject({ ...project })
  }

  const clearProject = () => {
    if (!project) return
    project.worldPoints.clear()
    project.lines.clear()
    project.viewpoints.clear()
    project.constraints = []
    setProject({ ...project })
  }

  const exportOptimizationDto = () => {
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
