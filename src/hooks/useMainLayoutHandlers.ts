// Event handlers for MainLayout
import { useCallback } from 'react'
import { WorldPoint } from '../entities/world-point'
import { Line as LineEntity } from '../entities/line'
import { Plane } from '../entities/plane'
import { ActiveTool } from './useMainLayoutState'
import { ISelectable } from '../types/selectable'

interface UseMainLayoutHandlersParams {
  activeTool: ActiveTool
  setActiveTool: (tool: ActiveTool) => void
  selectedPointEntities: WorldPoint[]
  addToSelection: (entity: ISelectable) => void
  handleEntityClick: (entity: ISelectable, ctrlKey: boolean, shiftKey: boolean) => void
  clearSelection: () => void
  editingLine: LineEntity | null
  setEditingLine: (line: LineEntity | null) => void
}

export function useMainLayoutHandlers({
  activeTool,
  setActiveTool,
  selectedPointEntities,
  addToSelection,
  handleEntityClick,
  clearSelection,
  editingLine,
  setEditingLine
}: UseMainLayoutHandlersParams) {

  // Point click handler
  const handleEnhancedPointClick = useCallback((
    worldPoint: WorldPoint,
    ctrlKey: boolean,
    shiftKey: boolean
  ) => {
    // If Line tool is active, dispatch event for slot filling
    if (activeTool === 'line') {
      const event = new CustomEvent('lineToolPointClick', {
        detail: { worldPoint },
        cancelable: true
      })
      window.dispatchEvent(event)
      if (event.defaultPrevented) return
      // Slots were full — fall through to normal selection
    }

    // If Coplanar tool is active, dispatch event for adding points
    if (activeTool === 'plane') {
      const event = new CustomEvent('coplanarToolPointClick', { detail: { worldPoint } })
      window.dispatchEvent(event)
      return
    }

    // If Loop tool is active, treat normal clicks as additive only
    if (activeTool === 'loop') {
      if (shiftKey) {
        handleEntityClick(worldPoint, false, true)
      } else {
        const firstSelected = selectedPointEntities.length > 0 ? selectedPointEntities[0] : null
        if (firstSelected && worldPoint === firstSelected && selectedPointEntities.length >= 3) {
          window.dispatchEvent(new CustomEvent('loopToolSetClosed', { detail: { closed: true } }))
        } else {
          addToSelection(worldPoint)
        }
      }
      return
    }

    // Normal selection behavior
    handleEntityClick(worldPoint, ctrlKey, shiftKey)
  }, [activeTool, selectedPointEntities, handleEntityClick, addToSelection])

  // Line click handler
  const handleEnhancedLineClick = useCallback((
    line: LineEntity,
    ctrlKey: boolean,
    shiftKey: boolean
  ) => {
    // Don't allow line switching during edit mode
    if (editingLine && line !== editingLine) {
      return
    }

    // If Orientation Paint tool is active, dispatch event for painting
    if (activeTool === 'orientationPaint') {
      const event = new CustomEvent('orientationPaintLineClick', { detail: { line } })
      window.dispatchEvent(event)
      return
    }

    handleEntityClick(line, ctrlKey, shiftKey)
  }, [editingLine, handleEntityClick, activeTool])

  // Plane click handler
  const handlePlaneClick = useCallback((
    plane: Plane,
    ctrlKey: boolean,
    shiftKey: boolean
  ) => {
    handleEntityClick(plane, ctrlKey, shiftKey)
  }, [handleEntityClick])

  // Empty space click handler
  const handleEmptySpaceClick = useCallback((shiftKey: boolean) => {
    // Don't clear selection when loop or orientationPaint tools are active
    if (activeTool === 'loop' || activeTool === 'orientationPaint') {
      return
    }
    if (!shiftKey) {
      clearSelection()
    }
  }, [clearSelection, activeTool])

  return {
    handleEnhancedPointClick,
    handleEnhancedLineClick,
    handlePlaneClick,
    handleEmptySpaceClick
  }
}
