// Entity-based project hook - DTOs are ONLY touched during load/save
// This is the PRIMARY hook for working with projects

import { useState, useEffect, useMemo } from 'react'
import { useProject } from './useProject'
import { deserializeProject, serializeProject } from '../utils/project-serialization'
import { EntityProject } from '../types/project-entities'

/**
 * Hook that manages entity-based project
 * DTOs are ONLY touched during initial load and final save
 * ALL runtime work uses entities
 */
export const useEntityProject = () => {
  const legacyProject = useProject()

  // Entity-based project - loaded ONCE from DTOs, used for EVERYTHING
  const [entityProject, setEntityProject] = useState<EntityProject | null>(null)

  // Deserialize DTO → Entities ONCE when DTO project changes
  useEffect(() => {
    if (legacyProject.project) {
      console.log('Loading entities from DTOs (ONCE)...')
      const entities = deserializeProject(legacyProject.project)
      setEntityProject(entities)
    }
  }, [legacyProject.project])

  // Save entities back to DTOs when needed
  const saveEntityProject = () => {
    if (entityProject) {
      console.log('Serializing entities back to DTOs for save...')
      const dtoProject = serializeProject(entityProject)
      // TODO: Need to update the DTO project in useProject
      // For now, entities are modified in place
    }
  }

  return {
    // Entity-based project (runtime data model)
    project: entityProject,

    // Save function
    saveProject: saveEntityProject,

    // Pass through other legacy project functions
    // These will be gradually migrated to work with entities
    currentImageId: legacyProject.currentImageId,
    setCurrentImageId: legacyProject.setCurrentImageId,
    isLoading: legacyProject.isLoading,
    error: legacyProject.error,

    // Keep legacy project for gradual migration
    legacyProject: legacyProject.project
  }
}
