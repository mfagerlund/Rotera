import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBullseye, faXmark } from '@fortawesome/free-solid-svg-icons'
import EntityListPopup, { EntityListItem } from './EntityListPopup'
import { WorldPoint } from '../entities/world-point'
import { Viewpoint } from '../entities/viewpoint'
import { IWorldPoint, IViewpoint, IImagePoint } from '../entities/interfaces'
import { getEntityKey } from '../utils/entityKeys'

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
  onSelectImagePoint
}) => {
  const allImagePointRefs: ImagePointReference[] = []

  Array.from(images.values()).forEach(viewpoint => {
    Array.from(viewpoint.imagePoints).forEach(imagePoint => {
      const worldPoint = imagePoint.worldPoint
      if (worldPoint) {
        allImagePointRefs.push({ worldPoint, viewpoint })
      }
    })
  })

  const imagePointEntities: EntityListItem<ImagePointReference>[] = allImagePointRefs.map(ref => {
    const imagePoint = Array.from(ref.viewpoint.imagePoints).find(ip => ip.worldPoint === ref.worldPoint)
    const compositeKey = `${getEntityKey(ref.worldPoint)}-${getEntityKey(ref.viewpoint)}`
    const isSelected = selectedImagePoints.some(sel =>
      sel.worldPoint === ref.worldPoint && sel.viewpoint === ref.viewpoint
    )

    return {
      id: compositeKey,
      name: `${ref.worldPoint.getName()} (${ref.viewpoint.getName()})`,
      displayInfo: imagePoint ? `(${imagePoint.u.toFixed(1)}, ${imagePoint.v.toFixed(1)})` : '',
      additionalInfo: [
        `World Point: ${ref.worldPoint.getName()}`,
        `Image: ${ref.viewpoint.getName()}`,
        imagePoint ? `Pixel coordinates: (${imagePoint.u.toFixed(1)}, ${imagePoint.v.toFixed(1)})` : ''
      ],
      isActive: isSelected,
      entity: ref  // Pass the actual ImagePointReference object
    }
  })

  return (
    <EntityListPopup
      title="Image Points"
      isOpen={isOpen}
      onClose={onClose}
      entities={imagePointEntities}
      emptyMessage="No image points found"
      storageKey="image-points-popup"
      onEdit={onEditImagePoint}
      onDelete={onDeleteImagePoint}
      onSelect={onSelectImagePoint}
      renderEntityDetails={(entityItem) => {
        const ref = entityItem.entity
        if (!ref) return null
        const imagePoint = (Array.from(ref.viewpoint.imagePoints) as IImagePoint[]).find(ip => ip.worldPoint === ref.worldPoint)

        return (
          <div className="image-point-details">
            <div className="image-info">
              Image: {ref.viewpoint.imageWidth}<FontAwesomeIcon icon={faXmark} />{ref.viewpoint.imageHeight}px
            </div>
            {imagePoint && (
              <div className="coordinates">
                Pixel: ({imagePoint.u.toFixed(1)}, {imagePoint.v.toFixed(1)})
              </div>
            )}
          </div>
        )
      }}
      renderCustomActions={(entity) => (
        <button
          className="btn-focus"
          onClick={(e) => {
            e.stopPropagation()
            // TODO: Focus on this image point in the image viewer
          }}
          title="Focus in image viewer"
        >
          <FontAwesomeIcon icon={faBullseye} />
        </button>
      )}
    />
  )
}

export default ImagePointsManager