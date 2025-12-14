import { useState, useRef, MutableRefObject } from 'react'
import { CanvasOffset, CanvasPoint, ImageCoords, PanVelocity } from '../types'
import { WorldPoint } from '../../../entities/world-point'
import { Line } from '../../../entities/line'
import { VanishingLine } from '../../../entities/vanishing-line'

export interface ImageViewerState {
  scale: number
  setScale: (scale: number) => void
  offset: CanvasOffset
  setOffset: (offset: CanvasOffset | ((prev: CanvasOffset) => CanvasOffset)) => void
  imageLoaded: boolean
  setImageLoaded: (loaded: boolean) => void
  currentMousePos: CanvasPoint | null
  setCurrentMousePos: (pos: CanvasPoint | null) => void
  panVelocity: PanVelocity
  setPanVelocity: (velocity: PanVelocity) => void
}

export interface DragState {
  isDragging: boolean
  setIsDragging: (dragging: boolean) => void
  lastMousePos: CanvasPoint
  setLastMousePos: (pos: CanvasPoint) => void
  lastPanTime: number
  setLastPanTime: (time: number) => void
  isCtrlKeyPressed: boolean
  setIsCtrlKeyPressed: (pressed: boolean) => void
}

export interface PointDragState {
  isDraggingPoint: boolean
  setIsDraggingPoint: (dragging: boolean) => void
  draggedPoint: WorldPoint | null
  setDraggedPoint: (point: WorldPoint | null) => void
  dragStartPos: CanvasPoint
  setDragStartPos: (pos: CanvasPoint) => void
  hoveredPoint: WorldPoint | null
  setHoveredPoint: (point: WorldPoint | null) => void
  hoveredLine: Line | null
  setHoveredLine: (line: Line | null) => void
  hoveredVanishingLine: VanishingLine | null
  setHoveredVanishingLine: (line: VanishingLine | null) => void
  isDragOverTarget: boolean
  setIsDragOverTarget: (isOver: boolean) => void
  dragStartImageCoordsRef: MutableRefObject<ImageCoords | null>
  draggedPointImageCoordsRef: MutableRefObject<ImageCoords | null>
  precisionPointerRef: MutableRefObject<ImageCoords | null>
  precisionCanvasPosRef: MutableRefObject<CanvasPoint | null>
}

export interface PrecisionDragState {
  isPrecisionDrag: boolean
  setIsPrecisionDrag: (isPrecision: boolean) => void
  isPrecisionToggleActive: boolean
  setIsPrecisionToggleActive: (isActive: boolean) => void
  isDragDropActive: boolean
  setIsDragDropActive: (isActive: boolean) => void
}

export interface VanishingLineDragState {
  vanishingLineStart: ImageCoords | null
  setVanishingLineStart: (start: ImageCoords | null) => void
  isDraggingVanishingLine: boolean
  setIsDraggingVanishingLine: (dragging: boolean) => void
  draggedVanishingLine: VanishingLine | null
  setDraggedVanishingLine: (line: VanishingLine | null) => void
  vanishingLineDragMode: 'whole' | 'p1' | 'p2' | null
  setVanishingLineDragMode: (mode: 'whole' | 'p1' | 'p2' | null) => void
  vanishingLineDragStartRef: MutableRefObject<{ p1: ImageCoords; p2: ImageCoords; mouseU: number; mouseV: number } | null>
  vanishingLineAccumulatedDeltaRef: MutableRefObject<{ u: number; v: number }>
}

export interface UseImageViewerStateReturn {
  imageViewerState: ImageViewerState
  dragState: DragState
  pointDragState: PointDragState
  precisionDragState: PrecisionDragState
  vanishingLineDragState: VanishingLineDragState
}

