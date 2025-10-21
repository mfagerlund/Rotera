// 3D to 2D projection hook

import { useCallback } from 'react'
import type { ViewMatrix, ProjectedPoint } from '../types'

export function useProjection(canvasRef: React.RefObject<HTMLCanvasElement>, viewMatrix: ViewMatrix) {
  const project3DTo2D = useCallback((point: [number, number, number]): ProjectedPoint => {
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
  }, [canvasRef, viewMatrix])

  return { project3DTo2D }
}
