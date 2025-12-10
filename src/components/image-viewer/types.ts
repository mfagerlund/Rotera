import { Viewpoint } from '../../entities/viewpoint'
import { WorldPoint } from '../../entities/world-point'
import { VanishingLine, VanishingLineAxis } from '../../entities/vanishing-line'

export interface CanvasPoint {
  x: number
  y: number
}

export interface ImageCoords {
  u: number
  v: number
}

export type CanvasOffset = CanvasPoint

export type PanVelocity = CanvasPoint

export interface ConstructionPreview {
  type: 'line' | 'loop-chain' | 'vanishing-line'
  pointA?: WorldPoint
  pointB?: WorldPoint
  showToCursor?: boolean
  // For loop-chain type
  segments?: Array<{
    pointA: WorldPoint
    pointB: WorldPoint
    status: 'new' | 'exists' | 'building'
  }>
  // For vanishing-line type
  vanishingLineStart?: ImageCoords
  vanishingLineAxis?: VanishingLineAxis
}

import { Line } from '../../entities/line'
import { VisibilitySettings, LockSettings } from '../../types/visibility'
import { ToolContext } from '../../types/tool-context'

export interface ImageViewerPropsBase {
  image: Viewpoint
  worldPoints: Map<string, WorldPoint>
  lineEntities?: Map<string, Line>
  selectedPoints: WorldPoint[]
  selectedLines?: Line[]
  constraintHighlightedPoints?: WorldPoint[]
  hoveredConstraintId: string | null
  hoveredWorldPoint?: WorldPoint | null
  placementMode?: { active: boolean; worldPoint: WorldPoint | null }
  isPointCreationActive?: boolean
  activeConstraintType?: string | null
  constructionPreview?: ConstructionPreview | null
  isVanishingLineActive?: boolean
  currentVanishingLineAxis?: VanishingLineAxis
  visibility?: VisibilitySettings
  locking?: LockSettings
  toolContext?: ToolContext
}

export interface ImageViewerRenderState {
  viewpoint: Viewpoint
  worldPoints: Map<string, WorldPoint>
  lines: Map<string, Line>
  scale: number
  offset: CanvasOffset
  selectedPoints: WorldPoint[]
  selectedLines: Line[]
  selectedVanishingLines: VanishingLine[]
  constraintHighlightedPoints: WorldPoint[]
  hoveredConstraintId: string | null
  hoveredWorldPoint: WorldPoint | null
  hoveredPoint: WorldPoint | null
  hoveredLine: Line | null
  isDraggingPoint: boolean
  draggedPoint: WorldPoint | null
  isDragging: boolean
  panVelocity: PanVelocity
  constructionPreview: ConstructionPreview | null
  currentMousePos: CanvasPoint | null
  isPrecisionDrag: boolean
  isDragDropActive: boolean
  isPlacementModeActive: boolean
  isPointCreationActive: boolean
  isLoopTraceActive: boolean
  isVanishingLineActive: boolean
  currentVanishingLineAxis: VanishingLineAxis | undefined
  isDraggingVanishingLine: boolean
  draggedVanishingLine: VanishingLine | null
  visibility: VisibilitySettings
}

export type CanvasToImage = (canvasX: number, canvasY: number) => ImageCoords | null
export type ImageToCanvas = (u: number, v: number) => CanvasPoint
export type OnMovePoint = ((worldPoint: WorldPoint, u: number, v: number) => void) | undefined
