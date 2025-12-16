import { MutableRefObject, RefObject } from 'react'
import { WorldPoint } from '../../../entities/world-point'
import { Line } from '../../../entities/line'
import { VanishingLine } from '../../../entities/vanishing-line'
import { Viewpoint } from '../../../entities/viewpoint'
import { CanvasToImage, ImageToCanvas, ConstructionPreview } from '../types'

export interface RenderParams {
  ctx: CanvasRenderingContext2D
  canvasEl: HTMLCanvasElement
  imageEl: HTMLImageElement
  viewpoint: Viewpoint
  worldPoints: Set<WorldPoint>
  lines: Map<string, Line>
  scale: number
  offset: { x: number; y: number }
  selectedPoints: WorldPoint[]
  selectedLines: Line[]
  selectedVanishingLines: VanishingLine[]
  constraintHighlightedPoints: WorldPoint[]
  hoveredWorldPoint: WorldPoint | null
  hoveredPoint: WorldPoint | null
  hoveredLine: Line | null
  isDraggingPoint: boolean
  draggedPoint: WorldPoint | null
  isDragging: boolean
  panVelocity: { x: number; y: number }
  constructionPreview: ConstructionPreview | null
  currentMousePos: { x: number; y: number } | null
  isPrecisionDrag: boolean
  isDragDropActive: boolean
  isPlacementModeActive: boolean
  isPointCreationActive: boolean
  isLoopTraceActive: boolean
  isVanishingLineActive: boolean
  isDraggingVanishingLine: boolean
  draggedVanishingLine: VanishingLine | null
  visibility: {
    worldPoints: boolean
    lines: boolean
    vanishingLines: boolean
    vanishingPoints: boolean
    perspectiveGrid: boolean
    cameraVanishingGeometry: boolean
    reprojectionErrors: boolean
  }
  canvasToImageCoords: CanvasToImage
  imageToCanvasCoords: ImageToCanvas
  precisionCanvasPosRef: MutableRefObject<{ x: number; y: number } | null>
  draggedPointImageCoordsRef: MutableRefObject<{ u: number; v: number } | null>
  onMovePoint: ((wp: WorldPoint, newU: number, newV: number) => void) | null
  canvasRef: RefObject<HTMLCanvasElement>
  imageRef: RefObject<HTMLImageElement>
}

export const AXIS_COLORS: Record<'x' | 'y' | 'z', string> = {
  x: '#F44336',
  y: '#4CAF50',
  z: '#2196F3'
}
