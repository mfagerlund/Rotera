// 3D World View for geometric primitives and constraints
import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import { observer } from 'mobx-react-lite'
import type { WorldViewProps, WorldViewRef } from './types'
import { useViewMatrix, quaternionToViewRotation } from './hooks/useViewMatrix'
import { useDragState } from './hooks/useDragState'
import { useHoverState } from './hooks/useHoverState'
import { useProjection } from './hooks/useProjection'
import { renderWorldPoints } from './renderers/pointRenderer'
import { renderLines } from './renderers/lineRenderer'
import { renderAxes } from './renderers/axesRenderer'
import { renderCameras } from './renderers/cameraRenderer'
import { findPointAt, findLineAt, findCameraAt } from './utils'
// Display handedness: RIGHT-handed (X right, Y up, Z toward viewer)
// The orthographic projection negates Z to achieve this.
// 
const DISPLAY_HANDEDNESS: 'L' | 'R' = 'R'


export const WorldView = observer(React.forwardRef<WorldViewRef, WorldViewProps>(({
  project,
  selectedEntities,
  hoveredConstraintId,
  onPointClick,
  onLineClick,
  onPlaneClick,
  onCreatePoint,
  onMovePoint,
  onLineHover,
  onPointHover,
  onPointRightClick,
  onLineRightClick
}, ref) => {
  const selectedSet = useMemo(() => new Set(selectedEntities), [selectedEntities])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const {
    viewMatrix,
    setViewMatrix,
    resetView,
    resetRotation,
    resetPan,
    zoomFitToProject,
    lookFromCamera: lookFromCameraHook,
    axisAngleQuat,
    multiplyQuat,
    normalizeQuaternion
  } = useViewMatrix()
  const hasInitializedRef = useRef(false)
  const [renderTrigger, setRenderTrigger] = useState(0)

  const zoomFit = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    zoomFitToProject(project, canvas.width, canvas.height)
  }, [project, zoomFitToProject])

  const lookFromCamera = useCallback((viewpoint: import('../../entities/viewpoint').Viewpoint) => {
    const canvas = canvasRef.current
    if (!canvas) return
    lookFromCameraHook(viewpoint, canvas.width, canvas.height)
  }, [lookFromCameraHook])

  const handleImageLoaded = useCallback(() => {
    setRenderTrigger(prev => prev + 1)
  }, [])
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
    renderCameras(ctx, project, selectedSet, null, project3DTo2D, handleImageLoaded)
    renderLines(ctx, project, selectedSet, hoverState.hoveredLine, project3DTo2D)
    renderWorldPoints(ctx, project, selectedSet, hoverState.hoveredPoint, project3DTo2D)
  }, [project, selectedSet, hoverState, project3DTo2D, handleImageLoaded, renderTrigger])

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

    // Check if clicking on a camera - animate to that camera's view
    const clickedCamera = findCameraAt(x, y, project, project3DTo2D)
    if (clickedCamera) {
      lookFromCamera(clickedCamera)
      return
    }

    // Start view manipulation (middle mouse button or ctrl+left = pan, left = rotate)
    const isPan = event.button === 1 || event.ctrlKey
    startDrag(x, y, isPan ? 'pan' : 'rotate')
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
      setViewMatrix(prev => {
        // If in camera mode, rotate the camera quaternion directly to preserve perspective alignment
        if (prev.cameraQuaternion) {
          const dqPitch = axisAngleQuat([1, 0, 0], deltaY * 0.01)
          const dqYaw = axisAngleQuat([0, 1, 0], deltaX * 0.01)
          // Apply pitch then yaw: q' = dqYaw * dqPitch * q
          const rotated = normalizeQuaternion(multiplyQuat(dqYaw, multiplyQuat(dqPitch, prev.cameraQuaternion)))
          return {
            ...prev,
            rotation: quaternionToViewRotation(rotated),
            cameraQuaternion: rotated
          }
        }

        // Orthographic mode: accumulate Euler angles
        return {
          ...prev,
          rotation: {
            x: prev.rotation.x + deltaY * 0.01,
            y: prev.rotation.y + deltaX * 0.01,
            z: prev.rotation.z
          }
        }
      })
    } else if (dragState.dragType === 'pan') {
      // Pan works in both modes
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

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1
    setViewMatrix(prev => ({
      ...prev,
      scale: Math.max(10, Math.min(1000, prev.scale * zoomFactor))
    }))
  }

  const handleContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    event.stopPropagation()

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    const clickedPoint = findPointAt(x, y, project, project3DTo2D)
    if (clickedPoint && onPointRightClick) {
      onPointRightClick(clickedPoint)
      return
    }

    const clickedLine = findLineAt(x, y, project, project3DTo2D)
    if (clickedLine && onLineRightClick) {
      onLineRightClick(clickedLine)
    }
  }

  // Expose ref methods
  React.useImperativeHandle(ref, () => ({
    zoomFit,
    resetView,
    lookFromCamera
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

      if (rect.width > 0 && rect.height > 0) {
        canvas.width = rect.width
        canvas.height = rect.height

        // Initial zoom fit on first render
        if (!hasInitializedRef.current && project.worldPoints.size > 0) {
          hasInitializedRef.current = true
          zoomFitToProject(project, canvas.width, canvas.height)
        }

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
      resizeObserver.observe(containerToObserve)
    }
    return () => resizeObserver.disconnect()
  }, [render, project, zoomFitToProject])

  return (
    <div className="world-view">
      <div className="world-view-controls">
        <button onClick={zoomFit}>
          Zoom All
        </button>
        <button onClick={resetRotation}>
          Reset Rotation
        </button>
        <button onClick={resetPan}>
          Reset Pan
        </button>
        {project.viewpoints.size > 0 && (
          <select
            onChange={(e) => {
              const index = parseInt(e.target.value, 10)
              if (!isNaN(index)) {
                const viewpointsArray = Array.from(project.viewpoints)
                const viewpoint = viewpointsArray[index]
                if (viewpoint) {
                  lookFromCamera(viewpoint)
                }
              }
              // Reset to placeholder to allow re-selection
              e.target.value = ''
            }}
            value=""
            style={{ marginLeft: '8px' }}
          >
            <option value="" disabled>View from camera...</option>
            {Array.from(project.viewpoints).map((vp, index) => (
              <option key={vp.name} value={index}>{vp.name}</option>
            ))}
          </select>
        )}
        <label>
          <input
            type="checkbox"
            checked={project.gridVisible}
            onChange={() => { project.gridVisible = !project.gridVisible }}
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
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        onAuxClick={(e) => e.preventDefault()}
      />
      <div className="world-view-info">
        <div className="view-state">
          {viewMatrix.cameraPosition ? (
            <>Cam: {viewMatrix.cameraPosition[0].toFixed(1)}, {viewMatrix.cameraPosition[1].toFixed(1)}, {viewMatrix.cameraPosition[2].toFixed(1)} • </>
          ) : null}
          View rot.x: {(viewMatrix.rotation.x * 180 / Math.PI).toFixed(1)}° • rot.y: {(viewMatrix.rotation.y * 180 / Math.PI).toFixed(1)}° • rot.z: {(viewMatrix.rotation.z * 180 / Math.PI).toFixed(1)}° • Zoom: {viewMatrix.scale.toFixed(0)} • {DISPLAY_HANDEDNESS}H
        </div>
        <div className="controls-hint">
          Drag: Rotate • Middle/Ctrl+Drag: Pan • Scroll: Zoom • Click camera: Focus
        </div>
      </div>
    </div>
  )
}))

WorldView.displayName = 'WorldView'

export default WorldView
