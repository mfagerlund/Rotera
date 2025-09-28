// Core project management hook with localStorage integration

import { useState, useEffect, useCallback } from 'react'
import { Project, WorldPoint, ProjectImage, Camera, Constraint, Line } from '../types/project'
import { ProjectStorage } from '../utils/storage'
import { ImageUtils } from '../utils/imageUtils'

export const useProject = () => {
  const [project, setProject] = useState<Project | null>(null)
  const [currentImageId, setCurrentImageId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load project from localStorage on mount
  useEffect(() => {
    try {
      const savedProject = ProjectStorage.load()
      if (savedProject) {
        setProject(savedProject)
        // Set current image to first image if available
        const imageIds = Object.keys(savedProject.images)
        if (imageIds.length > 0) {
          setCurrentImageId(imageIds[0])
        }
      } else {
        // Create new empty project
        const newProject = ProjectStorage.createEmptyProject()
        setProject(newProject)
        ProjectStorage.save(newProject)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Auto-save project changes
  const saveProject = useCallback((updatedProject: Project) => {
    if (updatedProject.settings.autoSave) {
      try {
        ProjectStorage.save(updatedProject)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save project')
      }
    }
  }, [])

  // Update project state and save
  const updateProject = useCallback((updater: (prev: Project) => Project) => {
    setProject(prev => {
      if (!prev) return prev
      const updated = updater(prev)
      saveProject(updated)
      return updated
    })
  }, [saveProject])

  // World Point Management
  const createWorldPoint = useCallback((imageId: string, u: number, v: number): WorldPoint | null => {
    if (!project) return null

    const id = crypto.randomUUID()
    const name = `WP${project.nextWpNumber}`

    const worldPoint: WorldPoint = {
      id,
      name,
      xyz: undefined, // Will be estimated during optimization
      imagePoints: [{
        imageId,
        u,
        v,
        wpId: id
      }],
      isVisible: true,
      color: generatePointColor(project.nextWpNumber - 1)
    }

    updateProject(prev => ({
      ...prev,
      worldPoints: {
        ...prev.worldPoints,
        [id]: worldPoint
      },
      nextWpNumber: prev.nextWpNumber + 1
    }))

    return worldPoint
  }, [project, updateProject])

  const addImagePointToWorldPoint = useCallback((worldPointId: string, imageId: string, u: number, v: number) => {
    updateProject(prev => {
      const worldPoint = prev.worldPoints[worldPointId]
      if (!worldPoint) return prev

      // Check if this world point already has a point in this image
      const existingImagePoint = worldPoint.imagePoints.find(ip => ip.imageId === imageId)
      if (existingImagePoint) {
        // Update existing image point
        existingImagePoint.u = u
        existingImagePoint.v = v
      } else {
        // Add new image point
        worldPoint.imagePoints.push({
          imageId,
          u,
          v,
          wpId: worldPointId
        })
      }

      return {
        ...prev,
        worldPoints: {
          ...prev.worldPoints,
          [worldPointId]: { ...worldPoint }
        }
      }
    })
  }, [updateProject])

  const renameWorldPoint = useCallback((id: string, newName: string) => {
    updateProject(prev => {
      const worldPoint = prev.worldPoints[id]
      if (!worldPoint) return prev

      return {
        ...prev,
        worldPoints: {
          ...prev.worldPoints,
          [id]: { ...worldPoint, name: newName }
        }
      }
    })
  }, [updateProject])

  const deleteWorldPoint = useCallback((id: string) => {
    updateProject(prev => {
      const { [id]: deleted, ...remainingWorldPoints } = prev.worldPoints

      // Also remove any constraints that reference this world point
      const filteredConstraints = prev.constraints.filter(constraint => {
        return !getConstraintPointIds(constraint).includes(id)
      })

      return {
        ...prev,
        worldPoints: remainingWorldPoints,
        constraints: filteredConstraints
      }
    })
  }, [updateProject])

  // Image Management
  const addImage = useCallback(async (projectImage: ProjectImage) => {
    if (!project) return

    // Create camera for this image
    const camera: Camera = {
      id: crypto.randomUUID(),
      name: `Camera_${projectImage.name}`
    }

    updateProject(prev => ({
      ...prev,
      images: {
        ...prev.images,
        [projectImage.id]: { ...projectImage, cameraId: camera.id }
      },
      cameras: {
        ...prev.cameras,
        [camera.id]: camera
      }
    }))

    // Always set newly added image as current
    setCurrentImageId(projectImage.id)
  }, [project, updateProject])

  const renameImage = useCallback((id: string, newName: string) => {
    updateProject(prev => {
      const image = prev.images[id]
      if (!image) return prev

      return {
        ...prev,
        images: {
          ...prev.images,
          [id]: { ...image, name: newName }
        }
      }
    })
  }, [updateProject])

  const deleteImage = useCallback((id: string) => {
    updateProject(prev => {
      const { [id]: deleted, ...remainingImages } = prev.images

      // Remove image points from world points
      const updatedWorldPoints = { ...prev.worldPoints }
      Object.values(updatedWorldPoints).forEach(wp => {
        wp.imagePoints = wp.imagePoints.filter(ip => ip.imageId !== id)
      })

      // Remove world points that no longer have any image points
      Object.entries(updatedWorldPoints).forEach(([wpId, wp]) => {
        if (wp.imagePoints.length === 0) {
          delete updatedWorldPoints[wpId]
        }
      })

      // Remove associated camera
      const image = prev.images[id]
      const { [image?.cameraId || '']: deletedCamera, ...remainingCameras } = prev.cameras

      return {
        ...prev,
        images: remainingImages,
        cameras: remainingCameras,
        worldPoints: updatedWorldPoints
      }
    })

    // Update current image if needed
    if (currentImageId === id) {
      const remainingImageIds = Object.keys(project?.images || {}).filter(imgId => imgId !== id)
      setCurrentImageId(remainingImageIds.length > 0 ? remainingImageIds[0] : null)
    }
  }, [updateProject, currentImageId, project])

  // Constraint Management
  const addConstraint = useCallback((constraint: Constraint) => {
    updateProject(prev => ({
      ...prev,
      constraints: [...prev.constraints, constraint]
    }))
  }, [updateProject])

  const updateConstraint = useCallback((id: string, updates: Partial<Constraint>) => {
    updateProject(prev => ({
      ...prev,
      constraints: prev.constraints.map(c =>
        c.id === id ? { ...c, ...updates } : c
      )
    }))
  }, [updateProject])

  const deleteConstraint = useCallback((id: string) => {
    updateProject(prev => ({
      ...prev,
      constraints: prev.constraints.filter(c => c.id !== id)
    }))
  }, [updateProject])

  const toggleConstraint = useCallback((id: string) => {
    updateProject(prev => ({
      ...prev,
      constraints: prev.constraints.map(c =>
        c.id === id ? { ...c, enabled: !c.enabled } : c
      )
    }))
  }, [updateProject])

  // Utility functions
  const getImagePointCount = useCallback((imageId: string): number => {
    if (!project) return 0
    return Object.values(project.worldPoints).filter(wp =>
      wp.imagePoints.some(ip => ip.imageId === imageId)
    ).length
  }, [project])

  const getSelectedPointsInImage = useCallback((imageId: string, selectedPointIds: string[]): number => {
    if (!project) return 0
    return selectedPointIds.filter(pointId => {
      const wp = project.worldPoints[pointId]
      return wp?.imagePoints.some(ip => ip.imageId === imageId)
    }).length
  }, [project])

  const clearProject = useCallback(() => {
    const newProject = ProjectStorage.createEmptyProject()
    setProject(newProject)
    setCurrentImageId(null)
    ProjectStorage.save(newProject)
  }, [])

  const currentImage = project && currentImageId ? project.images[currentImageId] : null

  // Line Management
  const updateLine = useCallback((lineId: string, updates: Partial<Line>) => {
    updateProject(prev => {
      const line = prev.lines[lineId]
      if (!line) return prev

      return {
        ...prev,
        lines: {
          ...prev.lines,
          [lineId]: { ...line, ...updates }
        }
      }
    })
  }, [updateProject])

  const deleteLine = useCallback((lineId: string) => {
    updateProject(prev => {
      const { [lineId]: deleted, ...remainingLines } = prev.lines

      // Remove any constraints that reference this line
      const filteredConstraints = prev.constraints.filter(constraint => {
        // Check if constraint references this line
        if (constraint.type === 'parallel' || constraint.type === 'perpendicular') {
          return !(
            (constraint.line1_wp_a === deleted?.pointA && constraint.line1_wp_b === deleted?.pointB) ||
            (constraint.line2_wp_a === deleted?.pointA && constraint.line2_wp_b === deleted?.pointB)
          )
        }
        return true
      })

      return {
        ...prev,
        lines: remainingLines,
        constraints: filteredConstraints
      }
    })
  }, [updateProject])

  return {
    // State
    project,
    currentImage,
    currentImageId,
    isLoading,
    error,

    // Actions
    setCurrentImageId,
    clearProject,

    // World Points
    createWorldPoint,
    addImagePointToWorldPoint,
    renameWorldPoint,
    deleteWorldPoint,

    // Images
    addImage,
    renameImage,
    deleteImage,

    // Constraints
    addConstraint,
    updateConstraint,
    deleteConstraint,
    toggleConstraint,

    // Lines
    updateLine,
    deleteLine,

    // Utilities
    getImagePointCount,
    getSelectedPointsInImage,

    // Computed values
    worldPoints: project?.worldPoints || {},
    lines: project?.lines || {},
    images: project?.images || {},
    cameras: project?.cameras || {},
    constraints: project?.constraints || [],
    settings: project?.settings || { showPointNames: true, autoSave: true, theme: 'dark' }
  }
}

// Helper functions
function generatePointColor(index: number): string {
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd', '#ff9f43', '#6c5ce7']
  return colors[index % colors.length]
}

function getConstraintPointIds(constraint: Constraint): string[] {
  // Extract point IDs from constraint based on type
  switch (constraint.type) {
    case 'distance':
      return [constraint.pointA, constraint.pointB]
    case 'angle':
      return [constraint.vertex, constraint.line1_end, constraint.line2_end]
    case 'perpendicular':
    case 'parallel':
      return [constraint.line1_wp_a, constraint.line1_wp_b, constraint.line2_wp_a, constraint.line2_wp_b]
    case 'collinear':
      return constraint.wp_ids || []
    case 'rectangle':
      return [constraint.cornerA, constraint.cornerB, constraint.cornerC, constraint.cornerD]
    case 'circle':
      return constraint.point_ids || []
    case 'fixed':
      return [constraint.point_id]
    default:
      return []
  }
}