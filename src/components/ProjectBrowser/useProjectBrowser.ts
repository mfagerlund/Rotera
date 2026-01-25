import { useState, useEffect, useCallback } from 'react'
import { ProjectDB, ProjectSummary, Folder, OptimizationResultSummary } from '../../services/project-db'
import { Project } from '../../entities/project'
import { SessionStore } from '../../services/session-store'
import { Serialization } from '../../entities/Serialization'
import JSZip from 'jszip'
import { optimizeProject } from '../../optimization/optimize-project'

interface BatchOptimizationResult {
  projectId: string
  error: number | null
  converged: boolean
  solveTimeMs: number
  errorMessage?: string
}

export const useProjectBrowser = () => {
  const [folders, setFolders] = useState<Folder[]>([])
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [currentFolderId, setCurrentFolderIdState] = useState<string | null>(() => SessionStore.getCurrentFolderId())
  const [lastOpenedProjectId] = useState<string | null>(() => SessionStore.getLastOpenedProjectId())
  const [folderPath, setFolderPath] = useState<Folder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<{ type: 'folder' | 'project'; id: string; name: string } | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [draggedProject, setDraggedProject] = useState<ProjectSummary | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null | 'root'>(null)
  const [moveModalProject, setMoveModalProject] = useState<ProjectSummary | null>(null)
  const [copyModalProject, setCopyModalProject] = useState<ProjectSummary | null>(null)
  const [copyName, setCopyName] = useState('')
  const [allFolders, setAllFolders] = useState<Folder[]>([])
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportExcludeImages, setExportExcludeImages] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [batchResults, setBatchResults] = useState<Map<string, BatchOptimizationResult>>(new Map())
  const [isBatchOptimizing, setIsBatchOptimizing] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 })
  const [folderStats, setFolderStats] = useState<Map<string, { projectCount: number; minError: number | null; maxError: number | null; avgError: number | null }>>(new Map())
  const [totalProjectCount, setTotalProjectCount] = useState(0)
  const [optimizingProjectId, setOptimizingProjectId] = useState<string | null>(null)
  const [queuedProjectIds, setQueuedProjectIds] = useState<Set<string>>(new Set())
  const [justCompletedProjectIds, setJustCompletedProjectIds] = useState<Set<string>>(new Set())
  const [folderProgress, setFolderProgress] = useState<Map<string, { completed: number; total: number }>>(new Map())
  const [justCompletedFolderIds, setJustCompletedFolderIds] = useState<Set<string>>(new Set())
  const [showImportModal, setShowImportModal] = useState(false)
  const [isImportingFolder, setIsImportingFolder] = useState(false)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, errors: 0 })

  const setCurrentFolderId = useCallback((folderId: string | null) => {
    setCurrentFolderIdState(folderId)
    SessionStore.setCurrentFolderId(folderId)
  }, [])

  const loadContents = useCallback(async () => {
    setIsLoading(true)
    try {
      const [loadedFolders, loadedProjects, loadedAllFolders, allProjectsRecursive] = await Promise.all([
        ProjectDB.listFolders(currentFolderId),
        ProjectDB.listProjects(currentFolderId),
        ProjectDB.listAllFolders(),
        ProjectDB.getProjectsRecursive(currentFolderId)
      ])
      setFolders(loadedFolders.sort((a, b) => a.name.localeCompare(b.name)))
      setProjects(loadedProjects.sort((a, b) => a.name.localeCompare(b.name)))
      setAllFolders(loadedAllFolders)
      setTotalProjectCount(allProjectsRecursive.length)

      // Load stats for each subfolder
      const statsMap = new Map<string, { projectCount: number; minError: number | null; maxError: number | null; avgError: number | null }>()
      await Promise.all(
        loadedFolders.map(async (folder) => {
          const stats = await ProjectDB.getFolderStats(folder.id)
          statsMap.set(folder.id, stats)
        })
      )
      setFolderStats(statsMap)
    } catch (error) {
      console.error('Failed to load contents:', error)
    } finally {
      setIsLoading(false)
    }
  }, [currentFolderId])

  useEffect(() => {
    loadContents()
  }, [loadContents])

  useEffect(() => {
    const buildPath = async () => {
      if (!currentFolderId) {
        setFolderPath([])
        return
      }

      const allFolders = await ProjectDB.listAllFolders()
      const path: Folder[] = []
      let folderId: string | null = currentFolderId

      while (folderId) {
        const folder = allFolders.find(f => f.id === folderId)
        if (folder) {
          path.unshift(folder)
          folderId = folder.parentId
        } else {
          break
        }
      }

      setFolderPath(path)
    }

    buildPath()
  }, [currentFolderId])

  const handleOpenFolder = (folderId: string) => {
    setCurrentFolderId(folderId)
  }

  const handleGoUp = () => {
    if (folderPath.length > 1) {
      setCurrentFolderId(folderPath[folderPath.length - 2].id)
    } else {
      setCurrentFolderId(null)
    }
  }

  const handleOpenProject = async (summary: ProjectSummary, onOpenProject: (project: Project) => void) => {
    setLoadingProjectId(summary.id)
    try {
      const project = await ProjectDB.loadProject(summary.id)
      onOpenProject(project)
    } catch (error) {
      console.error('Failed to load project:', error)
      alert('Failed to load project: ' + (error as Error).message)
    } finally {
      setLoadingProjectId(null)
    }
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return

    try {
      await ProjectDB.createFolder(newFolderName.trim(), currentFolderId)
      setNewFolderName('')
      setIsCreatingFolder(false)
      loadContents()
    } catch (error) {
      console.error('Failed to create folder:', error)
    }
  }

  const handleRenameItem = async () => {
    if (!editingItem || !editingItem.name.trim()) return

    try {
      if (editingItem.type === 'folder') {
        await ProjectDB.renameFolder(editingItem.id, editingItem.name.trim())
      } else {
        await ProjectDB.renameProject(editingItem.id, editingItem.name.trim())
      }
      setEditingItem(null)
      loadContents()
    } catch (error) {
      console.error('Failed to rename:', error)
    }
  }

  const handleDeleteFolder = async (folder: Folder, confirm: (message: string, options?: { variant?: 'danger' }) => Promise<boolean>) => {
    const shouldDelete = await confirm(`Delete folder "${folder.name}"?`, { variant: 'danger' })
    if (!shouldDelete) return

    try {
      await ProjectDB.deleteFolder(folder.id)
      loadContents()
    } catch (error) {
      alert((error as Error).message)
    }
  }

  const handleDeleteProject = async (project: ProjectSummary, confirm: (message: string, options?: { variant?: 'danger' }) => Promise<boolean>) => {
    const shouldDelete = await confirm(`Delete project "${project.name}"?`, { variant: 'danger' })
    if (!shouldDelete) return

    try {
      await ProjectDB.deleteProject(project.id)
      loadContents()
    } catch (error) {
      console.error('Failed to delete project:', error)
    }
  }

  const handleMoveProject = async (projectId: string, targetFolderId: string | null) => {
    try {
      await ProjectDB.moveProject(projectId, targetFolderId)
      loadContents()
      setMoveModalProject(null)
    } catch (error) {
      console.error('Failed to move project:', error)
    }
  }

  const handleCopyProject = async () => {
    if (!copyModalProject || !copyName.trim()) return
    try {
      await ProjectDB.copyProject(copyModalProject.id, copyName.trim())
      loadContents()
      setCopyModalProject(null)
      setCopyName('')
    } catch (error) {
      console.error('Failed to copy project:', error)
    }
  }

  const openCopyModal = (project: ProjectSummary) => {
    setCopyModalProject(project)
    setCopyName(project.name + ' (copy)')
  }

  const handleExportFolder = async () => {
    // Get all projects including subfolders
    const allProjects = await ProjectDB.getProjectsRecursive(currentFolderId)
    if (allProjects.length === 0) {
      alert('No projects in this folder to export')
      return
    }

    setIsExporting(true)
    try {
      const zip = new JSZip()
      const rootFolderName = currentFolderId
        ? folderPath[folderPath.length - 1]?.name || 'projects'
        : 'root'

      // Build folder ID to name mapping
      const folderIdToName = new Map<string, string>()
      const folderIdToParent = new Map<string, string | null>()
      for (const folder of allFolders) {
        folderIdToName.set(folder.id, folder.name)
        folderIdToParent.set(folder.id, folder.parentId)
      }

      // Build relative path for a project based on its folder
      const buildRelativePath = (projectFolderId: string | null): string => {
        if (projectFolderId === currentFolderId) {
          return ''  // Project is directly in the current folder
        }

        const parts: string[] = []
        let folderId = projectFolderId

        // Walk up the folder tree until we reach currentFolderId
        while (folderId && folderId !== currentFolderId) {
          const folderName = folderIdToName.get(folderId)
          if (folderName) {
            parts.unshift(folderName.replace(/[<>:"/\\|?*]/g, '_'))
          }
          folderId = folderIdToParent.get(folderId) ?? null
        }

        return parts.length > 0 ? parts.join('/') + '/' : ''
      }

      for (const summary of allProjects) {
        try {
          const project = await ProjectDB.loadProject(summary.id)
          const json = Serialization.serialize(project, { excludeImages: exportExcludeImages })
          const safeName = summary.name.replace(/[<>:"/\\|?*]/g, '_')
          const relativePath = buildRelativePath(summary.folderId)
          zip.file(`${relativePath}${safeName}.rotera`, json)
        } catch (error) {
          console.error(`Failed to export project ${summary.name}:`, error)
        }
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${rootFolderName}-export.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setShowExportModal(false)
    } catch (error) {
      console.error('Export failed:', error)
      alert('Export failed: ' + (error as Error).message)
    } finally {
      setIsExporting(false)
    }
  }

  const handleImportFolder = async (file: File) => {
    setIsImportingFolder(true)
    setImportProgress({ current: 0, total: 0, errors: 0 })

    try {
      const zip = await JSZip.loadAsync(file)
      const jsonFiles = Object.keys(zip.files).filter(name => (name.endsWith('.rotera') || name.endsWith('.json')) && !zip.files[name].dir)

      if (jsonFiles.length === 0) {
        alert('No project files found in the ZIP archive')
        return
      }

      setImportProgress({ current: 0, total: jsonFiles.length, errors: 0 })

      // Build folder structure from ZIP paths
      const folderCache = new Map<string, string>() // path -> folderId
      folderCache.set('', currentFolderId ?? '__root__')

      const getOrCreateFolder = async (folderPath: string): Promise<string | null> => {
        if (!folderPath) return currentFolderId

        const cached = folderCache.get(folderPath)
        if (cached) return cached === '__root__' ? null : cached

        const parts = folderPath.split('/')
        let parentId = currentFolderId

        for (let i = 0; i < parts.length; i++) {
          const partialPath = parts.slice(0, i + 1).join('/')
          const cachedPartial = folderCache.get(partialPath)

          if (cachedPartial) {
            parentId = cachedPartial === '__root__' ? null : cachedPartial
          } else {
            // Check if folder exists
            const existingFolders = await ProjectDB.listFolders(parentId)
            const existing = existingFolders.find(f => f.name === parts[i])

            if (existing) {
              folderCache.set(partialPath, existing.id)
              parentId = existing.id
            } else {
              // Create the folder
              const newFolderId = await ProjectDB.createFolder(parts[i], parentId)
              folderCache.set(partialPath, newFolderId)
              parentId = newFolderId
            }
          }
        }

        return parentId
      }

      let successCount = 0
      let errorCount = 0

      for (let i = 0; i < jsonFiles.length; i++) {
        const filePath = jsonFiles[i]
        setImportProgress({ current: i + 1, total: jsonFiles.length, errors: errorCount })

        try {
          const content = await zip.files[filePath].async('string')
          const project = Serialization.deserialize(content)

          // Determine folder from path
          const pathParts = filePath.split('/')
          const folderPath = pathParts.slice(0, -1).join('/')
          const targetFolderId = await getOrCreateFolder(folderPath)

          // Save project to database
          await ProjectDB.saveProject(project, targetFolderId)
          successCount++
        } catch (error) {
          console.error(`Failed to import ${filePath}:`, error)
          errorCount++
        }

        // Yield to UI
        await new Promise(resolve => setTimeout(resolve, 0))
      }

      setShowImportModal(false)
      await loadContents()

      if (errorCount > 0) {
        alert(`Import complete: ${successCount} projects imported, ${errorCount} failed`)
      }
    } catch (error) {
      console.error('Import failed:', error)
      alert('Import failed: ' + (error as Error).message)
    } finally {
      setIsImportingFolder(false)
      setImportProgress({ current: 0, total: 0, errors: 0 })
    }
  }

  const handleImportProject = async (file: File) => {
    try {
      const content = await file.text()
      const project = Serialization.deserialize(content)
      await ProjectDB.saveProject(project, currentFolderId)
      await loadContents()
    } catch (error) {
      console.error('Failed to import project:', error)
      alert('Failed to import project: ' + (error as Error).message)
    }
  }

  const handleBatchOptimize = async () => {
    // Get all projects including subdirectories
    const allProjects = await ProjectDB.getProjectsRecursive(currentFolderId)
    if (allProjects.length === 0) return

    // Build folder parent map for ancestry checks
    const folderParentMap = new Map<string, string | null>()
    for (const folder of allFolders) {
      folderParentMap.set(folder.id, folder.parentId)
    }

    // Check if a project's folder is a descendant of a target folder
    const isDescendantOf = (projectFolderId: string | null, targetFolderId: string): boolean => {
      let current = projectFolderId
      while (current) {
        if (current === targetFolderId) return true
        current = folderParentMap.get(current) ?? null
      }
      return false
    }

    // Build mapping: which visible folders contain which projects
    const folderToProjects = new Map<string, Set<string>>()
    const projectToFolders = new Map<string, Set<string>>()
    for (const folder of folders) {
      const projectIds = new Set<string>()
      for (const project of allProjects) {
        if (isDescendantOf(project.folderId, folder.id)) {
          projectIds.add(project.id)
          // Also track reverse mapping
          if (!projectToFolders.has(project.id)) {
            projectToFolders.set(project.id, new Set())
          }
          projectToFolders.get(project.id)!.add(folder.id)
        }
      }
      folderToProjects.set(folder.id, projectIds)
    }

    // Initialize folder progress
    const initialProgress = new Map<string, { completed: number; total: number }>()
    for (const folder of folders) {
      const projectIds = folderToProjects.get(folder.id) ?? new Set()
      initialProgress.set(folder.id, { completed: 0, total: projectIds.size })
    }
    setFolderProgress(initialProgress)

    setIsBatchOptimizing(true)
    setBatchProgress({ current: 0, total: allProjects.length })
    const newResults = new Map<string, BatchOptimizationResult>()
    const completedPerFolder = new Map<string, number>()

    // Set all projects as queued
    setQueuedProjectIds(new Set(allProjects.map(p => p.id)))

    for (let i = 0; i < allProjects.length; i++) {
      const summary = allProjects[i]
      setBatchProgress({ current: i + 1, total: allProjects.length })

      // Mark current project as optimizing, remove from queue
      setOptimizingProjectId(summary.id)
      setQueuedProjectIds(prev => {
        const next = new Set(prev)
        next.delete(summary.id)
        return next
      })

      let batchResult: BatchOptimizationResult

      try {
        const project = await ProjectDB.loadProject(summary.id)
        const startTime = performance.now()

        // Run optimization
        const result = await optimizeProject(project, {
          tolerance: 1e-6,
          maxIterations: 500,
          damping: 0.1,
          autoInitializeCameras: true,
          autoInitializeWorldPoints: true,
        })

        const solveTimeMs = performance.now() - startTime

        batchResult = {
          projectId: summary.id,
          error: result.residual,
          converged: result.converged,
          solveTimeMs,
          errorMessage: result.error ?? undefined,
        }

        newResults.set(summary.id, batchResult)

        // Save optimization result to database
        const optimizationResult: OptimizationResultSummary = {
          error: result.residual,
          converged: result.converged,
          solveTimeMs,
          errorMessage: result.error ?? undefined,
          optimizedAt: new Date(),
        }
        await ProjectDB.saveOptimizationResult(summary.id, optimizationResult)
      } catch (error) {
        batchResult = {
          projectId: summary.id,
          error: null,
          converged: false,
          solveTimeMs: 0,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        }

        newResults.set(summary.id, batchResult)

        // Save error result to database
        const optimizationResult: OptimizationResultSummary = {
          error: null,
          converged: false,
          solveTimeMs: 0,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          optimizedAt: new Date(),
        }
        await ProjectDB.saveOptimizationResult(summary.id, optimizationResult)
      }

      // Update results incrementally
      setBatchResults(new Map(newResults))

      // Mark this project as just completed (for pulse animation)
      setJustCompletedProjectIds(prev => {
        const next = new Set(prev)
        next.add(summary.id)
        return next
      })

      // Clear the "just completed" status after animation duration
      setTimeout(() => {
        setJustCompletedProjectIds(prev => {
          const next = new Set(prev)
          next.delete(summary.id)
          return next
        })
      }, 1500)

      // Update folder progress and trigger pulse for affected folders
      const affectedFolders = projectToFolders.get(summary.id) ?? new Set()
      for (const folderId of affectedFolders) {
        completedPerFolder.set(folderId, (completedPerFolder.get(folderId) ?? 0) + 1)
      }

      // Update folder progress state
      const updatedProgress = new Map<string, { completed: number; total: number }>()
      for (const folder of folders) {
        const projectIds = folderToProjects.get(folder.id) ?? new Set()
        updatedProgress.set(folder.id, {
          completed: completedPerFolder.get(folder.id) ?? 0,
          total: projectIds.size
        })
      }
      setFolderProgress(updatedProgress)

      // Trigger pulse for affected folders
      if (affectedFolders.size > 0) {
        setJustCompletedFolderIds(prev => {
          const next = new Set(prev)
          for (const folderId of affectedFolders) {
            next.add(folderId)
          }
          return next
        })

        // Clear folder pulse after animation
        setTimeout(() => {
          setJustCompletedFolderIds(prev => {
            const next = new Set(prev)
            for (const folderId of affectedFolders) {
              next.delete(folderId)
            }
            return next
          })
        }, 1500)
      }

      // Compute folder stats locally from batch results
      const statsMap = new Map<string, { projectCount: number; minError: number | null; maxError: number | null; avgError: number | null }>()
      for (const folder of folders) {
        const projectIds = folderToProjects.get(folder.id) ?? new Set()
        const errors: number[] = []
        for (const projectId of projectIds) {
          const result = newResults.get(projectId)
          if (result && result.error !== null) {
            errors.push(result.error)
          }
        }
        if (errors.length === 0) {
          statsMap.set(folder.id, { projectCount: projectIds.size, minError: null, maxError: null, avgError: null })
        } else {
          statsMap.set(folder.id, {
            projectCount: projectIds.size,
            minError: Math.min(...errors),
            maxError: Math.max(...errors),
            avgError: errors.reduce((a, b) => a + b, 0) / errors.length
          })
        }
      }
      setFolderStats(statsMap)

      // Yield to UI to allow React to render updates
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    setIsBatchOptimizing(false)
    setOptimizingProjectId(null)
    setQueuedProjectIds(new Set())
    setFolderProgress(new Map())

    // Reload contents to show updated stored results
    await loadContents()
  }

  const handleDragStart = (e: React.DragEvent, project: ProjectSummary) => {
    setDraggedProject(project)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', project.id)
  }

  const handleDragEnd = () => {
    setDraggedProject(null)
    setDragOverFolderId(null)
  }

  const handleDragOver = (e: React.DragEvent, folderId: string | null | 'root') => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverFolderId(folderId)
  }

  const handleDragLeave = () => {
    setDragOverFolderId(null)
  }

  const handleDrop = async (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault()
    if (draggedProject) {
      await handleMoveProject(draggedProject.id, targetFolderId)
    }
    setDraggedProject(null)
    setDragOverFolderId(null)
  }

  const buildFolderPath = (folderId: string | null): string => {
    if (!folderId) return 'Root'
    const parts: string[] = []
    let current = folderId
    while (current) {
      const folder = allFolders.find(f => f.id === current)
      if (folder) {
        parts.unshift(folder.name)
        current = folder.parentId!
      } else {
        break
      }
    }
    return parts.length > 0 ? parts.join(' / ') : 'Root'
  }

  const formatDate = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return 'Today ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return `${diffDays} days ago`
    } else {
      return date.toLocaleDateString()
    }
  }

  return {
    // State
    folders,
    projects,
    currentFolderId,
    lastOpenedProjectId,
    folderPath,
    isLoading,
    loadingProjectId,
    editingItem,
    newFolderName,
    isCreatingFolder,
    draggedProject,
    dragOverFolderId,
    moveModalProject,
    copyModalProject,
    copyName,
    allFolders,
    showExportModal,
    exportExcludeImages,
    isExporting,
    batchResults,
    isBatchOptimizing,
    batchProgress,
    folderStats,
    totalProjectCount,
    optimizingProjectId,
    queuedProjectIds,
    justCompletedProjectIds,
    folderProgress,
    justCompletedFolderIds,
    showImportModal,
    isImportingFolder,
    importProgress,

    // Setters
    setCurrentFolderId,
    setEditingItem,
    setNewFolderName,
    setIsCreatingFolder,
    setMoveModalProject,
    setCopyModalProject,
    setCopyName,
    setShowExportModal,
    setExportExcludeImages,
    setShowImportModal,

    // Handlers
    handleOpenFolder,
    handleGoUp,
    handleOpenProject,
    handleCreateFolder,
    handleRenameItem,
    handleDeleteFolder,
    handleDeleteProject,
    handleMoveProject,
    handleCopyProject,
    openCopyModal,
    handleExportFolder,
    handleImportFolder,
    handleImportProject,
    handleBatchOptimize,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    buildFolderPath,
    formatDate,
    loadContents,
  }
}
