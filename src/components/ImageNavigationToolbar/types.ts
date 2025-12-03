// ImageNavigationToolbar types

import type { Viewpoint } from '../../entities/viewpoint'
import type { WorldPoint } from '../../entities/world-point'

export interface ImageNavigationToolbarProps {
  images: Viewpoint[]
  currentViewpoint: Viewpoint | null
  worldPoints: WorldPoint[]
  selectedWorldPoints: WorldPoint[]
  hoveredWorldPoint: WorldPoint | null
  isCreatingConstraint: boolean
  onImageSelect: (viewpoint: Viewpoint) => void
  onImageAdd: (file: File) => Promise<Viewpoint | undefined>
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
  onViewFromCamera?: (viewpoint: Viewpoint) => void
  onShowInImageView?: (viewpoint: Viewpoint) => void
}

export interface ImageNavigationItemProps {
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
  onViewFromCamera?: (viewpoint: Viewpoint) => void
  onShowInImageView?: (viewpoint: Viewpoint) => void
  currentViewpoint: Viewpoint | null
}
