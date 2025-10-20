// Entity-based project hook - CLEAN, NO LEGACY
// DTOs are ONLY touched during load/save
// ALL runtime work uses entities

import { useState, useEffect } from 'react'
import { loadFromLocalStorage, saveToLocalStorage, loadProjectFromJson } from '../store/project-serialization'
import { Project } from '../entities/project'
import { newProject } from '../store/project-store'

const STORAGE_KEY = 'pictorigo-project'

/**
 * Hook that manages entity-based project
 * DTOs are ONLY touched during initial load and final save
 * ALL runtime work uses entities
 */
export const useEntityProject = () => {
  const [entityProject, setEntityProject] = useState<Project | null>(null)
  const [currentImageId, setCurrentImageId] = useState<string | null>(null)
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
          setCurrentImageId(firstViewpoint.id)
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

  // Auto-save on project changes
  useEffect(() => {
    if (entityProject && !isLoading) {
      saveToLocalStorage(entityProject, STORAGE_KEY)
    }
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
    currentImageId,
    setCurrentImageId,
    isLoading,
    error
  }
}
