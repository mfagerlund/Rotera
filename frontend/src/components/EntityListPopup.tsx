// Reusable Entity List Popup Component

import React, { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEye, faEyeSlash, faPencil, faTrash } from '@fortawesome/free-solid-svg-icons'
import FloatingWindow from './FloatingWindow'
import ContextMenu, { ContextMenuItem } from './ContextMenu'
import { useConfirm } from './ConfirmDialog'

export interface EntityListItem {
  id: string
  name: string
  displayInfo?: string
  additionalInfo?: string[]
  color?: string
  isVisible?: boolean
  isActive?: boolean
}

interface EntityListPopupProps {
  title: string
  isOpen: boolean
  onClose: () => void
  entities: EntityListItem[]
  emptyMessage?: string
  storageKey: string
  width?: number
  height?: number
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  onToggleVisibility?: (id: string) => void
  onSelect?: (id: string) => void
  renderCustomActions?: (entity: EntityListItem) => React.ReactNode
  renderEntityDetails?: (entity: EntityListItem) => React.ReactNode
}

export const EntityListPopup: React.FC<EntityListPopupProps> = ({
  title,
  isOpen,
  onClose,
  entities,
  emptyMessage = 'No items found',
  storageKey,
  width = 400,
  height = 500,
  onEdit,
  onDelete,
  onToggleVisibility,
  onSelect,
  renderCustomActions,
  renderEntityDetails
}) => {
  const { confirm, dialog } = useConfirm()
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean
    position: { x: number; y: number }
    entityId: string
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    entityId: ''
  })

  const handleDelete = async (id: string, name: string) => {
    if (await confirm(`Are you sure you want to delete "${name}"?\n\nThis action cannot be undone.`)) {
      onDelete?.(id)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, entityId: string) => {
    e.preventDefault()
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      entityId
    })
  }

  const closeContextMenu = () => {
    setContextMenu(prev => ({ ...prev, isOpen: false }))
  }

  const getContextMenuItems = (entity: EntityListItem): ContextMenuItem[] => {
    const items: ContextMenuItem[] = []

    if (onEdit) {
      items.push({
        id: 'edit',
        label: 'Edit',
        icon: 'faPencil',
        onClick: () => onEdit(entity.id)
      })
    }

    if (onToggleVisibility) {
      items.push({
        id: 'toggle-visibility',
        label: entity.isVisible ? 'Hide' : 'Show',
        icon: entity.isVisible ? 'faEyeSlash' : 'faEye',
        onClick: () => onToggleVisibility(entity.id)
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
        icon: 'faTrash',
        onClick: () => handleDelete(entity.id, entity.name)
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
        width={width}
        height={height}
        storageKey={storageKey}
        showOkCancel={false}
      >
        <div className="entity-list-popup">
        {entities.length === 0 ? (
          <div className="empty-state">
            <span>{emptyMessage}</span>
          </div>
        ) : (
          <div className="entity-list">
            {entities.map((entity) => (
              <div
                key={entity.id}
                className={`entity-item ${entity.isActive ? 'active' : ''}`}
                onClick={() => onSelect?.(entity.id)}
                onContextMenu={(e) => handleContextMenu(e, entity.id)}
              >
                <div className="entity-header">
                  <div className="entity-info">
                    <div className="entity-name">
                      {entity.color && (
                        <span
                          className="entity-color-indicator"
                          style={{ backgroundColor: entity.color }}
                        />
                      )}
                      <span>{entity.name}</span>
                    </div>
                    {entity.displayInfo && (
                      <div className="entity-display-info">
                        {entity.displayInfo}
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
                          onEdit(entity.id)
                        }}
                        title="Edit"
                      >
                        
                      </button>
                    )}

                    {/* Delete button */}
                    {onDelete && (
                      <button
                        className="btn-delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(entity.id, entity.name)
                        }}
                        title="Delete"
                      >
                        
                      </button>
                    )}

                    {renderCustomActions?.(entity)}
                  </div>
                </div>

                {entity.additionalInfo && entity.additionalInfo.length > 0 && (
                  <div className="entity-additional-info">
                    {entity.additionalInfo.map((info, index) => (
                      <div key={index} className="info-line">
                        {info}
                      </div>
                    ))}
                  </div>
                )}

                {renderEntityDetails?.(entity)}
              </div>
            ))}
          </div>
        )}

        {/* Context Menu */}
        {contextMenu.entityId && (
          <ContextMenu
            isOpen={contextMenu.isOpen}
            position={contextMenu.position}
            items={getContextMenuItems(entities.find(e => e.id === contextMenu.entityId)!)}
            onClose={closeContextMenu}
          />
        )}
      </div>
    </FloatingWindow>
    </>
  )
}

export default EntityListPopup