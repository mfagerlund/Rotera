// Entity-based project hook - CLEAN, NO LEGACY
// DTOs are ONLY touched during load/save
// ALL runtime work uses entities

import { useState, useEffect } from 'react'
import { autorun } from 'mobx'
import { loadFromLocalStorage, saveToLocalStorage, loadProjectFromJson } from '../store/project-serialization'
import { Project } from '../entities/project'
import { Viewpoint } from '../entities/viewpoint'
import { newProject } from '../store/project-store'

const STORAGE_KEY = 'pictorigo-project'

/**
 * Hook that manages entity-based project
 * DTOs are ONLY touched during initial load and final save
 * ALL runtime work uses entities
 */
export const useEntityProject = () => {
  const [entityProject, setEntityProject] = useState<Project | null>(null)
  const [currentViewpoint, setCurrentViewpoint] = useState<Viewpoint | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const loaded = loadFromLocalStorage(STORAGE_KEY)
      if (loaded) {
        console.log('Loaded project from localStorage')
        setEntityProject(loaded)
        // Set current image to first viewpoint if available
        const firstViewpoint = Array.from(loaded.viewpoints)[0]
        if (firstViewpoint) {
          setCurrentViewpoint(firstViewpoint)
        }
      } else {
        console.log('Creating new empty project')
        const newProj = newProject()
        setEntityProject(newProj)
        saveToLocalStorage(newProj, STORAGE_KEY)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Auto-save on project changes using MobX autorun
  useEffect(() => {
    if (!entityProject || isLoading) return

    const disposer = autorun(() => {
      const hasChanges =
        entityProject.worldPoints.size +
        entityProject.viewpoints.size +
        entityProject.lines.size +
        entityProject.imagePoints.size +
        entityProject.constraints.size

      saveToLocalStorage(entityProject, STORAGE_KEY)
    })

    return disposer
  }, [entityProject, isLoading])

  const saveProject = () => {
    if (entityProject) {
      saveToLocalStorage(entityProject, STORAGE_KEY)
    }
  }

  return {
    project: entityProject,
    setProject: setEntityProject,
    saveProject,
    currentViewpoint,
    setCurrentViewpoint,
    isLoading,
    error
  }
}
