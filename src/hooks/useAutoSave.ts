import { useEffect, useRef, useCallback } from 'react'
import { ProjectDB } from '../services/project-db'
import { Project } from '../entities/project'
import { getIsDirty, markClean } from '../store/project-store'

const AUTO_SAVE_INTERVAL = 30000 // 30 seconds

export function useAutoSave(project: Project | null) {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isSavingRef = useRef(false)

  const performSave = useCallback(async () => {
    if (!project || isSavingRef.current || !getIsDirty()) return

    isSavingRef.current = true
    try {
      await ProjectDB.saveProject(project)
      markClean()
      console.log('Auto-saved project')
    } catch (error) {
      console.error('Auto-save failed:', error)
    } finally {
      isSavingRef.current = false
    }
  }, [project])

  useEffect(() => {
    if (!project) return

    // Set up interval
    saveTimeoutRef.current = setInterval(() => {
      if (getIsDirty()) {
        performSave()
      }
    }, AUTO_SAVE_INTERVAL)

    // Save on visibility change (tab blur)
    const handleVisibilityChange = () => {
      if (document.hidden && getIsDirty()) {
        performSave()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (saveTimeoutRef.current) {
        clearInterval(saveTimeoutRef.current)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [project, performSave])
}
