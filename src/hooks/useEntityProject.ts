// Entity-based project hook - CLEAN, NO LEGACY
// DTOs are ONLY touched during load/save
// ALL runtime work uses entities

import { useState, useEffect } from 'react'
import { Project } from '../entities/project'
import { Viewpoint } from '../entities/viewpoint'
import { project as globalProject, loadProject as setGlobalProject } from '../store/project-store'

/**
 * Get the first viewpoint according to the project's image sort order.
 * Uses the same sorting logic as ImageNavigationToolbar.
 */
function getFirstViewpointBySortOrder(project: Project): Viewpoint | null {
  if (project.viewpoints.size === 0) return null

  const viewpoints = Array.from(project.viewpoints)
  const sortOrder = project.imageSortOrder || []

  // Sort viewpoints using the same logic as ImageNavigationToolbar
  const sorted = viewpoints.slice().sort((a, b) => {
    const indexA = sortOrder.indexOf(a.getName())
    const indexB = sortOrder.indexOf(b.getName())
    // Images in sort order come first (by their index), unsorted images go to end (Infinity)
    const orderA = indexA >= 0 ? indexA : Infinity
    const orderB = indexB >= 0 ? indexB : Infinity
    return orderA - orderB
  })

  return sorted[0]
}

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
    // Set current viewpoint to first by sort order if available
    if (globalProject) {
      setCurrentViewpoint(getFirstViewpointBySortOrder(globalProject))
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
