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
  worldPoints: Set<WorldPoint>
  lines: Map<string, LineEntity>
  selectedPoints: WorldPoint[]
  selectedLines: LineEntity[]
  constraintHighlightedPoints?: WorldPoint[]
  hoveredConstraintId: string | null
  hoveredWorldPoint: WorldPoint | null
  placementMode: { active: boolean; worldPoint: WorldPoint | null }
  activeConstraintType: string | null
  constructionPreview: ConstructionPreview | null
  onPointClick: (worldPoint: WorldPoint, ctrlKey: boolean, shiftKey: boolean) => void
  onLineClick?: (line: LineEntity, ctrlKey: boolean, shiftKey: boolean) => void
  onCreatePoint?: (u: number, v: number) => void
  onMovePoint?: (worldPoint: WorldPoint, u: number, v: number) => void
  onPlaceWorldPoint?: (worldPoint: WorldPoint, u: number, v: number) => void
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
  onMousePositionChange?: (position: { u: number; v: number } | null) => void
  onEscapePressed?: () => void
}

const ImageWorkspace: React.FC<ImageWorkspaceProps> = ({
  image,
  imageViewerRef,
  worldPoints,
  lines,
  selectedPoints,
  selectedLines,
  constraintHighlightedPoints = [],
  hoveredConstraintId,
  hoveredWorldPoint,
  placementMode,
  activeConstraintType,
  constructionPreview,
  onPointClick,
  onLineClick,
  onCreatePoint,
  onMovePoint,
  onPlaceWorldPoint,
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
  toolContext,
  onMousePositionChange,
  onEscapePressed
}) => {
  if (!image) {
    return (
      <div className="workspace-image-view">
        <div className="no-image-state">
          <div className="empty-state-content">
            <svg className="empty-state-illustration" width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="20" y="30" width="80" height="60" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.6"/>
              <circle cx="40" cy="50" r="8" stroke="currentColor" strokeWidth="2" opacity="0.4"/>
              <path d="M30 70 L50 55 L70 65 L90 50" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.4"/>
              <rect x="35" y="15" width="50" height="40" rx="3" stroke="currentColor" strokeWidth="2" opacity="0.8"/>
              <circle cx="50" cy="30" r="6" stroke="currentColor" strokeWidth="2" opacity="0.5"/>
              <path d="M40 45 L55 35 L70 42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
            </svg>
            <h3>No Image Selected</h3>
            <p>Add images using the sidebar to get started</p>
            <button
              className="btn-primary btn-pulse"
              onClick={onRequestAddImage}
            >
              Add First Image
            </button>
            <div className="empty-state-tip">
              Tip: You can also drag & drop images directly
            </div>
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
          constraintHighlightedPoints={constraintHighlightedPoints}
          hoveredConstraintId={hoveredConstraintId}
          hoveredWorldPoint={hoveredWorldPoint}
          placementMode={placementMode}
          activeConstraintType={activeConstraintType}
          constructionPreview={constructionPreview}
          onPointClick={onPointClick}
          onLineClick={onLineClick}
          onCreatePoint={onCreatePoint}
          onMovePoint={onMovePoint}
          onPlaceWorldPoint={onPlaceWorldPoint}
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
          onMousePositionChange={onMousePositionChange}
          onEscapePressed={onEscapePressed}
        />
      </div>
    </div>
  )
}

export default ImageWorkspace

