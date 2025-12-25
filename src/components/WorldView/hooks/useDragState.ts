// Drag state management hook

import { useState } from 'react'
import type { DragState } from '../types'
import type { WorldPoint } from '../../../entities/world-point/WorldPoint'

export function useDragState() {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    lastX: 0,
    lastY: 0,
    dragType: 'rotate'
  })

  const startDrag = (x: number, y: number, dragType: 'rotate' | 'pan' | 'point', draggedPoint?: WorldPoint) => {
    setDragState({
      isDragging: true,
      lastX: x,
      lastY: y,
      dragType,
      draggedPoint
    })
  }

  const updateDrag = (x: number, y: number) => {
    setDragState(prev => ({
      ...prev,
      lastX: x,
      lastY: y
    }))
  }

  const endDrag = () => {
    setDragState(prev => ({
      ...prev,
      isDragging: false,
      draggedPoint: undefined
    }))
  }

  return {
    dragState,
    startDrag,
    updateDrag,
    endDrag
  }
}
