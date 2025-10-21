// Main application toolbar component
// Extracted from MainLayout for better maintainability

import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faFolderOpen,
  faFloppyDisk,
  faFileExport,
  faTrash,
  faToggleOn,
  faToggleOff,
  faEye
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

  // Settings
  showPointNames: boolean
  onTogglePointNames: (show: boolean) => void
  showComponentOverlay: boolean
  onToggleComponentOverlay: () => void
  visualFeedbackLevel: 'minimal' | 'standard' | 'detailed'
  onVisualFeedbackChange: (level: 'minimal' | 'standard' | 'detailed') => void

  // Confirm dialog
  confirm: (message: string) => Promise<boolean>
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
  showPointNames,
  onTogglePointNames,
  showComponentOverlay,
  onToggleComponentOverlay,
  visualFeedbackLevel,
  onVisualFeedbackChange,
  confirm
}) => {
  const handleExport = () => {
    const exportData = onExportOptimization()
    if (!exportData) {
      alert('No project data to export')
      return
    }

    // Use the data as-is (viewpoints already serialize without blobs by default)
    const filteredData = exportData

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

  return (
    <div className="top-toolbar">
      <WorkspaceSwitcher
        currentWorkspace={currentWorkspace}
        onWorkspaceChange={onWorkspaceChange}
        imageHasContent={imageHasContent}
        worldHasContent={worldHasContent}
      />

      <div className="toolbar-section">
        <button className="btn-tool">
          <FontAwesomeIcon icon={faFolderOpen} /> Open
        </button>
        <button className="btn-tool">
          <FontAwesomeIcon icon={faFloppyDisk} /> Save
        </button>
        <button
          className="btn-tool"
          onClick={handleExport}
          title="Export project data for optimization (without image blobs)"
        >
          <FontAwesomeIcon icon={faFileExport} /> Export
        </button>
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

      <div className="toolbar-section">
        <label className="toolbar-toggle">
          <input
            type="checkbox"
            checked={showPointNames}
            onChange={(e) => onTogglePointNames(e.target.checked)}
          />
          Point Names
        </label>

        <button
          className="btn-tool"
          onClick={onToggleComponentOverlay}
          title="Toggle component overlay"
        >
          <FontAwesomeIcon icon={showComponentOverlay ? faToggleOn : faToggleOff} />
          {' '}Components
        </button>

        <label className="toolbar-label">
          Feedback:
          <select
            className="toolbar-select"
            value={visualFeedbackLevel}
            onChange={(e) => onVisualFeedbackChange(e.target.value as 'minimal' | 'standard' | 'detailed')}
          >
            <option value="minimal">Minimal</option>
            <option value="standard">Standard</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
      </div>
    </div>
  )
}
