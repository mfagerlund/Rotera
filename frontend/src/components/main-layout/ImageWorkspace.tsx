import React from 'react'

import ImageViewer, { ImageViewerRef } from '../ImageViewer'
import { LineData, ConstructionPreview } from '../image-viewer/types'
import { ProjectImage, WorldPoint } from '../../types/project'

interface ImageWorkspaceProps {
  isPointCreationActive: boolean
  isLoopTraceActive: boolean
  image: ProjectImage | null
  imageViewerRef: React.RefObject<ImageViewerRef>
  worldPoints: Map<string, WorldPoint>
  lines: Map<string, LineData>
  selectedPointIds: string[]
  selectedLineIds: string[]
  hoveredConstraintId: string | null
  hoveredWorldPointId: string | null
  placementMode: { active: boolean; worldPointId: string | null }
  activeConstraintType: string | null
  constructionPreview: ConstructionPreview | null
  onPointClick: (pointId: string, ctrlKey: boolean, shiftKey: boolean) => void
  onLineClick?: (lineId: string, ctrlKey: boolean, shiftKey: boolean) => void
  onCreatePoint?: (u: number, v: number) => void
  onMovePoint?: (worldPointId: string, u: number, v: number) => void
  onPointHover?: (pointId: string | null) => void
  onPointRightClick?: (pointId: string) => void
  onLineRightClick?: (lineId: string) => void
  onEmptySpaceClick?: (shiftKey: boolean) => void
  onRequestAddImage?: () => void
}

const ImageWorkspace: React.FC<ImageWorkspaceProps> = ({
  image,
  imageViewerRef,
  worldPoints,
  lines,
  selectedPointIds,
  selectedLineIds,
  hoveredConstraintId,
  hoveredWorldPointId,
  placementMode,
  activeConstraintType,
  constructionPreview,
  onPointClick,
  onLineClick,
  onCreatePoint,
  onMovePoint,
  onPointHover,
  onPointRightClick,
  onLineRightClick,
  onEmptySpaceClick,
  onRequestAddImage,
  isPointCreationActive,
  isLoopTraceActive
}) => {
  if (!image) {
    return (
      <div className="workspace-image-view">
        <div className="no-image-state">
          <div className="empty-state-content">
            <h3>No Image Selected</h3>
            <p>Add images using the sidebar to get started</p>
            <button
              className="btn-primary"
              onClick={onRequestAddImage}
            >
              Add First Image
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="workspace-image-view">
      <div className="image-viewer-container">
        <ImageViewer
          ref={imageViewerRef}
          image={image}
          worldPoints={worldPoints}
          lines={lines}
          selectedPoints={selectedPointIds}
          selectedLines={selectedLineIds}
          hoveredConstraintId={hoveredConstraintId}
          hoveredWorldPointId={hoveredWorldPointId}
          placementMode={placementMode}
          activeConstraintType={activeConstraintType}
          constructionPreview={constructionPreview}
          onPointClick={onPointClick}
          onLineClick={onLineClick}
          onCreatePoint={onCreatePoint}
          onMovePoint={onMovePoint}
          onPointHover={onPointHover}
          onPointRightClick={onPointRightClick}
          onLineRightClick={onLineRightClick}
          onEmptySpaceClick={onEmptySpaceClick}
          isPointCreationActive={isPointCreationActive}
          isLoopTraceActive={isLoopTraceActive}
        />
      </div>
    </div>
  )
}

export default ImageWorkspace

