// 3D World View for geometric primitives and constraints
import React, { useRef, useEffect, useCallback, useMemo } from 'react'
import type { WorldViewProps, WorldViewRef } from './types'
import { useViewMatrix } from './hooks/useViewMatrix'
import { useDragState } from './hooks/useDragState'
import { useHoverState } from './hooks/useHoverState'
import { useProjection } from './hooks/useProjection'
import { renderWorldPoints } from './renderers/pointRenderer'
import { renderLines } from './renderers/lineRenderer'
import { renderAxes } from './renderers/axesRenderer'
import { renderCameras } from './renderers/cameraRenderer'
import { findPointAt, findLineAt } from './utils'

export const WorldView = React.forwardRef<WorldViewRef, WorldViewProps>(({
  project,
  selectedEntities,
  hoveredConstraintId,
  onPointClick,
  onLineClick,
  onPlaneClick,
  onCreatePoint,
  onMovePoint,
  onLineHover,
  onPointHover
}, ref) => {
  const selectedSet = useMemo(() => new Set(selectedEntities), [selectedEntities])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { viewMatrix, setViewMatrix, resetView, resetRotation, resetPan, zoomFit } = useViewMatrix()
  const { dragState, startDrag, updateDrag, endDrag } = useDragState()
  const { hoverState, setHoverState, clearHover } = useHoverState()
  const { project3DTo2D } = useProjection(canvasRef, viewMatrix)

  // Main render function
  const render = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Set background
    ctx.fillStyle = '#f5f5f5'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Render in order: axes, cameras, lines, points
    renderAxes(ctx, project.gridVisible, project3DTo2D)
    renderCameras(ctx, project, selectedSet, null, project3DTo2D)
    renderLines(ctx, project, selectedSet, hoverState.hoveredLine, project3DTo2D)
    renderWorldPoints(ctx, project, selectedSet, hoverState.hoveredPoint, project3DTo2D)
  }, [project, selectedSet, hoverState, project3DTo2D])

  // Handle mouse events
  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    // Check if clicking on a point
    const clickedPoint = findPointAt(x, y, project, project3DTo2D)
    if (clickedPoint) {
      onPointClick(clickedPoint, event.ctrlKey, event.shiftKey)
      startDrag(x, y, 'point', clickedPoint)
      return
    }

    // Check if clicking on a line
    const clickedLine = findLineAt(x, y, project, project3DTo2D)
    if (clickedLine && onLineClick) {
      onLineClick(clickedLine, event.ctrlKey, event.shiftKey)
      return
    }

    // Start view manipulation
    startDrag(x, y, event.shiftKey ? 'pan' : 'rotate')
  }

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    // Handle hover states when not dragging
    if (!dragState.isDragging) {
      const hoveredPoint = findPointAt(x, y, project, project3DTo2D)
      const hoveredLine = findLineAt(x, y, project, project3DTo2D)

      if (hoveredPoint !== hoverState.hoveredPoint || hoveredLine !== hoverState.hoveredLine) {
        setHoverState({
          hoveredPoint,
          hoveredLine
        })

        // Update cursor style
        if (hoveredPoint || hoveredLine) {
          canvas.style.cursor = 'pointer'
        } else {
          canvas.style.cursor = 'default'
        }

        // Notify parent components of hover changes
        if (onPointHover && hoveredPoint !== hoverState.hoveredPoint) {
          onPointHover(hoveredPoint)
        }
        if (onLineHover && hoveredLine !== hoverState.hoveredLine) {
          onLineHover(hoveredLine)
        }
      }
      return
    }

    // Handle dragging
    const deltaX = x - dragState.lastX
    const deltaY = y - dragState.lastY

    if (dragState.dragType === 'rotate') {
      setViewMatrix(prev => ({
        ...prev,
        rotation: {
          x: prev.rotation.x + deltaY * 0.01,
          y: prev.rotation.y + deltaX * 0.01,
          z: prev.rotation.z
        }
      }))
    } else if (dragState.dragType === 'pan') {
      setViewMatrix(prev => ({
        ...prev,
        translation: {
          x: prev.translation.x + deltaX,
          y: prev.translation.y + deltaY,
          z: prev.translation.z
        }
      }))
    }

    updateDrag(x, y)
  }

  const handleMouseUp = () => {
    endDrag()
  }

  const handleMouseLeave = () => {
    // Clear hover states when mouse leaves canvas
    clearHover()

    // Notify parent components
    if (onPointHover) onPointHover(null)
    if (onLineHover) onLineHover(null)

    // Reset cursor
    const canvas = canvasRef.current
    if (canvas) {
      canvas.style.cursor = 'default'
    }
  }

  // Expose ref methods
  React.useImperativeHandle(ref, () => ({
    zoomFit,
    zoomSelection: () => {
      // Zoom to selected entities
      // TODO: Implement selection-based zoom
    },
    resetView
  }))

  // Re-render when dependencies change
  useEffect(() => {
    render()
  }, [render])

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const updateSize = () => {
      const parent = canvas.parentElement
      if (!parent) return

      const controls = parent.querySelector('.world-view-controls') as HTMLElement
      const controlsHeight = controls?.offsetHeight || 0

      // Position canvas below controls
      canvas.style.top = `${controlsHeight}px`

      const rect = canvas.getBoundingClientRect()
      console.log('[WorldView] Controls height:', controlsHeight, 'Canvas rect:', rect.width, 'x', rect.height)

      if (rect.width > 0 && rect.height > 0) {
        canvas.width = rect.width
        canvas.height = rect.height
        console.log('[WorldView] Set canvas resolution to:', canvas.width, 'x', canvas.height)
        render()
      }
    }

    requestAnimationFrame(() => {
      updateSize()
    })

    const resizeObserver = new ResizeObserver(updateSize)
    // Observe the grandparent (.workspace-world-view) to avoid resize feedback loop
    const containerToObserve = canvas.parentElement?.parentElement || canvas.parentElement
    if (containerToObserve) {
      console.log('[WorldView] Observing container:', containerToObserve.className)
      resizeObserver.observe(containerToObserve)
    }
    return () => resizeObserver.disconnect()
  }, [render])

  return (
    <div className="world-view">
      <div className="world-view-controls">
        <button onClick={resetRotation}>
          Reset Rotation
        </button>
        <button onClick={resetPan}>
          Reset Pan
        </button>
        <label>
          <input
            type="checkbox"
            checked={project.gridVisible}
            onChange={() => {/* TODO: Update settings */}}
          />
          Show Axes
        </label>
      </div>
      <canvas
        ref={canvasRef}
        className="world-view-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
      <div className="world-view-info">
        <div>Scale: {viewMatrix.scale.toFixed(0)}%</div>
        <div>Rotation: X:{(viewMatrix.rotation.x * 57.3).toFixed(0)}° Y:{(viewMatrix.rotation.y * 57.3).toFixed(0)}°</div>
        <div className="controls-hint">
          Drag: Rotate • Shift+Drag: Pan • Scroll: Zoom
        </div>
      </div>
    </div>
  )
})

WorldView.displayName = 'WorldView'

export default WorldView
