import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faFile,
  faCamera,
  faCircle,
  faSpinner,
  faCopy,
  faArrowRight,
  faPencil,
  faTrash,
  faBolt,
  faClock
} from '@fortawesome/free-solid-svg-icons'
import { ProjectSummary } from '../../services/project-db'
import { InlineRenameInput } from './InlineRenameInput'
import { getSolveQuality, formatRmsError } from '../../optimization/optimize-project'

interface ProjectCardProps {
  project: ProjectSummary
  isLoading: boolean
  isDragging: boolean
  isLastOpened: boolean
  isOptimizing: boolean
  isQueued: boolean
  isJustCompleted: boolean
  batchResult: {
    projectId: string
    error: number | null
    rmsReprojectionError?: number
    converged: boolean
    solveTimeMs: number
    errorMessage?: string
  } | undefined
  editingItem: { type: 'folder' | 'project'; id: string; name: string } | null
  onOpen: (project: ProjectSummary) => void
  onDragStart: (e: React.DragEvent, project: ProjectSummary) => void
  onDragEnd: () => void
  onCopy: (project: ProjectSummary) => void
  onMove: (project: ProjectSummary) => void
  onRename: (project: ProjectSummary) => void
  onDelete: (project: ProjectSummary) => void
  onEditChange: (name: string) => void
  onEditConfirm: () => void
  onEditCancel: () => void
  formatDate: (date: Date) => string
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  isLoading,
  isDragging,
  isLastOpened,
  isOptimizing,
  isQueued,
  isJustCompleted,
  batchResult,
  editingItem,
  onOpen,
  onDragStart,
  onDragEnd,
  onCopy,
  onMove,
  onRename,
  onDelete,
  onEditChange,
  onEditConfirm,
  onEditCancel,
  formatDate
}) => {
  const isEditing = editingItem?.type === 'project' && editingItem.id === project.id

  const renderOptimizationStatus = () => {
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
    const storedResult = project.optimizationResult
    const result = batchResult || storedResult
    if (!result) return null

    // Use RMS reprojection error for quality (the normalized, project-size-independent metric)
    const quality = getSolveQuality(result.rmsReprojectionError)
    const rmsDisplay = formatRmsError(result.rmsReprojectionError)

    return (
      <span
        className="project-browser__item-optimization"
        title={result.errorMessage || `${quality.label}: ${rmsDisplay}, Time: ${result.solveTimeMs.toFixed(0)}ms${result.converged ? '' : ' (not converged)'}`}
      >
        <span style={{ color: quality.vividColor }}>{quality.starDisplay}</span>
        <span style={{ color: quality.vividColor }}>{rmsDisplay}</span>
        <span className="project-browser__item-time">{result.solveTimeMs.toFixed(0)}ms</span>
      </span>
    )
  }

  return (
    <div
      className={`project-browser__item project-browser__item--project ${
        isLoading ? 'project-browser__item--loading' : ''
      } ${isDragging ? 'project-browser__item--dragging' : ''} ${
        isLastOpened ? 'project-browser__item--last-opened' : ''
      } ${isJustCompleted ? 'project-browser__item--just-completed' : ''}`}
      draggable
      onDragStart={e => onDragStart(e, project)}
      onDragEnd={onDragEnd}
      onClick={() => !editingItem && onOpen(project)}
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
      {isEditing ? (
        <InlineRenameInput
          value={editingItem.name}
          onChange={onEditChange}
          onConfirm={onEditConfirm}
          onCancel={onEditCancel}
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
          {renderOptimizationStatus()}
        </>
      )}
      <div className="project-browser__item-actions">
        {isLoading ? (
          <FontAwesomeIcon icon={faSpinner} spin />
        ) : (
          <>
            <button
              title="Copy project..."
              onClick={e => {
                e.stopPropagation()
                onCopy(project)
              }}
            >
              <FontAwesomeIcon icon={faCopy} />
            </button>
            <button
              title="Move to folder..."
              onClick={e => {
                e.stopPropagation()
                onMove(project)
              }}
            >
              <FontAwesomeIcon icon={faArrowRight} />
            </button>
            <button
              title="Rename"
              onClick={e => {
                e.stopPropagation()
                onRename(project)
              }}
            >
              <FontAwesomeIcon icon={faPencil} />
            </button>
            <button
              title="Delete"
              onClick={e => {
                e.stopPropagation()
                onDelete(project)
              }}
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
