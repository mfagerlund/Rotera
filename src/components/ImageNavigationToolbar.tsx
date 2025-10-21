// Left sidebar image navigation toolbar

import React, { useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowsUpDown, faCheck, faPlus, faPencil, faTrash, faCopy } from '@fortawesome/free-solid-svg-icons'
import { faCircle } from '@fortawesome/free-regular-svg-icons'
import { Viewpoint } from '../entities/viewpoint'
import { WorldPoint } from '../entities/world-point'
import { ImageUtils } from '../utils/imageUtils'
import { getEntityKey } from '../utils/entityKeys'
import { useConfirm } from './ConfirmDialog'
import ImageEditor from './ImageEditor'

interface ImageNavigationToolbarProps {
  images: Viewpoint[]
  currentViewpoint: Viewpoint | null
  worldPoints: WorldPoint[]
  selectedWorldPoints: WorldPoint[]
  hoveredWorldPoint: WorldPoint | null
  isCreatingConstraint: boolean
  onImageSelect: (viewpoint: Viewpoint) => void
  onImageAdd: (file: File) => Promise<void>
  onImageRename: (viewpoint: Viewpoint, newName: string) => void
  onImageDelete: (viewpoint: Viewpoint) => void
  getImagePointCount: (viewpoint: Viewpoint) => number
  getSelectedPointsInImage: (viewpoint: Viewpoint) => number
  imageHeights: Record<string, number>
  onImageHeightChange: (viewpoint: Viewpoint, height: number) => void
  imageSortOrder: string[]
  onImageReorder: (newOrder: string[]) => void
  onWorldPointHover?: (worldPoint: WorldPoint | null) => void
  onWorldPointClick?: (worldPoint: WorldPoint, ctrlKey: boolean, shiftKey: boolean) => void
  onCopyPointsToCurrentImage?: (sourceViewpoint: Viewpoint) => void
}

