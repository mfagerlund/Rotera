// Left sidebar image navigation toolbar

import React, { useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowsUpDown, faCheck, faPlus, faPencil, faTrash, faCopy } from '@fortawesome/free-solid-svg-icons'
import { faCircle } from '@fortawesome/free-regular-svg-icons'
import { Viewpoint } from '../entities/viewpoint'
import { WorldPoint } from '../entities/world-point'
import { ImageUtils } from '../utils/imageUtils'
import { useConfirm } from './ConfirmDialog'
import ImageEditor from './ImageEditor'

interface ImageNavigationToolbarProps {
  images: Map<string, Viewpoint>
  currentImageId: string | null
  worldPoints: Map<string, WorldPoint>
  selectedWorldPoints: WorldPoint[]
  hoveredWorldPoint: WorldPoint | null
  isCreatingConstraint: boolean
  onImageSelect: (imageId: string) => void
  onImageAdd: (image: Viewpoint) => void
  onImageRename: (viewpoint: Viewpoint, newName: string) => void
  onImageDelete: (viewpoint: Viewpoint) => void
  getImagePointCount: (viewpoint: Viewpoint) => number
  getSelectedPointsInImage: (viewpoint: Viewpoint) => number
  imageHeights: Record<string, number>
  onImageHeightChange: (imageId: string, height: number) => void
  imageSortOrder: string[]
  onImageReorder: (newOrder: string[]) => void
  onWorldPointHover?: (worldPoint: WorldPoint | null) => void
  onWorldPointClick?: (worldPoint: WorldPoint, ctrlKey: boolean, shiftKey: boolean) => void
  onCopyPointsToCurrentImage?: (sourceViewpoint: Viewpoint) => void
}

