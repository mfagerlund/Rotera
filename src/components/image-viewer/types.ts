import { Viewpoint } from '../../entities/viewpoint'
import { WorldPoint } from '../../entities/world-point'
import { VanishingLineAxis } from '../../entities/vanishing-line'

export interface CanvasPoint {
  x: number
  y: number
}

export interface ImageCoords {
  u: number
  v: number
}

export interface CanvasOffset extends CanvasPoint {}

export interface PanVelocity extends CanvasPoint {}

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

export interface ImageViewerPropsBase {
  image: Viewpoint
  worldPoints: Map<string, WorldPoint>
  lineEntities?: Map<string, Line>
  selectedPoints: WorldPoint[]
  selectedLines?: Line[]
  hoveredConstraintId: string | null
  hoveredWorldPoint?: WorldPoint | null
  placementMode?: { active: boolean; worldPoint: WorldPoint | null }
  isPointCreationActive?: boolean
  activeConstraintType?: string | null
  constructionPreview?: ConstructionPreview | null
  isVanishingLineActive?: boolean
  currentVanishingLineAxis?: VanishingLineAxis
}

export interface ImageViewerRenderState {
  viewpoint: Viewpoint
  worldPoints: Map<string, WorldPoint>
  lines: Map<string, Line>
  scale: number
  offset: CanvasOffset
  selectedPoints: WorldPoint[]
  selectedLines: Line[]
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
}

export type CanvasToImage = (canvasX: number, canvasY: number) => ImageCoords | null
export type ImageToCanvas = (u: number, v: number) => CanvasPoint
export type OnMovePoint = ((worldPoint: WorldPoint, u: number, v: number) => void) | undefined