export function useImageViewerState(): UseImageViewerStateReturn {
  const [scale, setScale] = useState<number>(1)
  const [offset, setOffset] = useState<CanvasOffset>({ x: 0, y: 0 })
  const [imageLoaded, setImageLoaded] = useState(false)
  const [currentMousePos, setCurrentMousePos] = useState<CanvasPoint | null>(null)
  const [panVelocity, setPanVelocity] = useState<PanVelocity>({ x: 0, y: 0 })

  const [isDragging, setIsDragging] = useState(false)
  const [lastMousePos, setLastMousePos] = useState<CanvasPoint>({ x: 0, y: 0 })
  const [lastPanTime, setLastPanTime] = useState(0)
  const [isCtrlKeyPressed, setIsCtrlKeyPressed] = useState(false)

  const [isDraggingPoint, setIsDraggingPoint] = useState(false)
  const [draggedPoint, setDraggedPoint] = useState<WorldPoint | null>(null)
  const [dragStartPos, setDragStartPos] = useState<CanvasPoint>({ x: 0, y: 0 })
  const [hoveredPoint, setHoveredPoint] = useState<WorldPoint | null>(null)
  const [hoveredLine, setHoveredLine] = useState<Line | null>(null)
  const [hoveredVanishingLine, setHoveredVanishingLine] = useState<VanishingLine | null>(null)
  const [isDragOverTarget, setIsDragOverTarget] = useState(false)

  const dragStartImageCoordsRef = useRef<ImageCoords | null>(null)
  const draggedPointImageCoordsRef = useRef<ImageCoords | null>(null)
  const precisionPointerRef = useRef<ImageCoords | null>(null)
  const precisionCanvasPosRef = useRef<CanvasPoint | null>(null)

  const [isPrecisionDrag, setIsPrecisionDrag] = useState(false)
  const [isPrecisionToggleActive, setIsPrecisionToggleActive] = useState(false)
  const [isDragDropActive, setIsDragDropActive] = useState(false)

  const [vanishingLineStart, setVanishingLineStart] = useState<ImageCoords | null>(null)
  const [isDraggingVanishingLine, setIsDraggingVanishingLine] = useState(false)
  const [draggedVanishingLine, setDraggedVanishingLine] = useState<VanishingLine | null>(null)
  const [vanishingLineDragMode, setVanishingLineDragMode] = useState<'whole' | 'p1' | 'p2' | null>(null)

  const vanishingLineDragStartRef = useRef<{ p1: ImageCoords; p2: ImageCoords; mouseU: number; mouseV: number } | null>(null)
  const vanishingLineAccumulatedDeltaRef = useRef<{ u: number; v: number }>({ u: 0, v: 0 })

  return {
    imageViewerState: {
      scale,
      setScale,
      offset,
      setOffset,
      imageLoaded,
      setImageLoaded,
      currentMousePos,
      setCurrentMousePos,
      panVelocity,
      setPanVelocity
    },
    dragState: {
      isDragging,
      setIsDragging,
      lastMousePos,
      setLastMousePos,
      lastPanTime,
      setLastPanTime,
      isCtrlKeyPressed,
      setIsCtrlKeyPressed
    },
    pointDragState: {
      isDraggingPoint,
      setIsDraggingPoint,
      draggedPoint,
      setDraggedPoint,
      dragStartPos,
      setDragStartPos,
      hoveredPoint,
      setHoveredPoint,
      hoveredLine,
      setHoveredLine,
      hoveredVanishingLine,
      setHoveredVanishingLine,
      isDragOverTarget,
      setIsDragOverTarget,
      dragStartImageCoordsRef,
      draggedPointImageCoordsRef,
      precisionPointerRef,
      precisionCanvasPosRef
    },
    precisionDragState: {
      isPrecisionDrag,
      setIsPrecisionDrag,
      isPrecisionToggleActive,
      setIsPrecisionToggleActive,
      isDragDropActive,
      setIsDragDropActive
    },
    vanishingLineDragState: {
      vanishingLineStart,
      setVanishingLineStart,
      isDraggingVanishingLine,
      setIsDraggingVanishingLine,
      draggedVanishingLine,
      setDraggedVanishingLine,
      vanishingLineDragMode,
      setVanishingLineDragMode,
      vanishingLineDragStartRef,
      vanishingLineAccumulatedDeltaRef
    }
  }
}