export const ImageNavigationToolbar: React.FC<ImageNavigationToolbarProps> = ({
  images,
  currentImageId,
  worldPoints,
  selectedWorldPoints,
  hoveredWorldPoint,
  isCreatingConstraint,
  onImageSelect,
  onImageAdd,
  onImageRename,
  onImageDelete,
  getImagePointCount,
  getSelectedPointsInImage,
  imageHeights,
  onImageHeightChange,
  imageSortOrder,
  onImageReorder,
  onWorldPointHover,
  onWorldPointClick,
  onCopyPointsToCurrentImage
}) => {
  const { confirm, dialog } = useConfirm()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [draggedImageId, setDraggedImageId] = React.useState<string | null>(null)
  const [dragOverImageId, setDragOverImageId] = React.useState<string | null>(null)
  const [editingImage, setEditingImage] = React.useState<Viewpoint | null>(null)

  const handleAddImage = () => {
    fileInputRef.current?.click()
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      try {
        const validation = ImageUtils.validateImageFile(file)
        if (!validation.valid) {
          alert(`Error with ${file.name}: ${validation.error}`)
          continue
        }

        const projectImage = await ImageUtils.loadImageFile(file)
        onImageAdd(projectImage as any) // ImageUtils returns legacy format, parent converts to Viewpoint
      } catch (error) {
        console.error('Failed to load image:', error)
        alert(`Failed to load ${file.name}`)
      }
    }

    // Reset file input
    event.target.value = ''
  }

  // Sort images according to sort order, with new images at the end
  const imageList = React.useMemo(() =>
    Array.from(images.values()).sort((a, b) => {
      const indexA = imageSortOrder.indexOf(a.getId())
      const indexB = imageSortOrder.indexOf(b.getId())
      // Images in sort order come first (by their index), unsorted images go to end (Infinity)
      const orderA = indexA >= 0 ? indexA : Infinity
      const orderB = indexB >= 0 ? indexB : Infinity
      return orderA - orderB
    })
  , [images, imageSortOrder])

  // Count selected world points in an image
  const getSelectedWorldPointsInImage = (viewpoint: Viewpoint): number => {
    const selectedIds = new Set(selectedWorldPoints.map(wp => wp.getId()))
    return viewpoint.getImagePoints().filter(ip => selectedIds.has(ip.worldPointId)).length
  }

  // Handle drag and drop reordering
  const handleDrop = (droppedOnImageId: string) => {
    if (!draggedImageId || draggedImageId === droppedOnImageId) return

    const newOrder = [...imageSortOrder]

    // Ensure both images are in the order array
    if (!newOrder.includes(draggedImageId)) {
      newOrder.push(draggedImageId)
    }
    if (!newOrder.includes(droppedOnImageId)) {
      newOrder.push(droppedOnImageId)
    }

    // Remove dragged item and insert it before the drop target
    const draggedIndex = newOrder.indexOf(draggedImageId)
    const dropTargetIndex = newOrder.indexOf(droppedOnImageId)

    newOrder.splice(draggedIndex, 1)
    const newDropIndex = draggedIndex < dropTargetIndex ? dropTargetIndex - 1 : dropTargetIndex
    newOrder.splice(newDropIndex, 0, draggedImageId)

    onImageReorder(newOrder)
    setDraggedImageId(null)
    setDragOverImageId(null)
  }

  return (
    <>
      {dialog}
      {editingImage && (
        <ImageEditor
          isOpen={true}
          viewpoint={editingImage}
          onClose={() => setEditingImage(null)}
          onUpdateViewpoint={(updatedViewpoint: Viewpoint) => {
            onImageRename(updatedViewpoint, updatedViewpoint.getName())
            setEditingImage(null)
          }}
          onDeleteViewpoint={(viewpoint: Viewpoint) => {
            onImageDelete(viewpoint)
            setEditingImage(null)
          }}
        />
      )}
      <div className="image-toolbar">
      <div className="image-toolbar-header">
        <h3>Images</h3>
        <button
          className="btn-add-image"
          title="Add Images"
          onClick={handleAddImage}
        >
          +
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
      </div>


      <div className="image-list">
        {imageList.length > 0 ? (
          imageList.map(image => (
            <ImageNavigationItem
              key={image.getId()}
              image={image}
              worldPoints={worldPoints}
              selectedWorldPoints={selectedWorldPoints}
              hoveredWorldPoint={hoveredWorldPoint}
              isActive={currentImageId === image.getId()}
              pointCount={getImagePointCount(image)}
              selectedPointCount={getSelectedPointsInImage(image)}
              selectedWorldPointCount={getSelectedWorldPointsInImage(image)}
              onClick={() => onImageSelect(image.getId())}
              onEdit={() => setEditingImage(image)}
              onRename={(newName) => onImageRename(image, newName)}
              onDelete={async () => {
                if (await confirm(`Delete image "${image.getName()}"?`)) {
                  onImageDelete(image)
                }
              }}
              thumbnailHeight={imageHeights[image.getId()] || 100}
              onThumbnailHeightChange={(height) => onImageHeightChange(image.getId(), height)}
              isDragging={draggedImageId === image.getId()}
              isDragOver={dragOverImageId === image.getId()}
              onDragStart={() => setDraggedImageId(image.getId())}
              onDragEnd={() => {
                setDraggedImageId(null)
                setDragOverImageId(null)
              }}
              onDragOver={() => setDragOverImageId(image.getId())}
              onDragLeave={() => setDragOverImageId(null)}
              onDrop={() => handleDrop(image.getId())}
              onWorldPointHover={onWorldPointHover}
              onWorldPointClick={onWorldPointClick}
              onCopyPointsToCurrentImage={onCopyPointsToCurrentImage}
              currentImageId={currentImageId}
            />
          ))
        ) : (
          <div className="empty-images-state">
            <div className="empty-icon">□</div>
            <div className="empty-text">No images yet</div>
            <div className="empty-hint">Click <FontAwesomeIcon icon={faPlus} /> to add images</div>
          </div>
        )}
      </div>

    </div>
    </>
  )
}

