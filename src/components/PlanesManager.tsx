// Planes Management Popup

import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPencil, faTrash, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
import FloatingWindow from './FloatingWindow'
import { Plane } from '../types/project'
import { WorldPoint } from '../entities/world-point'
import type { ISelectable } from '../types/selectable'
import { useConfirm } from './ConfirmDialog'

interface PlanesManagerProps {
  isOpen: boolean
  onClose: () => void
  planes: Record<string, Plane>
  allWorldPoints: WorldPoint[]
  selectedPlanes?: ISelectable[]
  onEditPlane?: (plane: Plane) => void
  onDeletePlane?: (plane: Plane) => void
  onDeleteAllPlanes?: () => void
  onTogglePlaneVisibility?: (plane: Plane) => void
  onSelectPlane?: (plane: Plane) => void
}

export const PlanesManager: React.FC<PlanesManagerProps> = ({
  isOpen,
  onClose,
  planes,
  allWorldPoints,
  selectedPlanes = [],
  onEditPlane,
  onDeletePlane,
  onDeleteAllPlanes,
  onTogglePlaneVisibility,
  onSelectPlane
}) => {
  const { confirm, dialog } = useConfirm()
  const planesList = Object.values(planes)

  const pointMap = new Map(allWorldPoints.map(p => [p.getName(), p]))

  const getPointName = (pointId: string) => {
    const point = pointMap.get(pointId)
    if (point) return point.getName()
    const withoutPrefix = pointId.replace(/^point-/, '')
    const pointByStripped = pointMap.get(withoutPrefix)
    if (pointByStripped) return pointByStripped.getName()
    return pointId
  }

  const getDefinitionType = (plane: Plane): string => {
    const types: Record<string, string> = {
      'three_points': '3 Points',
      'two_lines': '2 Lines',
      'line_point': 'Line+Point'
    }
    return types[plane.definition.type] || plane.definition.type
  }

  const getDefinitionEntities = (plane: Plane): string => {
    switch (plane.definition.type) {
      case 'three_points':
        if (plane.definition.pointIds) {
          return plane.definition.pointIds.map(id => getPointName(id)).join(', ')
        }
        break
      case 'two_lines':
        if (plane.definition.lineIds) {
          return `${plane.definition.lineIds.length} lines`
        }
        break
      case 'line_point':
        if (plane.definition.pointId) {
          return getPointName(plane.definition.pointId)
        }
        break
    }
    return '-'
  }

  const handleDelete = async (plane: Plane) => {
    if (await confirm(`Delete plane "${plane.name}"?`)) {
      onDeletePlane?.(plane)
    }
  }

  const handleDeleteAll = async () => {
    if (await confirm(`Delete all ${planesList.length} planes?`)) {
      onDeleteAllPlanes?.()
    }
  }

  const isSelected = (plane: Plane) => {
    return selectedPlanes.some(p => p.getType() === 'plane' && p.getName() === plane.name)
  }

  return (
    <>
      {dialog}
      <FloatingWindow
        title={`Planes (${planesList.length})`}
        isOpen={isOpen}
        onClose={onClose}
        width={450}
        maxHeight={400}
        storageKey="planes-popup"
        showOkCancel={false}
        onDelete={planesList.length > 0 && onDeleteAllPlanes ? handleDeleteAll : undefined}
      >
        <div className="lines-manager">
          {planesList.length === 0 ? (
            <div className="lines-manager__empty">No planes created yet</div>
          ) : (
            <table className="lines-manager__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Entities</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {planesList.map(plane => (
                  <tr
                    key={plane.id}
                    className={isSelected(plane) ? 'selected' : ''}
                    onClick={() => onSelectPlane?.(plane)}
                  >
                    <td>
                      <span
                        className="color-dot"
                        style={{ backgroundColor: plane.color }}
                      />
                      {plane.name}
                    </td>
                    <td className="dir-cell">{getDefinitionType(plane)}</td>
                    <td className="points-cell">{getDefinitionEntities(plane)}</td>
                    <td className="actions-cell">
                      {onTogglePlaneVisibility && (
                        <button
                          className="btn-icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            onTogglePlaneVisibility(plane)
                          }}
                          title={plane.isVisible ? 'Hide' : 'Show'}
                        >
                          <FontAwesomeIcon icon={plane.isVisible ? faEye : faEyeSlash} />
                        </button>
                      )}
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
}

export default PlanesManager
