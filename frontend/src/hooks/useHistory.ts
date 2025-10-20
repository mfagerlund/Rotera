// Project history management for undo/redo functionality

import { useState, useCallback } from 'react'
import { EntityProject } from '../types/project-entities'
import { ProjectHistoryEntry } from '../types/ui-types'

export const useHistory = () => {
  const [historyIndex, setHistoryIndex] = useState(-1)

  const addHistoryEntry = useCallback((
    project: EntityProject,
    action: string,
    description: string,
    before?: any,
    after?: any
  ): EntityProject => {
    const entry: ProjectHistoryEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      description,
      before,
      after
    }

    // Remove any future history if we're not at the end
    const newHistory = project.history.slice(0, historyIndex + 1)
    newHistory.push(entry)

    // Limit history to last 50 entries to prevent memory issues
    const limitedHistory = newHistory.slice(-50)

    const updatedProject = {
      ...project,
      history: limitedHistory,
      updatedAt: new Date().toISOString()
    }

    // Update history index to point to the new entry
    setHistoryIndex(limitedHistory.length - 1)

    return updatedProject
  }, [historyIndex])

  const canUndo = useCallback((project: EntityProject) => {
    return historyIndex > 0 && project.history.length > 0
  }, [historyIndex])

  const canRedo = useCallback((project: EntityProject) => {
    return historyIndex < project.history.length - 1
  }, [historyIndex])

  const undo = useCallback((project: EntityProject): EntityProject | null => {
    if (!canUndo(project)) return null

    const targetIndex = historyIndex - 1
    const targetEntry = project.history[targetIndex]

    if (!targetEntry || !targetEntry.before) return null

    setHistoryIndex(targetIndex)

    // Apply the "before" state
    return {
      ...project,
      ...targetEntry.before,
      updatedAt: new Date().toISOString()
    }
  }, [historyIndex, canUndo])

  const redo = useCallback((project: EntityProject): EntityProject | null => {
    if (!canRedo(project)) return null

    const targetIndex = historyIndex + 1
    const targetEntry = project.history[targetIndex]

    if (!targetEntry || !targetEntry.after) return null

    setHistoryIndex(targetIndex)

    // Apply the "after" state
    return {
      ...project,
      ...targetEntry.after,
      updatedAt: new Date().toISOString()
    }
  }, [historyIndex, canRedo])

  const getCurrentEntry = useCallback((project: EntityProject): ProjectHistoryEntry | null => {
    if (historyIndex < 0 || historyIndex >= project.history.length) return null
    return project.history[historyIndex]
  }, [historyIndex])

  const getHistoryStats = useCallback((project: EntityProject) => {
    return {
      currentIndex: historyIndex,
      totalEntries: project.history.length,
      canUndo: canUndo(project),
      canRedo: canRedo(project),
      currentEntry: getCurrentEntry(project)
    }
  }, [historyIndex, canUndo, canRedo, getCurrentEntry])

  const resetHistory = useCallback((project: EntityProject): EntityProject => {
    setHistoryIndex(-1)
    return {
      ...project,
      history: [],
      updatedAt: new Date().toISOString()
    }
  }, [])

  return {
    addHistoryEntry,
    canUndo,
    canRedo,
    undo,
    redo,
    getCurrentEntry,
    getHistoryStats,
    resetHistory,
    historyIndex
  }
}

// Helper function to create history entry data
export const createHistoryData = {
  worldPointCreated: (worldPoint: any) => ({
    action: 'create_world_point',
    description: `Created world point ${worldPoint.name}`,
    before: null,
    after: { worldPoints: { [worldPoint.id]: worldPoint } }
  }),

  worldPointDeleted: (worldPoint: any, constraints: any[]) => ({
    action: 'delete_world_point',
    description: `Deleted world point ${worldPoint.name}`,
    before: {
      worldPoints: { [worldPoint.id]: worldPoint },
      constraints: constraints
    },
    after: null
  }),

  worldPointRenamed: (oldName: string, newName: string, worldPoint: any) => ({
    action: 'rename_world_point',
    description: `Renamed ${oldName} to ${newName}`,
    before: { worldPoints: { [worldPoint.id]: { ...worldPoint, name: oldName } } },
    after: { worldPoints: { [worldPoint.id]: { ...worldPoint, name: newName } } }
  }),

  constraintCreated: (constraint: any) => ({
    action: 'create_constraint',
    description: `Created ${constraint.type} constraint`,
    before: null,
    after: { constraints: [constraint] }
  }),

  constraintDeleted: (constraint: any) => ({
    action: 'delete_constraint',
    description: `Deleted ${constraint.type} constraint`,
    before: { constraints: [constraint] },
    after: null
  }),

  constraintEdited: (oldConstraint: any, newConstraint: any) => ({
    action: 'edit_constraint',
    description: `Modified ${newConstraint.type} constraint`,
    before: { constraints: [oldConstraint] },
    after: { constraints: [newConstraint] }
  }),

  originSet: (pointId: string, pointName: string) => ({
    action: 'set_origin',
    description: `Set ${pointName} as origin`,
    before: { coordinateSystem: null },
    after: { coordinateSystem: { origin: pointId } }
  }),

  groundPlaneSet: (pointA: string, pointB: string, pointC: string) => ({
    action: 'set_ground_plane',
    description: 'Defined ground plane',
    before: null,
    after: {
      coordinateSystem: {
        groundPlane: { pointA, pointB, pointC }
      }
    }
  })
}

// Keyboard shortcuts hook for undo/redo
export const useHistoryKeyboard = (
  onUndo: () => void,
  onRedo: () => void,
  canUndo: boolean,
  canRedo: boolean
) => {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts if user is typing in an input
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return
    }

    if (event.ctrlKey || event.metaKey) {
      switch (event.key.toLowerCase()) {
        case 'z':
          if (event.shiftKey) {
            // Ctrl+Shift+Z = Redo
            if (canRedo) {
              event.preventDefault()
              onRedo()
            }
          } else {
            // Ctrl+Z = Undo
            if (canUndo) {
              event.preventDefault()
              onUndo()
            }
          }
          break
        case 'y':
          // Ctrl+Y = Redo (alternative)
          if (canRedo) {
            event.preventDefault()
            onRedo()
          }
          break
      }
    }
  }, [onUndo, onRedo, canUndo, canRedo])

  // Attach global keyboard listener
  React.useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

import React from 'react'