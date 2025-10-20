// 3D World View for geometric primitives and constraints
import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRight } from '@fortawesome/free-solid-svg-icons'
import type { Project } from '../entities/project'
import type { WorldPoint } from '../entities/world-point/WorldPoint'
import type { Line } from '../entities/line/Line'
import type { Plane } from '../entities/plane'
import type { ISelectable } from '../types/selectable'

interface WorldViewProps {
  project: Project
  selectedEntities: ISelectable[]
  hoveredConstraintId?: string | null
  onPointClick: (worldPoint: WorldPoint, ctrlKey: boolean, shiftKey: boolean) => void
  onLineClick?: (line: Line, ctrlKey: boolean, shiftKey: boolean) => void
  onPlaneClick?: (plane: Plane, ctrlKey: boolean, shiftKey: boolean) => void
  onCreatePoint?: (x: number, y: number, z: number) => void
  onMovePoint?: (point: WorldPoint, x: number, y: number, z: number) => void
  onLineHover?: (line: Line | null) => void
  onPointHover?: (point: WorldPoint | null) => void
}

export interface WorldViewRef {
  zoomFit: () => void
  zoomSelection: () => void
  resetView: () => void
}

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
    draggedPoint?: WorldPoint
  }>({
    isDragging: false,
    lastX: 0,
    lastY: 0,
    dragType: 'rotate'
  })

  const [hoverState, setHoverState] = useState<{
    hoveredPoint: WorldPoint | null
    hoveredLine: Line | null
  }>({
    hoveredPoint: null,
    hoveredLine: null
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

  // Get constraint status color (not used in this component currently)
  const getConstraintStatusColor = (status: 'satisfied' | 'warning' | 'violated') => {
    switch (status) {
      case 'satisfied': return '#4CAF50' // Green
      case 'warning': return '#FF9800'   // Amber
      case 'violated': return '#F44336'  // Red
      default: return '#2196F3'          // Blue
    }
  }

  // Render world points
  const renderWorldPoints = useCallback((ctx: CanvasRenderingContext2D) => {
    project.worldPoints.forEach((point) => {
      if (!point.isVisible || !point.xyz) return

      const coords = point.getDefinedCoordinates()
      if (!coords) return

      const projected = project3DTo2D(coords)
      const isSelected = selectedSet.has(point)
      const isHovered = hoverState.hoveredPoint === point
      const radius = isSelected ? 6 : (isHovered ? 5 : 4)

      // Point circle
      ctx.beginPath()
      ctx.arc(projected.x, projected.y, radius, 0, 2 * Math.PI)

      if (isSelected) {
        ctx.fillStyle = '#FFC107'
      } else if (isHovered) {
        ctx.fillStyle = '#FFE082' // Lighter yellow for hover
      } else {
        ctx.fillStyle = point.color || '#2196F3'
      }

      ctx.fill()
      ctx.strokeStyle = isHovered ? '#FFB300' : '#000'
      ctx.lineWidth = isHovered ? 2 : 1
      ctx.stroke()

      // Point name
      if (project.showPointNames || isHovered) {
        ctx.fillStyle = '#000'
        ctx.font = '12px Arial'
        ctx.textAlign = 'center'
        ctx.fillText(point.name, projected.x, projected.y - 12)
      }
    })
  }, [project, selectedSet, hoverState, project3DTo2D])

  // Render lines
  const renderLines = useCallback((ctx: CanvasRenderingContext2D) => {
    project.lines.forEach((line) => {
      if (!line.isVisible) return

      const pointA = line.pointA
      const pointB = line.pointB
      const coordsA = pointA.getDefinedCoordinates()
      const coordsB = pointB.getDefinedCoordinates()
      if (!coordsA || !coordsB) return

      const projA = project3DTo2D(coordsA)
      const projB = project3DTo2D(coordsB)
      const isSelected = selectedSet.has(line)
      const isHovered = hoverState.hoveredLine === line

      ctx.beginPath()
      ctx.moveTo(projA.x, projA.y)
      ctx.lineTo(projB.x, projB.y)

      // All lines are segments now
      if (line.isConstruction) {
        ctx.setLineDash([5, 3]) // Construction segments
      } else {
        ctx.setLineDash([]) // Solid for segments
      }

      let strokeColor = line.color || '#2196F3'
      let lineWidth = 2

      if (isSelected) {
        strokeColor = '#FFC107'
        lineWidth = 3
      } else if (isHovered) {
        strokeColor = '#42A5F5' // Lighter blue for hover
        lineWidth = 3
      }

      ctx.strokeStyle = strokeColor
      ctx.lineWidth = lineWidth
      ctx.stroke()

      // Always show line name and distance (if set)
      const midX = (projA.x + projB.x) / 2
      const midY = (projA.y + projB.y) / 2

      // Show glyph with direction constraint if available
      let directionGlyph = '↔' // Default glyph
      const direction = line.constraints.direction
      switch (direction) {
        case 'horizontal': directionGlyph = '↔'; break
        case 'vertical': directionGlyph = '↕'; break
        case 'x-aligned': directionGlyph = 'X'; break
        case 'z-aligned': directionGlyph = 'Z'; break
        case 'free': directionGlyph = '↔'; break
      }

      // Show target length if set, otherwise show calculated length
      let displayText = `${line.name} ${directionGlyph}`
      const targetLength = line.constraints.targetLength
      if (targetLength !== undefined) {
        displayText = `${line.name} ${directionGlyph} ${targetLength.toFixed(1)}m`
      } else {
        const calculatedLength = line.length()
        if (calculatedLength !== null) {
          displayText = `${line.name} ${directionGlyph} ${calculatedLength.toFixed(1)}m`
        }
      }

      // WorldView shows calculated 3D distance when coordinates are available

      // Draw outlined text
      ctx.font = '12px Arial'
      ctx.textAlign = 'center'

      // Draw text outline (stroke)
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 3
      ctx.strokeText(displayText, midX, midY + 2)

      // Draw text fill
      ctx.fillStyle = '#000'
      ctx.fillText(displayText, midX, midY + 2)
    })
  }, [project, selectedSet, hoverState, project3DTo2D])

  // Render planes
  const renderPlanes = useCallback((ctx: CanvasRenderingContext2D) => {
    // TODO: Planes not yet implemented in Project
    // Will be added when Plane entity is integrated into project structure
  }, [project, selectedSet, project3DTo2D])

  // Render coordinate axes
  const renderAxes = useCallback((ctx: CanvasRenderingContext2D) => {
    if (!project.gridVisible) return

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
  }, [project3DTo2D, project.gridVisible])

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
        draggedPoint: clickedPoint
      })
      return
    }

    // Check if clicking on a line
    const clickedLine = findLineAt(x, y)
    if (clickedLine && onLineClick) {
      onLineClick(clickedLine, event.ctrlKey, event.shiftKey)
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
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    // Handle hover states when not dragging
    if (!dragState.isDragging) {
      const hoveredPoint = findPointAt(x, y)
      const hoveredLine = findLineAt(x, y)

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
      draggedPoint: undefined
    }))
  }

  const handleMouseLeave = () => {
    // Clear hover states when mouse leaves canvas
    setHoverState({
      hoveredPoint: null,
      hoveredLine: null
    })

    // Notify parent components
    if (onPointHover) onPointHover(null)
    if (onLineHover) onLineHover(null)

    // Reset cursor
    const canvas = canvasRef.current
    if (canvas) {
      canvas.style.cursor = 'default'
    }
  }

  // NO ZOOM HANDLING - REMOVED COMPLETELY

  // Find point at screen coordinates
  const findPointAt = (x: number, y: number): WorldPoint | null => {
    for (const point of project.worldPoints) {
      if (!point.isVisible) continue

      const coords = point.getDefinedCoordinates()
      if (!coords) continue

      const projected = project3DTo2D(coords)
      const distance = Math.sqrt(
        Math.pow(projected.x - x, 2) + Math.pow(projected.y - y, 2)
      )

      if (distance <= 8) return point
    }
    return null
  }

  // Find line at screen coordinates
  const findLineAt = (x: number, y: number): Line | null => {
    for (const line of project.lines) {
      if (!line.isVisible) continue

      const coordsA = line.pointA.getDefinedCoordinates()
      const coordsB = line.pointB.getDefinedCoordinates()
      if (!coordsA || !coordsB) continue

      const projA = project3DTo2D(coordsA)
      const projB = project3DTo2D(coordsB)

      // Calculate distance from point to line segment
      const A = x - projA.x
      const B = y - projA.y
      const C = projB.x - projA.x
      const D = projB.y - projA.y

      const dot = A * C + B * D
      const lenSq = C * C + D * D

      if (lenSq === 0) {
        // Line is a point
        const distance = Math.sqrt(A * A + B * B)
        if (distance <= 5) return line
        continue
      }

      let param = dot / lenSq

      // All lines are segments, clamp parameter to [0, 1]
      param = Math.max(0, Math.min(1, param))

      const closestX = projA.x + param * C
      const closestY = projA.y + param * D

      const distance = Math.sqrt(
        Math.pow(x - closestX, 2) + Math.pow(y - closestY, 2)
      )

      // Increase hit tolerance for lines (larger buffer for easier clicking)
      if (distance <= 8) return line
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