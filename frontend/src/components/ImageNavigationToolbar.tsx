// Left sidebar image navigation toolbar

import React, { useRef } from 'react'
import { ProjectImage, WorldPoint } from '../types/project'
import { ImageUtils } from '../utils/imageUtils'

interface ImageNavigationToolbarProps {
  images: Record<string, ProjectImage>
  currentImageId: string | null
  worldPoints: Record<string, WorldPoint>
  selectedWorldPointIds: string[]
  isCreatingConstraint: boolean
  onImageSelect: (imageId: string) => void
  onImageAdd: (image: ProjectImage) => void
  onImageRename: (imageId: string, newName: string) => void
  onImageDelete: (imageId: string) => void
  getImagePointCount: (imageId: string) => number
  getSelectedPointsInImage: (imageId: string) => number
}

export const ImageNavigationToolbar: React.FC<ImageNavigationToolbarProps> = ({
  images,
  currentImageId,
  worldPoints,
  selectedWorldPointIds,
  isCreatingConstraint,
  onImageSelect,
  onImageAdd,
  onImageRename,
  onImageDelete,
  getImagePointCount,
  getSelectedPointsInImage
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const imageList = Object.values(images)

  // Count selected world points in an image
  const getSelectedWorldPointsInImage = (imageId: string): number => {
    return selectedWorldPointIds.filter(wpId => {
      const wp = worldPoints[wpId]
      return wp?.imagePoints.some(ip => ip.imageId === imageId)
    }).length
  }

  return (
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
              isActive={currentImageId === image.id}
              pointCount={getImagePointCount(image.id)}
              selectedPointCount={getSelectedPointsInImage(image.id)}
              selectedWorldPointCount={getSelectedWorldPointsInImage(image.id)}
              onClick={() => onImageSelect(image.id)}
              onRename={(newName) => onImageRename(image.id, newName)}
              onDelete={() => {
                if (confirm(`Delete image "${image.name}"?`)) {
                  onImageDelete(image.id)
                }
              }}
            />
          ))
        ) : (
          <div className="empty-images-state">
            <div className="empty-icon">□</div>
            <div className="empty-text">No images yet</div>
            <div className="empty-hint">Click ➕ to add images</div>
          </div>
        )}
      </div>

    </div>
  )
}

interface ImageNavigationItemProps {
  image: ProjectImage
  worldPoints: Record<string, WorldPoint>
  selectedWorldPointIds: string[]
  isActive: boolean
  pointCount: number
  selectedPointCount: number
  selectedWorldPointCount: number
  onClick: () => void
  onRename: (newName: string) => void
  onDelete: () => void
}

const ImageNavigationItem: React.FC<ImageNavigationItemProps> = ({
  image,
  worldPoints,
  selectedWorldPointIds,
  isActive,
  pointCount,
  selectedPointCount,
  selectedWorldPointCount,
  onClick,
  onRename,
  onDelete
}) => {
  const [isEditing, setIsEditing] = React.useState(false)
  const [name, setName] = React.useState(image.name)

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
      className={`image-nav-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <div className="image-thumbnail">
        <img src={image.blob} alt={image.name} />


        {/* Selected world points indicator */}
        {selectedWorldPointCount > 0 && (
          <div className="selected-wp-indicator">
            <span className="selected-wp-count">{selectedWorldPointCount}</span>
          </div>
        )}

        {/* World point locations overlay */}
        <div className="wp-locations-overlay">
            {Object.values(worldPoints).map(wp => {
              const imagePoint = wp.imagePoints.find(ip => ip.imageId === image.id)
              if (!imagePoint) return null

              // Convert world point coordinates to thumbnail coordinates
              // Calculate thumbnail dimensions maintaining aspect ratio with 100px height
              const imageAspectRatio = image.width / image.height
              const thumbnailHeight = 100
              const thumbnailWidth = Math.min(150, Math.max(75, thumbnailHeight * imageAspectRatio))

              const thumbnailX = (imagePoint.u / image.width) * thumbnailWidth
              const thumbnailY = (imagePoint.v / image.height) * thumbnailHeight

              const isSelected = selectedWorldPointIds.includes(wp.id)

              return (
                <div
                  key={wp.id}
                  className={`wp-location-dot ${isSelected ? 'selected' : ''}`}
                  style={{
                    left: `${thumbnailX}px`,
                    top: `${thumbnailY}px`,
                    backgroundColor: wp.color
                  }}
                  title={wp.name}
                />
              )
            })}
        </div>

      </div>

      <div className="image-info">
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

        <div className="image-stats">
          <div className="stat-item">
            <span className="stat-icon">•</span>
            <span>{pointCount} points</span>
          </div>
          <div className="stat-item">
            <span className="stat-icon">□</span>
            <span>{image.width}×{image.height}</span>
          </div>
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
              ×
            </button>
        </div>
      </div>
    </div>
  )
}

export default ImageNavigationToolbar