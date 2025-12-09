// Main application toolbar component
// Extracted from MainLayout for better maintainability

import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faFloppyDisk,
  faFileExport,
  faTrash,
  faHome,
  faPencil,
  faCheck
} from '@fortawesome/free-solid-svg-icons'
import { WorkspaceSwitcher } from '../WorkspaceManager'
import { ConstraintToolbar } from '../ConstraintToolbar'
import type { AvailableConstraint } from '../../types/ui-types'
import type { Project } from '../../entities/project'
import { Line } from '../../entities/line'
import { WorldPoint } from '../../entities/world-point'
import type { OptimizationExportDto } from '../../types/optimization-export'

interface MainToolbarProps {
  // Workspace
  currentWorkspace: 'image' | 'world' | 'split'
  onWorkspaceChange: (workspace: 'image' | 'world' | 'split') => void
  imageHasContent: boolean
  worldHasContent: boolean

  // Project
  project: Project | null
  onExportOptimization: () => OptimizationExportDto | null
  onClearProject: () => void

  // Selection & constraints
  selectedPoints: WorldPoint[]
  selectedLines: Line[]
  allConstraints: AvailableConstraint[]
  onConstraintClick: (type: string, selectedPoints: WorldPoint[], selectedLines: Line[]) => void


  // Confirm dialog
  confirm: (message: string, options?: { confirmLabel?: string; cancelLabel?: string; variant?: 'primary' | 'danger'; showMessage?: boolean }) => Promise<boolean>

  // Navigation
  onReturnToBrowser?: () => void
  onSaveProject?: () => Promise<void>

  // Dirty state
  isDirty?: boolean
}

export const MainToolbar: React.FC<MainToolbarProps> = ({
  currentWorkspace,
  onWorkspaceChange,
  imageHasContent,
  worldHasContent,
  project,
  onExportOptimization,
  onClearProject,
  selectedPoints,
  selectedLines,
  allConstraints,
  onConstraintClick,
  confirm,
  onReturnToBrowser,
  onSaveProject,
  isDirty
}) => {
  const [excludeImageUrls, setExcludeImageUrls] = React.useState(true)

  const handleExport = () => {
    const exportData = onExportOptimization()
    if (!exportData) {
      alert('No project data to export')
      return
    }

    let filteredData = exportData

    if (excludeImageUrls && exportData.viewpoints) {
      filteredData = {
        ...exportData,
        viewpoints: exportData.viewpoints.map((vp: any) => ({
          ...vp,
          url: ''
        }))
      }
    }

    // Create JSON blob and download
    const json = JSON.stringify(filteredData, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${project?.name || 'project'}-optimization-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleClearProject = async () => {
    const confirmed = await confirm(
      'Are you sure you want to clear the entire project?\n\n' +
      'This will remove all world points, images, lines, planes, and constraints. ' +
      'This action cannot be undone.'
    )
    if (confirmed) {
      onClearProject()
    }
  }

  const [isSaving, setIsSaving] = React.useState(false)
  const [isEditingName, setIsEditingName] = React.useState(false)
  const [editedName, setEditedName] = React.useState(project?.name || '')

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
    try {
      await onSaveProject()
    } finally {
      setIsSaving(false)
    }
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
        <button
          className="btn-tool btn-home"
          onClick={handleReturnToBrowser}
          title="Return to project browser"
        >
          <FontAwesomeIcon icon={faHome} />
        </button>
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
            <button
              className="project-name-display"
              onClick={() => {
                setEditedName(project.name)
                setIsEditingName(true)
              }}
              title="Click to rename project"
            >
              {project.name}{isDirty && <span className="dirty-indicator">*</span>}
              <FontAwesomeIcon icon={faPencil} className="edit-icon" />
            </button>
          )}
        </div>
      )}

      <WorkspaceSwitcher
        currentWorkspace={currentWorkspace}
        onWorkspaceChange={onWorkspaceChange}
        imageHasContent={imageHasContent}
        worldHasContent={worldHasContent}
      />

      <div className="toolbar-section">
        <button
          className="btn-tool"
          onClick={handleSave}
          disabled={!onSaveProject || isSaving}
          title="Save project to browser storage"
        >
          <FontAwesomeIcon icon={faFloppyDisk} /> {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          className="btn-tool"
          onClick={handleExport}
          title={excludeImageUrls ? "Export project data without image URLs" : "Export project data with image URLs"}
        >
          <FontAwesomeIcon icon={faFileExport} /> Export
        </button>
        <label className="toolbar-toggle" title="Exclude image data URLs from export to reduce file size">
          <input
            type="checkbox"
            checked={excludeImageUrls}
            onChange={(e) => setExcludeImageUrls(e.target.checked)}
          />
          Exclude Images
        </label>
        <button
          className="btn-tool btn-clear-project"
          onClick={handleClearProject}
          title="Clear entire project"
        >
          <FontAwesomeIcon icon={faTrash} /> Clear
        </button>
      </div>

      {/* Context-sensitive constraint toolbar */}
      <ConstraintToolbar
        selectedPoints={selectedPoints}
        selectedLines={selectedLines}
        availableConstraints={allConstraints}
        selectionSummary="" // Remove redundant selection display
        onConstraintClick={onConstraintClick}
      />
    </div>
  )
}
