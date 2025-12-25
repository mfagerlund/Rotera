import React, { forwardRef } from 'react'
import { observer } from 'mobx-react-lite'
import { WorldPoint } from '../../entities/world-point'
import { Viewpoint } from '../../entities/viewpoint'
import { Line as LineEntity } from '../../entities/line'
import ImageNavigationToolbar, { ImageNavigationToolbarRef } from '../ImageNavigationToolbar'
import { ResizableSidebar } from './ResizableSidebar'

export type LeftPanelRef = ImageNavigationToolbarRef

interface LeftPanelProps {
  width: number
  onWidthChange: (width: number) => void
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
  onWorldPointHover: (worldPoint: WorldPoint | null) => void
  onWorldPointClick: (worldPoint: WorldPoint, ctrlKey: boolean, shiftKey: boolean) => void
  onWorldPointRightClick: (worldPoint: WorldPoint) => void
  onCopyPointsToCurrentImage: (sourceViewpoint: Viewpoint) => void
  onViewFromCamera: (viewpoint: Viewpoint) => void
  onShowInImageView: (viewpoint: Viewpoint) => void
}

export const LeftPanel = observer(forwardRef<LeftPanelRef, LeftPanelProps>(({
  width,
  onWidthChange,
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
  onWorldPointRightClick,
  onCopyPointsToCurrentImage,
  onViewFromCamera,
  onShowInImageView
}, ref) => {
  return (
    <ResizableSidebar
      width={width}
      onWidthChange={onWidthChange}
      side="left"
      persistKey="Rotera-left-sidebar-width"
    >
      <ImageNavigationToolbar
        ref={ref}
        images={images}
        currentViewpoint={currentViewpoint}
        worldPoints={worldPoints}
        selectedWorldPoints={selectedWorldPoints}
        hoveredWorldPoint={hoveredWorldPoint}
        isCreatingConstraint={isCreatingConstraint}
        onImageSelect={onImageSelect}
        onImageAdd={onImageAdd}
        onImageRename={onImageRename}
        onImageDelete={onImageDelete}
        getImagePointCount={getImagePointCount}
        getSelectedPointsInImage={getSelectedPointsInImage}
        imageHeights={imageHeights}
        onImageHeightChange={onImageHeightChange}
        imageSortOrder={imageSortOrder}
        onImageReorder={onImageReorder}
        onWorldPointHover={onWorldPointHover}
        onWorldPointClick={onWorldPointClick}
        onWorldPointRightClick={onWorldPointRightClick}
        onCopyPointsToCurrentImage={onCopyPointsToCurrentImage}
        onViewFromCamera={onViewFromCamera}
        onShowInImageView={onShowInImageView}
      />
    </ResizableSidebar>
  )
}))
