import { useCallback, useEffect, RefObject } from 'react'
import { CanvasOffset, CanvasPoint, CanvasToImage, ImageCoords, ImageToCanvas } from '../types'
import { WorldPoint } from '../../../entities/world-point'
import { Viewpoint } from '../../../entities/viewpoint'

export interface UseImageTransformParams {
  canvasRef: RefObject<HTMLCanvasElement>
  containerRef: RefObject<HTMLDivElement>
  imageRef: RefObject<HTMLImageElement>
  scale: number
  setScale: (scale: number) => void
  offset: CanvasOffset
  setOffset: (offset: CanvasOffset | ((prev: CanvasOffset) => CanvasOffset)) => void
  imageLoaded: boolean
  setImageLoaded: (loaded: boolean) => void
  image: Viewpoint
  selectedPoints: WorldPoint[]
  worldPoints: Set<WorldPoint>
  onScaleChange?: (scale: number) => void
}

export interface UseImageTransformReturn {
  canvasToImageCoords: CanvasToImage
  canvasToImageCoordsUnbounded: (canvasX: number, canvasY: number) => ImageCoords | null
  imageToCanvasCoords: ImageToCanvas
  fitImageToCanvas: () => void
  zoomFit: () => void
  zoomSelection: () => void
  zoomToSelection: () => void
  setScaleValue: (newScale: number) => void
  getMousePosition: (currentMousePos: CanvasPoint | null) => { u: number; v: number } | null
}

export function useImageTransform({
  canvasRef,
  containerRef,
  imageRef,
  scale,
  setScale,
  offset,
  setOffset,
  imageLoaded,
  setImageLoaded,
  image,
  selectedPoints,
  worldPoints,
  onScaleChange
}: UseImageTransformParams): UseImageTransformReturn {

  const canvasToImageCoords = useCallback<CanvasToImage>((canvasX: number, canvasY: number) => {
    const img = imageRef.current
    if (!img) return null

    const imageX = (canvasX - offset.x) / scale
    const imageY = (canvasY - offset.y) / scale

    if (imageX < 0 || imageX > img.width || imageY < 0 || imageY > img.height) {
      return null
    }

    return { u: imageX, v: imageY }
  }, [offset.x, offset.y, scale])

  const canvasToImageCoordsUnbounded = useCallback((canvasX: number, canvasY: number): ImageCoords | null => {
    const img = imageRef.current
    if (!img) return null

    const imageX = (canvasX - offset.x) / scale
    const imageY = (canvasY - offset.y) / scale

    return { u: imageX, v: imageY }
  }, [offset.x, offset.y, scale])

  const imageToCanvasCoords = useCallback<ImageToCanvas>((u: number, v: number) => ({
    x: u * scale + offset.x,
    y: v * scale + offset.y
  }), [offset.x, offset.y, scale])

  const fitImageToCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    const img = imageRef.current

    if (!canvas || !container || !img) return

    const containerRect = container.getBoundingClientRect()

    const cssWidth = containerRect.width
    const cssHeight = containerRect.height
    const scaleX = cssWidth / img.width
    const scaleY = cssHeight / img.height
    const newScale = Math.min(scaleX, scaleY, 1)

    setScale(newScale)
    setOffset({
      x: (cssWidth - img.width * newScale) / 2,
      y: (cssHeight - img.height * newScale) / 2
    })
  }, [canvasRef, containerRef, imageRef, setScale, setOffset])

  const zoomToSelection = useCallback(() => {
    const canvas = canvasRef.current
    const img = imageRef.current

    if (!canvas || !img || selectedPoints.length === 0) return

    let minU = Infinity, maxU = -Infinity
    let minV = Infinity, maxV = -Infinity

    selectedPoints.forEach(wp => {
      const imagePoint = image.getImagePointsForWorldPoint(wp)[0]
      if (imagePoint) {
        minU = Math.min(minU, imagePoint.u)
        maxU = Math.max(maxU, imagePoint.u)
        minV = Math.min(minV, imagePoint.v)
        maxV = Math.max(maxV, imagePoint.v)
      }
    })

    if (minU === Infinity) return

    const padding = 50
    const selectionWidth = maxU - minU + (padding * 2)
    const selectionHeight = maxV - minV + (padding * 2)
    const centerU = (minU + maxU) / 2
    const centerV = (minV + maxV) / 2

    const scaleX = canvas.width / selectionWidth
    const scaleY = canvas.height / selectionHeight
    const newScale = Math.min(scaleX, scaleY, 5)

    setScale(newScale)
    setOffset({
      x: canvas.width / 2 - centerU * newScale,
      y: canvas.height / 2 - centerV * newScale
    })
  }, [canvasRef, imageRef, selectedPoints, image, setScale, setOffset])

  const zoomFit = useCallback(() => {
    fitImageToCanvas()
  }, [fitImageToCanvas])

  const zoomSelection = useCallback(() => {
    if (selectedPoints.length > 0) {
      zoomToSelection()
    } else {
      const allPoints = Array.from(worldPoints.values()).filter(wp =>
        image.getImagePointsForWorldPoint(wp).length > 0
      )

      if (allPoints.length > 0) {
        const originalSelection = selectedPoints
        selectedPoints.splice(0, selectedPoints.length, ...allPoints)
        zoomToSelection()
        selectedPoints.splice(0, selectedPoints.length, ...originalSelection)
      }
    }
  }, [selectedPoints, zoomToSelection, worldPoints, image])

  const setScaleValue = useCallback((newScale: number) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const clampedScale = Math.max(0.1, Math.min(5, newScale))
    const centerX = canvas.width / 2
    const centerY = canvas.height / 2

    const scaleRatio = clampedScale / scale
    setOffset(prev => ({
      x: centerX - (centerX - prev.x) * scaleRatio,
      y: centerY - (centerY - prev.y) * scaleRatio
    }))

    setScale(clampedScale)
  }, [canvasRef, scale, setScale, setOffset])

  const getMousePosition = useCallback((currentMousePos: CanvasPoint | null) => {
    if (!currentMousePos) return null
    return canvasToImageCoords(currentMousePos.x, currentMousePos.y)
  }, [canvasToImageCoords])

  useEffect(() => {
    if (!image) return

    const img = imageRef.current
    if (!img) return

    img.onload = () => {
      setImageLoaded(true)
      fitImageToCanvas()
    }
    img.src = image.url
  }, [image, fitImageToCanvas, setImageLoaded, imageRef])

  useEffect(() => {
    const handleResize = () => {
      if (imageLoaded) {
        fitImageToCanvas()
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [imageLoaded, fitImageToCanvas])

  useEffect(() => {
    if (onScaleChange) {
      onScaleChange(scale)
    }
  }, [scale, onScaleChange])

  return {
    canvasToImageCoords,
    canvasToImageCoordsUnbounded,
    imageToCanvasCoords,
    fitImageToCanvas,
    zoomFit,
    zoomSelection,
    zoomToSelection,
    setScaleValue,
    getMousePosition
  }
}
