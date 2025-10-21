// Keyboard shortcuts for MainLayout
import { useEffect } from 'react'
import { WorldPoint } from '../entities/world-point'
import { Line as LineEntity } from '../entities/line'
import { ActiveTool } from './useMainLayoutState'

interface UseMainLayoutKeyboardParams {
  isConfirmDialogOpen: boolean
  placementMode: { active: boolean; worldPoint: WorldPoint | null }
  cancelPlacementMode: () => void
  activeTool: ActiveTool
  setActiveTool: (tool: ActiveTool) => void
  selectedPointEntities: WorldPoint[]
  selectedLineEntities: LineEntity[]
  selectedPlaneEntities: any[]
  getSelectedByType: (type: string) => any[]
  confirm: (message: string, options?: any) => Promise<boolean>
  deleteConstraint: (constraint: any) => void
  deleteLine: (line: LineEntity) => void
  deleteWorldPoint: (point: WorldPoint) => void
  clearSelection: () => void
  setEditingLine: (line: LineEntity | null) => void
}

export function useMainLayoutKeyboard({
  isConfirmDialogOpen,
  placementMode,
  cancelPlacementMode,
  activeTool,
  setActiveTool,
  selectedPointEntities,
  selectedLineEntities,
  selectedPlaneEntities,
  getSelectedByType,
  confirm,
  deleteConstraint,
  deleteLine,
  deleteWorldPoint,
  clearSelection,
  setEditingLine
}: UseMainLayoutKeyboardParams) {

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      // Don't handle keyboard shortcuts if confirm dialog is open
      if (isConfirmDialogOpen) {
        return
      }

      // Escape key handling
      if (event.key === 'Escape') {
        if (placementMode.active) {
          cancelPlacementMode()
        } else if (activeTool !== 'select') {
          setActiveTool('select')
        }
        return
      }

      // Delete key handling
      if (event.key === 'Delete' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        const selectedPoints = selectedPointEntities
        const selectedLines = selectedLineEntities
        const selectedPlanes = selectedPlaneEntities
        const selectedConstraints = getSelectedByType('constraint' as any)

        const totalSelected = selectedPoints.length + selectedLines.length + selectedPlanes.length + selectedConstraints.length

        if (totalSelected === 0) return

        // Build message
        const parts: string[] = []
        if (selectedPoints.length > 0) parts.push(`${selectedPoints.length} point${selectedPoints.length > 1 ? 's' : ''}`)
        if (selectedLines.length > 0) parts.push(`${selectedLines.length} line${selectedLines.length > 1 ? 's' : ''}`)
        if (selectedPlanes.length > 0) parts.push(`${selectedPlanes.length} plane${selectedPlanes.length > 1 ? 's' : ''}`)
        if (selectedConstraints.length > 0) parts.push(`${selectedConstraints.length} constraint${selectedConstraints.length > 1 ? 's' : ''}`)

        const message = `Delete ${parts.join(', ')}?`

        if (await confirm(message, { variant: 'danger', confirmLabel: 'Delete', cancelLabel: 'Cancel' })) {
          selectedConstraints.forEach(constraint => deleteConstraint(constraint))
          selectedLineEntities.forEach(line => deleteLine(line))
          selectedPlanes.forEach(id => {
            console.warn('Plane deletion not yet implemented')
          })
          selectedPointEntities.forEach(point => deleteWorldPoint(point))
          clearSelection()
        }
        return
      }

      // Tool activation shortcuts (only if no input is focused)
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        switch (event.key.toLowerCase()) {
          case 'w':
            setActiveTool(activeTool === 'point' ? 'select' : 'point')
            break
          case 'l':
            if (selectedPointEntities.length <= 2) {
              if (activeTool === 'line') {
                setActiveTool('select')
                setEditingLine(null)
              } else {
                setEditingLine(null)
                setActiveTool('line')
              }
            }
            break
          case 'o':
            setActiveTool(activeTool === 'loop' ? 'select' : 'loop')
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    placementMode.active,
    activeTool,
    selectedPointEntities,
    selectedLineEntities,
    selectedPlaneEntities,
    getSelectedByType,
    confirm,
    deleteConstraint,
    deleteLine,
    deleteWorldPoint,
    clearSelection,
    isConfirmDialogOpen,
    cancelPlacementMode,
    setActiveTool,
    setEditingLine
  ])
}
