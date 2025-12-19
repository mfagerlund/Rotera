import React, { useState, useEffect, useCallback } from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faFolder,
  faFolderOpen,
  faFolderPlus,
  faFile,
  faPlus,
  faTrash,
  faPencil,
  faArrowUp,
  faSpinner,
  faCamera,
  faCircle,
  faArrowRight,
  faCopy,
  faFileExport,
  faBolt,
  faStar,
  faStarHalfAlt,
  faClock
} from '@fortawesome/free-solid-svg-icons'
import { faStar as faStarOutline } from '@fortawesome/free-regular-svg-icons'
import { ProjectDB, ProjectSummary, Folder, OptimizationResultSummary } from '../services/project-db'
import { Project } from '../entities/project'
import { useConfirm } from './ConfirmDialog'
import { SessionStore } from '../services/session-store'
import { Serialization } from '../entities/Serialization'
import { AppBranding } from './AppBranding'
import JSZip from 'jszip'
import { optimizeProject, OptimizeProjectResult } from '../optimization/optimize-project'

interface BatchOptimizationResult {
  projectId: string
  error: number | null
  converged: boolean
  solveTimeMs: number
  errorMessage?: string
}

interface ProjectBrowserProps {
  onOpenProject: (project: Project) => void
  onCreateProject: () => void
}

interface InlineRenameInputProps {
  value: string
  onChange: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
}

const InlineRenameInput: React.FC<InlineRenameInputProps> = ({ value, onChange, onConfirm, onCancel }) => {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') onConfirm()
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={onConfirm}
      autoFocus
      onClick={e => e.stopPropagation()}
    />
  )
}

