// Enhanced project management hook with unified entity system

import { useState, useEffect, useCallback } from 'react'
import { EnhancedProject, EnhancedProjectSettings, WorkspaceState } from '../types/enhanced-project'
import { EntityCollection } from '../types/entities'
import { EnhancedConstraint } from '../types/geometry'
import { useEntityManager } from './useEntityManager'

// Default settings for new projects
const DEFAULT_SETTINGS: EnhancedProjectSettings = {
  // Display settings
  showPointNames: true,
  showPointIds: false,
  showConstraintGlyphs: true,
  showMeasurements: true,
  showConstructionGeometry: true,

  // Theme and visual
  theme: 'dark',
  visualFeedbackLevel: 'standard',
  entityColors: {
    default: '#2196F3',
    selected: '#FFC107',
    highlighted: '#FF9800',
    construction: '#9E9E9E',
    points: '#2196F3',
    lines: '#4CAF50',
    planes: '#9C27B0',
    circles: '#FF5722',
    satisfied: '#4CAF50',
    warning: '#FF9800',
    violated: '#F44336',
    conflicting: '#9C27B0',
    redundant: '#9E9E9E'
  },

  // Units and precision
  measurementUnits: 'meters',
  precisionDigits: 3,
  anglePrecisionDigits: 1,

  // Workspace behavior
  defaultWorkspace: 'image',
  autoSwitchWorkspace: false,
  enableSmartSnapping: true,
  snapTolerance: 5,

  // Constraint behavior
  constraintPreview: true,
  autoOptimize: false,
  solverMaxIterations: 1000,
  solverTolerance: 1e-6,

  // Grid and visualization
  gridVisible: true,
  gridSize: 1.0,
  snapToGrid: false,
  showCoordinateAxes: true,
  showCameraPoses: true,

  // Performance
  maxVisibleEntities: 10000,
  levelOfDetail: true,
  renderQuality: 'medium',

  // Auto-save and backup
  autoSave: true,
  autoSaveInterval: 5,
  keepBackups: 5
}

const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  currentWorkspace: 'image',
  imageWorkspace: {
    currentImageId: null,
    scale: 1.0,
    pan: { x: 0, y: 0 },
    showImagePoints: true,
    showProjections: true
  },
  worldWorkspace: {
    viewMatrix: {
      scale: 100,
      rotation: { x: 0, y: 0, z: 0 },
      translation: { x: 0, y: 0, z: 0 }
    },
    renderMode: 'wireframe',
    showAxes: true,
    showGrid: true,
    showCameras: true
  },
  splitWorkspace: {
    splitDirection: 'line_axis_aligned',
    splitRatio: 0.5,
    syncSelection: true,
    syncNavigation: false
  }
}

