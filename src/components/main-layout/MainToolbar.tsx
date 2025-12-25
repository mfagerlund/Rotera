// Main application toolbar component
// Extracted from MainLayout for better maintainability

import React, { useRef, useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faFloppyDisk,
  faCopy,
  faFileExport,
  faTrash,
  faPencil,
  faCheck,
  faBolt,
  faFile,
  faChevronDown,
  faFileLines,
  faRotate
} from '@fortawesome/free-solid-svg-icons'
import { downloadRoteraProject } from '../../services/blender-export'
import { WorkspaceSwitcher } from '../WorkspaceManager'
import { AppBranding } from '../AppBranding'
import type { Project } from '../../entities/project'
import { checkOptimizationReadiness, getOptimizationStatusSummary } from '../../optimization/optimization-readiness'

interface MainToolbarProps {
  // Workspace
  currentWorkspace: 'image' | 'world' | 'split'
  onWorkspaceChange: (workspace: 'image' | 'world' | 'split') => void
  imageHasContent: boolean
  worldHasContent: boolean

  // Project
  project: Project | null
  onClearProject: () => void

  // Confirm dialog
  confirm: (message: string, options?: { confirmLabel?: string; cancelLabel?: string; variant?: 'primary' | 'danger'; showMessage?: boolean }) => Promise<boolean>

  // Navigation
  onReturnToBrowser?: () => void
  onSaveProject?: () => Promise<void>
  onSaveAsProject?: (newName: string) => Promise<void>
  onReloadProject?: () => Promise<void>
  onOpenOptimization?: () => void

  // Dirty state
  isDirty?: boolean
}

