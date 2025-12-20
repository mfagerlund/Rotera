// World Points Management Popup

import React from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPencil, faTrash, faCamera } from '@fortawesome/free-solid-svg-icons'
import FloatingWindow from './FloatingWindow'
import { WorldPoint } from '../entities/world-point'
import { Viewpoint } from '../entities/viewpoint'
import { useConfirm } from './ConfirmDialog'
import { getEntityKey } from '../utils/entityKeys'
import { formatXyz } from '../utils/formatters'

interface WorldPointsManagerProps {
  isOpen: boolean
  onClose: () => void
  worldPoints: Set<WorldPoint>
  viewpoints: Map<string, Viewpoint>
  selectedWorldPoints?: WorldPoint[]
  onEditWorldPoint?: (worldPoint: WorldPoint) => void
  onDeleteWorldPoint?: (worldPoint: WorldPoint) => void
  onDeleteAllWorldPoints?: () => void
  onSelectWorldPoint?: (worldPoint: WorldPoint) => void
}

export const WorldPointsManager: React.FC<WorldPointsManagerProps> = observer(({
  isOpen,
  onClose,
  worldPoints,
  viewpoints,
  selectedWorldPoints = [],
  onEditWorldPoint,
  onDeleteWorldPoint,
  onDeleteAllWorldPoints,
  onSelectWorldPoint
}) => {
  const { confirm, dialog } = useConfirm()
  const worldPointsList = Array.from(worldPoints.values())

  const getImagePointCount = (worldPoint: WorldPoint): number => {
    let count = 0
    for (const viewpoint of viewpoints.values()) {
      if (Array.from(viewpoint.imagePoints).some(ip => ip.worldPoint === worldPoint)) {
        count++
      }
    }
    return count
  }

  const formatLockedCoords = (worldPoint: WorldPoint): string => formatXyz(worldPoint.lockedXyz)

  const formatInferredCoords = (worldPoint: WorldPoint): string => formatXyz(worldPoint.inferredXyz)

  const formatOptimizedCoords = (worldPoint: WorldPoint): string => formatXyz(worldPoint.optimizedXyz)

  const formatResidual = (worldPoint: WorldPoint): string => {
    const info = worldPoint.getOptimizationInfo()
    if (info.residuals.length === 0) return '-'
    return `${info.rmsResidual.toFixed(1)}px`
  }

  const handleDelete = async (worldPoint: WorldPoint) => {
    if (await confirm(`Delete world point "${worldPoint.getName()}"?`)) {
      onDeleteWorldPoint?.(worldPoint)
    }
  }

  const handleDeleteAll = async () => {
    if (await confirm(`Delete all ${worldPointsList.length} world points?`)) {
      onDeleteAllWorldPoints?.()
    }
  }

  const isSelected = (worldPoint: WorldPoint) => selectedWorldPoints.includes(worldPoint)

  return (
    <>
      {dialog}
      <FloatingWindow
        title={`World Points (${worldPointsList.length})`}
        isOpen={isOpen}
        onClose={onClose}
        width={730}
        maxHeight={400}
        storageKey="world-points-popup"
        showOkCancel={false}
        onDelete={worldPointsList.length > 0 && onDeleteAllWorldPoints ? handleDeleteAll : undefined}
      >
        <div className="lines-manager">
          {worldPointsList.length === 0 ? (
            <div className="lines-manager__empty">No world points created yet</div>
          ) : (
            <table className="lines-manager__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Images</th>
                  <th>Locked</th>
                  <th>Inferred</th>
                  <th>Optimized</th>
                  <th>Residual</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {worldPointsList.map(worldPoint => (
                  <tr
                    key={getEntityKey(worldPoint)}
                    className={isSelected(worldPoint) ? 'selected' : ''}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectWorldPoint?.(worldPoint)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onSelectWorldPoint?.(worldPoint)
                      onEditWorldPoint?.(worldPoint)
                    }}
                  >
                    <td>
                      <span
                        className="color-dot"
                        style={{ backgroundColor: worldPoint.color }}
                      />
                      {worldPoint.getName()}
                    </td>
                    <td className="dir-cell">
                      <FontAwesomeIcon icon={faCamera} style={{ opacity: 0.5, marginRight: 4 }} />
                      {getImagePointCount(worldPoint)}
                    </td>
                    <td className="length-cell">{formatLockedCoords(worldPoint)}</td>
                    <td className="length-cell">{formatInferredCoords(worldPoint)}</td>
                    <td className="length-cell">{formatOptimizedCoords(worldPoint)}</td>
                    <td className="residual-cell">{formatResidual(worldPoint)}</td>
                    <td className="actions-cell">
                      {onEditWorldPoint && (
                        <button
                          className="btn-icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            onEditWorldPoint(worldPoint)
                          }}
                          title="Edit"
                        >
                          <FontAwesomeIcon icon={faPencil} />
                        </button>
                      )}
                      {onDeleteWorldPoint && (
                        <button
                          className="btn-icon btn-danger-icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(worldPoint)
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

export default WorldPointsManager