export const useEnhancedProject = () => {
  const [project, setProject] = useState<EnhancedProject | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Initialize entity manager
  const entityManager = useEntityManager(
    project?.entities,
    project?.constraints || []
  )

  // Load project from storage
  useEffect(() => {
    const loadProject = async () => {
      try {
        setIsLoading(true)

        // Try to load from localStorage first
        const savedProject = localStorage.getItem('pictorigo-enhanced-project')

        if (savedProject) {
          const parsed = JSON.parse(savedProject) as EnhancedProject

          // Validate and migrate if necessary
          const migratedProject = await migrateProject(parsed)
          setProject(migratedProject)
        } else {
          // Create new empty project
          const newProject = createEmptyProject()
          setProject(newProject)
          await saveProject(newProject)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load project')
      } finally {
        setIsLoading(false)
      }
    }

    loadProject()
  }, [])

  // Auto-save when project changes
  useEffect(() => {
    if (project && !isLoading && project.settings.autoSave) {
      const timeoutId = setTimeout(() => {
        saveProject(project)
      }, 1000) // Debounce saves

      return () => clearTimeout(timeoutId)
    }
  }, [project, isLoading])

  // Create empty project
  const createEmptyProject = useCallback((): EnhancedProject => {
    const now = new Date().toISOString()

    return {
      id: crypto.randomUUID(),
      name: 'Untitled Project',
      version: '2.0.0',

      entities: {
        points: {},
        lines: {},
        planes: {},
        circles: {}
      },

      constraints: [],
      images: {},
      cameras: {},

      entityManager: entityManager,
      selection: entityManager.selection,

      workspaceState: DEFAULT_WORKSPACE_STATE,
      settings: DEFAULT_SETTINGS,

      constraintTypes: {}, // Will be populated with available constraint types

      groups: {},
      layers: {},

      optimization: {
        status: 'idle',
        currentIteration: 0,
        maxIterations: 1000,
        residual: 0,
        targetResidual: 1e-6,
        constraintProgress: []
      },

      history: [],
      currentHistoryIndex: -1,

      createdAt: now,
      updatedAt: now,

      isModified: false,
      autoSaveEnabled: true
    }
  }, [entityManager])

  // Save project to storage
  const saveProject = useCallback(async (projectToSave: EnhancedProject) => {
    try {
      const serialized = JSON.stringify({
        ...projectToSave,
        lastSavedAt: new Date().toISOString(),
        isModified: false
      })

      localStorage.setItem('pictorigo-enhanced-project', serialized)

      // Also save backup
      const backupKey = `pictorigo-backup-${Date.now()}`
      localStorage.setItem(backupKey, serialized)

      // Clean up old backups
      const keys = Object.keys(localStorage)
      const backupKeys = keys.filter(key => key.startsWith('pictorigo-backup-'))
        .sort()
        .slice(0, -projectToSave.settings.keepBackups)

      backupKeys.forEach(key => localStorage.removeItem(key))

    } catch (err) {
      console.error('Failed to save project:', err)
      setError('Failed to save project')
    }
  }, [])

  // Project migration (placeholder)
  const migrateProject = useCallback(async (oldProject: any): Promise<EnhancedProject> => {
    // TODO: Implement migration from legacy project format
    if (oldProject.version === '2.0.0') {
      return oldProject as EnhancedProject
    }

    // For now, just return the project as-is
    return oldProject as EnhancedProject
  }, [])

  // Update project
  const updateProject = useCallback((updater: (prev: EnhancedProject) => EnhancedProject) => {
    setProject(prev => {
      if (!prev) return prev

      const updated = updater(prev)
      return {
        ...updated,
        updatedAt: new Date().toISOString(),
        isModified: true
      }
    })
  }, [])

  // Workspace management
  const setCurrentWorkspace = useCallback((workspace: 'image' | 'world' | 'split') => {
    updateProject(prev => ({
      ...prev,
      workspaceState: {
        ...prev.workspaceState,
        currentWorkspace: workspace
      }
    }))
  }, [updateProject])

  const updateWorkspaceState = useCallback((updates: Partial<WorkspaceState>) => {
    updateProject(prev => ({
      ...prev,
      workspaceState: {
        ...prev.workspaceState,
        ...updates
      }
    }))
  }, [updateProject])

  // Settings management
  const updateSettings = useCallback((updates: Partial<EnhancedProjectSettings>) => {
    updateProject(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...updates
      }
    }))
  }, [updateProject])

  // Constraint management
  const addConstraint = useCallback((constraint: EnhancedConstraint) => {
    updateProject(prev => ({
      ...prev,
      constraints: [...prev.constraints, constraint]
    }))
  }, [updateProject])

  const updateConstraint = useCallback((id: string, updates: Partial<EnhancedConstraint>) => {
    updateProject(prev => ({
      ...prev,
      constraints: prev.constraints.map(c =>
        c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
      )
    }))
  }, [updateProject])

  const deleteConstraint = useCallback((id: string) => {
    updateProject(prev => ({
      ...prev,
      constraints: prev.constraints.filter(c => c.id !== id)
    }))
  }, [updateProject])

  // Project operations
  const clearProject = useCallback(() => {
    const newProject = createEmptyProject()
    setProject(newProject)
    saveProject(newProject)
  }, [createEmptyProject, saveProject])

  const duplicateProject = useCallback(() => {
    if (!project) return

    const duplicated: EnhancedProject = {
      ...project,
      id: crypto.randomUUID(),
      name: `${project.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isModified: true
    }

    setProject(duplicated)
  }, [project])

  // Export current project state
  const exportProject = useCallback((format: 'json' | 'legacy' = 'json') => {
    if (!project) return null

    if (format === 'legacy') {
      // Convert to legacy format for backwards compatibility
      return convertToLegacyProject(project)
    }

    return project
  }, [project])

  // Convert to legacy project format (placeholder)
  const convertToLegacyProject = useCallback((enhancedProject: EnhancedProject) => {
    // TODO: Implement conversion to legacy format
    return {
      id: enhancedProject.id,
      name: enhancedProject.name,
      worldPoints: enhancedProject.entities.points,
      images: enhancedProject.images,
      cameras: enhancedProject.cameras,
      constraints: enhancedProject.constraints,
      settings: {
        showPointNames: enhancedProject.settings.showPointNames,
        autoSave: enhancedProject.settings.autoSave,
        theme: enhancedProject.settings.theme
      }
    }
  }, [])

  // Project validation
  const validateProject = useCallback(() => {
    if (!project) return null

    const validation = entityManager.operations.validateAll()
    const errors: string[] = []
    const warnings: string[] = []

    // Collect all validation results
    for (const [entityId, result] of Object.entries(validation)) {
      errors.push(...result.errors)
      warnings.push(...result.warnings)
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      entityValidation: validation
    }
  }, [project, entityManager])

  return {
    // Core state
    project,
    isLoading,
    error,

    // Entity management
    entityManager,

    // Project operations
    updateProject,
    clearProject,
    duplicateProject,
    exportProject,
    validateProject,

    // Workspace management
    setCurrentWorkspace,
    updateWorkspaceState,

    // Settings
    updateSettings,

    // Constraints
    addConstraint,
    updateConstraint,
    deleteConstraint,

    // Computed values
    currentWorkspace: project?.workspaceState.currentWorkspace || 'image',
    settings: project?.settings || DEFAULT_SETTINGS,
    entities: project?.entities || { points: {}, lines: {}, planes: {}, circles: {} },
    constraints: project?.constraints || [],
    images: project?.images || {},
    cameras: project?.cameras || {}
  }
}