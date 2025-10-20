import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBullseye, faXmark } from '@fortawesome/free-solid-svg-icons'
import EntityListPopup, { EntityListItem } from './EntityListPopup'
import { WorldPoint } from '../entities/world-point'
import { Viewpoint } from '../entities/viewpoint'

interface ImagePointsManagerProps {
  isOpen: boolean
  onClose: () => void
  worldPoints: Map<string, WorldPoint>
  images: Map<string, Viewpoint>
  selectedImagePoints?: string[]
  onEditImagePoint?: (imagePointId: string) => void
  onDeleteImagePoint?: (imagePointId: string) => void
  onSelectImagePoint?: (imagePointId: string) => void
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
  // Collect all image points from all viewpoints
  const allImagePoints: Array<{ u: number, v: number, viewpointId: string, worldPointId: string, worldPointName: string }> = []

  Array.from(images.values()).forEach(viewpoint => {
    viewpoint.getImagePoints().forEach(imagePoint => {
      const worldPoint = worldPoints.get(imagePoint.worldPointId)
      if (worldPoint) {
        allImagePoints.push({
          u: imagePoint.u,
          v: imagePoint.v,
          viewpointId: viewpoint.getId(),
          worldPointId: imagePoint.worldPointId,
          worldPointName: worldPoint.getName()
        })
      }
    })
  })

  const getImageName = (imageId: string) => images.get(imageId)?.getName() || imageId

  // Convert image points to EntityListItem format
  const imagePointEntities: EntityListItem[] = allImagePoints.map(imagePoint => {
    const imagePointId = `${imagePoint.worldPointId}-${imagePoint.viewpointId}`
    return {
      id: imagePointId,
      name: `${imagePoint.worldPointName} (${getImageName(imagePoint.viewpointId)})`,
      displayInfo: `(${imagePoint.u.toFixed(1)}, ${imagePoint.v.toFixed(1)})`,
      additionalInfo: [
        `World Point: ${imagePoint.worldPointName}`,
        `Image: ${getImageName(imagePoint.viewpointId)}`,
        `Pixel coordinates: (${imagePoint.u.toFixed(1)}, ${imagePoint.v.toFixed(1)})`
      ],
      isActive: selectedImagePoints.includes(imagePointId)
    }
  })

  const handleEdit = (imagePointId: string) => {
    // Extract world point ID and image ID from composite ID
    const [worldPointId, imageId] = imagePointId.split('-')
    onEditImagePoint?.(imagePointId)
  }

  const handleDelete = (imagePointId: string) => {
    onDeleteImagePoint?.(imagePointId)
  }

  return (
    <EntityListPopup
      title="Image Points"
      isOpen={isOpen}
      onClose={onClose}
      entities={imagePointEntities}
      emptyMessage="No image points found"
      storageKey="image-points-popup"
      onEdit={handleEdit}
      onDelete={handleDelete}
      onSelect={onSelectImagePoint}
      renderEntityDetails={(entity) => {
        const [worldPointId, imageId] = entity.id.split('-')
        const viewpoint = images.get(imageId)
        const imagePoint = viewpoint?.getImagePoints().find(ip => ip.worldPointId === worldPointId)

        return (
          <div className="image-point-details">
            {viewpoint && (
              <div className="image-info">
                Image: {viewpoint.imageDimensions[0]}<FontAwesomeIcon icon={faXmark} />{viewpoint.imageDimensions[1]}px
              </div>
            )}
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
            console.log('Focus on image point:', entity.id)
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