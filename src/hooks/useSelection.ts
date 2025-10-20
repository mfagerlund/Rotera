// Unified entity selection system with ISelectable interface

import { useState, useEffect, useCallback, useMemo } from 'react'
import { EntitySelection, EntitySelectionImpl, ISelectable, SelectableType, getSelectionStats } from '../types/selectable'

export const useSelection = () => {
  // Pure object-based selection state
  const [selection, setSelection] = useState<EntitySelection>(new EntitySelectionImpl())

  // Entity type filters
  const [filters, setFilters] = useState({
    points: true,
    lines: true,
    planes: true,
    constraints: true,
    cameras: true,
    images: true
  })


  // Pure entity selection handler
  const handleEntityClick = useCallback((entity: ISelectable, ctrlKey: boolean = false, shiftKey: boolean = false) => {
    const entityType = entity.getType()

    // Check if this entity type is filtered
    const filterKey = entityType === 'point' ? 'points' :
                     entityType === 'line' ? 'lines' :
                     entityType === 'plane' ? 'planes' :
                     entityType === 'constraint' ? 'constraints' :
                     entityType === 'camera' ? 'cameras' :
                     entityType === 'image' ? 'images' :
                     'points' // fallback

    if (!filters[filterKey as keyof typeof filters]) {
      return
    }

    setSelection(prev => {
      const newSelection = new EntitySelectionImpl()

      if (ctrlKey || shiftKey) {
        // Add/remove from selection (multi-select) - both Ctrl and Shift toggle
        if (prev.has(entity)) {
          // Remove the entity
          for (const item of prev.items) {
            if (item !== entity) {
              newSelection.add(item)
            }
          }
        } else {
          // Add the entity
          newSelection.addMultiple([...Array.from(prev.items), entity])
        }
      } else {
        // Single selection - replace current selection
        newSelection.add(entity)
      }

      return newSelection
    })
  }, [filters])


  // Selection filter toggles
  const toggleSelectionFilter = useCallback((entityType: keyof typeof filters) => {
    setFilters(prev => ({
      ...prev,
      [entityType]: !prev[entityType]
    }))
  }, [])

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelection(new EntitySelectionImpl())
  }, [])

  // Add to selection without toggle (for loop tool)
  const addToSelection = useCallback((entity: ISelectable) => {
    setSelection(prev => {
      const wasAlreadySelected = prev.has(entity)

      if (wasAlreadySelected) {
        return prev // Already selected - don't toggle
      }

      const newSelection = new EntitySelectionImpl()
      newSelection.addMultiple([...Array.from(prev.items), entity])
      return newSelection
    })
  }, [])

  // Select all entities of specific type
  const selectAllEntities = useCallback((entities: ISelectable[]) => {
    const newSelection = new EntitySelectionImpl()
    newSelection.addMultiple(entities)
    setSelection(newSelection)
  }, [])

  const selectAllByType = useCallback((entities: ISelectable[], entityType: SelectableType) => {
    selectAllEntities(entities.filter(e => e.getType() === entityType))
  }, [selectAllEntities])

  // Computed values using selection
  const hasSelection = selection.count > 0
  const totalSelected = selection.count
  const selectionStats = useMemo(() => getSelectionStats(selection), [selection])

  const selectionSummary = useMemo(() => {
    const parts = []

    if (selectionStats.point > 0) {
      parts.push(`${selectionStats.point} point${selectionStats.point !== 1 ? 's' : ''}`)
    }

    if (selectionStats.line > 0) {
      parts.push(`${selectionStats.line} line${selectionStats.line !== 1 ? 's' : ''}`)
    }

    if (selectionStats.plane > 0) {
      parts.push(`${selectionStats.plane} plane${selectionStats.plane !== 1 ? 's' : ''}`)
    }

    if (selectionStats.image > 0) {
      parts.push(`${selectionStats.image} image point${selectionStats.image !== 1 ? 's' : ''}`)
    }

    if (parts.length === 0) {
      return 'Select entities to see available constraints'
    }

    return `Selected: ${parts.join(', ')}`
  }, [selectionStats])

  return {
    // Pure object-based selection API
    selection,
    handleEntityClick,
    addToSelection,
    selectAllEntities,
    selectAllByType,
    selectionStats,
    hasSelection,
    totalSelected,
    selectionSummary,
    toggleSelectionFilter,
    clearSelection,
    filters,

    // Filtering helpers
    getSelectedByType: <T extends ISelectable>(type: SelectableType): T[] =>
      selection.getByType<T>(type),
    getSelectedEntities: (): ISelectable[] =>
      Array.from(selection.items),
    getSelectedIds: (): string[] =>
      selection.items.map(e => e.getId()),
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