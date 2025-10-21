// Individual image navigation item component

import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowsUpDown, faCheck, faPencil, faTrash, faCopy } from '@fortawesome/free-solid-svg-icons'
import { faCircle } from '@fortawesome/free-regular-svg-icons'
import { getEntityKey } from '../../utils/entityKeys'
import type { ImageNavigationItemProps } from './types'
import { useImageBounds } from './hooks/useImageBounds'
import { WorldPointOverlay } from './WorldPointOverlay'

export const ImageNavigationItem: React.FC<ImageNavigationItemProps> = ({
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
  const { imgBounds } = useImageBounds(imgRef, image, thumbnailHeight)

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
        <WorldPointOverlay
          image={image}
          imgRef={imgRef}
          imgBounds={imgBounds}
          selectedWorldPoints={selectedWorldPoints}
          hoveredWorldPoint={hoveredWorldPoint}
          onWorldPointHover={onWorldPointHover}
          onWorldPointClick={onWorldPointClick}
        />
      </div>
    </div>
  )
}