interface ImageNavigationItemProps {
  image: Viewpoint
  worldPoints: Map<string, WorldPoint>
  selectedWorldPoints: WorldPoint[]
  hoveredWorldPoint: WorldPoint | null
  isActive: boolean
  pointCount: number
  selectedPointCount: number
  selectedWorldPointCount: number
  onClick: () => void
  onEdit: () => void
  onRename: (newName: string) => void
  onDelete: () => void
  thumbnailHeight: number
  onThumbnailHeightChange: (height: number) => void
  isDragging: boolean
  isDragOver: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: () => void
  onWorldPointHover?: (worldPoint: WorldPoint | null) => void
  onWorldPointClick?: (worldPoint: WorldPoint, ctrlKey: boolean, shiftKey: boolean) => void
  onCopyPointsToCurrentImage?: (sourceViewpoint: Viewpoint) => void
  currentImageId: string | null
}

const ImageNavigationItem: React.FC<ImageNavigationItemProps> = ({
  image,
  worldPoints,
  selectedWorldPoints,
  hoveredWorldPoint,
  isActive,
  pointCount,
  selectedPointCount,
  selectedWorldPointCount,
  onClick,
  onEdit,
  onRename,
  onDelete,
  thumbnailHeight,
  onThumbnailHeightChange,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onWorldPointHover,
  onWorldPointClick,
  onCopyPointsToCurrentImage,
  currentImageId
}) => {
  const imgRef = React.useRef<HTMLImageElement>(null)
  const [imgBounds, setImgBounds] = React.useState({ width: 0, height: 0, offsetX: 0, offsetY: 0 })

  // Update image bounds when thumbnail height changes or image loads
  React.useEffect(() => {
    const updateBounds = () => {
      if (!imgRef.current) return

      const parent = imgRef.current.parentElement
      if (!parent) return

      const parentRect = parent.getBoundingClientRect()

      // For object-fit: contain, we need to calculate the actual rendered image size
      // The image element itself has the container dimensions, but the visible image is scaled
      const imgElement = imgRef.current
      const containerWidth = parentRect.width
      const containerHeight = parentRect.height
      const [imageNaturalWidth, imageNaturalHeight] = [image.imageWidth, image.imageHeight]

      // Calculate the scale factor for object-fit: contain
      const scaleX = containerWidth / imageNaturalWidth
      const scaleY = containerHeight / imageNaturalHeight
      const scale = Math.min(scaleX, scaleY)

      // Actual rendered dimensions
      const renderedWidth = imageNaturalWidth * scale
      const renderedHeight = imageNaturalHeight * scale

      // Centering offsets
      const offsetX = (containerWidth - renderedWidth) / 2
      const offsetY = (containerHeight - renderedHeight) / 2

      setImgBounds({
        width: renderedWidth,
        height: renderedHeight,
        offsetX,
        offsetY
      })
    }

    updateBounds()
    // Update on resize or when thumbnail height changes
    const observer = new ResizeObserver(updateBounds)
    if (imgRef.current) {
      observer.observe(imgRef.current)
    }

    return () => observer.disconnect()
  }, [thumbnailHeight, image, image.imageWidth, image.imageHeight])

  return (
    <div
      className={`image-nav-item ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
      onClick={onClick}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOver()
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
    >
      {/* Top bar with name and controls */}
      <div className="image-top-bar">
        {/* Image name */}
        <div className="image-name" title={image.getName()}>
          {image.getName()}
        </div>

        {/* Right side controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Drag handle */}
          <div
            className="image-drag-handle-top"
            title="Drag to reorder images"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', image.getId())
              onDragStart()
            }}
            onDragEnd={onDragEnd}
            onClick={(e) => e.stopPropagation()}
          >
            <FontAwesomeIcon icon={faArrowsUpDown} />
          </div>

          {/* Action buttons */}
          <div className="image-top-actions">
            {/* Copy points button */}
            <button
              className="btn-image-top-action"
              disabled={!currentImageId || image.getId() === currentImageId || pointCount === 0}
              onClick={(e) => {
                e.stopPropagation()
                if (onCopyPointsToCurrentImage) {
                  onCopyPointsToCurrentImage(image)
                }
              }}
              title={
                !currentImageId
                  ? 'Select a target image first'
                  : image.getId() === currentImageId
                  ? "Can't copy to self"
                  : pointCount === 0
                  ? 'No points to copy'
                  : `Copy ${pointCount} point${pointCount === 1 ? '' : 's'} to current image`
              }
            >
              <FontAwesomeIcon icon={faCopy} />
            </button>
            <button
              className="btn-image-top-action"
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
              title="Edit image"
            >
              <FontAwesomeIcon icon={faPencil} />
            </button>
            <button
              className="btn-image-top-action"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              title="Delete image"
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </div>

          {/* Image select button */}
          <button
            className={`image-select-button ${isActive ? 'selected' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              onClick()
            }}
            title={isActive ? "Currently selected" : "Click to select this image"}
          >
            {isActive ? <FontAwesomeIcon icon={faCheck} /> : <FontAwesomeIcon icon={faCircle} />}
          </button>
        </div>
      </div>

      {/* Selected world points indicator */}
      {selectedWorldPointCount > 0 && (
        <div className="selected-wp-indicator">
          <span className="selected-wp-count">{selectedWorldPointCount}</span>
        </div>
      )}

      <div
        className="image-thumbnail"
        style={{ height: `${thumbnailHeight}px` }}
      >
        <img ref={imgRef} src={image.url} alt={image.getName()} />

        {/* Resize handle */}
        <div
          className="thumbnail-resize-handle"
          onMouseDown={(e) => {
            e.stopPropagation()
            const startY = e.clientY
            const startHeight = thumbnailHeight

            const handleMouseMove = (moveEvent: MouseEvent) => {
              const deltaY = moveEvent.clientY - startY
              const newHeight = Math.max(60, Math.min(400, startHeight + deltaY))
              onThumbnailHeightChange(newHeight)
            }

            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove)
              document.removeEventListener('mouseup', handleMouseUp)
            }

            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
          }}
          title="Drag to resize"
        />

        {/* World point locations overlay */}
        <div className="wp-locations-overlay">
            {image.getImagePoints().map(imagePoint => {
              const wp = worldPoints.get(imagePoint.worldPointId)
              if (!wp) return null

              // Use actual rendered image bounds from the DOM
              // This accounts for centering and actual size
              if (imgBounds.width === 0 || imgBounds.height === 0) return null

              const [imgWidth, imgHeight] = [image.imageWidth, image.imageHeight]
              // Calculate position as percentage of rendered image size, plus offset for centering
              const thumbnailX = imgBounds.offsetX + (imagePoint.u / imgWidth) * imgBounds.width
              const thumbnailY = imgBounds.offsetY + (imagePoint.v / imgHeight) * imgBounds.height

              const isSelected = selectedWorldPoints.some(swp => swp.getId() === wp.getId())
              const isGloballyHovered = hoveredWorldPoint?.getId() === wp.getId()

              return (
                <div
                  key={wp.getId()}
                  className={`wp-location-dot ${isSelected ? 'selected' : ''} ${isGloballyHovered ? 'globally-hovered' : ''}`}
                  style={{
                    left: `${thumbnailX}px`,
                    top: `${thumbnailY}px`,
                    backgroundColor: wp.color
                  }}
                  title={wp.getName()}
                  draggable={true}
                  onDragStart={(e) => {
                    e.stopPropagation()
                    // Set drag data
                    e.dataTransfer.setData('application/json', JSON.stringify({
                      type: 'world-point',
                      worldPointId: wp.getId(),
                      action: image.getImagePoints().length > 0 ? 'move' : 'place'
                    }))
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onMouseEnter={() => onWorldPointHover?.(wp)}
                  onMouseLeave={() => onWorldPointHover?.(null)}
                  onClick={(e) => {
                    e.stopPropagation()
                    onWorldPointClick?.(wp, e.ctrlKey, e.shiftKey)
                  }}
                />
              )
            })}
        </div>

      </div>
    </div>
  )
}

export default ImageNavigationToolbar