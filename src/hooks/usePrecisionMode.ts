import { useRef, useState, useCallback } from 'react'

interface ImageCoords {
  u: number
  v: number
}

interface CanvasPoint {
  x: number
  y: number
}

const PRECISION_DRAG_RATIO = 0.12
const SHIFT_TAP_THRESHOLD_MS = 250

export interface PrecisionModeState {
  isPrecisionActive: boolean
  isPrecisionToggled: boolean
  precisionCanvasPos: CanvasPoint | null
}

export interface PrecisionModeHandlers {
  handleShiftKey: (event: KeyboardEvent) => void
  applyPrecisionToImageDelta: (currentImageCoords: ImageCoords, baseImageCoords: ImageCoords) => ImageCoords
  applyPrecisionToCanvasDelta: (currentCanvasPos: CanvasPoint, deltaX: number, deltaY: number, scale: number, offset: { x: number; y: number }) => { canvasPos: CanvasPoint; imageCoords: ImageCoords }
  resetPrecision: (clearToggle?: boolean) => void
  getPrecisionState: () => PrecisionModeState
}

export function usePrecisionMode(
  imageToCanvasCoords: (u: number, v: number) => CanvasPoint
): PrecisionModeHandlers {
  const [isPrecisionToggled, setIsPrecisionToggled] = useState(false)
  const precisionPointerRef = useRef<ImageCoords | null>(null)
  const precisionCanvasPosRef = useRef<CanvasPoint | null>(null)
  const shiftPressStartTimeRef = useRef<number | null>(null)

  const handleShiftKey = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Shift') {
      if (event.type === 'keydown') {
        if (!shiftPressStartTimeRef.current) {
          shiftPressStartTimeRef.current = Date.now()
        }
      } else if (event.type === 'keyup') {
        if (shiftPressStartTimeRef.current) {
          const pressDuration = Date.now() - shiftPressStartTimeRef.current
          if (pressDuration < SHIFT_TAP_THRESHOLD_MS) {
            setIsPrecisionToggled(prev => !prev)
          }
          shiftPressStartTimeRef.current = null
        }
      }
    }
  }, [])

  const applyPrecisionToImageDelta = useCallback((currentImageCoords: ImageCoords, baseImageCoords: ImageCoords): ImageCoords => {
    const previousPointer = precisionPointerRef.current || currentImageCoords
    const deltaU = currentImageCoords.u - previousPointer.u
    const deltaV = currentImageCoords.v - previousPointer.v
    precisionPointerRef.current = currentImageCoords

    const targetCoords = {
      u: baseImageCoords.u + deltaU * PRECISION_DRAG_RATIO,
      v: baseImageCoords.v + deltaV * PRECISION_DRAG_RATIO
    }

    precisionCanvasPosRef.current = imageToCanvasCoords(targetCoords.u, targetCoords.v)

    return targetCoords
  }, [imageToCanvasCoords])

  const applyPrecisionToCanvasDelta = useCallback((
    currentCanvasPos: CanvasPoint,
    deltaX: number,
    deltaY: number,
    scale: number,
    offset: { x: number; y: number }
  ): { canvasPos: CanvasPoint; imageCoords: ImageCoords } => {
    const incrementalDeltaX = deltaX * PRECISION_DRAG_RATIO
    const incrementalDeltaY = deltaY * PRECISION_DRAG_RATIO

    const newCanvasX = (precisionCanvasPosRef.current?.x ?? currentCanvasPos.x) + incrementalDeltaX
    const newCanvasY = (precisionCanvasPosRef.current?.y ?? currentCanvasPos.y) + incrementalDeltaY

    precisionCanvasPosRef.current = { x: newCanvasX, y: newCanvasY }

    const imageU = (newCanvasX - offset.x) / scale
    const imageV = (newCanvasY - offset.y) / scale

    return {
      canvasPos: { x: newCanvasX, y: newCanvasY },
      imageCoords: { u: imageU, v: imageV }
    }
  }, [])

  const resetPrecision = useCallback((clearToggle: boolean = false) => {
    precisionPointerRef.current = null
    precisionCanvasPosRef.current = null
    if (clearToggle) {
      setIsPrecisionToggled(false)
    }
  }, [])

  const getPrecisionState = useCallback((): PrecisionModeState => ({
    isPrecisionActive: isPrecisionToggled,
    isPrecisionToggled,
    precisionCanvasPos: precisionCanvasPosRef.current
  }), [isPrecisionToggled])

  return {
    handleShiftKey,
    applyPrecisionToImageDelta,
    applyPrecisionToCanvasDelta,
    resetPrecision,
    getPrecisionState
  }
}
