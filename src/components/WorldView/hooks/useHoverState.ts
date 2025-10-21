// Hover state management hook

import { useState } from 'react'
import type { HoverState } from '../types'

export function useHoverState() {
  const [hoverState, setHoverState] = useState<HoverState>({
    hoveredPoint: null,
    hoveredLine: null
  })

  const setHoveredPoint = (point: any) => {
    setHoverState(prev => ({ ...prev, hoveredPoint: point }))
  }

  const setHoveredLine = (line: any) => {
    setHoverState(prev => ({ ...prev, hoveredLine: line }))
  }

  const clearHover = () => {
    setHoverState({
      hoveredPoint: null,
      hoveredLine: null
    })
  }

  return {
    hoverState,
    setHoverState,
    setHoveredPoint,
    setHoveredLine,
    clearHover
  }
}
