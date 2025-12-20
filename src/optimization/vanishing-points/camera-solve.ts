import { WorldPoint } from '../../entities/world-point'
import { normalize, solveLinearSystem3x3 } from './math-utils'

/**
 * Check if a world point is in front of the camera (positive Z in camera space)
 */
export function isPointInFrontOfCamera(
  worldPoint: [number, number, number],
  cameraPosition: [number, number, number],
  rotation: [number, number, number, number]
): boolean {

  const [qw, qx, qy, qz] = rotation
  // Third row of rotation matrix (camera Z axis in world coordinates)
  const R2 = [
    2 * (qx * qz - qw * qy),
    2 * (qy * qz + qw * qx),
    1 - 2 * (qx * qx + qy * qy)
  ]

  const dx = worldPoint[0] - cameraPosition[0]
  const dy = worldPoint[1] - cameraPosition[1]
  const dz = worldPoint[2] - cameraPosition[2]

  const camZ = R2[0] * dx + R2[1] * dy + R2[2] * dz
  return camZ > 0
}

/**
 * Compute camera position from rotation and locked world points
 */
export function computeCameraPosition(
  rotation: [number, number, number, number],
  focalLength: number,
  principalPoint: { u: number; v: number },
  lockedPoints: Array<{
    worldPoint: WorldPoint
    imagePoint: { u: number; v: number }
    effectiveXyz: [number, number, number]
  }>
): [number, number, number] | null {
  if (lockedPoints.length < 1) {
    return null
  }

  // Special case: 1 locked point - place camera along ray at default distance
  if (lockedPoints.length === 1) {
    const { effectiveXyz, imagePoint } = lockedPoints[0]
    const P = effectiveXyz

    // Compute ray direction from image point
    const u_norm = (imagePoint.u - principalPoint.u) / focalLength
    const v_norm = (principalPoint.v - imagePoint.v) / focalLength
    const ray_cam = normalize([u_norm, v_norm, 1])

    // Transform ray to world coordinates using R^T
    const qw = rotation[0], qx = rotation[1], qy = rotation[2], qz = rotation[3]
    const Rt = [
      [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qw * qz), 2 * (qx * qz - qw * qy)],
      [2 * (qx * qy - qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qw * qx)],
      [2 * (qx * qz + qw * qy), 2 * (qy * qz - qw * qx), 1 - 2 * (qx * qx + qy * qy)]
    ]
    const ray_world = normalize([
      Rt[0][0] * ray_cam[0] + Rt[0][1] * ray_cam[1] + Rt[0][2] * ray_cam[2],
      Rt[1][0] * ray_cam[0] + Rt[1][1] * ray_cam[1] + Rt[1][2] * ray_cam[2],
      Rt[2][0] * ray_cam[0] + Rt[2][1] * ray_cam[1] + Rt[2][2] * ray_cam[2]
    ])

    // Default distance - will be refined by optimizer
    const defaultDistance = 50

    // Camera is at P - distance * ray_direction (camera looks along +Z in camera space)
    return [
      P[0] - defaultDistance * ray_world[0],
      P[1] - defaultDistance * ray_world[1],
      P[2] - defaultDistance * ray_world[2]
    ]
  }

  const qw = rotation[0]
  const qx = rotation[1]
  const qy = rotation[2]
  const qz = rotation[3]

  let R = [
    [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qw * qz), 2 * (qx * qz + qw * qy)],
    [2 * (qx * qy + qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qw * qx)],
    [2 * (qx * qz - qw * qy), 2 * (qy * qz + qw * qx), 1 - 2 * (qx * qx + qy * qy)]
  ]

  const Rt = [
    [R[0][0], R[1][0], R[2][0]],
    [R[0][1], R[1][1], R[2][1]],
    [R[0][2], R[1][2], R[2][2]]
  ]

  const A = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ]
  const b = [0, 0, 0]

  let validLines = 0

  lockedPoints.forEach(({ effectiveXyz, imagePoint }) => {
    const P = [effectiveXyz[0], effectiveXyz[1], effectiveXyz[2]]

    const u_norm = (imagePoint.u - principalPoint.u) / focalLength
    const v_norm = (principalPoint.v - imagePoint.v) / focalLength

    const ray_cam = normalize([u_norm, v_norm, 1])
    const ray_world = normalize([
      Rt[0][0] * ray_cam[0] + Rt[0][1] * ray_cam[1] + Rt[0][2] * ray_cam[2],
      Rt[1][0] * ray_cam[0] + Rt[1][1] * ray_cam[1] + Rt[1][2] * ray_cam[2],
      Rt[2][0] * ray_cam[0] + Rt[2][1] * ray_cam[1] + Rt[2][2] * ray_cam[2]
    ])

    if (
      !isFinite(ray_world[0]) ||
      !isFinite(ray_world[1]) ||
      !isFinite(ray_world[2])
    ) {
      return
    }

    validLines++

    const Ix = 1 - ray_world[0] * ray_world[0]
    const Iy = 1 - ray_world[1] * ray_world[1]
    const Iz = 1 - ray_world[2] * ray_world[2]
    const xy = -ray_world[0] * ray_world[1]
    const xz = -ray_world[0] * ray_world[2]
    const yz = -ray_world[1] * ray_world[2]

    const Ai = [
      [Ix, xy, xz],
      [xy, Iy, yz],
      [xz, yz, Iz]
    ]

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        A[i][j] += Ai[i][j]
      }
      b[i] += Ai[i][0] * P[0] + Ai[i][1] * P[1] + Ai[i][2] * P[2]
    }
  })

  if (validLines < 2) {
    return null
  }

  const C = solveLinearSystem3x3(A, b)
  if (!C) {
    return null
  }

  return [C[0], C[1], C[2]]
}

