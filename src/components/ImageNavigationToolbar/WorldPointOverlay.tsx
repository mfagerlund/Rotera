// World point overlay for image thumbnails

import React from 'react'
import { observer } from 'mobx-react-lite'
import type { Viewpoint } from '../../entities/viewpoint'
import type { WorldPoint } from '../../entities/world-point'
import type { ImageBounds } from './hooks/useImageBounds'
import { getEntityKey } from '../../utils/entityKeys'

interface WorldPointOverlayProps {
  image: Viewpoint
  imgRef: React.RefObject<HTMLImageElement>
  imgBounds: ImageBounds
  selectedWorldPoints: WorldPoint[]
  hoveredWorldPoint: WorldPoint | null
  onWorldPointHover?: (worldPoint: WorldPoint | null) => void
  onWorldPointClick?: (worldPoint: WorldPoint, ctrlKey: boolean, shiftKey: boolean) => void
  onWorldPointRightClick?: (worldPoint: WorldPoint) => void
}

export const WorldPointOverlay: React.FC<WorldPointOverlayProps> = observer(({
  image,
  imgRef,
  imgBounds,
  selectedWorldPoints,
  hoveredWorldPoint,
  onWorldPointHover,
  onWorldPointClick,
  onWorldPointRightClick
}) => {
  return (
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
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              // Select the point and open the edit dialog
              onWorldPointClick?.(wp, e.ctrlKey, e.shiftKey)
              onWorldPointRightClick?.(wp)
            }}
          />
        )
      })}
    </div>
  )
})
