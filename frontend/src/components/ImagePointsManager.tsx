import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBullseye, faXmark } from '@fortawesome/free-solid-svg-icons'
import EntityListPopup, { EntityListItem } from './EntityListPopup'
import { ImagePoint, WorldPoint, ProjectImage } from '../types/project'

interface ImagePointsManagerProps {
  isOpen: boolean
  onClose: () => void
  worldPoints: Record<string, WorldPoint>
  images: Record<string, ProjectImage>
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
  // Collect all image points from all world points
  const allImagePoints: Array<ImagePoint & { worldPointId: string, worldPointName: string }> = []

  Object.entries(worldPoints).forEach(([wpId, worldPoint]) => {
    worldPoint.imagePoints.forEach(imagePoint => {
      allImagePoints.push({
        ...imagePoint,
        worldPointId: wpId,
        worldPointName: worldPoint.name
      })
    })
  })

  const getImageName = (imageId: string) => images[imageId]?.name || imageId

  // Convert image points to EntityListItem format
  const imagePointEntities: EntityListItem[] = allImagePoints.map(imagePoint => {
    const imagePointId = `${imagePoint.worldPointId}-${imagePoint.imageId}`
    return {
      id: imagePointId,
      name: `${imagePoint.worldPointName} (${getImageName(imagePoint.imageId)})`,
      displayInfo: `(${imagePoint.u.toFixed(1)}, ${imagePoint.v.toFixed(1)})`,
      additionalInfo: [
        `World Point: ${imagePoint.worldPointName}`,
        `Image: ${getImageName(imagePoint.imageId)}`,
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
        const worldPoint = worldPoints[worldPointId]
        const imagePoint = worldPoint?.imagePoints.find(ip => ip.imageId === imageId)
        const image = images[imageId]

        return (
          <div className="image-point-details">
            {image && (
              <div className="image-info">
                Image: {image.width}<FontAwesomeIcon icon={faXmark} />{image.height}px
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