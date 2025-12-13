// Left sidebar image navigation toolbar

import React, { useRef, useMemo, forwardRef, useImperativeHandle } from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import { ImageUtils } from '../../utils/imageUtils'
import { useConfirm } from '../ConfirmDialog'
import ImageEditor from '../ImageEditor'
import { ImageNavigationItem } from './ImageNavigationItem'
import type { ImageNavigationToolbarProps, ImageNavigationToolbarRef } from './types'
import type { Viewpoint } from '../../entities/viewpoint'
import type { WorldPoint } from '../../entities/world-point'
import { getEntityKey } from '../../utils/entityKeys'

export const ImageNavigationToolbar = observer(forwardRef<ImageNavigationToolbarRef, ImageNavigationToolbarProps>(({
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
  onCopyPointsToCurrentImage,
  onViewFromCamera,
  onShowInImageView
}, ref) => {
  const { confirm, dialog } = useConfirm()
  const fileInputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    triggerAddImage: () => {
      fileInputRef.current?.click()
    }
  }))
  const [draggedImage, setDraggedImage] = React.useState<Viewpoint | null>(null)
  const [dragOverImage, setDragOverImage] = React.useState<Viewpoint | null>(null)
  const [editingImage, setEditingImage] = React.useState<Viewpoint | null>(null)

  const handleAddImage = () => {
    fileInputRef.current?.click()
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return

    let lastAddedViewpoint: Viewpoint | undefined

    for (const file of Array.from(files)) {
      try {
        const validation = ImageUtils.validateImageFile(file)
        if (!validation.valid) {
          alert(`Error with ${file.name}: ${validation.error}`)
          continue
        }

        const newViewpoint = await onImageAdd(file)
        if (newViewpoint) {
          lastAddedViewpoint = newViewpoint
        }
      } catch (error) {
        console.error('Failed to load image:', error)
        alert(`Failed to load ${file.name}`)
      }
    }

    // Auto-select the last added viewpoint
    if (lastAddedViewpoint) {
      onImageSelect(lastAddedViewpoint)
    }

    // Reset file input
    event.target.value = ''
  }

  // Sort images according to sort order, with new images at the end
  const imageList = useMemo(() => {
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
                onViewFromCamera={onViewFromCamera}
                onShowInImageView={onShowInImageView}
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
}))

export default ImageNavigationToolbar
