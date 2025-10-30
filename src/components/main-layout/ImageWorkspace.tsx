import React from 'react'

import ImageViewer, { ImageViewerRef } from '../ImageViewer'
import { ConstructionPreview } from '../image-viewer/types'
import { Viewpoint } from '../../entities/viewpoint'
import { WorldPoint } from '../../entities/world-point'
import { Line as LineEntity } from '../../entities/line'
import { VanishingLine } from '../../entities/vanishing-line'
import { VisibilitySettings, LockSettings } from '../../types/visibility'
import { ToolContext } from '../../types/tool-context'

interface ImageWorkspaceProps {
  isPointCreationActive: boolean
  isLoopTraceActive: boolean
  isVanishingLineActive?: boolean
  currentVanishingLineAxis?: 'x' | 'y' | 'z'
  image: Viewpoint | null
  imageViewerRef: React.RefObject<ImageViewerRef>
  worldPoints: Map<string, WorldPoint>
  lines: Map<string, LineEntity>
  selectedPoints: WorldPoint[]
  selectedLines: LineEntity[]
  hoveredConstraintId: string | null
  hoveredWorldPoint: WorldPoint | null
  placementMode: { active: boolean; worldPoint: WorldPoint | null }
  activeConstraintType: string | null
  constructionPreview: ConstructionPreview | null
  onPointClick: (worldPoint: WorldPoint, ctrlKey: boolean, shiftKey: boolean) => void
  onLineClick?: (line: LineEntity, ctrlKey: boolean, shiftKey: boolean) => void
  onCreatePoint?: (u: number, v: number) => void
  onMovePoint?: (worldPoint: WorldPoint, u: number, v: number) => void
  onPointHover?: (worldPoint: WorldPoint | null) => void
  onPointRightClick?: (worldPoint: WorldPoint) => void
  onLineRightClick?: (line: LineEntity) => void
  onEmptySpaceClick?: (shiftKey: boolean) => void
  onRequestAddImage?: () => void
  onCreateVanishingLine?: (p1: { u: number; v: number }, p2: { u: number; v: number }) => void
  onVanishingLineClick?: (vanishingLine: VanishingLine, ctrlKey: boolean, shiftKey: boolean) => void
  selectedVanishingLines?: VanishingLine[]
  visibility?: VisibilitySettings
  locking?: LockSettings
  toolContext?: ToolContext
}

const ImageWorkspace: React.FC<ImageWorkspaceProps> = ({
  image,
  imageViewerRef,
  worldPoints,
  lines,
  selectedPoints,
  selectedLines,
  hoveredConstraintId,
  hoveredWorldPoint,
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
  isLoopTraceActive,
  isVanishingLineActive,
  currentVanishingLineAxis,
  onCreateVanishingLine,
  onVanishingLineClick,
  selectedVanishingLines,
  visibility,
  locking,
  toolContext
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
          lineEntities={lines}
          selectedPoints={selectedPoints}
          selectedLines={selectedLines}
          hoveredConstraintId={hoveredConstraintId}
          hoveredWorldPoint={hoveredWorldPoint}
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
          isVanishingLineActive={isVanishingLineActive}
          currentVanishingLineAxis={currentVanishingLineAxis}
          onCreateVanishingLine={onCreateVanishingLine}
          onVanishingLineClick={onVanishingLineClick}
          selectedVanishingLines={selectedVanishingLines}
          visibility={visibility}
          locking={locking}
          toolContext={toolContext}
        />
      </div>
    </div>
  )
}

export default ImageWorkspace

