import React from 'react'
import { observer } from 'mobx-react-lite'
import { WorldPoint } from '../../entities/world-point'
import { Viewpoint } from '../../entities/viewpoint'
import { Line as LineEntity } from '../../entities/line'
import ImageNavigationToolbar from '../ImageNavigationToolbar'
import { ResizableSidebar } from './ResizableSidebar'

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
  onCopyPointsToCurrentImage: (sourceViewpoint: Viewpoint) => void
}

export const LeftPanel: React.FC<LeftPanelProps> = observer(({
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
  onCopyPointsToCurrentImage
}) => {
  return (
    <ResizableSidebar
      width={width}
      onWidthChange={onWidthChange}
      side="left"
      persistKey="pictorigo-left-sidebar-width"
    >
      <ImageNavigationToolbar
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
        onCopyPointsToCurrentImage={onCopyPointsToCurrentImage}
      />
    </ResizableSidebar>
  )
})
