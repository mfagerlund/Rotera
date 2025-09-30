import { ProjectImage, WorldPoint } from '../../types/project'

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
  pointA?: string
  pointB?: string
  showToCursor?: boolean
  // For loop-chain type
  segments?: Array<{
    pointA: string
    pointB: string
    status: 'new' | 'exists' | 'building'
  }>
}

export interface LineData {
  id: string
  name: string
  pointA: string
  pointB: string
  length?: number
  color: string
  isVisible: boolean
  isConstruction: boolean
  createdAt: string
  updatedAt?: string
  constraints?: {
    direction: 'free' | 'horizontal' | 'vertical' | 'x-aligned' | 'z-aligned'
    targetLength?: number
    tolerance?: number
  }
}

export interface ImageViewerPropsBase {
  image: ProjectImage
  worldPoints: Record<string, WorldPoint>
  lines?: Record<string, LineData>
  selectedPoints: string[]
  selectedLines?: string[]
  hoveredConstraintId: string | null
  hoveredWorldPointId?: string | null
  placementMode?: { active: boolean; worldPointId: string | null }
  isPointCreationActive?: boolean
  activeConstraintType?: string | null
  constructionPreview?: ConstructionPreview | null
}

export interface ImageViewerRenderState {
  imageId: string
  worldPoints: Record<string, WorldPoint>
  lines: Record<string, LineData>
  scale: number
  offset: CanvasOffset
  selectedPoints: string[]
  selectedLines: string[]
  hoveredConstraintId: string | null
  hoveredWorldPointId: string | null
  hoveredPointId: string | null
  hoveredLineId: string | null
  isDraggingPoint: boolean
  draggedPointId: string | null
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
export type OnMovePoint = ((worldPointId: string, u: number, v: number) => void) | undefined
