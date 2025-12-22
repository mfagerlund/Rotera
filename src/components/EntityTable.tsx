/**
 * Reusable table component for entity management popups.
 * Provides common structure for ConstraintsManager, CoplanarConstraintsManager, etc.
 */

import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPencil, faTrash } from '@fortawesome/free-solid-svg-icons'

export interface EntityTableColumn<T> {
  header: string
  render: (item: T) => React.ReactNode
  className?: string
}

interface EntityTableProps<T> {
  items: T[]
  columns: EntityTableColumn<T>[]
  emptyMessage: string
  selectedItems?: T[]
  onSelect?: (item: T) => void
  onEdit?: (item: T) => void
  onDelete?: (item: T) => void
  getKey: (item: T, index: number) => string | number
}

export function EntityTable<T>({
  items,
  columns,
  emptyMessage,
  selectedItems = [],
  onSelect,
  onEdit,
  onDelete,
  getKey
}: EntityTableProps<T>) {
  const isSelected = (item: T) => selectedItems.includes(item)
  const hasActions = onEdit || onDelete

  if (items.length === 0) {
    return <div className="lines-manager__empty">{emptyMessage}</div>
  }

  return (
    <table className="entity-table">
      <thead>
        <tr>
          {columns.map((col, i) => (
            <th key={i}>{col.header}</th>
          ))}
          {hasActions && <th></th>}
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => (
          <tr
            key={getKey(item, index)}
            className={isSelected(item) ? 'selected' : ''}
            onClick={(e) => {
              e.stopPropagation()
              onSelect?.(item)
            }}
          >
            {columns.map((col, i) => (
              <td key={i} className={col.className}>
                {col.render(item)}
              </td>
            ))}
            {hasActions && (
              <td className="actions-cell">
                {onEdit && (
                  <button
                    className="btn-icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit(item)
                    }}
                    title="Edit"
                  >
                    <FontAwesomeIcon icon={faPencil} />
                  </button>
                )}
                {onDelete && (
                  <button
                    className="btn-icon btn-danger-icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(item)
                    }}
                    title="Delete"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
