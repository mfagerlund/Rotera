import { Viewpoint } from '../../entities/viewpoint'
import { WorldPoint } from '../../entities/world-point'

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
  type: 'line' | 'loop-chain'
  pointA?: WorldPoint
  pointB?: WorldPoint
  showToCursor?: boolean
  // For loop-chain type
  segments?: Array<{
    pointA: WorldPoint
    pointB: WorldPoint
    status: 'new' | 'exists' | 'building'
  }>
}

import { Line as LineEntity } from '../../entities/line'

export interface LineData {
  id: string
  name: string
  pointA: WorldPoint
  pointB: WorldPoint
  length?: number
  color: string
  isVisible: boolean
  isConstruction: boolean
  createdAt?: string
  updatedAt?: string
  constraints?: {
    direction: 'free' | 'horizontal' | 'vertical' | 'x-aligned' | 'z-aligned'
    targetLength?: number
    tolerance?: number
  }
}

export interface ImageViewerPropsBase {
  image: Viewpoint
  worldPoints: Map<string, WorldPoint>
  lineEntities?: Map<string, LineEntity>
  selectedPoints: WorldPoint[]
  selectedLines?: LineEntity[]
  hoveredConstraintId: string | null
  hoveredWorldPoint?: WorldPoint | null
  placementMode?: { active: boolean; worldPoint: WorldPoint | null }
  isPointCreationActive?: boolean
  activeConstraintType?: string | null
  constructionPreview?: ConstructionPreview | null
}

import type { Line } from '../../entities/line'

export interface ImageViewerRenderState {
  viewpoint: Viewpoint
  worldPoints: Map<string, WorldPoint>
  lines: Map<string, LineData>
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
}

export type CanvasToImage = (canvasX: number, canvasY: number) => ImageCoords | null
export type ImageToCanvas = (u: number, v: number) => CanvasPoint
export type OnMovePoint = ((worldPoint: WorldPoint, u: number, v: number) => void) | undefined
