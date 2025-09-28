// Entity-first multi-selection system with Ctrl/Shift support for new UI paradigm

import { useState, useEffect, useCallback } from 'react'
import { SelectionState } from '../types/project'

export const useSelection = () => {
  const [selectionState, setSelectionState] = useState<SelectionState>({
    selectedPoints: [],
    selectedLines: [],
    selectedPlanes: [],
    selectedImagePoints: [],
    primarySelection: null,
    primaryType: null,
    selectionFilters: {
      points: true,
      lines: true,
      planes: true,
      imagePoints: true
    }
  })

  // Point selection handler
  const handlePointClick = useCallback((pointId: string, ctrlKey: boolean = false, shiftKey: boolean = false) => {
    if (!selectionState.selectionFilters.points) return

    setSelectionState(prev => {
      if (ctrlKey) {
        // Add/remove from selection (Fusion 360 style multi-select)
        const isSelected = prev.selectedPoints.includes(pointId)
        return {
          ...prev,
          selectedPoints: isSelected
            ? prev.selectedPoints.filter(id => id !== pointId)
            : [...prev.selectedPoints, pointId],
          primarySelection: isSelected ? prev.primarySelection : pointId,
          primaryType: isSelected ? prev.primaryType : 'point'
        }
      } else if (shiftKey && prev.selectedPoints.length > 0) {
        // Range selection - for now just add the point
        // TODO: Implement proper range selection based on point ordering
        return {
          ...prev,
          selectedPoints: prev.selectedPoints.includes(pointId)
            ? prev.selectedPoints
            : [...prev.selectedPoints, pointId],
          primarySelection: pointId,
          primaryType: 'point'
        }
      } else {
        // Single selection - replace current selection
        return {
          ...prev,
          selectedPoints: [pointId],
          selectedLines: [],
          selectedPlanes: [],
          selectedImagePoints: [],
          primarySelection: pointId,
          primaryType: 'point'
        }
      }
    })
  }, [selectionState.selectionFilters.points])

  // Line selection handler
  const handleLineClick = useCallback((lineId: string, ctrlKey: boolean = false, shiftKey: boolean = false) => {
    if (!selectionState.selectionFilters.lines) return

    setSelectionState(prev => {
      if (ctrlKey) {
        // Add/remove from selection
        const isSelected = prev.selectedLines.includes(lineId)
        return {
          ...prev,
          selectedLines: isSelected
            ? prev.selectedLines.filter(id => id !== lineId)
            : [...prev.selectedLines, lineId],
          primarySelection: isSelected ? prev.primarySelection : lineId,
          primaryType: isSelected ? prev.primaryType : 'line'
        }
      } else if (shiftKey && prev.selectedLines.length > 0) {
        // Range selection
        return {
          ...prev,
          selectedLines: prev.selectedLines.includes(lineId)
            ? prev.selectedLines
            : [...prev.selectedLines, lineId],
          primarySelection: lineId,
          primaryType: 'line'
        }
      } else {
        // Single selection
        return {
          ...prev,
          selectedPoints: [],
          selectedLines: [lineId],
          selectedPlanes: [],
          selectedImagePoints: [],
          primarySelection: lineId,
          primaryType: 'line'
        }
      }
    })
  }, [selectionState.selectionFilters.lines])

  // Plane selection handler
  const handlePlaneClick = useCallback((planeId: string, ctrlKey: boolean = false, shiftKey: boolean = false) => {
    if (!selectionState.selectionFilters.planes) return

    setSelectionState(prev => {
      if (ctrlKey) {
        // Add/remove from selection
        const isSelected = prev.selectedPlanes.includes(planeId)
        return {
          ...prev,
          selectedPlanes: isSelected
            ? prev.selectedPlanes.filter(id => id !== planeId)
            : [...prev.selectedPlanes, planeId],
          primarySelection: isSelected ? prev.primarySelection : planeId,
          primaryType: isSelected ? prev.primaryType : 'plane'
        }
      } else {
        // Single selection
        return {
          ...prev,
          selectedPoints: [],
          selectedLines: [],
          selectedPlanes: [planeId],
          selectedImagePoints: [],
          primarySelection: planeId,
          primaryType: 'plane'
        }
      }
    })
  }, [selectionState.selectionFilters.planes])

  // Image point selection handler
  const handleImagePointClick = useCallback((imagePointId: string, ctrlKey: boolean = false) => {
    if (!selectionState.selectionFilters.imagePoints) return

    setSelectionState(prev => {
      if (ctrlKey) {
        // Add/remove from selection
        const isSelected = prev.selectedImagePoints.includes(imagePointId)
        return {
          ...prev,
          selectedImagePoints: isSelected
            ? prev.selectedImagePoints.filter(id => id !== imagePointId)
            : [...prev.selectedImagePoints, imagePointId],
          primarySelection: isSelected ? prev.primarySelection : imagePointId,
          primaryType: isSelected ? prev.primaryType : 'imagepoint'
        }
      } else {
        // Single selection
        return {
          ...prev,
          selectedPoints: [],
          selectedLines: [],
          selectedPlanes: [],
          selectedImagePoints: [imagePointId],
          primarySelection: imagePointId,
          primaryType: 'imagepoint'
        }
      }
    })
  }, [selectionState.selectionFilters.imagePoints])

  // Selection filter toggles
  const toggleSelectionFilter = useCallback((entityType: keyof SelectionState['selectionFilters']) => {
    setSelectionState(prev => ({
      ...prev,
      selectionFilters: {
        ...prev.selectionFilters,
        [entityType]: !prev.selectionFilters[entityType]
      }
    }))
  }, [])

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectionState(prev => ({
      ...prev,
      selectedPoints: [],
      selectedLines: [],
      selectedPlanes: [],
      selectedImagePoints: [],
      primarySelection: null,
      primaryType: null
    }))
  }, [])

  // Select all entities of specific type
  const selectAllPoints = useCallback((allPointIds: string[]) => {
    setSelectionState(prev => ({
      ...prev,
      selectedPoints: allPointIds,
      selectedLines: [],
      selectedPlanes: [],
      selectedImagePoints: [],
      primarySelection: allPointIds[allPointIds.length - 1] || null,
      primaryType: allPointIds.length > 0 ? 'point' : null
    }))
  }, [])

  const selectAllLines = useCallback((allLineIds: string[]) => {
    setSelectionState(prev => ({
      ...prev,
      selectedPoints: [],
      selectedLines: allLineIds,
      selectedPlanes: [],
      selectedImagePoints: [],
      primarySelection: allLineIds[allLineIds.length - 1] || null,
      primaryType: allLineIds.length > 0 ? 'line' : null
    }))
  }, [])

  // Computed values
  const hasSelection = selectionState.selectedPoints.length > 0 ||
                     selectionState.selectedLines.length > 0 ||
                     selectionState.selectedPlanes.length > 0 ||
                     selectionState.selectedImagePoints.length > 0

  const totalSelected = selectionState.selectedPoints.length +
                       selectionState.selectedLines.length +
                       selectionState.selectedPlanes.length +
                       selectionState.selectedImagePoints.length

  const selectionSummary = (() => {
    const parts = []

    if (selectionState.selectedPoints.length > 0) {
      parts.push(`${selectionState.selectedPoints.length} point${selectionState.selectedPoints.length !== 1 ? 's' : ''}`)
    }

    if (selectionState.selectedLines.length > 0) {
      parts.push(`${selectionState.selectedLines.length} line${selectionState.selectedLines.length !== 1 ? 's' : ''}`)
    }

    if (selectionState.selectedPlanes.length > 0) {
      parts.push(`${selectionState.selectedPlanes.length} plane${selectionState.selectedPlanes.length !== 1 ? 's' : ''}`)
    }

    if (selectionState.selectedImagePoints.length > 0) {
      parts.push(`${selectionState.selectedImagePoints.length} image point${selectionState.selectedImagePoints.length !== 1 ? 's' : ''}`)
    }

    if (parts.length === 0) {
      return 'Select entities to see available constraints'
    }

    return `Selected: ${parts.join(', ')}`
  })()

  return {
    // State
    ...selectionState,
    hasSelection,
    totalSelected,
    selectionSummary,

    // Actions
    handlePointClick,
    handleLineClick,
    handlePlaneClick,
    handleImagePointClick,
    toggleSelectionFilter,
    clearSelection,
    selectAllPoints,
    selectAllLines,

    // Legacy support (for backwards compatibility)
    selectedPoints: selectionState.selectedPoints,
    selectedLines: selectionState.selectedLines.map(lineId => ({ id: lineId, pointA: '', pointB: '' })), // Simplified for compatibility
    pointCount: selectionState.selectedPoints.length,
    lineCount: selectionState.selectedLines.length,

    // Manual setters for backwards compatibility
    setSelectedPoints: (points: string[]) => setSelectionState(prev => ({
      ...prev,
      selectedPoints: points,
      primarySelection: points[points.length - 1] || null,
      primaryType: points.length > 0 ? 'point' : null
    })),
    setSelectedLines: () => {} // Legacy - not used in new paradigm
  }
}

// Hook for keyboard shortcuts
export const useSelectionKeyboard = (
  onSelectAll: () => void,
  onClearSelection: () => void,
  onDelete: () => void
) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 'a':
            event.preventDefault()
            onSelectAll()
            break
          case 'd':
            event.preventDefault()
            onClearSelection()
            break
        }
      } else {
        switch (event.key) {
          case 'Escape':
            onClearSelection()
            break
          case 'Delete':
          case 'Backspace':
            event.preventDefault()
            onDelete()
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSelectAll, onClearSelection, onDelete])
}