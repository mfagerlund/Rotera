// World Points Management Popup

import React from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPencil, faTrash, faCamera, faLocationDot, faCrosshairs } from '@fortawesome/free-solid-svg-icons'
import FloatingWindow from './FloatingWindow'
import { WorldPoint } from '../entities/world-point'
import { Viewpoint } from '../entities/viewpoint'
import { useConfirm } from './ConfirmDialog'
import { getEntityKey } from '../utils/entityKeys'
import { formatXyz } from '../utils/formatters'
import { setDraggingWorldPoint, clearDraggingWorldPoint } from '../utils/dragContext'
import { projectWorldPointToPixel, hasValidCameraPose } from '../utils/projection'

interface WorldPointsManagerProps {
  isOpen: boolean
  onClose: () => void
  worldPoints: Set<WorldPoint>
  viewpoints: Map<string, Viewpoint>
  selectedWorldPoints?: WorldPoint[]
  currentViewpoint?: Viewpoint | null
  onEditWorldPoint?: (worldPoint: WorldPoint) => void
  onDeleteWorldPoint?: (worldPoint: WorldPoint) => void
  onDeleteAllWorldPoints?: () => void
  onSelectWorldPoint?: (worldPoint: WorldPoint) => void
  onStartPlacement?: (worldPoint: WorldPoint) => void
  onAddImagePoint?: (worldPoint: WorldPoint, viewpoint: Viewpoint, u: number, v: number) => void
}

export const WorldPointsManager: React.FC<WorldPointsManagerProps> = observer(({
  isOpen,
  onClose,
  worldPoints,
  viewpoints,
  selectedWorldPoints = [],
  currentViewpoint,
  onEditWorldPoint,
  onDeleteWorldPoint,
  onDeleteAllWorldPoints,
  onSelectWorldPoint,
  onStartPlacement,
  onAddImagePoint
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

  // Check if a world point is missing from the current viewpoint
  const isMissingFromCurrentImage = (wp: WorldPoint): boolean => {
    if (!currentViewpoint) return false
    return !Array.from(currentViewpoint.imagePoints).some(ip => ip.worldPoint === wp)
  }

  // Check if auto-place at reprojection is available for a world point
  const canAutoPlace = (wp: WorldPoint): boolean => {
    if (!currentViewpoint) return false
    if (!isMissingFromCurrentImage(wp)) return false
    if (!hasValidCameraPose(currentViewpoint)) return false
    if (!wp.optimizedXyz) return false
    const projection = projectWorldPointToPixel(wp, currentViewpoint)
    if (!projection) return false
    return projection.u >= 0 && projection.u <= currentViewpoint.imageWidth &&
           projection.v >= 0 && projection.v <= currentViewpoint.imageHeight
  }

  // Handle auto-placing a world point at its reprojected position
  const handleAutoPlace = (wp: WorldPoint) => {
    if (!currentViewpoint || !onAddImagePoint) return
    const projection = projectWorldPointToPixel(wp, currentViewpoint)
    if (!projection) return
    onAddImagePoint(wp, currentViewpoint, projection.u, projection.v)
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
            <table className="entity-table">
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
                {worldPointsList.map(worldPoint => {
                  const isMissing = isMissingFromCurrentImage(worldPoint)
                  const autoPlaceAvailable = canAutoPlace(worldPoint)

                  return (
                    <tr
                      key={getEntityKey(worldPoint)}
                      className={`${isSelected(worldPoint) ? 'selected' : ''} ${isMissing ? 'missing-from-image' : ''}`}
                      draggable={true}
                      onDragStart={(e) => {
                        const action = isMissing ? 'place' : 'move'
                        e.dataTransfer.setData('application/json', JSON.stringify({
                          type: 'world-point',
                          worldPointKey: getEntityKey(worldPoint),
                          action
                        }))
                        e.dataTransfer.effectAllowed = 'copy'
                        e.currentTarget.style.opacity = '0.5'
                        setDraggingWorldPoint(worldPoint, action)
                      }}
                      onDragEnd={(e) => {
                        e.currentTarget.style.opacity = '1'
                        clearDraggingWorldPoint()
                      }}
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
                        {autoPlaceAvailable && onAddImagePoint && (
                          <button
                            className="btn-icon btn-auto-place"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleAutoPlace(worldPoint)
                            }}
                            title="Auto-place at reprojected position"
                          >
                            <FontAwesomeIcon icon={faCrosshairs} />
                          </button>
                        )}
                        {isMissing && onStartPlacement && (
                          <button
                            className="btn-icon btn-place"
                            onClick={(e) => {
                              e.stopPropagation()
                              onStartPlacement(worldPoint)
                            }}
                            title="Place on current image"
                          >
                            <FontAwesomeIcon icon={faLocationDot} />
                          </button>
                        )}
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
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </FloatingWindow>
    </>
  )
})

export default WorldPointsManager
