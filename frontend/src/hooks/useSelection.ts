// Multi-selection system with Ctrl/Shift support for Fusion 360-style UX

import { useState, useEffect, useCallback } from 'react'
import { Line, SelectionState } from '../types/project'

export const useSelection = () => {
  const [selectedPoints, setSelectedPoints] = useState<string[]>([])
  const [selectedLines, setSelectedLines] = useState<Line[]>([])
  const [selectionMode, setSelectionMode] = useState<'points' | 'lines' | 'auto'>('auto')

  const handlePointClick = useCallback((pointId: string, ctrlKey: boolean = false, shiftKey: boolean = false) => {
    if (ctrlKey) {
      // Add/remove from selection (Fusion 360 style multi-select)
      setSelectedPoints(prev =>
        prev.includes(pointId)
          ? prev.filter(id => id !== pointId)
          : [...prev, pointId]
      )
    } else if (shiftKey && selectedPoints.length > 0) {
      // Range selection - for now just add the point
      // TODO: Implement proper range selection based on point ordering
      setSelectedPoints(prev =>
        prev.includes(pointId) ? prev : [...prev, pointId]
      )
    } else {
      // Single selection - replace current selection
      setSelectedPoints([pointId])
    }
  }, [selectedPoints])

  const addPointToSelection = useCallback((pointId: string) => {
    setSelectedPoints(prev =>
      prev.includes(pointId) ? prev : [...prev, pointId]
    )
  }, [])

  const removePointFromSelection = useCallback((pointId: string) => {
    setSelectedPoints(prev => prev.filter(id => id !== pointId))
  }, [])

  const detectLines = useCallback((points: string[]): Line[] => {
    // Auto-detect lines from selected points
    // Simple heuristic: every 2 consecutive points form a line
    const lines: Line[] = []
    for (let i = 0; i < points.length - 1; i += 2) {
      if (points[i + 1]) {
        lines.push({
          pointA: points[i],
          pointB: points[i + 1]
        })
      }
    }
    return lines
  }, [])

  const setManualLines = useCallback((lines: Line[]) => {
    setSelectedLines(lines)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedPoints([])
    setSelectedLines([])
  }, [])

  const selectAll = useCallback((allPointIds: string[]) => {
    setSelectedPoints(allPointIds)
  }, [])

  // Auto-detect lines when points are selected - DISABLED for manual constraint creation
  useEffect(() => {
    // Always clear lines - no automatic line detection
    setSelectedLines([])
  }, [selectedPoints, selectionMode])

  // Computed values
  const hasSelection = selectedPoints.length > 0 || selectedLines.length > 0
  const pointCount = selectedPoints.length
  const lineCount = selectedLines.length

  const selectionSummary = (() => {
    const parts = []

    if (pointCount > 0) {
      parts.push(`${pointCount} point${pointCount !== 1 ? 's' : ''}`)
    }

    if (lineCount > 0) {
      parts.push(`${lineCount} line${lineCount !== 1 ? 's' : ''}`)
    }

    if (parts.length === 0) {
      return 'Select points or lines to see available constraints'
    }

    return `Selected: ${parts.join(', ')}`
  })()

  return {
    // State
    selectedPoints,
    selectedLines,
    selectionMode,
    pointCount,
    lineCount,
    hasSelection,
    selectionSummary,

    // Actions
    setSelectionMode,
    handlePointClick,
    addPointToSelection,
    removePointFromSelection,
    setManualLines,
    clearSelection,
    selectAll,

    // Manual selection setters
    setSelectedPoints,
    setSelectedLines
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