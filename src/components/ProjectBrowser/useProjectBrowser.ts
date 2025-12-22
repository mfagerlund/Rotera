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
  const [exportExcludeImages, setExportExcludeImages] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [batchResults, setBatchResults] = useState<Map<string, BatchOptimizationResult>>(new Map())
  const [isBatchOptimizing, setIsBatchOptimizing] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 })
  const [folderStats, setFolderStats] = useState<Map<string, { projectCount: number; minError: number | null; maxError: number | null; avgError: number | null }>>(new Map())
  const [totalProjectCount, setTotalProjectCount] = useState(0)
  const [optimizingProjectId, setOptimizingProjectId] = useState<string | null>(null)
  const [queuedProjectIds, setQueuedProjectIds] = useState<Set<string>>(new Set())
  const [justCompletedProjectIds, setJustCompletedProjectIds] = useState<Set<string>>(new Set())

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
    if (projects.length === 0) {
      alert('No projects in this folder to export')
      return
    }

    setIsExporting(true)
    try {
      const zip = new JSZip()
      const folderName = currentFolderId
        ? folderPath[folderPath.length - 1]?.name || 'projects'
        : 'root'

      for (const summary of projects) {
        try {
          const project = await ProjectDB.loadProject(summary.id)
          const json = Serialization.serialize(project, { excludeImages: exportExcludeImages })
          const safeName = summary.name.replace(/[<>:"/\\|?*]/g, '_')
          zip.file(`${safeName}.json`, json)
        } catch (error) {
          console.error(`Failed to export project ${summary.name}:`, error)
        }
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${folderName}-export.zip`
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

  const handleBatchOptimize = async () => {
    // Get all projects including subdirectories
    const allProjects = await ProjectDB.getProjectsRecursive(currentFolderId)
    console.log('[DEBUG] handleBatchOptimize: allProjects.length =', allProjects.length)
    if (allProjects.length === 0) return

    setIsBatchOptimizing(true)
    setBatchProgress({ current: 0, total: allProjects.length })
    const newResults = new Map<string, BatchOptimizationResult>()

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

      try {
        const project = await ProjectDB.loadProject(summary.id)
        const startTime = performance.now()

        // Run optimization (no yieldToUI for batch - we want speed)
        const result = await optimizeProject(project, {
          tolerance: 1e-6,
          maxIterations: 500,
          damping: 0.1,
          autoInitializeCameras: true,
          autoInitializeWorldPoints: true,
        })

        const solveTimeMs = performance.now() - startTime

        const batchResult: BatchOptimizationResult = {
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
        console.log('[DEBUG] About to save to database')
        await ProjectDB.saveOptimizationResult(summary.id, optimizationResult)
        console.log('[DEBUG] Database save completed')
      } catch (error) {
        console.log('[DEBUG] Caught error:', error)
        const batchResult: BatchOptimizationResult = {
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
      console.log('[DEBUG] Updating batch results')
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

      // Reload folder stats to update aggregated values
      const statsMap = new Map<string, { projectCount: number; minError: number | null; maxError: number | null; avgError: number | null }>()
      await Promise.all(
        folders.map(async (folder) => {
          const stats = await ProjectDB.getFolderStats(folder.id)
          statsMap.set(folder.id, stats)
        })
      )
      setFolderStats(statsMap)

      // Continue to next project (removed async yield that was blocking)
      console.log('[DEBUG] Continuing to next project')
    }

    console.log('[DEBUG] Loop completed, setting batch optimizing to false')
    setIsBatchOptimizing(false)
    setOptimizingProjectId(null)
    setQueuedProjectIds(new Set())

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
    handleBatchOptimize,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    buildFolderPath,
    formatDate,
  }
}
