// 3D World View for geometric primitives and constraints
import React, { useRef, useEffect, useCallback, useState } from 'react'
import { WorldPoint, Line, Plane, Project, ConstraintStatus } from '../types/project'

interface WorldViewProps {
  project: Project
  selectedPoints: string[]
  selectedLines: string[]
  selectedPlanes: string[]
  hoveredConstraintId?: string
  onPointClick: (pointId: string, ctrlKey: boolean, shiftKey: boolean) => void
  onLineClick?: (lineId: string, ctrlKey: boolean, shiftKey: boolean) => void
  onPlaneClick?: (planeId: string, ctrlKey: boolean, shiftKey: boolean) => void
  onCreatePoint?: (x: number, y: number, z: number) => void
  onMovePoint?: (pointId: string, x: number, y: number, z: number) => void
}

export interface WorldViewRef {
  zoomFit: () => void
  zoomSelection: () => void
  resetView: () => void
}

export const WorldView = React.forwardRef<WorldViewRef, WorldViewProps>(({
  project,
  selectedPoints,
  selectedLines,
  selectedPlanes,
  hoveredConstraintId,
  onPointClick,
  onLineClick,
  onPlaneClick,
  onCreatePoint,
  onMovePoint
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewMatrix, setViewMatrix] = useState({
    scale: 100,
    rotation: { x: 0, y: 0, z: 0 },
    translation: { x: 0, y: 0, z: 0 }
  })
  const [dragState, setDragState] = useState<{
    isDragging: boolean
    lastX: number
    lastY: number
    dragType: 'rotate' | 'pan' | 'point'
    draggedPointId?: string
  }>({
    isDragging: false,
    lastX: 0,
    lastY: 0,
    dragType: 'rotate'
  })

  // 3D to 2D projection
  const project3DTo2D = useCallback((point: [number, number, number]) => {
    const [x, y, z] = point
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    // Simple orthographic projection with rotation
    const cos = Math.cos
    const sin = Math.sin
    const { rotation, scale, translation } = viewMatrix

    // Apply rotation
    let rotX = x
    let rotY = y * cos(rotation.x) - z * sin(rotation.x)
    let rotZ = y * sin(rotation.x) + z * cos(rotation.x)

    let rotX2 = rotX * cos(rotation.y) + rotZ * sin(rotation.y)
    let rotY2 = rotY
    let rotZ2 = -rotX * sin(rotation.y) + rotZ * cos(rotation.y)

    // Project to screen
    const screenX = canvas.width / 2 + (rotX2 * scale) + translation.x
    const screenY = canvas.height / 2 - (rotY2 * scale) + translation.y

    return { x: screenX, y: screenY, depth: rotZ2 }
  }, [viewMatrix])

  // Get constraint status color
  const getConstraintStatusColor = (status: ConstraintStatus) => {
    switch (status) {
      case 'satisfied': return '#4CAF50' // Green
      case 'warning': return '#FF9800'   // Amber
      case 'violated': return '#F44336'  // Red
      default: return '#2196F3'          // Blue
    }
  }

  // Render world points
  const renderWorldPoints = useCallback((ctx: CanvasRenderingContext2D) => {
    Object.entries(project.worldPoints).forEach(([pointId, point]) => {
      if (!point.isVisible || !point.xyz) return

      const projected = project3DTo2D(point.xyz)
      const isSelected = selectedPoints.includes(pointId)
      const radius = isSelected ? 8 : 6

      // Point circle
      ctx.beginPath()
      ctx.arc(projected.x, projected.y, radius, 0, 2 * Math.PI)
      ctx.fillStyle = isSelected ? '#FFC107' : point.color || '#2196F3'
      ctx.fill()
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1
      ctx.stroke()

      // Point name
      if (project.settings.showPointNames) {
        ctx.fillStyle = '#000'
        ctx.font = '12px Arial'
        ctx.textAlign = 'center'
        ctx.fillText(point.name, projected.x, projected.y - 12)
      }
    })
  }, [project, selectedPoints, project3DTo2D])

  // Render lines
  const renderLines = useCallback((ctx: CanvasRenderingContext2D) => {
    Object.entries(project.lines || {}).forEach(([lineId, line]) => {
      if (!line.isVisible) return

      const pointA = project.worldPoints[line.pointA]
      const pointB = project.worldPoints[line.pointB]
      if (!pointA?.xyz || !pointB?.xyz) return

      const projA = project3DTo2D(pointA.xyz)
      const projB = project3DTo2D(pointB.xyz)
      const isSelected = selectedLines.includes(lineId)

      ctx.beginPath()
      ctx.moveTo(projA.x, projA.y)
      ctx.lineTo(projB.x, projB.y)

      if (line.type === 'infinite') {
        // Extend line to canvas edges for infinite lines
        const dx = projB.x - projA.x
        const dy = projB.y - projA.y
        const length = Math.sqrt(dx * dx + dy * dy)
        if (length > 0) {
          const unitX = dx / length
          const unitY = dy / length
          const extension = 1000 // Extend by 1000 pixels

          ctx.moveTo(projA.x - unitX * extension, projA.y - unitY * extension)
          ctx.lineTo(projB.x + unitX * extension, projB.y + unitY * extension)
          ctx.setLineDash([5, 5]) // Dashed for infinite
        }
      } else {
        ctx.setLineDash([]) // Solid for segments
      }

      ctx.strokeStyle = isSelected ? '#FFC107' : line.color || '#2196F3'
      ctx.lineWidth = isSelected ? 3 : 2
      ctx.stroke()
    })
  }, [project, selectedLines, project3DTo2D])

  // Render planes
  const renderPlanes = useCallback((ctx: CanvasRenderingContext2D) => {
    Object.entries(project.planes || {}).forEach(([planeId, plane]) => {
      if (!plane.isVisible) return

      // For now, render as a simple wireframe
      // TODO: Implement proper plane rendering with transparency
      const isSelected = selectedPlanes.includes(planeId)

      if (plane.definition.type === 'three_points' && plane.definition.pointIds) {
        const [p1Id, p2Id, p3Id] = plane.definition.pointIds
        const p1 = project.worldPoints[p1Id]
        const p2 = project.worldPoints[p2Id]
        const p3 = project.worldPoints[p3Id]

        if (p1?.xyz && p2?.xyz && p3?.xyz) {
          const proj1 = project3DTo2D(p1.xyz)
          const proj2 = project3DTo2D(p2.xyz)
          const proj3 = project3DTo2D(p3.xyz)

          ctx.beginPath()
          ctx.moveTo(proj1.x, proj1.y)
          ctx.lineTo(proj2.x, proj2.y)
          ctx.lineTo(proj3.x, proj3.y)
          ctx.closePath()

          // Fill with transparency
          ctx.fillStyle = isSelected ? 'rgba(255, 193, 7, 0.2)' : 'rgba(33, 150, 243, 0.1)'
          ctx.fill()

          // Stroke outline
          ctx.strokeStyle = isSelected ? '#FFC107' : plane.color || '#2196F3'
          ctx.lineWidth = isSelected ? 2 : 1
          ctx.stroke()
        }
      }
    })
  }, [project, selectedPlanes, project3DTo2D])

  // Render coordinate axes
  const renderAxes = useCallback((ctx: CanvasRenderingContext2D) => {
    if (!project.settings.gridVisible) return

    const origin = [0, 0, 0] as [number, number, number]
    const axisLength = 2 // meters

    const axes = [
      { end: [axisLength, 0, 0] as [number, number, number], color: '#F44336', label: 'X' },
      { end: [0, axisLength, 0] as [number, number, number], color: '#4CAF50', label: 'Y' },
      { end: [0, 0, axisLength] as [number, number, number], color: '#2196F3', label: 'Z' }
    ]

    const originProj = project3DTo2D(origin)

    axes.forEach(axis => {
      const endProj = project3DTo2D(axis.end)

      ctx.beginPath()
      ctx.moveTo(originProj.x, originProj.y)
      ctx.lineTo(endProj.x, endProj.y)
      ctx.strokeStyle = axis.color
      ctx.lineWidth = 2
      ctx.stroke()

      // Axis label
      ctx.fillStyle = axis.color
      ctx.font = '14px Arial'
      ctx.fillText(axis.label, endProj.x + 5, endProj.y - 5)
    })
  }, [project3DTo2D, project.settings.gridVisible])

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

    // Render in order: axes, planes, lines, points
    renderAxes(ctx)
    renderPlanes(ctx)
    renderLines(ctx)
    renderWorldPoints(ctx)
  }, [renderAxes, renderPlanes, renderLines, renderWorldPoints])

  // Handle mouse events
  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    // Check if clicking on a point
    const clickedPoint = findPointAt(x, y)
    if (clickedPoint) {
      onPointClick(clickedPoint, event.ctrlKey, event.shiftKey)
      setDragState({
        isDragging: true,
        lastX: x,
        lastY: y,
        dragType: 'point',
        draggedPointId: clickedPoint
      })
      return
    }

    // Start view manipulation
    setDragState({
      isDragging: true,
      lastX: x,
      lastY: y,
      dragType: event.shiftKey ? 'pan' : 'rotate'
    })
  }

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragState.isDragging) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

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

    setDragState(prev => ({
      ...prev,
      lastX: x,
      lastY: y
    }))
  }

  const handleMouseUp = () => {
    setDragState(prev => ({
      ...prev,
      isDragging: false,
      draggedPointId: undefined
    }))
  }

  // NO ZOOM HANDLING - REMOVED COMPLETELY

  // Find point at screen coordinates
  const findPointAt = (x: number, y: number): string | null => {
    for (const [pointId, point] of Object.entries(project.worldPoints)) {
      if (!point.isVisible || !point.xyz) continue

      const projected = project3DTo2D(point.xyz)
      const distance = Math.sqrt(
        Math.pow(projected.x - x, 2) + Math.pow(projected.y - y, 2)
      )

      if (distance <= 8) return pointId
    }
    return null
  }

  // Expose ref methods
  React.useImperativeHandle(ref, () => ({
    zoomFit: () => {
      // Calculate bounding box of all points and fit view
      // TODO: Implement proper fit calculation
      setViewMatrix(prev => ({
        ...prev,
        scale: 100,
        translation: { x: 0, y: 0, z: 0 }
      }))
    },
    zoomSelection: () => {
      // Zoom to selected entities
      // TODO: Implement selection-based zoom
    },
    resetView: () => {
      setViewMatrix({
        scale: 100,
        rotation: { x: 0, y: 0, z: 0 },
        translation: { x: 0, y: 0, z: 0 }
      })
    }
  }))

  // Re-render when dependencies change
  useEffect(() => {
    render()
  }, [render, viewMatrix])

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resizeObserver = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
      render()
    })

    resizeObserver.observe(canvas)
    return () => resizeObserver.disconnect()
  }, [render])

  return (
    <div className="world-view">
      <div className="world-view-controls">
        <button onClick={() => setViewMatrix(prev => ({ ...prev, rotation: { x: 0, y: 0, z: 0 } }))}>
          Reset Rotation
        </button>
        <button onClick={() => setViewMatrix(prev => ({ ...prev, translation: { x: 0, y: 0, z: 0 } }))}>
          Reset Pan
        </button>
        <label>
          <input
            type="checkbox"
            checked={project.settings.gridVisible}
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