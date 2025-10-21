// View matrix state management hook

import { useState } from 'react'
import type { ViewMatrix } from '../types'

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

  const zoomFit = () => {
    // Calculate bounding box of all points and fit view
    // TODO: Implement proper fit calculation
    setViewMatrix(prev => ({
      ...prev,
      scale: 100,
      translation: { x: 0, y: 0, z: 0 }
    }))
  }

  return {
    viewMatrix,
    setViewMatrix,
    resetView,
    resetRotation,
    resetPan,
    zoomFit
  }
}
