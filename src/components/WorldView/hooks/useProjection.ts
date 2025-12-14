// 3D to 2D projection hook
// Based on standard pinhole camera model: https://web.stanford.edu/class/cs231a/course_notes/01-camera-models.pdf

import { useCallback } from 'react'
import type { ViewMatrix, ProjectedPoint } from '../types'

// Rotate point by quaternion: v' = q * v * q^-1
function rotateByQuaternion(point: [number, number, number], q: [number, number, number, number]): [number, number, number] {
  const [qw, qx, qy, qz] = q
  const [x, y, z] = point

  // Quaternion rotation formula (optimized)
  const tx = 2 * (qy * z - qz * y)
  const ty = 2 * (qz * x - qx * z)
  const tz = 2 * (qx * y - qy * x)

  return [
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx)
  ]
}

export function useProjection(canvasRef: React.RefObject<HTMLCanvasElement>, viewMatrix: ViewMatrix) {
  const project3DTo2D = useCallback((point: [number, number, number]): ProjectedPoint => {
    const [x, y, z] = point
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const {
      rotation,
      scale,
      translation,
      cameraPosition,
      cameraQuaternion,
      focalLength,
      principalPoint,
      aspectRatio,
      skew,
      isZReflected
    } = viewMatrix

    // If we have camera quaternion, use proper pinhole camera projection
    if (cameraQuaternion && cameraPosition && focalLength) {
      // Step 1: Translate to camera-relative coordinates
      const px = x - cameraPosition[0]
      const py = y - cameraPosition[1]
      const pz = z - cameraPosition[2]

      // Step 2: Rotate into camera frame (quaternion already stores world→camera rotation)
      const [camX, camY, camZ] = rotateByQuaternion([px, py, pz], cameraQuaternion)

      // Step 3: Perspective projection (pinhole camera model)
      // After Z-reflection + Rz_180, cam' = -cam, so points in front have camZ < 0
      const isInFront = isZReflected ? (camZ < -0.01) : (camZ > 0.01)
      if (isInFront) {
        // Principal point + translation for pan support
        const cx = (principalPoint?.[0] ?? canvas.width / 2) + translation.x
        const cy = (principalPoint?.[1] ?? canvas.height / 2) + translation.y

        // Apply scale to focal length for zoom support
        const scaledFx = focalLength * (scale / 100)
        const scaledFy = scaledFx * (aspectRatio ?? 1)
        const skewCoeff = skew ?? 0

        // x = fx * X/Z + s * Y/Z + cx, y = fy * Y/Z + cy
        // Note: Y is flipped for screen coordinates
        const screenX = scaledFx * (camX / camZ) + skewCoeff * (camY / camZ) + cx
        const screenY = cy - scaledFy * (camY / camZ)

        return { x: screenX, y: screenY, depth: camZ }
      } else {
        // Behind camera - return off-screen
        return { x: -1000, y: -1000, depth: camZ }
      }
    }

    // Fallback: Orthographic projection with euler angles
    const cos = Math.cos
    const sin = Math.sin

    // Apply rotation: first X (pitch), then Y (yaw), then Z (roll)
    let rotX = x
    let rotY = y * cos(rotation.x) - z * sin(rotation.x)
    let rotZ = y * sin(rotation.x) + z * cos(rotation.x)

    let rotX2 = rotX * cos(rotation.y) + rotZ * sin(rotation.y)
    let rotY2 = rotY
    let rotZ2 = -rotX * sin(rotation.y) + rotZ * cos(rotation.y)

    let rotX3 = rotX2 * cos(rotation.z) - rotY2 * sin(rotation.z)
    let rotY3 = rotX2 * sin(rotation.z) + rotY2 * cos(rotation.z)

    const screenX = canvas.width / 2 + (rotX3 * scale) + translation.x
    const screenY = canvas.height / 2 - (rotY3 * scale) + translation.y

    return { x: screenX, y: screenY, depth: rotZ2 }
  }, [canvasRef, viewMatrix])

  return { project3DTo2D }
}
