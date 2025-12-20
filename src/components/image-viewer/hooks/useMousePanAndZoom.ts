import { useCallback, RefObject } from 'react'
import { ImageViewerState, DragState } from './useImageViewerState'
import { UseImageTransformReturn } from './useImageTransform'

export interface UseMousePanAndZoomParams {
  canvasRef: RefObject<HTMLCanvasElement>
  imageViewerState: ImageViewerState
  dragState: DragState
  transform: UseImageTransformReturn
}

export interface UseMousePanAndZoomReturn {
  handleWheel: (event: React.WheelEvent) => void
  updatePan: (x: number, y: number) => void
  startPan: (x: number, y: number) => void
  stopPan: () => void
  zoomAtCenter: (scaleFactor: number, minScale: number, maxScale: number) => void
}

export function useMousePanAndZoom({
  canvasRef,
  imageViewerState,
  dragState,
  transform
}: UseMousePanAndZoomParams): UseMousePanAndZoomReturn {

  const handleWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault()

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top

    const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.1, Math.min(5, imageViewerState.scale * scaleFactor))

    const scaleRatio = newScale / imageViewerState.scale
    imageViewerState.setOffset(prev => ({
      x: mouseX - (mouseX - prev.x) * scaleRatio,
      y: mouseY - (mouseY - prev.y) * scaleRatio
    }))

    imageViewerState.setScale(newScale)
  }, [canvasRef, imageViewerState])

  const zoomAtCenter = useCallback((scaleFactor: number, minScale: number, maxScale: number) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const centerX = canvas.width / 2
    const centerY = canvas.height / 2
    const newScale = Math.max(minScale, Math.min(maxScale, imageViewerState.scale * scaleFactor))

    const scaleRatio = newScale / imageViewerState.scale
    imageViewerState.setOffset(prev => ({
      x: centerX - (centerX - prev.x) * scaleRatio,
      y: centerY - (centerY - prev.y) * scaleRatio
    }))
    imageViewerState.setScale(newScale)
  }, [canvasRef, imageViewerState])

  const startPan = useCallback((x: number, y: number) => {
    dragState.setIsDragging(true)
    dragState.setLastMousePos({ x, y })
    dragState.setLastPanTime(Date.now())
    imageViewerState.setPanVelocity({ x: 0, y: 0 })
  }, [dragState, imageViewerState])

  const updatePan = useCallback((x: number, y: number) => {
    if (!dragState.isDragging) return

    const deltaX = x - dragState.lastMousePos.x
    const deltaY = y - dragState.lastMousePos.y
    const currentTime = Date.now()

    const timeDelta = currentTime - dragState.lastPanTime
    if (timeDelta > 0) {
      imageViewerState.setPanVelocity({
        x: deltaX / timeDelta * 100,
        y: deltaY / timeDelta * 100
      })
      dragState.setLastPanTime(currentTime)
    }

    imageViewerState.setOffset(prev => ({
      x: prev.x + deltaX,
      y: prev.y + deltaY
    }))

    dragState.setLastMousePos({ x, y })
  }, [dragState, imageViewerState])

  const stopPan = useCallback(() => {
    dragState.setIsDragging(false)
    imageViewerState.setPanVelocity({ x: 0, y: 0 })
  }, [dragState, imageViewerState])

  return {
    handleWheel,
    updatePan,
    startPan,
    stopPan,
    zoomAtCenter
  }
}
