// Left sidebar image navigation toolbar

import React, { useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowsUpDown, faCheck, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'
import { faCircle } from '@fortawesome/free-regular-svg-icons'
import { ProjectImage, WorldPoint } from '../types/project'
import { ImageUtils } from '../utils/imageUtils'
import { useConfirm } from './ConfirmDialog'

interface ImageNavigationToolbarProps {
  images: Record<string, ProjectImage>
  currentImageId: string | null
  worldPoints: Record<string, WorldPoint>
  selectedWorldPointIds: string[]
  hoveredWorldPointId?: string | null
  isCreatingConstraint: boolean
  onImageSelect: (imageId: string) => void
  onImageAdd: (image: ProjectImage) => void
  onImageRename: (imageId: string, newName: string) => void
  onImageDelete: (imageId: string) => void
  getImagePointCount: (imageId: string) => number
  getSelectedPointsInImage: (imageId: string) => number
  imageHeights: Record<string, number>
  onImageHeightChange: (imageId: string, height: number) => void
  imageSortOrder: string[]
  onImageReorder: (newOrder: string[]) => void
  onWorldPointHover?: (pointId: string | null) => void
  onWorldPointClick?: (pointId: string, ctrlKey: boolean, shiftKey: boolean) => void
}

export const ImageNavigationToolbar: React.FC<ImageNavigationToolbarProps> = ({
  images,
  currentImageId,
  worldPoints,
  selectedWorldPointIds,
  hoveredWorldPointId,
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
  onWorldPointClick
}) => {
  const { confirm, dialog } = useConfirm()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [draggedImageId, setDraggedImageId] = React.useState<string | null>(null)
  const [dragOverImageId, setDragOverImageId] = React.useState<string | null>(null)

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
        onImageAdd(projectImage)
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
    const allImages = Object.values(images)
    const sortedImages: ProjectImage[] = []

    // Add images in order
    imageSortOrder.forEach(imageId => {
      const image = images[imageId]
      if (image) {
        sortedImages.push(image)
      }
    })

    // Add any new images not in the sort order
    allImages.forEach(image => {
      if (!imageSortOrder.includes(image.id)) {
        sortedImages.push(image)
      }
    })

    return sortedImages
  }, [images, imageSortOrder])

  // Count selected world points in an image
  const getSelectedWorldPointsInImage = (imageId: string): number => {
    return selectedWorldPointIds.filter(wpId => {
      const wp = worldPoints[wpId]
      return wp?.imagePoints.some(ip => ip.imageId === imageId)
    }).length
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
              key={image.id}
              image={image}
              worldPoints={worldPoints}
              selectedWorldPointIds={selectedWorldPointIds}
              hoveredWorldPointId={hoveredWorldPointId}
              isActive={currentImageId === image.id}
              pointCount={getImagePointCount(image.id)}
              selectedPointCount={getSelectedPointsInImage(image.id)}
              selectedWorldPointCount={getSelectedWorldPointsInImage(image.id)}
              onClick={() => onImageSelect(image.id)}
              onRename={(newName) => onImageRename(image.id, newName)}
              onDelete={async () => {
                if (await confirm(`Delete image "${image.name}"?`)) {
                  onImageDelete(image.id)
                }
              }}
              thumbnailHeight={imageHeights[image.id] || 100}
              onThumbnailHeightChange={(height) => onImageHeightChange(image.id, height)}
              isDragging={draggedImageId === image.id}
              isDragOver={dragOverImageId === image.id}
              onDragStart={() => setDraggedImageId(image.id)}
              onDragEnd={() => {
                setDraggedImageId(null)
                setDragOverImageId(null)
              }}
              onDragOver={() => setDragOverImageId(image.id)}
              onDragLeave={() => setDragOverImageId(null)}
              onDrop={() => handleDrop(image.id)}
              onWorldPointHover={onWorldPointHover}
              onWorldPointClick={onWorldPointClick}
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
  image: ProjectImage
  worldPoints: Record<string, WorldPoint>
  selectedWorldPointIds: string[]
  hoveredWorldPointId?: string | null
  isActive: boolean
  pointCount: number
  selectedPointCount: number
  selectedWorldPointCount: number
  onClick: () => void
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
  onWorldPointHover?: (pointId: string | null) => void
  onWorldPointClick?: (pointId: string, ctrlKey: boolean, shiftKey: boolean) => void
}

