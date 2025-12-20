// Planes Management Popup

import React from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPencil, faTrash } from '@fortawesome/free-solid-svg-icons'
import FloatingWindow from './FloatingWindow'
import { Plane } from '../entities/plane'
import { WorldPoint } from '../entities/world-point'
import type { ISelectable } from '../types/selectable'
import { useConfirm } from './ConfirmDialog'
import { getEntityKey } from '../utils/entityKeys'

interface PlanesManagerProps {
  isOpen: boolean
  onClose: () => void
  planes: Plane[]
  allWorldPoints: WorldPoint[]
  selectedPlanes?: ISelectable[]
  onEditPlane?: (plane: Plane) => void
  onDeletePlane?: (plane: Plane) => void
  onDeleteAllPlanes?: () => void
  onTogglePlaneVisibility?: (plane: Plane) => void
  onSelectPlane?: (plane: Plane) => void
}

export const PlanesManager: React.FC<PlanesManagerProps> = observer(({
  isOpen,
  onClose,
  planes,
  selectedPlanes = [],
  onEditPlane,
  onDeletePlane,
  onDeleteAllPlanes,
  onSelectPlane
}) => {
  const { confirm, dialog } = useConfirm()

  const getPointNames = (plane: Plane): string => {
    const points = plane.getPoints()
    if (points.length === 0) return '-'
    return points.map(p => p.name).join(', ')
  }

  const handleDelete = async (plane: Plane) => {
    if (await confirm(`Delete plane "${plane.name}"?`)) {
      onDeletePlane?.(plane)
    }
  }

  const handleDeleteAll = async () => {
    if (await confirm(`Delete all ${planes.length} planes?`)) {
      onDeleteAllPlanes?.()
    }
  }

  const isSelected = (plane: Plane) => {
    return selectedPlanes.some(p => p === plane)
  }

  return (
    <>
      {dialog}
      <FloatingWindow
        title={`Planes (${planes.length})`}
        isOpen={isOpen}
        onClose={onClose}
        width={450}
        maxHeight={400}
        storageKey="planes-popup"
        showOkCancel={false}
        onDelete={planes.length > 0 && onDeleteAllPlanes ? handleDeleteAll : undefined}
      >
        <div className="lines-manager">
          {planes.length === 0 ? (
            <div className="lines-manager__empty">No planes created yet</div>
          ) : (
            <table className="entity-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Points</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {planes.map(plane => (
                  <tr
                    key={getEntityKey(plane)}
                    className={isSelected(plane) ? 'selected' : ''}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectPlane?.(plane)
                    }}
                  >
                    <td>
                      <span
                        className="color-dot"
                        style={{ backgroundColor: plane.color }}
                      />
                      {plane.name}
                    </td>
                    <td className="points-cell">{getPointNames(plane)}</td>
                    <td className="actions-cell">
                      {onEditPlane && (
                        <button
                          className="btn-icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            onEditPlane(plane)
                          }}
                          title="Edit"
                        >
                          <FontAwesomeIcon icon={faPencil} />
                        </button>
                      )}
                      {onDeletePlane && (
                        <button
                          className="btn-icon btn-danger-icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(plane)
                          }}
                          title="Delete"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </FloatingWindow>
    </>
  )
})

export default PlanesManager
