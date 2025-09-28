// 3D visualization component for photogrammetry results

import React, { useRef, useEffect, useState } from 'react'
import { WorldPoint, ProjectImage, Camera, PointCloud } from '../types/project'

interface Viewer3DProps {
  worldPoints: Record<string, WorldPoint>
  images: Record<string, ProjectImage>
  cameras: Record<string, Camera>
  selectedPointIds: string[]
  onPointClick: (pointId: string) => void
  onCameraClick: (imageId: string) => void
}

export const Viewer3D: React.FC<Viewer3DProps> = ({
  worldPoints,
  images,
  cameras,
  selectedPointIds,
  onPointClick,
  onCameraClick
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewState, setViewState] = useState({
    rotation: { x: 0, y: 0, z: 0 },
    translation: { x: 0, y: 0, z: -5 },
    scale: 1
  })
  const [isDragging, setIsDragging] = useState(false)
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 })
  const [renderMode, setRenderMode] = useState<'points' | 'cameras' | 'both'>('both')

  // Generate point cloud data
  const pointCloud = React.useMemo((): PointCloud => {
    const points = Object.values(worldPoints)
      .filter(wp => wp.xyz && wp.isVisible)
      .map(wp => ({
        position: wp.xyz!,
        color: hexToRgb(wp.color || '#ff6b6b'),
        size: selectedPointIds.includes(wp.id) ? 8 : 5,
        worldPointId: wp.id
      }))

    const cameraData = Object.values(images)
      .map(image => {
        const camera = cameras[image.cameraId || '']
        if (!camera?.extrinsics) return null

        return {
          position: camera.extrinsics.translation,
          rotation: camera.extrinsics.rotation,
          fov: 60, // Default field of view
          imageId: image.id
        }
      })
      .filter(Boolean) as PointCloud['cameras']

    return { points, cameras: cameraData }
  }, [worldPoints, images, cameras, selectedPointIds])

  // Simple 3D rendering using canvas 2D context
  const render = React.useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    // Set up 3D to 2D projection
    const centerX = width / 2
    const centerY = height / 2
    const focalLength = 500

    const project3DTo2D = (point: [number, number, number]) => {
      // Apply view transformations
      let [x, y, z] = point

      // Apply translation
      x += viewState.translation.x
      y += viewState.translation.y
      z += viewState.translation.z

      // Apply rotation (simplified)
      const cosY = Math.cos(viewState.rotation.y)
      const sinY = Math.sin(viewState.rotation.y)
      const cosX = Math.cos(viewState.rotation.x)
      const sinX = Math.sin(viewState.rotation.x)

      // Rotate around Y axis
      const tempX = x * cosY - z * sinY
      const tempZ = x * sinY + z * cosY
      x = tempX
      z = tempZ

      // Rotate around X axis
      const tempY = y * cosX - z * sinX
      z = y * sinX + z * cosX
      y = tempY

      // Apply scale
      x *= viewState.scale
      y *= viewState.scale
      z *= viewState.scale

      // Perspective projection
      if (z <= 0) return null // Behind camera

      const screenX = centerX + (x * focalLength) / z
      const screenY = centerY - (y * focalLength) / z // Flip Y for screen coordinates

      return { x: screenX, y: screenY, depth: z }
    }

    // Render world points
    if (renderMode === 'points' || renderMode === 'both') {
      pointCloud.points.forEach(point => {
        const projected = project3DTo2D(point.position)
        if (!projected) return

        const radius = (point.size || 5) / Math.max(1, projected.depth / 5)

        const color = point.color || [255, 0, 0]
        ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`
        ctx.strokeStyle = selectedPointIds.includes(point.worldPointId) ? '#ffffff' : '#000000'
        ctx.lineWidth = selectedPointIds.includes(point.worldPointId) ? 2 : 1

        ctx.beginPath()
        ctx.arc(projected.x, projected.y, radius, 0, 2 * Math.PI)
        ctx.fill()
        ctx.stroke()

        // Draw point name
        const wp = worldPoints[point.worldPointId]
        if (wp) {
          ctx.fillStyle = '#ffffff'
          ctx.strokeStyle = '#000000'
          ctx.lineWidth = 3
          ctx.font = '12px Arial'
          ctx.textAlign = 'center'
          ctx.strokeText(wp.name, projected.x, projected.y - radius - 5)
          ctx.fillText(wp.name, projected.x, projected.y - radius - 5)
        }
      })
    }

    // Render cameras
    if (renderMode === 'cameras' || renderMode === 'both') {
      pointCloud.cameras.forEach(camera => {
        const projected = project3DTo2D(camera.position)
        if (!projected) return

        // Draw camera frustum (simplified as a pyramid)
        const size = 20 / Math.max(1, projected.depth / 5)

        ctx.strokeStyle = '#00ff00'
        ctx.lineWidth = 2
        ctx.fillStyle = 'rgba(0, 255, 0, 0.1)'

        // Draw camera body
        ctx.fillRect(projected.x - size/2, projected.y - size/2, size, size)
        ctx.strokeRect(projected.x - size/2, projected.y - size/2, size, size)

        // Draw direction indicator
        ctx.beginPath()
        ctx.moveTo(projected.x, projected.y)
        ctx.lineTo(projected.x, projected.y - size)
        ctx.stroke()

        // Draw image name
        const image = Object.values(images).find(img => img.cameraId === camera.imageId)
        if (image) {
          ctx.fillStyle = '#00ff00'
          ctx.font = '10px Arial'
          ctx.textAlign = 'center'
          ctx.fillText(image.name, projected.x, projected.y + size + 15)
        }
      })
    }

    // Draw coordinate axes
    const axisLength = 50
    const origin = project3DTo2D([0, 0, 0])
    if (origin) {
      // X axis (red)
      const xAxis = project3DTo2D([axisLength, 0, 0])
      if (xAxis) {
        ctx.strokeStyle = '#ff0000'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(origin.x, origin.y)
        ctx.lineTo(xAxis.x, xAxis.y)
        ctx.stroke()
        ctx.fillStyle = '#ff0000'
        ctx.font = '12px Arial'
        ctx.fillText('X', xAxis.x + 5, xAxis.y)
      }

      // Y axis (green)
      const yAxis = project3DTo2D([0, axisLength, 0])
      if (yAxis) {
        ctx.strokeStyle = '#00ff00'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(origin.x, origin.y)
        ctx.lineTo(yAxis.x, yAxis.y)
        ctx.stroke()
        ctx.fillStyle = '#00ff00'
        ctx.font = '12px Arial'
        ctx.fillText('Y', yAxis.x + 5, yAxis.y)
      }

      // Z axis (blue)
      const zAxis = project3DTo2D([0, 0, axisLength])
      if (zAxis) {
        ctx.strokeStyle = '#0000ff'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(origin.x, origin.y)
        ctx.lineTo(zAxis.x, zAxis.y)
        ctx.stroke()
        ctx.fillStyle = '#0000ff'
        ctx.font = '12px Arial'
        ctx.fillText('Z', zAxis.x + 5, zAxis.y)
      }
    }

    // Draw grid (on XZ plane)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    for (let i = -5; i <= 5; i++) {
      // Lines parallel to X axis
      const start = project3DTo2D([i * 10, 0, -50])
      const end = project3DTo2D([i * 10, 0, 50])
      if (start && end) {
        ctx.beginPath()
        ctx.moveTo(start.x, start.y)
        ctx.lineTo(end.x, end.y)
        ctx.stroke()
      }

      // Lines parallel to Z axis
      const start2 = project3DTo2D([-50, 0, i * 10])
      const end2 = project3DTo2D([50, 0, i * 10])
      if (start2 && end2) {
        ctx.beginPath()
        ctx.moveTo(start2.x, start2.y)
        ctx.lineTo(end2.x, end2.y)
        ctx.stroke()
      }
    }
  }, [viewState, pointCloud, renderMode, selectedPointIds, worldPoints, images])

  // Handle mouse interactions
  const handleMouseDown = (event: React.MouseEvent) => {
    setIsDragging(true)
    setLastMousePos({ x: event.clientX, y: event.clientY })
  }

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!isDragging) return

    const deltaX = event.clientX - lastMousePos.x
    const deltaY = event.clientY - lastMousePos.y

    if (event.buttons === 1) { // Left mouse button - rotate
      setViewState(prev => ({
        ...prev,
        rotation: {
          x: prev.rotation.x + deltaY * 0.01,
          y: prev.rotation.y + deltaX * 0.01,
          z: prev.rotation.z
        }
      }))
    } else if (event.buttons === 2) { // Right mouse button - pan
      setViewState(prev => ({
        ...prev,
        translation: {
          x: prev.translation.x + deltaX * 0.01,
          y: prev.translation.y - deltaY * 0.01,
          z: prev.translation.z
        }
      }))
    }

    setLastMousePos({ x: event.clientX, y: event.clientY })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleWheel = (event: React.WheelEvent) => {
    event.preventDefault()
    const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1
    setViewState(prev => ({
      ...prev,
      scale: Math.max(0.1, Math.min(5, prev.scale * scaleFactor))
    }))
  }

  const resetView = () => {
    setViewState({
      rotation: { x: 0, y: 0, z: 0 },
      translation: { x: 0, y: 0, z: -5 },
      scale: 1
    })
  }

  // Render on every frame
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Set canvas size
    const resizeCanvas = () => {
      const container = canvas.parentElement
      if (container) {
        canvas.width = container.clientWidth
        canvas.height = container.clientHeight
      }
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    const animate = () => {
      render()
      requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [render])

  return (
    <div className="viewer-3d">
      <div className="viewer-3d-controls">
        <div className="render-mode-controls">
          <label>View:</label>
          <select
            value={renderMode}
            onChange={(e) => setRenderMode(e.target.value as any)}
          >
            <option value="both">Points & Cameras</option>
            <option value="points">Points Only</option>
            <option value="cameras">Cameras Only</option>
          </select>
        </div>
        <button onClick={resetView} className="btn-reset-view">
          Reset View
        </button>
        <div className="view-stats">
          <span>{pointCloud.points.length} points</span>
          <span>{pointCloud.cameras.length} cameras</span>
        </div>
      </div>

      <div className="viewer-3d-canvas-container">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        />

        <div className="viewer-3d-instructions">
          <div>Left click + drag: Rotate</div>
          <div>Right click + drag: Pan</div>
          <div>Mouse wheel: Zoom</div>
        </div>
      </div>
    </div>
  )
}

// Helper function to convert hex color to RGB
function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [255, 107, 107]
}

export default Viewer3D