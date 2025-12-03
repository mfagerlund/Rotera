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
  faCircle
} from '@fortawesome/free-solid-svg-icons'
import { ProjectDB, ProjectSummary, Folder } from '../services/project-db'
import { Project } from '../entities/project'

interface ProjectBrowserProps {
  onOpenProject: (project: Project) => void
  onCreateProject: () => void
}

export const ProjectBrowser: React.FC<ProjectBrowserProps> = observer(({
  onOpenProject,
  onCreateProject
}) => {
  const [folders, setFolders] = useState<Folder[]>([])
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState<Folder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<{ type: 'folder' | 'project'; id: string; name: string } | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)

  const loadContents = useCallback(async () => {
    setIsLoading(true)
    try {
      const [loadedFolders, loadedProjects] = await Promise.all([
        ProjectDB.listFolders(currentFolderId),
        ProjectDB.listProjects(currentFolderId)
      ])
      setFolders(loadedFolders.sort((a, b) => a.name.localeCompare(b.name)))
      setProjects(loadedProjects.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()))
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
    if (!confirm(`Delete folder "${folder.name}"? This cannot be undone.`)) return

    try {
      await ProjectDB.deleteFolder(folder.id)
      loadContents()
    } catch (error) {
      alert((error as Error).message)
    }
  }

  const handleDeleteProject = async (project: ProjectSummary) => {
    if (!confirm(`Delete project "${project.name}"? This cannot be undone.`)) return

    try {
      await ProjectDB.deleteProject(project.id)
      loadContents()
    } catch (error) {
      console.error('Failed to delete project:', error)
    }
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
      <header className="project-browser__header">
        <h1>Pictorigo Projects</h1>
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
        </div>
      </header>

      <nav className="project-browser__breadcrumb">
        <button
          className="project-browser__breadcrumb-item"
          onClick={() => setCurrentFolderId(null)}
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
                className="project-browser__item project-browser__item--folder"
                onDoubleClick={() => handleOpenFolder(folder.id)}
              >
                <FontAwesomeIcon
                  icon={faFolder}
                  className="project-browser__item-icon project-browser__item-icon--folder"
                />
                {editingItem?.type === 'folder' && editingItem.id === folder.id ? (
                  <input
                    type="text"
                    value={editingItem.name}
                    onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRenameItem()
                      if (e.key === 'Escape') setEditingItem(null)
                    }}
                    onBlur={handleRenameItem}
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className="project-browser__item-name">{folder.name}</span>
                )}
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
                }`}
                onDoubleClick={() => handleOpenProject(project)}
              >
                <FontAwesomeIcon
                  icon={faFile}
                  className="project-browser__item-icon project-browser__item-icon--project"
                />
                {editingItem?.type === 'project' && editingItem.id === project.id ? (
                  <input
                    type="text"
                    value={editingItem.name}
                    onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRenameItem()
                      if (e.key === 'Escape') setEditingItem(null)
                    }}
                    onBlur={handleRenameItem}
                    autoFocus
                    onClick={e => e.stopPropagation()}
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
                  </>
                )}
                <div className="project-browser__item-actions">
                  {loadingProjectId === project.id ? (
                    <FontAwesomeIcon icon={faSpinner} spin />
                  ) : (
                    <>
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
    </div>
  )
})
