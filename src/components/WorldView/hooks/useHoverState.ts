// Hover state management hook

import { useState } from 'react'
import type { HoverState } from '../types'
import type { WorldPoint } from '../../../entities/world-point/WorldPoint'
import type { Line } from '../../../entities/line/Line'

export function useHoverState() {
  const [hoverState, setHoverState] = useState<HoverState>({
    hoveredPoint: null,
    hoveredLine: null
  })

  const setHoveredPoint = (point: WorldPoint | null) => {
    setHoverState(prev => ({ ...prev, hoveredPoint: point }))
  }

  const setHoveredLine = (line: Line | null) => {
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
