// Event handlers for MainLayout
import { useCallback } from 'react'
import { WorldPoint } from '../entities/world-point'
import { Line as LineEntity } from '../entities/line'
import { Plane } from '../entities/plane'
import { ActiveTool } from './useMainLayoutState'

interface UseMainLayoutHandlersParams {
  activeTool: ActiveTool
  setActiveTool: (tool: ActiveTool) => void
  selectedPointEntities: WorldPoint[]
  addToSelection: (entity: any) => void
  handleEntityClick: (entity: any, ctrlKey: boolean, shiftKey: boolean) => void
  clearSelection: () => void
  editingLine: LineEntity | null
  setEditingLine: (line: LineEntity | null) => void
  onEditLineOpen: (line: LineEntity) => void
  onEditPointOpen: (point: WorldPoint) => void
}

export function useMainLayoutHandlers({
  activeTool,
  setActiveTool,
  selectedPointEntities,
  addToSelection,
  handleEntityClick,
  clearSelection,
  editingLine,
  setEditingLine,
  onEditLineOpen,
  onEditPointOpen
}: UseMainLayoutHandlersParams) {

  // Point click handler
  const handleEnhancedPointClick = useCallback((
    worldPoint: WorldPoint,
    ctrlKey: boolean,
    shiftKey: boolean
  ) => {
    // If Line tool is active, dispatch event for slot filling
    if (activeTool === 'line') {
      const event = new CustomEvent('lineToolPointClick', { detail: { worldPoint } })
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

    // Normal selection behavior - consistent with lines
    if (ctrlKey || shiftKey) {
      handleEntityClick(worldPoint, ctrlKey, shiftKey)
    } else {
      handleEntityClick(worldPoint, false, false)
      onEditPointOpen(worldPoint)
    }
  }, [activeTool, selectedPointEntities, handleEntityClick, addToSelection, onEditPointOpen])

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

    if (ctrlKey || shiftKey) {
      handleEntityClick(line, ctrlKey, shiftKey)
    } else {
      handleEntityClick(line, false, false)
      onEditLineOpen(line)
    }
  }, [editingLine, handleEntityClick, onEditLineOpen])

  // Plane click handler
  const handlePlaneClick = useCallback((
    plane: Plane,
    ctrlKey: boolean,
    shiftKey: boolean
  ) => {
    // TODO: Implement plane selection/editing
  }, [])

  // Empty space click handler
  const handleEmptySpaceClick = useCallback((shiftKey: boolean) => {
    if (activeTool === 'loop') {
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
