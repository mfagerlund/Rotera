// Entity-based project hook - CLEAN, NO LEGACY
// DTOs are ONLY touched during load/save
// ALL runtime work uses entities

import { useState, useEffect } from 'react'
import { Project } from '../entities/project'
import { Viewpoint } from '../entities/viewpoint'
import { project as globalProject, loadProject as setGlobalProject } from '../store/project-store'

/**
 * Hook that manages entity-based project
 * Uses global project store - the project is set by App.tsx via loadProject()
 */
export const useEntityProject = () => {
  const [entityProject, setEntityProject] = useState<Project | null>(globalProject)
  const [currentViewpoint, setCurrentViewpoint] = useState<Viewpoint | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sync with global project when it changes
  useEffect(() => {
    setEntityProject(globalProject)
    // Set current viewpoint to first if available
    if (globalProject && globalProject.viewpoints.size > 0) {
      const firstViewpoint = Array.from(globalProject.viewpoints)[0]
      setCurrentViewpoint(firstViewpoint)
    } else {
      setCurrentViewpoint(null)
    }
  }, [])

  // Update the local state setter to also update global
  const handleSetProject = (newProject: Project | null) => {
    if (newProject) {
      setGlobalProject(newProject)
    }
    setEntityProject(newProject)
  }

  const saveProject = () => {
    // No-op for now - IndexedDB save is handled by MainLayout
  }

  return {
    project: entityProject,
    setProject: handleSetProject,
    saveProject,
    currentViewpoint,
    setCurrentViewpoint,
    isLoading,
    error
  }
}