const ImageNavigationItem: React.FC<ImageNavigationItemProps> = ({
  image,
  worldPoints,
  selectedWorldPointIds,
  hoveredWorldPointId,
  isActive,
  pointCount,
  selectedPointCount,
  selectedWorldPointCount,
  onClick,
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
  onWorldPointClick
}) => {
  const [isEditing, setIsEditing] = React.useState(false)
  const [name, setName] = React.useState(image.name)
  const imgRef = React.useRef<HTMLImageElement>(null)
  const [imgBounds, setImgBounds] = React.useState({ width: 0, height: 0, offsetX: 0, offsetY: 0 })
  const [isPanelCollapsed, setIsPanelCollapsed] = React.useState(false)

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
      const imageNaturalWidth = image.width
      const imageNaturalHeight = image.height

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
  }, [thumbnailHeight, image.width, image.height])

  const handleNameSubmit = () => {
    setIsEditing(false)
    if (name.trim() !== image.name) {
      onRename(name.trim())
    } else {
      setName(image.name) // Reset if no change
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSubmit()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setName(image.name) // Reset to original
    }
  }

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
      {/* Image select button in top-right corner of outer panel */}
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

      {/* Selected world points indicator - moved outside thumbnail */}
      {selectedWorldPointCount > 0 && (
        <div className="selected-wp-indicator">
          <span className="selected-wp-count">{selectedWorldPointCount}</span>
        </div>
      )}

      {/* Image name at top center */}
      <div className="image-name-overlay">
        {isEditing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="image-name-input"
          />
        ) : (
          <div
            className="image-name"
            onDoubleClick={(e) => {
              e.stopPropagation()
              setIsEditing(true)
            }}
            title="Double-click to rename"
          >
            {image.name}
          </div>
        )}
      </div>

      <div
        className="image-thumbnail"
        style={{ height: `${thumbnailHeight}px` }}
      >
        <img ref={imgRef} src={image.blob} alt={image.name} />

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
            {Object.values(worldPoints).map(wp => {
              const imagePoint = wp.imagePoints.find(ip => ip.imageId === image.id)
              if (!imagePoint) return null

              // Use actual rendered image bounds from the DOM
              // This accounts for centering and actual size
              if (imgBounds.width === 0 || imgBounds.height === 0) return null

              // Calculate position as percentage of rendered image size, plus offset for centering
              const thumbnailX = imgBounds.offsetX + (imagePoint.u / image.width) * imgBounds.width
              const thumbnailY = imgBounds.offsetY + (imagePoint.v / image.height) * imgBounds.height

              const isSelected = selectedWorldPointIds.includes(wp.id)
              const isGloballyHovered = hoveredWorldPointId === wp.id

              return (
                <div
                  key={wp.id}
                  className={`wp-location-dot ${isSelected ? 'selected' : ''} ${isGloballyHovered ? 'globally-hovered' : ''}`}
                  style={{
                    left: `${thumbnailX}px`,
                    top: `${thumbnailY}px`,
                    backgroundColor: wp.color
                  }}
                  title={wp.name}
                  onMouseEnter={() => onWorldPointHover?.(wp.id)}
                  onMouseLeave={() => onWorldPointHover?.(null)}
                  onClick={(e) => {
                    e.stopPropagation()
                    onWorldPointClick?.(wp.id, e.ctrlKey, e.shiftKey)
                  }}
                />
              )
            })}
        </div>

      </div>

      {/* Right panel with stats and actions */}
      <div className={`image-info-right ${isPanelCollapsed ? 'collapsed' : ''}`}>
        {!isPanelCollapsed ? (
          <>
            <div className="image-stats">
              <div className="stat-item">
                <span className="stat-icon">•</span>
                <span>{pointCount} pts</span>
              </div>
              <div className="stat-item">
                <span className="stat-icon">□</span>
                <span>{image.width}<FontAwesomeIcon icon={faXmark} />{image.height}</span>
              </div>
            </div>

            {/* Drag handle */}
            <div
              className="image-drag-area"
              title="Drag to reorder images"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', image.id)
                onDragStart()
              }}
              onDragEnd={onDragEnd}
              onClick={(e) => e.stopPropagation()}
            >
              <FontAwesomeIcon icon={faArrowsUpDown} />
            </div>

            <div className="image-actions">
                <button
                  className="btn-image-action"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsEditing(true)
                  }}
                  title="Rename image"
                >
                  ✎
                </button>
                <button
                  className="btn-image-action"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete()
                  }}
                  title="Delete image"
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
            </div>

            {/* Collapse button */}
            <button
              className="btn-collapse-panel"
              onClick={(e) => {
                e.stopPropagation()
                setIsPanelCollapsed(true)
              }}
              title="Hide panel"
            >
              ›
            </button>
          </>
        ) : (
          <button
            className="btn-expand-panel"
            onClick={(e) => {
              e.stopPropagation()
              setIsPanelCollapsed(false)
            }}
            title="Show panel"
          >
            ‹
          </button>
        )}
      </div>
    </div>
  )
}

export default ImageNavigationToolbar