export const ImageNavigationToolbar: React.FC<ImageNavigationToolbarProps> = ({
  images,
  currentViewpoint,
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
  const [draggedImage, setDraggedImage] = React.useState<Viewpoint | null>(null)
  const [dragOverImage, setDragOverImage] = React.useState<Viewpoint | null>(null)
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

        await onImageAdd(file)
      } catch (error) {
        console.error('Failed to load image:', error)
        alert(`Failed to load ${file.name}`)
      }
    }

    // Reset file input
    event.target.value = ''
  }

  // Sort images according to sort order, with new images at the end
  const imageList = React.useMemo(() => {
    const imageToName = new Map(images.map(img => [img, img.getName()]))
    return images.slice().sort((a, b) => {
      const indexA = imageSortOrder.indexOf(imageToName.get(a)!)
      const indexB = imageSortOrder.indexOf(imageToName.get(b)!)
      // Images in sort order come first (by their index), unsorted images go to end (Infinity)
      const orderA = indexA >= 0 ? indexA : Infinity
      const orderB = indexB >= 0 ? indexB : Infinity
      return orderA - orderB
    })
  }, [images, imageSortOrder])

  // Count selected world points in an image
  const getSelectedWorldPointsInImage = (viewpoint: Viewpoint): number => {
    const selectedSet = new Set(selectedWorldPoints)
    return Array.from(viewpoint.imagePoints).filter(ip => {
      return selectedSet.has(ip.worldPoint as WorldPoint)
    }).length
  }

  // Handle drag and drop reordering
  const handleDrop = (droppedOnImage: Viewpoint) => {
    if (!draggedImage || draggedImage === droppedOnImage) return

    const newOrder = [...imageSortOrder]

    // Ensure both images are in the order array
    if (!newOrder.includes(draggedImage.getName())) {
      newOrder.push(draggedImage.getName())
    }
    if (!newOrder.includes(droppedOnImage.getName())) {
      newOrder.push(droppedOnImage.getName())
    }

    // Remove dragged item and insert it before the drop target
    const draggedIndex = newOrder.indexOf(draggedImage.getName())
    const dropTargetIndex = newOrder.indexOf(droppedOnImage.getName())

    newOrder.splice(draggedIndex, 1)
    const newDropIndex = draggedIndex < dropTargetIndex ? dropTargetIndex - 1 : dropTargetIndex
    newOrder.splice(newDropIndex, 0, draggedImage.getName())

    onImageReorder(newOrder)
    setDraggedImage(null)
    setDragOverImage(null)
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
              key={getEntityKey(image)}
              image={image}
              worldPoints={worldPoints}
              selectedWorldPoints={selectedWorldPoints}
              hoveredWorldPoint={hoveredWorldPoint}
              isActive={currentViewpoint === image}
              pointCount={getImagePointCount(image)}
              selectedPointCount={getSelectedPointsInImage(image)}
              selectedWorldPointCount={getSelectedWorldPointsInImage(image)}
              onClick={() => onImageSelect(image)}
              onEdit={() => setEditingImage(image)}
              onRename={(newName) => onImageRename(image, newName)}
              onDelete={async () => {
                if (await confirm(`Delete image "${image.getName()}"?`)) {
                  onImageDelete(image)
                }
              }}
              thumbnailHeight={imageHeights[image.getName()] || 100}
              onThumbnailHeightChange={(height) => onImageHeightChange(image, height)}
              isDragging={draggedImage === image}
              isDragOver={dragOverImage === image}
              onDragStart={() => setDraggedImage(image)}
              onDragEnd={() => {
                setDraggedImage(null)
                setDragOverImage(null)
              }}
              onDragOver={() => setDragOverImage(image)}
              onDragLeave={() => setDragOverImage(null)}
              onDrop={() => handleDrop(image)}
              onWorldPointHover={onWorldPointHover}
              onWorldPointClick={onWorldPointClick}
              onCopyPointsToCurrentImage={onCopyPointsToCurrentImage}
              currentViewpoint={currentViewpoint}
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
  worldPoints: WorldPoint[]
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
  currentViewpoint: Viewpoint | null
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
  currentViewpoint
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
      const imgElement = imgRef.current
      const containerWidth = parentRect.width
      const containerHeight = parentRect.height

      // Use naturalWidth/naturalHeight if available, otherwise fall back to entity dimensions
      const imageNaturalWidth = imgElement.naturalWidth || image.imageWidth
      const imageNaturalHeight = imgElement.naturalHeight || image.imageHeight

      // Skip if image hasn't loaded yet
      if (imageNaturalWidth === 0 || imageNaturalHeight === 0) return

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

    // Initial update
    const timer = setTimeout(updateBounds, 0)

    const imgElement = imgRef.current
    if (imgElement) {
      imgElement.addEventListener('load', updateBounds)
      // If image is already complete, update immediately
      if (imgElement.complete) {
        updateBounds()
      }
    }

    const observer = new ResizeObserver(updateBounds)
    if (imgRef.current) {
      observer.observe(imgRef.current)
    }

    return () => {
      clearTimeout(timer)
      observer.disconnect()
      if (imgElement) {
        imgElement.removeEventListener('load', updateBounds)
      }
    }
  }, [thumbnailHeight, image, image.imageWidth, image.imageHeight, image.imagePoints.size])

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
              e.dataTransfer.setData('text/plain', image.getName())
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
              disabled={!currentViewpoint || image === currentViewpoint || pointCount === 0}
              onClick={(e) => {
                e.stopPropagation()
                if (onCopyPointsToCurrentImage) {
                  onCopyPointsToCurrentImage(image)
                }
              }}
              title={
                !currentViewpoint
                  ? 'Select a target image first'
                  : image === currentViewpoint
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
            {Array.from(image.imagePoints).map(imagePoint => {
              const wp = imagePoint.worldPoint as WorldPoint

              // Use actual rendered image bounds from the DOM
              // This accounts for centering and actual size
              if (imgBounds.width === 0 || imgBounds.height === 0) return null

              // Use naturalWidth from DOM if available
              const imgElement = imgRef.current
              const imgWidth = imgElement?.naturalWidth || image.imageWidth
              const imgHeight = imgElement?.naturalHeight || image.imageHeight

              // imagePoint.u and imagePoint.v are in pixel coordinates (0 to imgWidth, 0 to imgHeight)
              // We need to normalize to 0-1, then scale to rendered size, then add centering offset
              const thumbnailX = imgBounds.offsetX + (imagePoint.u / imgWidth) * imgBounds.width
              const thumbnailY = imgBounds.offsetY + (imagePoint.v / imgHeight) * imgBounds.height

              const isSelected = selectedWorldPoints.some(swp => swp === wp)
              const isGloballyHovered = hoveredWorldPoint === wp

              return (
                <div
                  key={getEntityKey(wp)}
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
                      worldPointName: wp.getName(),
                      action: image.imagePoints.size > 0 ? 'move' : 'place'
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