// Domain operations for EntityProject - CLEAN, NO LEGACY
import { EntityProject } from '../types/project-entities'
import { WorldPoint } from '../entities/world-point'
import { Line } from '../entities/line'
import { Viewpoint } from '../entities/viewpoint'

export interface DomainOperations {
  // World Points
  createWorldPoint: (name: string, xyz: [number, number, number], options?: any) => WorldPoint
  renameWorldPoint: (id: string, name: string) => void
  deleteWorldPoint: (id: string) => void
  getWorldPointEntity: (id: string) => WorldPoint | undefined

  // Lines
  createLine: (pointAId: string, pointBId: string, options?: any) => Line
  updateLine: (id: string, updates: any) => void
  deleteLine: (id: string) => void
  getLineEntity: (id: string) => Line | undefined

  // Viewpoints (Images)
  addImage: (file: File) => Promise<void>
  renameImage: (id: string, name: string) => void
  deleteImage: (id: string) => void
  getImagePointCount: (imageId: string) => number

  // Image Points
  addImagePointToWorldPoint: (worldPointId: string, imageId: string, u: number, v: number) => void
  getSelectedPointsInImage: (imageId: string) => any[]
  copyPointsFromImageToImage: (fromImageId: string, toImageId: string) => void

  // Constraints
  addConstraint: (constraint: any) => void
  updateConstraint: (id: string, updates: any) => void
  deleteConstraint: (id: string) => void
  toggleConstraint: (id: string) => void

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

  const renameWorldPoint = (id: string, name: string) => {
    if (!project) return
    const point = project.worldPoints.get(id)
    if (point) {
      // Mutation via private field access (entity doesn't expose setters)
      (point as any)._name = name
      ;(point as any)._updatedAt = new Date().toISOString()
      setProject({ ...project })
    }
  }

  const deleteWorldPoint = (id: string) => {
    if (!project) return
    project.worldPoints.delete(id)
    // TODO: Remove constraints referencing this point
    setProject({ ...project })
  }

  const getWorldPointEntity = (id: string) => {
    return project?.worldPoints.get(id)
  }

  const createLine = (pointAId: string, pointBId: string, options?: any): Line => {
    if (!project) throw new Error('No project')

    const pointA = project.worldPoints.get(pointAId)
    const pointB = project.worldPoints.get(pointBId)
    if (!pointA || !pointB) throw new Error('Points not found')

    const id = `line-${crypto.randomUUID()}`
    const line = Line.create(id, options?.name || 'Line', pointA, pointB, {
      ...options
    })

    project.lines.set(id, line)
    setProject({ ...project })
    return line
  }

  const updateLine = (id: string, updates: any) => {
    if (!project) return
    const line = project.lines.get(id)
    if (line) {
      // Mutation via private field access (entity doesn't expose setters)
      if (updates.name) (line as any)._name = updates.name
      if (updates.color) (line as any)._color = updates.color
      if (updates.isVisible !== undefined) (line as any)._isVisible = updates.isVisible
      ;(line as any)._updatedAt = new Date().toISOString()
      setProject({ ...project })
    }
  }

  const deleteLine = (id: string) => {
    if (!project) return
    project.lines.delete(id)
    setProject({ ...project })
  }

  const getLineEntity = (id: string) => {
    return project?.lines.get(id)
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

  const renameImage = (id: string, name: string) => {
    if (!project) return
    const viewpoint = project.viewpoints.get(id)
    if (viewpoint) {
      // Mutation via private field access (entity doesn't expose setters)
      (viewpoint as any)._data.name = name
      ;(viewpoint as any)._data.updatedAt = new Date().toISOString()
      setProject({ ...project })
    }
  }

  const deleteImage = (id: string) => {
    if (!project) return
    project.viewpoints.delete(id)
    setProject({ ...project })
  }

  const getImagePointCount = (imageId: string): number => {
    if (!project) return 0
    const viewpoint = project.viewpoints.get(imageId)
    return viewpoint?.getImagePoints().length || 0
  }

  const addImagePointToWorldPoint = (worldPointId: string, imageId: string, u: number, v: number) => {
    if (!project) return

    const viewpoint = project.viewpoints.get(imageId)
    const worldPoint = project.worldPoints.get(worldPointId)
    if (!viewpoint || !worldPoint) return

    const imagePoint = {
      id: `ip-${crypto.randomUUID()}`,
      worldPointId,
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

  const getSelectedPointsInImage = (imageId: string): any[] => {
    // TODO: Implement selection tracking
    return []
  }

  const copyPointsFromImageToImage = (fromImageId: string, toImageId: string) => {
    // TODO: Implement point copying
  }

  const addConstraint = (constraint: any) => {
    if (!project) return
    project.constraints.push(constraint)
    setProject({ ...project })
  }

  const updateConstraint = (id: string, updates: any) => {
    if (!project) return
    const constraint = project.constraints.find(c => c.getId() === id)
    if (constraint) {
      // TODO: Update constraint properties
      setProject({ ...project })
    }
  }

  const deleteConstraint = (id: string) => {
    if (!project) return
    project.constraints = project.constraints.filter(c => c.getId() !== id)
    setProject({ ...project })
  }

  const toggleConstraint = (id: string) => {
    if (!project) return
    const constraint = project.constraints.find(c => c.getId() === id)
    if (constraint) {
      constraint.isEnabled = !constraint.isEnabled
      setProject({ ...project })
    }
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
    getWorldPointEntity,
    createLine,
    updateLine,
    deleteLine,
    getLineEntity,
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