/**
 * Refine camera translation using iterative optimization
 */
export function refineTranslation(
  initialPosition: [number, number, number],
  rotationMatrix: number[][],
  focalLength: number,
  principalPoint: { u: number; v: number },
  points: Array<{
    effectiveXyz: [number, number, number]
    imagePoint: { u: number; v: number }
  }>
): [number, number, number] {
  let position: [number, number, number] = [...initialPosition] as [number, number, number]

  const maxIterations = 10

  for (let iter = 0; iter < maxIterations; iter++) {
    const JTJ = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ]
    const JTr = [0, 0, 0]
    let usedPoints = 0

    for (const { effectiveXyz, imagePoint } of points) {
      const rel = [
        effectiveXyz[0] - position[0],
        effectiveXyz[1] - position[1],
        effectiveXyz[2] - position[2]
      ]
      const cam = [
        rotationMatrix[0][0] * rel[0] + rotationMatrix[0][1] * rel[1] + rotationMatrix[0][2] * rel[2],
        rotationMatrix[1][0] * rel[0] + rotationMatrix[1][1] * rel[1] + rotationMatrix[1][2] * rel[2],
        rotationMatrix[2][0] * rel[0] + rotationMatrix[2][1] * rel[1] + rotationMatrix[2][2] * rel[2]
      ]

      if (cam[2] <= 1e-6) {
        continue
      }

      usedPoints++

      const projU = principalPoint.u + focalLength * (cam[0] / cam[2])
      const projV = principalPoint.v - focalLength * (cam[1] / cam[2])
      const ru = projU - imagePoint.u
      const rv = projV - imagePoint.v

      const invZ = 1 / cam[2]
      const invZ2 = invZ * invZ

      const dCam0 = [-rotationMatrix[0][0], -rotationMatrix[0][1], -rotationMatrix[0][2]]
      const dCam1 = [-rotationMatrix[1][0], -rotationMatrix[1][1], -rotationMatrix[1][2]]
      const dCam2 = [-rotationMatrix[2][0], -rotationMatrix[2][1], -rotationMatrix[2][2]]

      const du: number[] = []
      const dv: number[] = []

      for (let j = 0; j < 3; j++) {
        du[j] = focalLength * ((dCam0[j] * cam[2] - cam[0] * dCam2[j]) * invZ2)
        dv[j] = -focalLength * ((dCam1[j] * cam[2] - cam[1] * dCam2[j]) * invZ2)
      }

      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          JTJ[r][c] += du[r] * du[c] + dv[r] * dv[c]
        }
        JTr[r] += du[r] * ru + dv[r] * rv
      }
    }

    if (usedPoints < 2) {
      break
    }

    const delta = solveLinearSystem3x3(JTJ, JTr)
    if (!delta) {
      break
    }

    position = [
      position[0] - delta[0],
      position[1] - delta[1],
      position[2] - delta[2]
    ]

    const deltaNorm = Math.sqrt(delta[0] * delta[0] + delta[1] * delta[1] + delta[2] * delta[2])
    if (deltaNorm < 1e-4) {
      break
    }
  }

  return position
}
