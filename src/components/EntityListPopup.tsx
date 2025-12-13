// Reusable Entity List Popup Component

import React, { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEye, faEyeSlash, faPencil, faTrash } from '@fortawesome/free-solid-svg-icons'
import FloatingWindow from './FloatingWindow'
import ContextMenu, { ContextMenuItem } from './ContextMenu'
import { useConfirm } from './ConfirmDialog'

export interface EntityListItem<T = any> {
  id: string
  name: string
  displayInfo?: string
  additionalInfo?: string[]
  color?: string
  isActive?: boolean
  entity: T  // The actual entity object - use this instead of ID lookups
}

interface EntityListPopupProps<T = any> {
  title: string
  isOpen: boolean
  onClose: () => void
  entities: EntityListItem<T>[]
  emptyMessage?: string
  storageKey: string
  width?: number
  height?: number
  maxHeight?: number
  onEdit?: (entity: T) => void
  onDelete?: (entity: T) => void
  onDeleteAll?: () => void
  onToggleVisibility?: (entity: T) => void
  onSelect?: (entity: T) => void
  renderCustomActions?: (entity: EntityListItem<T>) => React.ReactNode
  renderEntityDetails?: (entity: EntityListItem<T>) => React.ReactNode
}

export const EntityListPopup: React.FC<EntityListPopupProps> = observer(({
  title,
  isOpen,
  onClose,
  entities,
  emptyMessage = 'No items found',
  storageKey,
  width = 400,
  height,
  maxHeight = 500,
  onEdit,
  onDelete,
  onDeleteAll,
  onToggleVisibility,
  onSelect,
  renderCustomActions,
  renderEntityDetails
}) => {
  const { confirm, dialog } = useConfirm()
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean
    position: { x: number; y: number }
    entityItem: EntityListItem | null
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    entityItem: null
  })

  const handleDelete = async (entityItem: EntityListItem) => {
    if (await confirm(`Are you sure you want to delete "${entityItem.name}"?\n\nThis action cannot be undone.`)) {
      onDelete?.(entityItem.entity)
    }
  }

  const handleDeleteAll = async () => {
    if (await confirm(`Are you sure you want to delete ALL ${entities.length} ${title.toLowerCase()}?\n\nThis action cannot be undone.`)) {
      onDeleteAll?.()
    }
  }

  const handleContextMenu = (e: React.MouseEvent, entityItem: EntityListItem) => {
    e.preventDefault()
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      entityItem
    })
  }

  const closeContextMenu = () => {
    setContextMenu(prev => ({ ...prev, isOpen: false }))
  }

  const getContextMenuItems = (entityItem: EntityListItem): ContextMenuItem[] => {
    const items: ContextMenuItem[] = []

    if (onEdit) {
      items.push({
        id: 'edit',
        label: 'Edit',
        icon: faPencil,
        onClick: () => onEdit(entityItem.entity)
      })
    }

    if (items.length > 0 && onDelete) {
      items.push({
        id: 'separator',
        label: '',
        separator: true,
        onClick: () => {}
      })
    }

    if (onDelete) {
      items.push({
        id: 'delete',
        label: 'Delete',
        icon: faTrash,
        onClick: () => handleDelete(entityItem)
      })
    }

    return items
  }

  return (
    <>
      {dialog}
      <FloatingWindow
        title={title}
        isOpen={isOpen}
        onClose={onClose}
        storageKey={storageKey}
        width={width}
        height={height}
        maxHeight={maxHeight}
        showOkCancel={false}
      >
        <div className="entity-list-popup">
        {/* Delete All Button */}
        {entities.length > 0 && onDeleteAll && (
          <div className="entity-list-header">
            <button
              className="btn-delete-all"
              onClick={handleDeleteAll}
              title={`Delete all ${entities.length} ${title.toLowerCase()}`}
            >
              <FontAwesomeIcon icon={faTrash} />
              <span>Delete All ({entities.length})</span>
            </button>
          </div>
        )}

        {entities.length === 0 ? (
          <div className="empty-state">
            <span>{emptyMessage}</span>
          </div>
        ) : (
          <div className="entity-list">
            {entities.map((entityItem) => (
              <div
                key={entityItem.id}
                className={`entity-item ${entityItem.isActive ? 'active' : ''}`}
                onClick={() => onSelect?.(entityItem.entity)}
                onContextMenu={(e) => handleContextMenu(e, entityItem)}
              >
                <div className="entity-header">
                  <div className="entity-info">
                    <div className="entity-name">
                      {entityItem.color && (
                        <span
                          className="entity-color-indicator"
                          style={{ backgroundColor: entityItem.color }}
                        />
                      )}
                      <span>{entityItem.name}</span>
                    </div>
                    {entityItem.displayInfo && (
                      <div className="entity-display-info">
                        {entityItem.displayInfo}
                      </div>
                    )}
                  </div>

                  <div className="entity-actions">
                    {/* Edit button */}
                    {onEdit && (
                      <button
                        className="btn-edit"
                        onClick={(e) => {
                          e.stopPropagation()
                          onEdit(entityItem.entity)
                        }}
                        title="Edit"
                      >
                        <FontAwesomeIcon icon={faPencil} />
                      </button>
                    )}

                    {/* Delete button */}
                    {onDelete && (
                      <button
                        className="btn-delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(entityItem)
                        }}
                        title="Delete"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    )}

                    {renderCustomActions?.(entityItem)}
                  </div>
                </div>

                {entityItem.additionalInfo && entityItem.additionalInfo.length > 0 && (
                  <div className="entity-additional-info">
                    {entityItem.additionalInfo.map((info, index) => (
                      <div key={index} className="info-line">
                        {info}
                      </div>
                    ))}
                  </div>
                )}

                {renderEntityDetails?.(entityItem)}
              </div>
            ))}
          </div>
        )}

        {/* Context Menu */}
        {contextMenu.entityItem && (
          <ContextMenu
            isOpen={contextMenu.isOpen}
            position={contextMenu.position}
            items={getContextMenuItems(contextMenu.entityItem)}
            onClose={closeContextMenu}
          />
        )}
      </div>
    </FloatingWindow>
    </>
  )
})

export default EntityListPopup