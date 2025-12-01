// View matrix state management hook

import { useState, useCallback } from 'react'
import type { ViewMatrix } from '../types'
import type { Project } from '../../../entities/project'

export function useViewMatrix() {
  const [viewMatrix, setViewMatrix] = useState<ViewMatrix>({
    scale: 100,
    rotation: { x: 0, y: 0, z: 0 },
    translation: { x: 0, y: 0, z: 0 }
  })

  const resetView = () => {
    setViewMatrix({
      scale: 100,
      rotation: { x: 0, y: 0, z: 0 },
      translation: { x: 0, y: 0, z: 0 }
    })
  }

  const resetRotation = () => {
    setViewMatrix(prev => ({ ...prev, rotation: { x: 0, y: 0, z: 0 } }))
  }

  const resetPan = () => {
    setViewMatrix(prev => ({ ...prev, translation: { x: 0, y: 0, z: 0 } }))
  }

  const zoomFitToProject = useCallback((project: Project, canvasWidth: number, canvasHeight: number) => {
    const points = Array.from(project.worldPoints.values())
    if (points.length === 0) {
      setViewMatrix(prev => ({
        ...prev,
        scale: 100,
        translation: { x: 0, y: 0, z: 0 }
      }))
      return
    }

    // Calculate bounding box from all points (using optimized or effective coordinates)
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    let minZ = Infinity, maxZ = -Infinity

    for (const point of points) {
      const coords = point.optimizedXyz ?? point.getEffectiveXyz()
      if (!coords) continue

      const [x, y, z] = coords
      if (x !== null) {
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
      }
      if (y !== null) {
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
      if (z !== null) {
        minZ = Math.min(minZ, z)
        maxZ = Math.max(maxZ, z)
      }
    }

    // Also include viewpoint camera positions
    for (const vp of project.viewpoints.values()) {
      if (vp.position) {
        const [x, y, z] = vp.position
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
        minZ = Math.min(minZ, z)
        maxZ = Math.max(maxZ, z)
      }
    }

    // If no valid coordinates found, use default view
    if (!isFinite(minX) || !isFinite(maxX)) {
      setViewMatrix(prev => ({
        ...prev,
        scale: 100,
        translation: { x: 0, y: 0, z: 0 }
      }))
      return
    }

    // Calculate the size of the bounding box
    const sizeX = Math.max(maxX - minX, 0.1)
    const sizeY = Math.max(maxY - minY, 0.1)
    const sizeZ = Math.max(maxZ - minZ, 0.1)
    const maxSize = Math.max(sizeX, sizeY, sizeZ)

    // Calculate center of bounding box
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const centerZ = (minZ + maxZ) / 2

    // Calculate scale to fit in canvas with 20% margin
    const margin = 0.8
    const canvasSize = Math.min(canvasWidth, canvasHeight) * margin
    const scale = canvasSize / maxSize

    // Translation to center the view (canvas center minus projected world center)
    // At scale 100, 1 unit = 1 pixel. The 3D projection applies current rotation.
    // We set translation to bring center to canvas center after projection
    const canvasCenterX = canvasWidth / 2
    const canvasCenterY = canvasHeight / 2

    setViewMatrix(prev => ({
      ...prev,
      scale: Math.max(10, Math.min(1000, scale)),
      translation: {
        x: canvasCenterX - centerX * scale,
        y: canvasCenterY - centerY * scale,
        z: -centerZ * scale
      }
    }))
  }, [])

  return {
    viewMatrix,
    setViewMatrix,
    resetView,
    resetRotation,
    resetPan,
    zoomFitToProject
  }
}