export const MainToolbar: React.FC<MainToolbarProps> = observer(({
  currentWorkspace,
  onWorkspaceChange,
  imageHasContent,
  worldHasContent,
  project,
  onClearProject,
  confirm,
  onReturnToBrowser,
  onSaveProject,
  onSaveAsProject,
  onReloadProject,
  onOpenOptimization,
  isDirty
}) => {
  const handleClearProject = async () => {
    setFileMenuOpen(false)
    const confirmed = await confirm(
      'Are you sure you want to clear the entire project?\n\n' +
      'This will remove all world points, images, lines, planes, and constraints. ' +
      'This action cannot be undone.'
    )
    if (confirmed) {
      onClearProject()
    }
  }

  const [isReloading, setIsReloading] = React.useState(false)

  const handleReloadProject = async () => {
    if (!onReloadProject || isReloading) return
    setFileMenuOpen(false)
    const confirmed = await confirm(
      'Reload project and discard all unsaved changes?\n\n' +
      'This will restore the project to its last saved state.',
      { confirmLabel: 'Reload', variant: 'danger' }
    )
    if (confirmed) {
      setIsReloading(true)
      try {
        await onReloadProject()
      } finally {
        setIsReloading(false)
      }
    }
  }

  const [isSaving, setIsSaving] = React.useState(false)
  const [isSavingAs, setIsSavingAs] = React.useState(false)
  const [showSaveAsInput, setShowSaveAsInput] = React.useState(false)
  const [saveAsName, setSaveAsName] = React.useState('')
  const [isEditingName, setIsEditingName] = React.useState(false)
  const [editedName, setEditedName] = React.useState(project?.name || '')
  const [fileMenuOpen, setFileMenuOpen] = React.useState(false)
  const fileMenuRef = useRef<HTMLDivElement>(null)

  // Close file menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(event.target as Node)) {
        setFileMenuOpen(false)
        setShowSaveAsInput(false)
      }
    }
    if (fileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [fileMenuOpen])

  const handleNameSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (project && editedName.trim() && editedName !== project.name) {
      project.name = editedName.trim()
    }
    setIsEditingName(false)
  }

  const handleSave = async () => {
    if (!onSaveProject || isSaving) return
    setIsSaving(true)
    setFileMenuOpen(false)
    try {
      await onSaveProject()
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveAsClick = () => {
    setSaveAsName(project?.name ? `${project.name} (copy)` : 'New Project')
    setShowSaveAsInput(true)
  }

  const handleSaveAsSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!onSaveAsProject || isSavingAs || !saveAsName.trim()) return
    setIsSavingAs(true)
    try {
      await onSaveAsProject(saveAsName.trim())
      setShowSaveAsInput(false)
      setFileMenuOpen(false)
    } finally {
      setIsSavingAs(false)
    }
  }

  const handleSaveAsCancel = () => {
    setShowSaveAsInput(false)
    setSaveAsName('')
  }

  const handleReturnToBrowser = async () => {
    if (!onReturnToBrowser) return
    if (isDirty && onSaveProject) {
      const shouldSave = await confirm('Save project before closing?', { showMessage: true, variant: 'primary' })
      if (shouldSave) {
        await handleSave()
      }
    }
    onReturnToBrowser()
  }

  return (
    <div className="top-toolbar">
      {onReturnToBrowser && (
        <AppBranding
          onClick={handleReturnToBrowser}
          size="small"
        />
      )}

      {project && (
        <div className="toolbar-project-name">
          {isEditingName ? (
            <form onSubmit={handleNameSubmit} className="project-name-form">
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onBlur={handleNameSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsEditingName(false)
                    setEditedName(project.name)
                  }
                }}
                autoFocus
                className="project-name-input"
              />
              <button type="submit" className="btn-tool btn-small" title="Save name">
                <FontAwesomeIcon icon={faCheck} />
              </button>
            </form>
          ) : (
            <>
              <button
                className="project-name-display"
                onClick={() => {
                  setEditedName(project.name)
                  setIsEditingName(true)
                }}
                title="Click to rename project"
              >
                {project.name}
                <FontAwesomeIcon icon={faPencil} className="edit-icon" />
              </button>
              {onSaveProject && (
                <button
                  className={`btn-save-inline ${isDirty ? 'btn-save-inline--dirty' : ''}`}
                  onClick={handleSave}
                  disabled={isSaving || !isDirty}
                  title={isDirty ? 'Save project (Ctrl+S)' : 'No unsaved changes'}
                >
                  <FontAwesomeIcon icon={faFloppyDisk} />
                </button>
              )}
            </>
          )}
        </div>
      )}

      <WorkspaceSwitcher
        currentWorkspace={currentWorkspace}
        onWorkspaceChange={onWorkspaceChange}
        imageHasContent={imageHasContent}
        worldHasContent={worldHasContent}
      />

      {/* Optimization status and button */}
      {(() => {
        const readiness = project ? checkOptimizationReadiness(project) : null
        const status = readiness ? getOptimizationStatusSummary(readiness) : null
        return (
          <div className="optimization-status-group">
            {status && status.status !== 'empty' && (
              <div
                className="optimization-status-indicator"
                title={readiness?.issues.map(i => i.message).join('\n') || status.message}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  backgroundColor: status.status === 'ready' ? 'rgba(39, 174, 96, 0.15)' :
                                   status.status === 'warning' ? 'rgba(243, 156, 18, 0.15)' :
                                   'rgba(231, 76, 60, 0.15)',
                  color: status.color,
                  border: `1px solid ${status.color}40`
                }}
              >
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: status.color
                }} />
                <span>{status.message}</span>
              </div>
            )}
            <button
              className="btn-optimize"
              onClick={onOpenOptimization}
              title="Open optimization panel"
            >
              <FontAwesomeIcon icon={faBolt} />
              <span>Optimize</span>
            </button>
          </div>
        )
      })()}

      <div className="file-menu-container" ref={fileMenuRef}>
        <button
          className="btn-file-menu"
          onClick={() => setFileMenuOpen(!fileMenuOpen)}
          title="File menu"
        >
          <FontAwesomeIcon icon={faFile} />
          <span>File</span>
          <FontAwesomeIcon icon={faChevronDown} className="chevron" />
        </button>
        {fileMenuOpen && (
          <div className="file-menu-dropdown">
            <button
              className="file-menu-item"
              onClick={handleSave}
              disabled={!onSaveProject || isSaving}
            >
              <FontAwesomeIcon icon={faFloppyDisk} />
              <span>{isSaving ? 'Saving...' : 'Save'}</span>
              <span className="shortcut">Ctrl+S</span>
            </button>
            {showSaveAsInput ? (
              <form onSubmit={handleSaveAsSubmit} className="file-menu-save-as-form">
                <input
                  type="text"
                  value={saveAsName}
                  onChange={(e) => setSaveAsName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') handleSaveAsCancel()
                  }}
                  autoFocus
                  placeholder="New project name"
                />
                <button type="submit" disabled={isSavingAs || !saveAsName.trim()}>
                  <FontAwesomeIcon icon={faCheck} />
                </button>
              </form>
            ) : (
              <button
                className="file-menu-item"
                onClick={handleSaveAsClick}
                disabled={!onSaveAsProject}
              >
                <FontAwesomeIcon icon={faCopy} />
                <span>Save As...</span>
              </button>
            )}
            <button
              className="file-menu-item"
              onClick={handleReloadProject}
              disabled={!onReloadProject || isReloading || !isDirty}
              title={!isDirty ? 'No unsaved changes to discard' : 'Discard changes and reload from last save'}
            >
              <FontAwesomeIcon icon={faRotate} />
              <span>{isReloading ? 'Reloading...' : 'Reload Project'}</span>
            </button>
            <div className="file-menu-divider" />
            <button
              className="file-menu-item"
              onClick={async () => {
                if (project) {
                  await downloadRoteraProject(project, true)
                  setFileMenuOpen(false)
                }
              }}
              disabled={!project}
            >
              <FontAwesomeIcon icon={faFileExport} />
              <span>Export (.rotera)</span>
            </button>
            <button
              className="file-menu-item"
              onClick={async () => {
                if (project) {
                  await downloadRoteraProject(project, false)
                  setFileMenuOpen(false)
                }
              }}
              disabled={!project}
            >
              <FontAwesomeIcon icon={faFileLines} />
              <span>Export without Images (.rotera)</span>
            </button>
            <div className="file-menu-divider" />
            <button
              className="file-menu-item file-menu-item-danger"
              onClick={handleClearProject}
            >
              <FontAwesomeIcon icon={faTrash} />
              <span>Clear Project</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
})
