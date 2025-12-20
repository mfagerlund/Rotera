import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faFolder,
  faFolderOpen,
  faPencil,
  faTrash,
  faSpinner
} from '@fortawesome/free-solid-svg-icons'
import { Folder } from '../../services/project-db'
import { InlineRenameInput } from './InlineRenameInput'

interface FolderCardProps {
  folder: Folder
  isDragOver: boolean
  isBatchOptimizing: boolean
  stats: {
    projectCount: number
    minError: number | null
    maxError: number | null
    avgError: number | null
  } | undefined
  editingItem: { type: 'folder' | 'project'; id: string; name: string } | null
  onOpen: (folderId: string) => void
  onRename: (folder: Folder) => void
  onDelete: (folder: Folder) => void
  onEditChange: (name: string) => void
  onEditConfirm: () => void
  onEditCancel: () => void
  onDragOver: (e: React.DragEvent, folderId: string) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, folderId: string) => void
}

export const FolderCard: React.FC<FolderCardProps> = ({
  folder,
  isDragOver,
  isBatchOptimizing,
  stats,
  editingItem,
  onOpen,
  onRename,
  onDelete,
  onEditChange,
  onEditConfirm,
  onEditCancel,
  onDragOver,
  onDragLeave,
  onDrop
}) => {
  const isEditing = editingItem?.type === 'folder' && editingItem.id === folder.id

  const renderStats = () => {
    // If batch optimizing and this folder has projects, show spinner
    if (isBatchOptimizing && stats && stats.projectCount > 0) {
      return (
        <span className="project-browser__item-meta" style={{ marginLeft: 'auto', marginRight: '8px' }}>
          <FontAwesomeIcon icon={faSpinner} spin style={{ color: '#3498db', marginRight: '6px' }} />
          <span style={{ color: '#3498db' }}>
            {stats.projectCount} projects
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
  }

  return (
    <div
      className={`project-browser__item project-browser__item--folder ${
        isDragOver ? 'project-browser__item--drag-over' : ''
      }`}
      onClick={() => !editingItem && onOpen(folder.id)}
      onDragOver={e => onDragOver(e, folder.id)}
      onDragLeave={onDragLeave}
      onDrop={e => onDrop(e, folder.id)}
    >
      <FontAwesomeIcon
        icon={isDragOver ? faFolderOpen : faFolder}
        className="project-browser__item-icon project-browser__item-icon--folder"
      />
      {isEditing ? (
        <InlineRenameInput
          value={editingItem.name}
          onChange={onEditChange}
          onConfirm={onEditConfirm}
          onCancel={onEditCancel}
        />
      ) : (
        <span className="project-browser__item-name">{folder.name}</span>
      )}
      {renderStats()}
      <div className="project-browser__item-actions">
        <button
          title="Rename"
          onClick={e => {
            e.stopPropagation()
            onRename(folder)
          }}
        >
          <FontAwesomeIcon icon={faPencil} />
        </button>
        <button
          title="Delete"
          onClick={e => {
            e.stopPropagation()
            onDelete(folder)
          }}
        >
          <FontAwesomeIcon icon={faTrash} />
        </button>
      </div>
    </div>
  )
}
