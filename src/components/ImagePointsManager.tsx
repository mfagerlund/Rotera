import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPencil, faTrash } from '@fortawesome/free-solid-svg-icons'
import FloatingWindow from './FloatingWindow'
import { WorldPoint } from '../entities/world-point'
import { Viewpoint } from '../entities/viewpoint'
import { IWorldPoint, IViewpoint, IImagePoint } from '../entities/interfaces'
import { useConfirm } from './ConfirmDialog'

export interface ImagePointReference {
  worldPoint: IWorldPoint
  viewpoint: IViewpoint
}

interface ImagePointsManagerProps {
  isOpen: boolean
  onClose: () => void
  worldPoints: Map<string, WorldPoint>
  images: Map<string, Viewpoint>
  selectedImagePoints?: ImagePointReference[]
  onEditImagePoint?: (ref: ImagePointReference) => void
  onDeleteImagePoint?: (ref: ImagePointReference) => void
  onDeleteAllImagePoints?: () => void
  onSelectImagePoint?: (ref: ImagePointReference) => void
}

export const ImagePointsManager: React.FC<ImagePointsManagerProps> = ({
  isOpen,
  onClose,
  worldPoints,
  images,
  selectedImagePoints = [],
  onEditImagePoint,
  onDeleteImagePoint,
  onDeleteAllImagePoints,
  onSelectImagePoint
}) => {
  const { confirm, dialog } = useConfirm()

  const allImagePointRefs: { ref: ImagePointReference; imagePoint: IImagePoint }[] = []

  Array.from(images.values()).forEach(viewpoint => {
    Array.from(viewpoint.imagePoints).forEach(imagePoint => {
      const worldPoint = imagePoint.worldPoint
      if (worldPoint) {
        allImagePointRefs.push({
          ref: { worldPoint, viewpoint },
          imagePoint
        })
      }
    })
  })

  const handleDelete = async (ref: ImagePointReference) => {
    if (await confirm(`Delete image point for "${ref.worldPoint.getName()}" in "${ref.viewpoint.getName()}"?`)) {
      onDeleteImagePoint?.(ref)
    }
  }

  const handleDeleteAll = async () => {
    if (await confirm(`Delete all ${allImagePointRefs.length} image points?`)) {
      onDeleteAllImagePoints?.()
    }
  }

  const formatResidual = (imagePoint: IImagePoint): string => {
    if (imagePoint.reprojectedU === undefined || imagePoint.reprojectedV === undefined) return '-'
    const du = imagePoint.reprojectedU - imagePoint.u
    const dv = imagePoint.reprojectedV - imagePoint.v
    const error = Math.sqrt(du * du + dv * dv)
    return `${error.toFixed(1)}px`
  }

  const formatCoords = (imagePoint: IImagePoint): string => {
    return `(${imagePoint.u.toFixed(0)}, ${imagePoint.v.toFixed(0)})`
  }

  const isSelected = (ref: ImagePointReference) => {
    return selectedImagePoints.some(sel =>
      sel.worldPoint === ref.worldPoint && sel.viewpoint === ref.viewpoint
    )
  }

  return (
    <>
      {dialog}
      <FloatingWindow
        title={`Image Points (${allImagePointRefs.length})`}
        isOpen={isOpen}
        onClose={onClose}
        width={480}
        maxHeight={400}
        storageKey="image-points-popup"
        showOkCancel={false}
        onDelete={allImagePointRefs.length > 0 && onDeleteAllImagePoints ? handleDeleteAll : undefined}
      >
        <div className="lines-manager">
          {allImagePointRefs.length === 0 ? (
            <div className="lines-manager__empty">No image points found</div>
          ) : (
            <table className="lines-manager__table">
              <thead>
                <tr>
                  <th>World Point</th>
                  <th>Image</th>
                  <th>Coords</th>
                  <th>Residual</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {allImagePointRefs.map(({ ref, imagePoint }) => {
                  const key = `${ref.worldPoint.getName()}-${ref.viewpoint.getName()}`
                  return (
                    <tr
                      key={key}
                      className={isSelected(ref) ? 'selected' : ''}
                      onClick={() => onSelectImagePoint?.(ref)}
                    >
                      <td>{ref.worldPoint.getName()}</td>
                      <td className="points-cell">{ref.viewpoint.getName()}</td>
                      <td className="length-cell">{formatCoords(imagePoint)}</td>
                      <td className="residual-cell">{formatResidual(imagePoint)}</td>
                      <td className="actions-cell">
                        {onEditImagePoint && (
                          <button
                            className="btn-icon"
                            onClick={(e) => {
                              e.stopPropagation()
                              onEditImagePoint(ref)
                            }}
                            title="Edit"
                          >
                            <FontAwesomeIcon icon={faPencil} />
                          </button>
                        )}
                        {onDeleteImagePoint && (
                          <button
                            className="btn-icon btn-danger-icon"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(ref)
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
}

export default ImagePointsManager