export const ProjectBrowser: React.FC<ProjectBrowserProps> = observer(({
  onOpenProject,
  onCreateProject
}) => {
  const { confirm, dialog } = useConfirm()
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

  const handleOpenProject = async (summary: ProjectSummary) => {
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

  const handleDeleteFolder = async (folder: Folder) => {
    const shouldDelete = await confirm(`Delete folder "${folder.name}"?`, { variant: 'danger' })
    if (!shouldDelete) return

    try {
      await ProjectDB.deleteFolder(folder.id)
      loadContents()
    } catch (error) {
      alert((error as Error).message)
    }
  }

  const handleDeleteProject = async (project: ProjectSummary) => {
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

        // Run optimization
        const result = optimizeProject(project, {
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
        await ProjectDB.saveOptimizationResult(summary.id, optimizationResult)
      } catch (error) {
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
      setBatchResults(new Map(newResults))

      // Yield to event loop between projects
      await new Promise(resolve => setTimeout(resolve, 0))
    }

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

  return (
    <div className="project-browser">
      <div className="top-toolbar">
        <AppBranding size="small" />
        <div className="project-browser__actions">
          <button
            className="project-browser__btn project-browser__btn--primary"
            onClick={onCreateProject}
          >
            <FontAwesomeIcon icon={faPlus} /> New Project
          </button>
          <button
            className="project-browser__btn"
            onClick={() => setIsCreatingFolder(true)}
          >
            <FontAwesomeIcon icon={faFolderPlus} /> New Folder
          </button>
          <button
            className="project-browser__btn"
            onClick={() => setShowExportModal(true)}
            disabled={projects.length === 0}
            title="Export all projects in this folder"
          >
            <FontAwesomeIcon icon={faFileExport} /> Export Folder
          </button>
          <button
            className="project-browser__btn project-browser__btn--optimize"
            onClick={handleBatchOptimize}
            disabled={totalProjectCount === 0 || isBatchOptimizing}
            title="Run optimization on all projects in this folder and subfolders"
          >
            {isBatchOptimizing ? (
              <><FontAwesomeIcon icon={faSpinner} spin /> Optimizing {batchProgress.current}/{batchProgress.total}...</>
            ) : (
              <><FontAwesomeIcon icon={faBolt} /> Optimize All ({totalProjectCount})</>
            )}
          </button>
        </div>
      </div>

      <nav className="project-browser__breadcrumb">
        <button
          className={`project-browser__breadcrumb-item ${dragOverFolderId === 'root' ? 'project-browser__breadcrumb-item--drag-over' : ''}`}
          onClick={() => setCurrentFolderId(null)}
          onDragOver={e => handleDragOver(e, 'root')}
          onDragLeave={handleDragLeave}
          onDrop={e => handleDrop(e, null)}
        >
          Projects
        </button>
        {folderPath.map((folder, index) => (
          <React.Fragment key={folder.id}>
            <span className="project-browser__breadcrumb-separator">/</span>
            <button
              className="project-browser__breadcrumb-item"
              onClick={() => setCurrentFolderId(folder.id)}
            >
              {folder.name}
            </button>
          </React.Fragment>
        ))}
      </nav>

      {isCreatingFolder && (
        <div className="project-browser__new-folder">
          <input
            type="text"
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreateFolder()
              if (e.key === 'Escape') {
                setIsCreatingFolder(false)
                setNewFolderName('')
              }
            }}
            placeholder="Folder name..."
            autoFocus
          />
          <button onClick={handleCreateFolder}>Create</button>
          <button onClick={() => {
            setIsCreatingFolder(false)
            setNewFolderName('')
          }}>Cancel</button>
        </div>
      )}

      <div className="project-browser__content">
        {isLoading ? (
          <div className="project-browser__loading">
            <FontAwesomeIcon icon={faSpinner} spin size="2x" />
            <p>Loading...</p>
          </div>
        ) : (
          <>
            {currentFolderId && (
              <div
                className="project-browser__item project-browser__item--folder"
                onClick={handleGoUp}
              >
                <FontAwesomeIcon icon={faArrowUp} className="project-browser__item-icon" />
                <span className="project-browser__item-name">..</span>
              </div>
            )}

            {folders.map(folder => (
              <div
                key={folder.id}
                className={`project-browser__item project-browser__item--folder ${
                  dragOverFolderId === folder.id ? 'project-browser__item--drag-over' : ''
                }`}
                onClick={() => !editingItem && handleOpenFolder(folder.id)}
                onDragOver={e => handleDragOver(e, folder.id)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, folder.id)}
              >
                <FontAwesomeIcon
                  icon={dragOverFolderId === folder.id ? faFolderOpen : faFolder}
                  className="project-browser__item-icon project-browser__item-icon--folder"
                />
                {editingItem?.type === 'folder' && editingItem.id === folder.id ? (
                  <InlineRenameInput
                    value={editingItem.name}
                    onChange={name => setEditingItem({ ...editingItem, name })}
                    onConfirm={handleRenameItem}
                    onCancel={() => setEditingItem(null)}
                  />
                ) : (
                  <span className="project-browser__item-name">{folder.name}</span>
                )}
                {(() => {
                  const stats = folderStats.get(folder.id)

                  // Check if any projects in this folder are being optimized or queued
                  // We need to check all projects recursively in this folder
                  const folderHasOptimizing = optimizingProjectId !== null &&
                    projects.some(p => p.folderId === folder.id && optimizingProjectId === p.id)
                  const folderHasQueued = queuedProjectIds.size > 0

                  if (isBatchOptimizing && (folderHasQueued || folderHasOptimizing)) {
                    return (
                      <span className="project-browser__item-meta" style={{ marginLeft: 'auto', marginRight: '8px' }}>
                        <FontAwesomeIcon icon={faSpinner} spin style={{ color: '#3498db', marginRight: '6px' }} />
                        <span style={{ color: '#3498db' }}>
                          {stats?.projectCount ?? 0} projects
                        </span>
                      </span>
                    )
                  }

                  if (!stats || stats.projectCount === 0) return null
                  return (
                    <span className="project-browser__item-meta" style={{ marginLeft: 'auto', marginRight: '8px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{stats.projectCount} projects</span>
                      {stats.avgError !== null && (
                        <span style={{
                          marginLeft: '8px',
                          color: stats.avgError < 1 ? '#2ecc71' : stats.avgError < 5 ? '#f1c40f' : '#e74c3c'
                        }}>
                          avg: {stats.avgError.toFixed(2)}
                          <span style={{ opacity: 0.7, marginLeft: '4px' }}>
                            ({stats.minError?.toFixed(2)} - {stats.maxError?.toFixed(2)})
                          </span>
                        </span>
                      )}
                    </span>
                  )
                })()}
                <div className="project-browser__item-actions">
                  <button
                    title="Rename"
                    onClick={e => {
                      e.stopPropagation()
                      setEditingItem({ type: 'folder', id: folder.id, name: folder.name })
                    }}
                  >
                    <FontAwesomeIcon icon={faPencil} />
                  </button>
                  <button
                    title="Delete"
                    onClick={e => {
                      e.stopPropagation()
                      handleDeleteFolder(folder)
                    }}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              </div>
            ))}

            {projects.map(project => (
              <div
                key={project.id}
                className={`project-browser__item project-browser__item--project ${
                  loadingProjectId === project.id ? 'project-browser__item--loading' : ''
                } ${draggedProject?.id === project.id ? 'project-browser__item--dragging' : ''} ${
                  lastOpenedProjectId === project.id ? 'project-browser__item--last-opened' : ''
                }`}
                draggable
                onDragStart={e => handleDragStart(e, project)}
                onDragEnd={handleDragEnd}
                onClick={() => !editingItem && handleOpenProject(project)}
              >
                {project.thumbnailUrl ? (
                  <img
                    src={project.thumbnailUrl}
                    alt=""
                    className="project-browser__item-thumbnail"
                  />
                ) : (
                  <FontAwesomeIcon
                    icon={faFile}
                    className="project-browser__item-icon project-browser__item-icon--project"
                  />
                )}
                {editingItem?.type === 'project' && editingItem.id === project.id ? (
                  <InlineRenameInput
                    value={editingItem.name}
                    onChange={name => setEditingItem({ ...editingItem, name })}
                    onConfirm={handleRenameItem}
                    onCancel={() => setEditingItem(null)}
                  />
                ) : (
                  <>
                    <span className="project-browser__item-name">{project.name}</span>
                    <span className="project-browser__item-meta">
                      <FontAwesomeIcon icon={faCamera} /> {project.viewpointCount}
                      <FontAwesomeIcon icon={faCircle} style={{ fontSize: '8px', margin: '0 4px' }} /> {project.worldPointCount} pts
                    </span>
                    <span className="project-browser__item-date">
                      {formatDate(project.updatedAt)}
                    </span>
                    {(() => {
                      const isOptimizing = optimizingProjectId === project.id
                      const isQueued = queuedProjectIds.has(project.id)

                      // Show optimizing state
                      if (isOptimizing) {
                        return (
                          <span
                            className="project-browser__item-optimization"
                            title="Optimizing..."
                          >
                            <FontAwesomeIcon icon={faBolt} spin style={{ color: '#3498db' }} />
                            <span style={{ color: '#3498db' }}>Optimizing...</span>
                          </span>
                        )
                      }

                      // Show queued state
                      if (isQueued) {
                        return (
                          <span
                            className="project-browser__item-optimization"
                            title="Queued for optimization"
                          >
                            <FontAwesomeIcon icon={faClock} style={{ color: '#95a5a6' }} />
                            <span style={{ color: '#95a5a6' }}>Queued</span>
                          </span>
                        )
                      }

                      // Show batch results during optimization, otherwise show stored results
                      const batchResult = batchResults.get(project.id)
                      const storedResult = project.optimizationResult
                      const result = batchResult || storedResult
                      if (!result) return null

                      const getQualityInfo = () => {
                        if (result.error === null || result.errorMessage) {
                          return { icon: faStarOutline, color: '#e74c3c', label: 'Failed' }
                        }
                        if (result.error < 1) {
                          return { icon: faStar, color: '#2ecc71', label: 'Excellent' }
                        }
                        if (result.error < 5) {
                          return { icon: faStarHalfAlt, color: '#f1c40f', label: 'Good' }
                        }
                        return { icon: faStarOutline, color: '#e74c3c', label: 'Poor' }
                      }
                      const quality = getQualityInfo()
                      return (
                        <span
                          className="project-browser__item-optimization"
                          title={result.errorMessage || `Error: ${result.error?.toFixed(3)}, Time: ${result.solveTimeMs.toFixed(0)}ms${result.converged ? '' : ' (not converged)'}`}
                        >
                          <FontAwesomeIcon icon={quality.icon} style={{ color: quality.color }} />
                          {result.error !== null ? (
                            <span style={{ color: quality.color }}>{result.error.toFixed(2)}</span>
                          ) : (
                            <span style={{ color: quality.color }}>Error</span>
                          )}
                          <span className="project-browser__item-time">{result.solveTimeMs.toFixed(0)}ms</span>
                        </span>
                      )
                    })()}
                  </>
                )}
                <div className="project-browser__item-actions">
                  {loadingProjectId === project.id ? (
                    <FontAwesomeIcon icon={faSpinner} spin />
                  ) : (
                    <>
                      <button
                        title="Copy project..."
                        onClick={e => {
                          e.stopPropagation()
                          openCopyModal(project)
                        }}
                      >
                        <FontAwesomeIcon icon={faCopy} />
                      </button>
                      <button
                        title="Move to folder..."
                        onClick={e => {
                          e.stopPropagation()
                          setMoveModalProject(project)
                        }}
                      >
                        <FontAwesomeIcon icon={faArrowRight} />
                      </button>
                      <button
                        title="Rename"
                        onClick={e => {
                          e.stopPropagation()
                          setEditingItem({ type: 'project', id: project.id, name: project.name })
                        }}
                      >
                        <FontAwesomeIcon icon={faPencil} />
                      </button>
                      <button
                        title="Delete"
                        onClick={e => {
                          e.stopPropagation()
                          handleDeleteProject(project)
                        }}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}

            {folders.length === 0 && projects.length === 0 && !currentFolderId && (
              <div className="project-browser__empty">
                <h2>No projects yet</h2>
                <p>Create a new project to get started</p>
                <button
                  className="project-browser__btn project-browser__btn--primary project-browser__btn--large"
                  onClick={onCreateProject}
                >
                  <FontAwesomeIcon icon={faPlus} /> Create First Project
                </button>
              </div>
            )}

            {folders.length === 0 && projects.length === 0 && currentFolderId && (
              <div className="project-browser__empty">
                <p>This folder is empty</p>
              </div>
            )}
          </>
        )}
      </div>

      {moveModalProject && (
        <div className="project-browser__modal-overlay" onClick={() => setMoveModalProject(null)}>
          <div className="project-browser__modal" onClick={e => e.stopPropagation()}>
            <h3>Move "{moveModalProject.name}" to...</h3>
            <div className="project-browser__modal-folders">
              <button
                className={`project-browser__modal-folder ${moveModalProject.folderId === null ? 'project-browser__modal-folder--current' : ''}`}
                onClick={() => handleMoveProject(moveModalProject.id, null)}
                disabled={moveModalProject.folderId === null}
              >
                <FontAwesomeIcon icon={faFolder} /> Root
                {moveModalProject.folderId === null && <span className="project-browser__modal-current">(current)</span>}
              </button>
              {allFolders.map(folder => (
                <button
                  key={folder.id}
                  className={`project-browser__modal-folder ${moveModalProject.folderId === folder.id ? 'project-browser__modal-folder--current' : ''}`}
                  onClick={() => handleMoveProject(moveModalProject.id, folder.id)}
                  disabled={moveModalProject.folderId === folder.id}
                >
                  <FontAwesomeIcon icon={faFolder} /> {buildFolderPath(folder.id)}
                  {moveModalProject.folderId === folder.id && <span className="project-browser__modal-current">(current)</span>}
                </button>
              ))}
            </div>
            <div className="project-browser__modal-actions">
              <button onClick={() => setMoveModalProject(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {copyModalProject && (
        <div className="project-browser__modal-overlay" onClick={() => setCopyModalProject(null)}>
          <div className="project-browser__modal" onClick={e => e.stopPropagation()}>
            <h3>Copy "{copyModalProject.name}"</h3>
            <input
              type="text"
              value={copyName}
              onChange={e => setCopyName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCopyProject()
                if (e.key === 'Escape') setCopyModalProject(null)
              }}
              placeholder="New project name..."
              autoFocus
              className="project-browser__modal-input"
            />
            <div className="project-browser__modal-actions">
              <button onClick={() => setCopyModalProject(null)}>Cancel</button>
              <button
                onClick={handleCopyProject}
                disabled={!copyName.trim()}
                className="project-browser__btn--primary"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {showExportModal && (
        <div className="project-browser__modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="project-browser__modal" onClick={e => e.stopPropagation()}>
            <h3>Export {projects.length} Project{projects.length !== 1 ? 's' : ''}</h3>
            <p style={{ marginBottom: '16px', color: '#888' }}>
              Export all projects in this folder as a ZIP file.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={exportExcludeImages}
                onChange={e => setExportExcludeImages(e.target.checked)}
              />
              Exclude images (smaller file size, for fixtures)
            </label>
            <div className="project-browser__modal-actions">
              <button onClick={() => setShowExportModal(false)} disabled={isExporting}>Cancel</button>
              <button
                onClick={handleExportFolder}
                disabled={isExporting}
                className="project-browser__btn--primary"
              >
                {isExporting ? (
                  <><FontAwesomeIcon icon={faSpinner} spin /> Exporting...</>
                ) : (
                  <>Export</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {dialog}
    </div>
  )
})
