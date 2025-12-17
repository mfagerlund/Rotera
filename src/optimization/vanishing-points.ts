// Debug flag - set to true to enable verbose VP sign debug output
const VP_SIGN_DEBUG = false

/**
 * Vanishing Point Camera Initialization
 *
 * HOW VP INITIALIZATION WORKS:
 *
 * 1. Vanishing points (VPs) define axis DIRECTIONS but have sign ambiguity.
 *    A VP is where parallel lines converge at infinity - but lines extend in
 *    BOTH directions (+/-). The VP tells us the LINE direction, not which end
 *    is "positive".
 *
 * 2. The code computes 3D directions TO the VPs: [u/f, -v/f, 1]
 *    The -v converts from image coords (+v = down) to camera coords (+Y = up).
 *
 * 3. A rotation matrix R is built from these directions, where columns represent
 *    where world +X, +Y, +Z axes point in camera space.
 *
 * 4. The code tests all 4 valid rotational sign combinations:
 *    - [F,F,F]: (+X, +Y, +Z) toward VPs
 *    - [T,T,F]: (+X, +Y toward OPPOSITE of VPs, +Z toward VP)
 *    - [T,F,T]: similar combinations
 *    - [F,T,T]: similar combinations
 *
 *    These cover all 4 rotational orientations. Odd flips (1 or 3) would create
 *    reflections, which quaternions cannot represent.
 *
 * 5. Additionally, when Y is from a VP (not derived), the code now also tests
 *    an alternate rotation with Y flipped (and X flipped to maintain rotation).
 *
 * 6. For each orientation, camera position is computed and reprojection error
 *    measured against LOCKED world points. The orientation with lowest error wins.
 *
 * DETERMINING COORDINATE SIGNS:
 *
 * The VP geometry alone CANNOT determine which direction is "+X", "+Y", or "+Z".
 * The sign is determined by LOCKED POINTS:
 *
 * - If you lock a point at Y=+10, you're saying "+Y is in this direction"
 * - The code tests orientations and finds one where that point reprojects correctly
 * - If Y=+10 gives high error but Y=-10 gives low error, it means the physical
 *   point is actually in the -Y direction from the origin
 *
 * RIGHT-HAND RULE:
 *
 * Pointing your fingers at VPs does NOT determine sign! VPs represent where
 * parallel lines converge at infinity - they don't specify which direction
 * along that line is "positive".
 *
 * To set up a right-handed coordinate system:
 * 1. Place origin (O) at a known physical location
 * 2. Place +X point in the desired positive X direction from O
 * 3. Place +Y point in the desired positive Y direction from O
 * 4. Place +Z point in the desired positive Z direction from O
 * 5. Lock these points with positive coordinates
 *
 * The VP orientations will be resolved to match your locked points.
 *
 * TROUBLESHOOTING:
 *
 * If positive coordinates don't work, it likely means:
 * - The physical point is placed in the negative direction from origin
 * - Try locking with negative coordinates instead
 * - OR move the physical point to the other side of the origin
 */

import { VanishingLine, VanishingLineAxis } from '../entities/vanishing-line'
import { Viewpoint } from '../entities/viewpoint'
import { WorldPoint } from '../entities/world-point'
import { Line, LineDirection } from '../entities/line'
import { Quaternion } from './Quaternion'
import { log, logOnce } from './optimization-logger'
import { viewpointInitialVps } from './optimize-project'

/**
 * Maps Line direction constraints to vanishing point axes.
 * Only axis-aligned directions (x, y, z) map to a single vanishing point.
 * Plane-constrained directions (xy, xz, yz) don't map to a single axis.
 */
function lineDirectionToVPAxis(direction: LineDirection): VanishingLineAxis | null {
  switch (direction) {
    case 'x': return 'x'
    case 'y': return 'y'
    case 'z': return 'z'
    // Plane constraints don't map to a single vanishing point
    case 'xy': return null
    case 'xz': return null
    case 'yz': return null
    case 'free': return null
    default: return null
  }
}

/**
 * Finds ImagePoint for a WorldPoint in a specific Viewpoint.
 */
function findImagePointInViewpoint(
  worldPoint: WorldPoint,
  viewpoint: Viewpoint
): { u: number; v: number } | null {
  for (const ip of worldPoint.imagePoints) {
    if (ip.viewpoint === viewpoint) {
      return { u: ip.u, v: ip.v }
    }
  }
  return null
}

/**
 * Generic line type for VP calculations - just needs p1 and p2 coordinates.
 */
export interface VPLineData {
  p1: { u: number; v: number }
  p2: { u: number; v: number }
}

/**
 * Collects direction-constrained Lines visible in a viewpoint as virtual vanishing lines.
 * A Line is "visible" if both endpoints have ImagePoints in the viewpoint.
 */
export function collectDirectionConstrainedLines(
  viewpoint: Viewpoint
): { axis: VanishingLineAxis; p1: { u: number; v: number }; p2: { u: number; v: number } }[] {
  const virtualLines: { axis: VanishingLineAxis; p1: { u: number; v: number }; p2: { u: number; v: number } }[] = []
  const processedLines = new Set<Line>()

  // Iterate through all imagePoints in this viewpoint
  for (const imagePoint of viewpoint.imagePoints) {
    const worldPoint = imagePoint.worldPoint as WorldPoint

    // Check each line connected to this world point
    for (const iline of worldPoint.connectedLines) {
      const line = iline as Line

      // Skip if already processed or no direction constraint
      if (processedLines.has(line)) continue
      processedLines.add(line)

      const axis = lineDirectionToVPAxis(line.direction)
      if (!axis) continue

      // Find image points for both endpoints
      const p1 = findImagePointInViewpoint(line.pointA as WorldPoint, viewpoint)
      const p2 = findImagePointInViewpoint(line.pointB as WorldPoint, viewpoint)

      if (p1 && p2) {
        virtualLines.push({ axis, p1, p2 })
      }
    }
  }

  return virtualLines
}

export interface VanishingPoint {
  u: number
  v: number
  axis: VanishingLineAxis
}

export interface LineQualityIssue {
  type: 'warning' | 'error'
  message: string
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  vanishingPoints?: {
    x?: VanishingPoint
    y?: VanishingPoint
    z?: VanishingPoint
  }
  anglesBetweenVPs?: {
    xy?: number
    xz?: number
    yz?: number
  }
}

/**
 * Check if a world point is in front of the camera (positive Z in camera space)
 */
function isPointInFrontOfCamera(
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
 * Flip rotation matrix axes by applying sign changes, then convert back to quaternion
 */
function flipRotationAxes(
  rotation: [number, number, number, number],
  flipX: boolean,
  flipY: boolean,
  flipZ: boolean
): [number, number, number, number] {
  const [qw, qx, qy, qz] = rotation

  // Build rotation matrix
  const R = [
    [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qw * qz), 2 * (qx * qz + qw * qy)],
    [2 * (qx * qy + qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qw * qx)],
    [2 * (qx * qz - qw * qy), 2 * (qy * qz + qw * qx), 1 - 2 * (qx * qx + qy * qy)]
  ]

  // Flip columns (which represent world axes in camera frame)
  if (flipX) {
    R[0][0] = -R[0][0]; R[1][0] = -R[1][0]; R[2][0] = -R[2][0]
  }
  if (flipY) {
    R[0][1] = -R[0][1]; R[1][1] = -R[1][1]; R[2][1] = -R[2][1]
  }
  if (flipZ) {
    R[0][2] = -R[0][2]; R[1][2] = -R[1][2]; R[2][2] = -R[2][2]
  }

  // Convert back to quaternion
  const trace = R[0][0] + R[1][1] + R[2][2]
  let w: number, x: number, y: number, z: number

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0)
    w = 0.25 / s
    x = (R[2][1] - R[1][2]) * s
    y = (R[0][2] - R[2][0]) * s
    z = (R[1][0] - R[0][1]) * s
  } else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
    const s = 2.0 * Math.sqrt(1.0 + R[0][0] - R[1][1] - R[2][2])
    w = (R[2][1] - R[1][2]) / s
    x = 0.25 * s
    y = (R[0][1] + R[1][0]) / s
    z = (R[0][2] + R[2][0]) / s
  } else if (R[1][1] > R[2][2]) {
    const s = 2.0 * Math.sqrt(1.0 + R[1][1] - R[0][0] - R[2][2])
    w = (R[0][2] - R[2][0]) / s
    x = (R[0][1] + R[1][0]) / s
    y = 0.25 * s
    z = (R[1][2] + R[2][1]) / s
  } else {
    const s = 2.0 * Math.sqrt(1.0 + R[2][2] - R[0][0] - R[1][1])
    w = (R[1][0] - R[0][1]) / s
    x = (R[0][2] + R[2][0]) / s
    y = (R[1][2] + R[2][1]) / s
    z = 0.25 * s
  }

  const mag = Math.sqrt(w * w + x * x + y * y + z * z)
  return [w / mag, x / mag, y / mag, z / mag]
}

export function computeVanishingPoint(
  lines: Array<{ p1: { u: number; v: number }; p2: { u: number; v: number } }>
): { u: number; v: number } | null {
  if (lines.length < 2) {
    return null
  }

  const homogeneousLines: Array<[number, number, number]> = lines.map(line => {
    const p1 = [line.p1.u, line.p1.v, 1]
    const p2 = [line.p2.u, line.p2.v, 1]

    const a = p1[1] * p2[2] - p1[2] * p2[1]
    const b = p1[2] * p2[0] - p1[0] * p2[2]
    const c = p1[0] * p2[1] - p1[1] * p2[0]

    return [a, b, c]
  })

  if (lines.length === 2) {
    const l1 = homogeneousLines[0]
    const l2 = homogeneousLines[1]

    const vp_x = l1[1] * l2[2] - l1[2] * l2[1]
    const vp_y = l1[2] * l2[0] - l1[0] * l2[2]
    const vp_w = l1[0] * l2[1] - l1[1] * l2[0]

    if (Math.abs(vp_w) < 1e-10) {
      return null
    }

    return {
      u: vp_x / vp_w,
      v: vp_y / vp_w
    }
  }

  const A: number[][] = homogeneousLines.map(l => [l[0], l[1], l[2]])

  const svdResult = simpleSVD(A)
  if (!svdResult) {
    return null
  }

  const vp = svdResult.V[2]

  if (Math.abs(vp[2]) < 1e-10) {
    return null
  }

  const result = {
    u: vp[0] / vp[2],
    v: vp[1] / vp[2]
  }

  if (Math.abs(result.u) > 10000 || Math.abs(result.v) > 10000) {
    logOnce(`[VP] WARNING: VP very far from origin (u=${result.u.toFixed(0)}, v=${result.v.toFixed(0)})`)
  }

  return result
}

function simpleSVD(A: number[][]): { V: number[][] } | null {
  const m = A.length
  const n = A[0].length

  const AtA: number[][] = Array(n).fill(0).map(() => Array(n).fill(0))

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0
      for (let k = 0; k < m; k++) {
        sum += A[k][i] * A[k][j]
      }
      AtA[i][j] = sum
    }
  }

  const eigResult = inversePowerIteration(AtA, 100)
  if (!eigResult) {
    return null
  }

  return { V: [[0, 0, 1], [0, 1, 0], eigResult.vector] }
}

function inversePowerIteration(A: number[][], maxIter: number): { vector: number[] } | null {
  const n = A.length

  const shift = 1e-6
  const AShifted: number[][] = Array(n).fill(0).map((_, i) =>
    Array(n).fill(0).map((_, j) =>
      i === j ? A[i][j] + shift : A[i][j]
    )
  )

  let v = Array(n).fill(1 / Math.sqrt(n))

  for (let iter = 0; iter < maxIter; iter++) {
    const y = solveLinearSystem(AShifted, v)
    if (!y) {
      return null
    }

    const norm = Math.sqrt(y.reduce((sum, x) => sum + x * x, 0))
    if (norm < 1e-10) {
      return null
    }

    v = y.map(x => x / norm)
  }

  return { vector: v }
}

function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length
  const aug: number[][] = A.map((row, i) => [...row, b[i]])

  for (let i = 0; i < n; i++) {
    let maxRow = i
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) {
        maxRow = k
      }
    }

    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]]

    if (Math.abs(aug[i][i]) < 1e-10) {
      return null
    }

    for (let k = i + 1; k < n; k++) {
      const factor = aug[k][i] / aug[i][i]
      for (let j = i; j <= n; j++) {
        aug[k][j] -= factor * aug[i][j]
      }
    }
  }

  const x = Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n]
    for (let j = i + 1; j < n; j++) {
      x[i] -= aug[i][j] * x[j]
    }
    x[i] /= aug[i][i]
  }

  return x
}

function powerIteration(A: number[][], maxIter: number): { vector: number[] } | null {
  const n = A.length
  let v = Array(n).fill(1 / Math.sqrt(n))

  for (let iter = 0; iter < maxIter; iter++) {
    const Av = Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        Av[i] += A[i][j] * v[j]
      }
    }

    const norm = Math.sqrt(Av.reduce((sum, x) => sum + x * x, 0))
    if (norm < 1e-10) {
      return null
    }

    v = Av.map(x => x / norm)
  }

  return { vector: v }
}

export function computeAngleBetweenVPs(
  vp1: { u: number; v: number },
  vp2: { u: number; v: number },
  principalPoint: { u: number; v: number }
): number {
  const d1_u = vp1.u - principalPoint.u
  const d1_v = vp1.v - principalPoint.v
  const d2_u = vp2.u - principalPoint.u
  const d2_v = vp2.v - principalPoint.v

  const dot = d1_u * d2_u + d1_v * d2_v
  const norm1 = Math.sqrt(d1_u * d1_u + d1_v * d1_v)
  const norm2 = Math.sqrt(d2_u * d2_u + d2_v * d2_v)

  if (norm1 < 1e-10 || norm2 < 1e-10) {
    return 0
  }

  const cosAngle = dot / (norm1 * norm2)
  const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle)))
  const angleDeg = (angleRad * 180) / Math.PI

  return angleDeg
}

export function validateVanishingPoints(viewpoint: Viewpoint): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const vanishingPoints: {
    x?: VanishingPoint
    y?: VanishingPoint
    z?: VanishingPoint
  } = {}

  // Use a generic type that works for both explicit VanishingLines and virtual lines from direction constraints
  type VPLineData = { p1: { u: number; v: number }; p2: { u: number; v: number } }
  const linesByAxis: Record<VanishingLineAxis, VPLineData[]> = {
    x: [],
    y: [],
    z: []
  }

  // 1. Collect explicit VanishingLines
  Array.from(viewpoint.vanishingLines).forEach(line => {
    linesByAxis[line.axis].push(line)
  })

  // 2. Collect direction-constrained Lines as virtual vanishing lines
  const virtualLines = collectDirectionConstrainedLines(viewpoint)
  let virtualLineCount = 0
  virtualLines.forEach(vl => {
    linesByAxis[vl.axis].push(vl)
    virtualLineCount++
  })

  if (virtualLineCount > 0) {
    log(`[validateVanishingPoints] Added ${virtualLineCount} virtual VP lines from direction-constrained Lines`)
  }

  const axes: VanishingLineAxis[] = ['x', 'y', 'z']
  axes.forEach(axis => {
    const axisLines = linesByAxis[axis]
    if (axisLines.length === 0) {
      return
    }

    if (axisLines.length === 1) {
      warnings.push(`${axis.toUpperCase()}-axis has only 1 line (need 2+ for vanishing point)`)
      return
    }

    const vp = computeVanishingPoint(axisLines)
    if (!vp) {
      errors.push(`${axis.toUpperCase()}-axis lines do not converge to a valid vanishing point`)
      return
    }

    vanishingPoints[axis] = { u: vp.u, v: vp.v, axis }
  })

  const vpCount = Object.keys(vanishingPoints).length
  if (vpCount < 2) {
    errors.push(`Need at least 2 vanishing points (have ${vpCount})`)
  }

  const anglesBetweenVPs: {
    xy?: number
    xz?: number
    yz?: number
  } = {}

  const principalPoint = {
    u: viewpoint.principalPointX,
    v: viewpoint.principalPointY
  }

  if (vanishingPoints.x && vanishingPoints.y) {
    const angle = computeAngleBetweenVPs(vanishingPoints.x, vanishingPoints.y, principalPoint)
    anglesBetweenVPs.xy = angle

    if (angle < 85 || angle > 95) {
      warnings.push(
        `X-Y vanishing points not perpendicular (${angle.toFixed(1)}°, expected ~90°)`
      )
    }
  }

  if (vanishingPoints.x && vanishingPoints.z) {
    const angle = computeAngleBetweenVPs(vanishingPoints.x, vanishingPoints.z, principalPoint)
    anglesBetweenVPs.xz = angle

    if (angle < 85 || angle > 95) {
      warnings.push(
        `X-Z vanishing points not perpendicular (${angle.toFixed(1)}°, expected ~90°)`
      )
    }
  }

  if (vanishingPoints.y && vanishingPoints.z) {
    const angle = computeAngleBetweenVPs(vanishingPoints.y, vanishingPoints.z, principalPoint)
    anglesBetweenVPs.yz = angle

    if (angle < 85 || angle > 95) {
      warnings.push(
        `Y-Z vanishing points not perpendicular (${angle.toFixed(1)}°, expected ~90°)`
      )
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    vanishingPoints,
    anglesBetweenVPs
  }
}

export function canInitializeWithVanishingPoints(
  viewpoint: Viewpoint,
  worldPoints: Set<WorldPoint>,
  options: { allowSinglePoint?: boolean } = {}
): boolean {
  const { allowSinglePoint = false } = options

  const validation = validateVanishingPoints(viewpoint)
  if (!validation.isValid) {
    return false
  }

  const vpCount = Object.keys(validation.vanishingPoints || {}).length
  if (vpCount < 2) {
    return false
  }

  // Use fully constrained points (locked OR inferred) for camera position solving
  const fullyConstrainedPoints = Array.from(worldPoints).filter(wp => wp.isFullyConstrained())

  if (fullyConstrainedPoints.length >= 2) {
    return true
  }

  // With 1 constrained point + VPs, we can estimate camera position
  if (allowSinglePoint && fullyConstrainedPoints.length >= 1) {
    return true
  }

  return false
}

export function estimateFocalLength(
  vp1: { u: number; v: number },
  vp2: { u: number; v: number },
  principalPoint: { u: number; v: number }
): number | null {
  const u1 = vp1.u - principalPoint.u
  const v1 = vp1.v - principalPoint.v
  const u2 = vp2.u - principalPoint.u
  const v2 = vp2.v - principalPoint.v

  const discriminant = -(u1 * u2 + v1 * v2)

  if (discriminant < 0) {
    return null
  }

  const f = Math.sqrt(discriminant)
  return f
}

export function estimatePrincipalPoint(
  vanishingPoints: {
    x?: VanishingPoint
    y?: VanishingPoint
    z?: VanishingPoint
  },
  imageWidth: number,
  imageHeight: number
): { u: number; v: number } | null {
  // For most cameras, the principal point is very close to the image center.
  // Estimating PP from vanishing points is unreliable and can produce wildly wrong values.
  //
  // IMPORTANT: We return null here to preserve user-set principal point values.
  // This is critical for cropped images where the principal point is NOT at image center.
  // The Viewpoint already defaults cx/cy to image center when created, so returning
  // null here means we respect either the default or any user-specified values.
  //
  // If reliable PP estimation from 3+ orthogonal VPs is needed in the future,
  // implement it here - but for now, null is the safe choice.
  return null
}

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0))
  if (norm < 1e-10) {
    return v
  }
  return v.map(x => x / norm)
}

function cross(a: number[], b: number[]): number[] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
}

function matrixToQuaternion(R: number[][]): [number, number, number, number] {
  const trace = R[0][0] + R[1][1] + R[2][2]

  let w: number, x: number, y: number, z: number

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0)
    w = 0.25 / s
    x = (R[2][1] - R[1][2]) * s
    y = (R[0][2] - R[2][0]) * s
    z = (R[1][0] - R[0][1]) * s
  } else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
    const s = 2.0 * Math.sqrt(1.0 + R[0][0] - R[1][1] - R[2][2])
    w = (R[2][1] - R[1][2]) / s
    x = 0.25 * s
    y = (R[0][1] + R[1][0]) / s
    z = (R[0][2] + R[2][0]) / s
  } else if (R[1][1] > R[2][2]) {
    const s = 2.0 * Math.sqrt(1.0 + R[1][1] - R[0][0] - R[2][2])
    w = (R[0][2] - R[2][0]) / s
    x = (R[0][1] + R[1][0]) / s
    y = 0.25 * s
    z = (R[1][2] + R[2][1]) / s
  } else {
    const s = 2.0 * Math.sqrt(1.0 + R[2][2] - R[0][0] - R[1][1])
    w = (R[1][0] - R[0][1]) / s
    x = (R[0][2] + R[2][0]) / s
    y = (R[1][2] + R[2][1]) / s
    z = 0.25 * s
  }

  const mag = Math.sqrt(w * w + x * x + y * y + z * z)
  return [w / mag, x / mag, y / mag, z / mag]
}

function quaternionToEulerDegrees(q: [number, number, number, number]): { rollDeg: number; pitchDeg: number; yawDeg: number } {
  const [w, x, y, z] = q

  // Roll (X-axis rotation)
  const sinr_cosp = 2 * (w * x + y * z)
  const cosr_cosp = 1 - 2 * (x * x + y * y)
  const roll = Math.atan2(sinr_cosp, cosr_cosp)

  // Pitch (Y-axis rotation)
  const sinp = 2 * (w * y - z * x)
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp)

  // Yaw (Z-axis rotation)
  const siny_cosp = 2 * (w * z + x * y)
  const cosy_cosp = 1 - 2 * (y * y + z * z)
  const yaw = Math.atan2(siny_cosp, cosy_cosp)

  const toDeg = (rad: number) => rad * 180 / Math.PI
  return { rollDeg: toDeg(roll), pitchDeg: toDeg(pitch), yawDeg: toDeg(yaw) }
}

/**
 * Compute rotation(s) from vanishing points.
 * When Y is derived from X and Z via cross product, returns TWO rotations:
 * one for Y = Z × X and one for Y = X × Z (opposite direction).
 * This allows exploring all 8 valid orientations when combined with even-flip sign combos.
 */
export function computeRotationsFromVPs(
  vanishingPoints: {
    x?: VanishingPoint
    y?: VanishingPoint
    z?: VanishingPoint
  },
  focalLength: number,
  principalPoint: { u: number; v: number }
): Array<[number, number, number, number]> | null {
  const availableAxes = Object.keys(vanishingPoints).filter(
    axis => vanishingPoints[axis as VanishingLineAxis] !== undefined
  ) as VanishingLineAxis[]

  if (availableAxes.length < 2) {
    return null
  }

  const directions: Partial<Record<VanishingLineAxis, number[]>> = {}

  availableAxes.forEach(axis => {
    const vp = vanishingPoints[axis]!
    const u = vp.u - principalPoint.u
    const v = vp.v - principalPoint.v

    const dir = normalize([u / focalLength, -v / focalLength, 1])
    directions[axis] = dir

    // Log which way each axis points in camera space
    const camX = dir[0] > 0 ? 'RIGHT' : 'LEFT'
    const camY = dir[1] > 0 ? 'UP' : 'DOWN'
    log(`[VP Debug] ${axis.toUpperCase()} VP at (${vp.u.toFixed(0)}, ${vp.v.toFixed(0)}) -> direction ${camX}/${camY} in camera [${dir.map(d => d.toFixed(3)).join(', ')}]`)
  })

  let d_x: number[], d_y: number[], d_z: number[]
  let d_y_alt: number[] | null = null  // Alternate Y direction (flipped)
  let derivedYAxis = false  // True when Y is computed from cross product (not from VP)

  if (directions.x && directions.y && directions.z) {
    // All 3 VPs observed - use them directly, but ensure right-handed
    d_x = directions.x
    d_y = directions.y
    d_z = directions.z
    d_y_alt = [-d_y[0], -d_y[1], -d_y[2]]

    log(`[VP Debug] All 3 VPs observed. Initial directions:`)
    log(`[VP Debug]   d_x = [${d_x.map(v => v.toFixed(4)).join(', ')}]`)
    log(`[VP Debug]   d_y = [${d_y.map(v => v.toFixed(4)).join(', ')}]`)
    log(`[VP Debug]   d_z = [${d_z.map(v => v.toFixed(4)).join(', ')}]`)

    // Check if observed directions form right or left-handed system
    const crossXY = cross(d_x, d_y)
    const crossXY_norm = normalize(crossXY)
    const dot = crossXY_norm[0] * d_z[0] + crossXY_norm[1] * d_z[1] + crossXY_norm[2] * d_z[2]
    log(`[VP Debug] X × Y = [${crossXY_norm.map(v => v.toFixed(4)).join(', ')}]`)
    log(`[VP Debug] (X × Y) · Z = ${dot.toFixed(4)} (${dot > 0 ? 'RIGHT-HANDED' : 'LEFT-HANDED'})`)

    // CRITICAL: If left-handed, flip Z to make the base right-handed
    // This ensures all 4 even-flip sign combinations are also right-handed
    if (dot < 0) {
      log(`[VP Debug] Flipping d_z to make base rotation RIGHT-HANDED`)
      d_z = [-d_z[0], -d_z[1], -d_z[2]]
    }
  } else if (directions.x && directions.z && !directions.y) {
    d_x = directions.x
    d_z = directions.z
    d_y = cross(d_z, d_x)  // Y = Z × X (right-hand rule)
    d_y = normalize(d_y)
    // Also compute the opposite direction: Y = X × Z = -(Z × X)
    d_y_alt = cross(d_x, d_z)
    d_y_alt = normalize(d_y_alt)
    derivedYAxis = true
  } else if (directions.x && directions.y) {
    d_x = directions.x
    d_y = directions.y
    d_z = cross(d_x, d_y)
    d_z = normalize(d_z)
    // ALSO compute alternate Y (flipped) - the VP only tells us the LINE, not which end is +Y
    d_y_alt = [-d_y[0], -d_y[1], -d_y[2]]
  } else if (directions.y && directions.z) {
    d_y = directions.y
    d_z = directions.z
    d_x = cross(d_y, d_z)
    d_x = normalize(d_x)
    // ALSO compute alternate Y (flipped) - the VP only tells us the LINE, not which end is +Y
    d_y_alt = [-d_y[0], -d_y[1], -d_y[2]]
  } else {
    return null
  }

  // If all 3 VP directions were observed, check cross product consistency
  if (directions.x && directions.y && directions.z) {
    const expected_z = cross(directions.x, directions.y)
    const expected_z_norm = normalize(expected_z)
    const actual_z = directions.z
    const dot = expected_z_norm[0] * actual_z[0] + expected_z_norm[1] * actual_z[1] + expected_z_norm[2] * actual_z[2]
    log(`[VP Debug] Cross product check: X × Y dot Z = ${dot.toFixed(3)} (should be +1 for right-handed, -1 for left-handed)`)
    if (dot < 0) {
      log(`[VP Debug] WARNING: VP configuration appears LEFT-HANDED! The Z VP is on the opposite side of X×Y.`)
    }
  }

  // NOTE: We do NOT force d_y[1] > 0 here. The sign ambiguity is resolved by
  // trying multiple sign combinations in initializeCameraWithVanishingPoints().
  // Forcing a specific sign here would bias the base rotation and could cause
  // failures when the camera orientation doesn't match the assumption.

  let R = [
    [d_x[0], d_y[0], d_z[0]],
    [d_x[1], d_y[1], d_z[1]],
    [d_x[2], d_y[2], d_z[2]]
  ]

  // Check orthogonality of the basis vectors
  const dot_xy = d_x[0] * d_y[0] + d_x[1] * d_y[1] + d_x[2] * d_y[2]
  const dot_xz = d_x[0] * d_z[0] + d_x[1] * d_z[1] + d_x[2] * d_z[2]
  const dot_yz = d_y[0] * d_z[0] + d_y[1] * d_z[1] + d_y[2] * d_z[2]
  log(`[VP Debug] Orthogonality check: X·Y=${dot_xy.toFixed(3)}, X·Z=${dot_xz.toFixed(3)}, Y·Z=${dot_yz.toFixed(3)} (all should be ~0)`)

  // Save original directions for X-fixed strategy
  const d_x_original = [...d_x] as number[]
  const d_z_original = [...d_z] as number[]

  // If VP directions are not orthogonal, we need to orthogonalize them!
  // This is critical - non-orthogonal directions produce invalid rotation matrices.
  //
  // IMPORTANT: We try BOTH orthogonalization strategies:
  // 1. Keep Z fixed, adjust X (Z is often more reliable for depth)
  // 2. Keep X fixed, adjust Z
  // Then we return BOTH rotations and let the sign combination search find the best one.
  const orthogonalityThreshold = 0.1
  let d_x_orthZ = [...d_x] as number[]  // X orthogonalized against Z (Z kept fixed)
  let d_z_orthX = [...d_z] as number[]  // Z orthogonalized against X (X kept fixed)
  let d_y_orthZ = [...d_y] as number[]
  let d_y_orthX = [...d_y] as number[]
  let didOrthogonalize = false

  // Strategy 3 variables for Procrustes orthogonalization
  let d_x_procrustes = [...d_x] as number[]
  let d_z_procrustes = [...d_z] as number[]
  let d_y_procrustes = [...d_y] as number[]

  if (Math.abs(dot_xz) > orthogonalityThreshold) {
    didOrthogonalize = true
    log(`[VP Debug] WARNING: VP directions are not orthogonal (X·Z=${dot_xz.toFixed(3)})! Trying orthogonalization strategies...`)

    // Strategy 1: Keep Z fixed, orthogonalize X against Z
    const x_proj_z = dot_xz
    d_x_orthZ = normalize([
      d_x_original[0] - x_proj_z * d_z_original[0],
      d_x_original[1] - x_proj_z * d_z_original[1],
      d_x_original[2] - x_proj_z * d_z_original[2]
    ])
    d_y_orthZ = normalize(cross(d_z_original, d_x_orthZ))
    const angle1 = Math.acos(Math.min(1, Math.abs(d_x_original[0]*d_x_orthZ[0] + d_x_original[1]*d_x_orthZ[1] + d_x_original[2]*d_x_orthZ[2]))) * 180/Math.PI
    log(`[VP Debug] Strategy 1 (Z fixed): X moved by ${angle1.toFixed(1)}°`)

    // Strategy 2: Keep X fixed, orthogonalize Z against X
    const z_proj_x = dot_xz
    d_z_orthX = normalize([
      d_z_original[0] - z_proj_x * d_x_original[0],
      d_z_original[1] - z_proj_x * d_x_original[1],
      d_z_original[2] - z_proj_x * d_x_original[2]
    ])
    d_y_orthX = normalize(cross(d_z_orthX, d_x_original))
    const angle2 = Math.acos(Math.min(1, Math.abs(d_z_original[0]*d_z_orthX[0] + d_z_original[1]*d_z_orthX[1] + d_z_original[2]*d_z_orthX[2]))) * 180/Math.PI
    log(`[VP Debug] Strategy 2 (X fixed): Z moved by ${angle2.toFixed(1)}°`)

    // Strategy 3: Procrustes - split the difference equally between X and Z
    // This finds the closest orthogonal pair to the original non-orthogonal pair
    // by rotating both X and Z toward each other by half the angle
    const halfAngle = Math.acos(Math.min(1, Math.abs(dot_xz))) / 2
    // Compute the axis perpendicular to both X and Z
    const perpAxis = normalize(cross(d_x_original, d_z_original))
    // Rotate X toward Z by halfAngle, and Z toward X by halfAngle
    // Using Rodrigues' rotation formula: v_rot = v*cos(θ) + (k×v)*sin(θ) + k*(k·v)*(1-cos(θ))
    const cosHalf = Math.cos(halfAngle)
    const sinHalf = Math.sin(halfAngle)
    // Rotate X toward Z (around perpAxis)
    const kCrossX = cross(perpAxis, d_x_original)
    const kDotX = perpAxis[0]*d_x_original[0] + perpAxis[1]*d_x_original[1] + perpAxis[2]*d_x_original[2]
    d_x_procrustes = normalize([
      d_x_original[0]*cosHalf + kCrossX[0]*sinHalf + perpAxis[0]*kDotX*(1-cosHalf),
      d_x_original[1]*cosHalf + kCrossX[1]*sinHalf + perpAxis[1]*kDotX*(1-cosHalf),
      d_x_original[2]*cosHalf + kCrossX[2]*sinHalf + perpAxis[2]*kDotX*(1-cosHalf)
    ])
    // Rotate Z toward X (around -perpAxis, i.e., opposite direction)
    const kCrossZ = cross(perpAxis, d_z_original)
    const kDotZ = perpAxis[0]*d_z_original[0] + perpAxis[1]*d_z_original[1] + perpAxis[2]*d_z_original[2]
    d_z_procrustes = normalize([
      d_z_original[0]*cosHalf - kCrossZ[0]*sinHalf + perpAxis[0]*kDotZ*(1-cosHalf),
      d_z_original[1]*cosHalf - kCrossZ[1]*sinHalf + perpAxis[1]*kDotZ*(1-cosHalf),
      d_z_original[2]*cosHalf - kCrossZ[2]*sinHalf + perpAxis[2]*kDotZ*(1-cosHalf)
    ])
    d_y_procrustes = normalize(cross(d_z_procrustes, d_x_procrustes))
    const angleX = Math.acos(Math.min(1, Math.abs(d_x_original[0]*d_x_procrustes[0] + d_x_original[1]*d_x_procrustes[1] + d_x_original[2]*d_x_procrustes[2]))) * 180/Math.PI
    const angleZ = Math.acos(Math.min(1, Math.abs(d_z_original[0]*d_z_procrustes[0] + d_z_original[1]*d_z_procrustes[1] + d_z_original[2]*d_z_procrustes[2]))) * 180/Math.PI
    log(`[VP Debug] Strategy 3 (Procrustes): X moved by ${angleX.toFixed(1)}°, Z moved by ${angleZ.toFixed(1)}°`)
  }

  // Use strategy 1 as primary (Z fixed, X adjusted)
  d_x = d_x_orthZ
  d_y = d_y_orthZ
  // d_z stays the same (it was the reference in strategy 1)

  const hasAlternateY = !!d_y_alt

  const computeDet = (dx: number[], dy: number[], dz: number[]) =>
    dx[0] * (dy[1] * dz[2] - dy[2] * dz[1]) -
    dx[1] * (dy[0] * dz[2] - dy[2] * dz[0]) +
    dx[2] * (dy[0] * dz[1] - dy[1] * dz[0])

  type AxisSet = {
    label: string
    d_x: number[]
    d_y: number[]
    d_z: number[]
  }

  const axisSets: AxisSet[] = []

  const addAxisSet = (label: string, dx: number[], dy: number[], dz: number[]) => {
    const det = computeDet(dx, dy, dz)
    log(`[VP Debug] Rotation determinant (${label}): ${det.toFixed(6)} (should be +1 for right-handed)`)
    if (det <= 0) {
      log(`[VP Debug] ${label} is still left-handed - skipping`)
      return
    }
    axisSets.push({ label, d_x: dx, d_y: dy, d_z: dz })
  }

  const det = computeDet(d_x, d_y, d_z)
  if (det > 0) {
    addAxisSet('base', d_x, d_y, d_z)
  } else {
    log('[VP Debug] WARNING: Left-handed coordinate system detected! Trying axis flips...')
    const flipCandidates: Array<{ label: string; d_x: number[]; d_y: number[]; d_z: number[] }> = [
      { label: 'flipX', d_x: [-d_x[0], -d_x[1], -d_x[2]], d_y, d_z },
      { label: 'flipY', d_x, d_y: [-d_y[0], -d_y[1], -d_y[2]], d_z },
      { label: 'flipZ', d_x, d_y, d_z: [-d_z[0], -d_z[1], -d_z[2]] }
    ]

    for (const candidate of flipCandidates) {
      addAxisSet(candidate.label, candidate.d_x, candidate.d_y, candidate.d_z)
    }

    if (axisSets.length === 0) {
      log('[VP Debug] All single-axis flips are invalid - forcing Z flip as fallback')
      addAxisSet('forced-flipZ', d_x, d_y, [-d_z[0], -d_z[1], -d_z[2]])
    }
  }

  // NOTE: Roll correction was removed. It used pre-orthogonalization directions which
  // caused massive errors after orthogonalization changed d_x significantly.
  // The sign combination search handles orientation ambiguity better.

  const rotations: [number, number, number, number][] = []

  for (const { label, d_x: dx, d_y: dy, d_z: dz } of axisSets) {
    const R_candidate = [
      [dx[0], dy[0], dz[0]],
      [dx[1], dy[1], dz[1]],
      [dx[2], dy[2], dz[2]]
    ]
    const quaternion = matrixToQuaternion(R_candidate)

    log(`[VP Debug] Computed rotation matrix from vanishing points (${label}):`)
    log(`[ ${R_candidate[0].map(v => v.toFixed(6)).join(', ')} ]`)
    log(`[ ${R_candidate[1].map(v => v.toFixed(6)).join(', ')} ]`)
    log(`[ ${R_candidate[2].map(v => v.toFixed(6)).join(', ')} ]`)
    log(`[VP Debug] Quaternion (${label}): ${JSON.stringify(quaternion.map(v => Number(v.toFixed(6))))}`)

    rotations.push(quaternion)

    if (hasAlternateY) {
      const dyFlipped = [-dy[0], -dy[1], -dy[2]]
      const R_alt = [
        [-dx[0], dyFlipped[0], dz[0]],
        [-dx[1], dyFlipped[1], dz[1]],
        [-dx[2], dyFlipped[2], dz[2]]
      ]
      const quaternion_alt = matrixToQuaternion(R_alt)
      rotations.push(quaternion_alt)
      log(`[VP Debug] Added alternate rotation with flipped Y and X (${label})`)
    }
  }

  // If we orthogonalized, also try the X-fixed and Procrustes strategies
  if (didOrthogonalize) {
    // Strategy 2: X fixed, Z adjusted (using original X)
    const R_xfixed = [
      [d_x_original[0], d_y_orthX[0], d_z_orthX[0]],
      [d_x_original[1], d_y_orthX[1], d_z_orthX[1]],
      [d_x_original[2], d_y_orthX[2], d_z_orthX[2]]
    ]
    // Check determinant
    const det_xfixed = d_x_original[0] * (d_y_orthX[1] * d_z_orthX[2] - d_y_orthX[2] * d_z_orthX[1])
                     - d_x_original[1] * (d_y_orthX[0] * d_z_orthX[2] - d_y_orthX[2] * d_z_orthX[0])
                     + d_x_original[2] * (d_y_orthX[0] * d_z_orthX[1] - d_y_orthX[1] * d_z_orthX[0])
    log(`[VP Debug] X-fixed strategy det: ${det_xfixed.toFixed(6)}`)
    if (det_xfixed > 0) {
      const q_xfixed = matrixToQuaternion(R_xfixed)
      rotations.push(q_xfixed)
      log('[VP Debug] Added X-fixed orthogonalization rotation')

      // Also add flipped Y version
      const d_y_orthX_flipped = [-d_y_orthX[0], -d_y_orthX[1], -d_y_orthX[2]]
      const R_xfixed_flipY = [
        [-d_x_original[0], d_y_orthX_flipped[0], d_z_orthX[0]],
        [-d_x_original[1], d_y_orthX_flipped[1], d_z_orthX[1]],
        [-d_x_original[2], d_y_orthX_flipped[2], d_z_orthX[2]]
      ]
      const q_xfixed_flipY = matrixToQuaternion(R_xfixed_flipY)
      rotations.push(q_xfixed_flipY)
      log('[VP Debug] Added X-fixed + flipped Y rotation')
    }

    // Strategy 3: Procrustes - both X and Z adjusted equally
    const R_procrustes = [
      [d_x_procrustes[0], d_y_procrustes[0], d_z_procrustes[0]],
      [d_x_procrustes[1], d_y_procrustes[1], d_z_procrustes[1]],
      [d_x_procrustes[2], d_y_procrustes[2], d_z_procrustes[2]]
    ]
    const det_procrustes = d_x_procrustes[0] * (d_y_procrustes[1] * d_z_procrustes[2] - d_y_procrustes[2] * d_z_procrustes[1])
                         - d_x_procrustes[1] * (d_y_procrustes[0] * d_z_procrustes[2] - d_y_procrustes[2] * d_z_procrustes[0])
                         + d_x_procrustes[2] * (d_y_procrustes[0] * d_z_procrustes[1] - d_y_procrustes[1] * d_z_procrustes[0])
    log(`[VP Debug] Procrustes strategy det: ${det_procrustes.toFixed(6)}`)
    if (det_procrustes > 0) {
      const q_procrustes = matrixToQuaternion(R_procrustes)
      rotations.push(q_procrustes)
      log('[VP Debug] Added Procrustes orthogonalization rotation')

      // Also add flipped Y version
      const d_y_procrustes_flipped = [-d_y_procrustes[0], -d_y_procrustes[1], -d_y_procrustes[2]]
      const R_procrustes_flipY = [
        [-d_x_procrustes[0], d_y_procrustes_flipped[0], d_z_procrustes[0]],
        [-d_x_procrustes[1], d_y_procrustes_flipped[1], d_z_procrustes[1]],
        [-d_x_procrustes[2], d_y_procrustes_flipped[2], d_z_procrustes[2]]
      ]
      const q_procrustes_flipY = matrixToQuaternion(R_procrustes_flipY)
      rotations.push(q_procrustes_flipY)
      log('[VP Debug] Added Procrustes + flipped Y rotation')
    }
  }

  log(`[VP Debug] Returning ${rotations.length} base rotation(s)`)
  return rotations
}

// Backwards compatibility wrapper
export function computeRotationFromVPs(
  vanishingPoints: {
    x?: VanishingPoint
    y?: VanishingPoint
    z?: VanishingPoint
  },
  focalLength: number,
  principalPoint: { u: number; v: number }
): [number, number, number, number] | null {
  const rotations = computeRotationsFromVPs(vanishingPoints, focalLength, principalPoint)
  return rotations ? rotations[0] : null
}

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

function refineTranslation(
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

function solveLinearSystem3x3(A: number[][], b: number[]): number[] | null {
  const det =
    A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
    A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
    A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0])

  if (Math.abs(det) < 1e-10) {
    return null
  }

  const invA: number[][] = [
    [
      (A[1][1] * A[2][2] - A[1][2] * A[2][1]) / det,
      (A[0][2] * A[2][1] - A[0][1] * A[2][2]) / det,
      (A[0][1] * A[1][2] - A[0][2] * A[1][1]) / det
    ],
    [
      (A[1][2] * A[2][0] - A[1][0] * A[2][2]) / det,
      (A[0][0] * A[2][2] - A[0][2] * A[2][0]) / det,
      (A[0][2] * A[1][0] - A[0][0] * A[1][2]) / det
    ],
    [
      (A[1][0] * A[2][1] - A[1][1] * A[2][0]) / det,
      (A[0][1] * A[2][0] - A[0][0] * A[2][1]) / det,
      (A[0][0] * A[1][1] - A[0][1] * A[1][0]) / det
    ]
  ]

  const x = [
    invA[0][0] * b[0] + invA[0][1] * b[1] + invA[0][2] * b[2],
    invA[1][0] * b[0] + invA[1][1] * b[1] + invA[1][2] * b[2],
    invA[2][0] * b[0] + invA[2][1] * b[1] + invA[2][2] * b[2]
  ]

  return x
}

export function computeLineLength(line: VPLineData): number {
  const dx = line.p2.u - line.p1.u
  const dy = line.p2.v - line.p1.v
  return Math.sqrt(dx * dx + dy * dy)
}

export function computeAngleBetweenLines(
  line1: VPLineData,
  line2: VPLineData
): number {
  const dx1 = line1.p2.u - line1.p1.u
  const dy1 = line1.p2.v - line1.p1.v
  const dx2 = line2.p2.u - line2.p1.u
  const dy2 = line2.p2.v - line2.p1.v

  const dot = dx1 * dx2 + dy1 * dy2
  const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1)
  const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)

  if (len1 < 1e-10 || len2 < 1e-10) {
    return 0
  }

  const cosAngle = dot / (len1 * len2)
  const angleRad = Math.acos(Math.max(-1, Math.min(1, Math.abs(cosAngle))))
  const angleDeg = (angleRad * 180) / Math.PI

  return angleDeg
}

export function validateLineQuality(
  line: VPLineData,
  allLinesForAxis: VPLineData[]
): LineQualityIssue[] {
  const issues: LineQualityIssue[] = []

  const length = computeLineLength(line)
  if (length < 50) {
    issues.push({
      type: 'warning',
      message: `Line too short (${length.toFixed(0)}px). Draw longer lines for better accuracy.`
    })
  }

  // Only check parallel lines when there are exactly 2 lines on axis.
  // With 3+ lines, overdetermined least-squares handles parallel pairs well.
  if (allLinesForAxis.length === 2) {
    const otherLines = allLinesForAxis.filter(l => l !== line)
    if (otherLines.length > 0) {
      const minAngle = Math.min(...otherLines.map(other => computeAngleBetweenLines(line, other)))

      if (minAngle < 2) {
        issues.push({
          type: 'error',
          message: `Line nearly parallel to another (${minAngle.toFixed(1)}°). Lines should spread out.`
        })
      } else if (minAngle < 5) {
        issues.push({
          type: 'warning',
          message: `Line close to parallel with another (${minAngle.toFixed(1)}°). More spread recommended.`
        })
      }
    }
  }

  return issues
}

export function validateAxisLineDistribution(
  lines: VPLineData[]
): LineQualityIssue[] {
  const issues: LineQualityIssue[] = []

  if (lines.length < 2) {
    return issues
  }

  const centerPoints = lines.map(line => ({
    u: (line.p1.u + line.p2.u) / 2,
    v: (line.p1.v + line.p2.v) / 2
  }))

  const avgU = centerPoints.reduce((sum, p) => sum + p.u, 0) / centerPoints.length
  const avgV = centerPoints.reduce((sum, p) => sum + p.v, 0) / centerPoints.length

  const maxDistFromCenter = Math.max(...centerPoints.map(p => {
    const du = p.u - avgU
    const dv = p.v - avgV
    return Math.sqrt(du * du + dv * dv)
  }))

  if (maxDistFromCenter < 100) {
    issues.push({
      type: 'warning',
      message: 'Lines clustered in one area. Spread them across the image for better accuracy.'
    })
  }

  return issues
}

export function initializeCameraWithVanishingPoints(
  viewpoint: Viewpoint,
  worldPoints: Set<WorldPoint>,
  options: { allowSinglePoint?: boolean } = {}
): boolean {
  const { allowSinglePoint = false } = options

  log('[initializeCameraWithVanishingPoints] Starting vanishing point initialization...')

  const validation = validateVanishingPoints(viewpoint)
  if (!validation.isValid || !validation.vanishingPoints) {
    log(`[initializeCameraWithVanishingPoints] Validation failed: ${validation.errors.join(', ')}`)
    return false
  }

  const vps = validation.vanishingPoints
  const vpArray = Object.values(vps).filter(vp => vp !== undefined) as VanishingPoint[]

  // Log observed VPs from vanishing lines
  log('[VP Init] Vanishing points:')
  if (vps.x) log(`  X: (${vps.x.u.toFixed(3)}, ${vps.x.v.toFixed(3)})`)
  if (vps.y) log(`  Y: (${vps.y.u.toFixed(3)}, ${vps.y.v.toFixed(3)})`)
  if (vps.z) log(`  Z: (${vps.z.u.toFixed(3)}, ${vps.z.v.toFixed(3)})`)

  if (vpArray.length < 2) {
    log('[initializeCameraWithVanishingPoints] Not enough vanishing points')
    return false
  }

  let principalPoint = {
    u: viewpoint.principalPointX,
    v: viewpoint.principalPointY
  }

  const estimatedPP = estimatePrincipalPoint(vps, viewpoint.imageWidth, viewpoint.imageHeight)
  if (estimatedPP) {
    principalPoint = estimatedPP
    viewpoint.principalPointX = estimatedPP.u
    viewpoint.principalPointY = estimatedPP.v
    log(`[initializeCameraWithVanishingPoints] Estimated principal point: (${estimatedPP.u.toFixed(1)}, ${estimatedPP.v.toFixed(1)})`)
  } else {
    log(`[initializeCameraWithVanishingPoints] Using existing principal point: (${principalPoint.u.toFixed(1)}, ${principalPoint.v.toFixed(1)})`)
  }

  let focalLength = viewpoint.focalLength

  // Try to estimate focal length from VPs if the current one seems like a default value
  const isDefaultFocalLength =
    Math.abs(focalLength - viewpoint.imageWidth) < 10 ||
    Math.abs(focalLength - viewpoint.imageHeight) < 10 ||
    Math.abs(focalLength - Math.max(viewpoint.imageWidth, viewpoint.imageHeight)) < 10;

  if (isDefaultFocalLength) {
    // Try all pairs of VPs and take the median valid estimate
    const vpKeys = Object.keys(vps) as Array<keyof typeof vps>
    const estimates: number[] = []
    
    for (let i = 0; i < vpKeys.length; i++) {
      for (let j = i + 1; j < vpKeys.length; j++) {
        const vp1 = vps[vpKeys[i]]
        const vp2 = vps[vpKeys[j]]
        if (vp1 && vp2) {
          const f = estimateFocalLength(vp1, vp2, principalPoint)
          if (f !== null && f > 0 && f < 50000) {
            log('[VP Focal] ' + vpKeys[i].toUpperCase() + '-' + vpKeys[j].toUpperCase() + ' pair: f=' + f.toFixed(1))
            estimates.push(f)
          }
        }
      }
    }
    
    if (estimates.length > 0) {
      estimates.sort((a, b) => a - b)
      const medianF = estimates[Math.floor(estimates.length / 2)]
      log('[initializeCameraWithVanishingPoints] Estimated focal length from VPs: ' + medianF.toFixed(1) + ' (was ' + focalLength + ')')
      focalLength = medianF
      viewpoint.focalLength = medianF
    }
  } else {
    log('[initializeCameraWithVanishingPoints] Using existing focal length: ' + focalLength.toFixed(1))
  }

  const baseRotations = computeRotationsFromVPs(vps, focalLength, principalPoint)
  if (!baseRotations || baseRotations.length === 0) {
    log('[initializeCameraWithVanishingPoints] Failed to compute rotation')
    return false
  }
  log(`[initializeCameraWithVanishingPoints] Trying ${baseRotations.length} base rotation(s)`)

  // For POSITION SOLVING: Use fully constrained points (locked OR inferred)
  // Inferred coordinates are as valid as locked coordinates after propagation
  const constrainedPoints = Array.from(worldPoints).filter(wp => wp.isFullyConstrained())

  const lockedPointsData = constrainedPoints
    .map(wp => {
      const imagePoints = viewpoint.getImagePointsForWorldPoint(wp)
      if (imagePoints.length === 0) {
        return null
      }
      return {
        worldPoint: wp,
        imagePoint: { u: imagePoints[0].u, v: imagePoints[0].v },
        effectiveXyz: wp.getEffectiveXyz() as [number, number, number]
      }
    })
    .filter(p => p !== null) as Array<{
    worldPoint: WorldPoint
    imagePoint: { u: number; v: number }
    effectiveXyz: [number, number, number]
  }>

  const minLockedPoints = allowSinglePoint ? 1 : 2
  if (lockedPointsData.length < minLockedPoints) {
    log(`[initializeCameraWithVanishingPoints] Not enough locked points with image observations (have ${lockedPointsData.length}, need ${minLockedPoints})`)
    return false
  }

  // For SIGN SELECTION: Also include points with effective coordinates (locked + inferred)
  // This ensures Y-axis constraints from partially-locked points influence the sign choice
  const effectivePointsData = Array.from(worldPoints)
    .filter(wp => wp.isFullyConstrained())
    .map(wp => {
      const imagePoints = viewpoint.getImagePointsForWorldPoint(wp)
      if (imagePoints.length === 0) {
        return null
      }
      const effective = wp.getEffectiveXyz()
      return {
        worldPoint: wp,
        imagePoint: { u: imagePoints[0].u, v: imagePoints[0].v },
        effectiveXyz: effective as [number, number, number]
      }
    })
    .filter(p => p !== null) as Array<{
    worldPoint: WorldPoint
    imagePoint: { u: number; v: number }
    effectiveXyz: [number, number, number]
  }>

  // Try sign combinations for axis orientations.
  // IMPORTANT: Only use EVEN-flip combinations (0 or 2 flips). Odd-flip combinations
  // produce reflection matrices (det = -1), and matrixToQuaternion gives garbage
  // for reflections since quaternions can only represent proper rotations.
  //
  // The 4 even-flip combinations cover all 4 valid rotational orientations:
  // - [F,F,F]: 0 flips - original orientation
  // - [T,T,F]: 2 flips - flip X and Y (180° around Z)
  // - [T,F,T]: 2 flips - flip X and Z (180° around Y)
  // - [F,T,T]: 2 flips - flip Y and Z (180° around X)
  //
  // When Y is derived from X and Z, we have TWO base rotations (for Y = Z×X and Y = X×Z),
  // so we try 4 combinations on each, giving 8 total orientations.
  const signCombinations: [boolean, boolean, boolean][] = [
    [false, false, false],  // 0 flips - valid rotation
    [true, true, false],    // 2 flips - valid rotation
    [true, false, true],    // 2 flips - valid rotation
    [false, true, true],    // 2 flips - valid rotation
  ]

  let bestRotation: [number, number, number, number] | null = null
  let bestPosition: [number, number, number] | null = null
  let bestScore = -Infinity
  let bestPointsInFront = 0
  let bestReprojError = Infinity

  for (let baseIdx = 0; baseIdx < baseRotations.length; baseIdx++) {
    const baseRotation = baseRotations[baseIdx]
    const baseLabel = baseIdx === 0 ? 'Y=Z×X' : 'Y=X×Z'

  for (const [flipX, flipY, flipZ] of signCombinations) {
    const rotation = flipRotationAxes(baseRotation, flipX, flipY, flipZ)
    const positionInitial = computeCameraPosition(rotation, focalLength, principalPoint, lockedPointsData)

    if (!positionInitial) {
      continue
    }

    const rotationMatrix = [
      [1 - 2 * (rotation[2] * rotation[2] + rotation[3] * rotation[3]), 2 * (rotation[1] * rotation[2] - rotation[3] * rotation[0]), 2 * (rotation[1] * rotation[3] + rotation[2] * rotation[0])],
      [2 * (rotation[1] * rotation[2] + rotation[3] * rotation[0]), 1 - 2 * (rotation[1] * rotation[1] + rotation[3] * rotation[3]), 2 * (rotation[2] * rotation[3] - rotation[1] * rotation[0])],
      [2 * (rotation[1] * rotation[3] - rotation[2] * rotation[0]), 2 * (rotation[2] * rotation[3] + rotation[1] * rotation[0]), 1 - 2 * (rotation[1] * rotation[1] + rotation[2] * rotation[2])]
    ]

    const position = refineTranslation(positionInitial, rotationMatrix, focalLength, principalPoint, effectivePointsData)

    // Count how many points are in front of the camera (using effective coordinates)
    let pointsInFront = 0
    for (const { effectiveXyz } of effectivePointsData) {
      if (isPointInFrontOfCamera(effectiveXyz, position, rotation)) {
        pointsInFront++
      }
    }

    // Compute reprojection error for ALL constrained points (locked + inferred)
    // This ensures Y-axis constraints from partially-locked points influence sign selection
    let totalReprojError = 0
    for (const { effectiveXyz, imagePoint } of effectivePointsData) {
      const wp = effectiveXyz

      // Transform world point to camera space using R (world→camera)
      const rel = [wp[0] - position[0], wp[1] - position[1], wp[2] - position[2]]
      const camSpace = [
        rotationMatrix[0][0] * rel[0] + rotationMatrix[0][1] * rel[1] + rotationMatrix[0][2] * rel[2],
        rotationMatrix[1][0] * rel[0] + rotationMatrix[1][1] * rel[1] + rotationMatrix[1][2] * rel[2],
        rotationMatrix[2][0] * rel[0] + rotationMatrix[2][1] * rel[1] + rotationMatrix[2][2] * rel[2]
      ]

      if (camSpace[2] <= 0) {
        totalReprojError += 10000 // Huge penalty for behind camera
        continue
      }

      // Project to image using standard camera model: v = pp_v - f * cam_y / cam_z
      const projU = principalPoint.u + focalLength * (camSpace[0] / camSpace[2])
      const projV = principalPoint.v - focalLength * (camSpace[1] / camSpace[2])

      const du = projU - imagePoint.u
      const dv = projV - imagePoint.v
      const err = Math.sqrt(du * du + dv * dv)
      totalReprojError += err
    }

    // =========================================================================
    // RIGHT-HANDED COORDINATE PREFERENCE
    // =========================================================================
    // For right-handed coordinates, we need X×Y to point in +Z direction.
    // When X is at +X and Y is at +Y, this requires Z to be at +Z.
    //
    // Check which sign of axis-constrained coordinates produces better reprojection.
    let optimalXIsPositive = true  // default to positive if no X constraint
    let optimalZIsPositive = true  // default to positive if no Z constraint

    for (const wp of Array.from(worldPoints)) {
      const locked = wp.lockedXyz
      if (!locked) continue

      // Check for Z-axis constraint: [0, 0, null]
      if (locked[0] === 0 && locked[1] === 0 && locked[2] === null) {
        const imagePoints = viewpoint.getImagePointsForWorldPoint(wp)
        if (imagePoints.length === 0) continue

        const observed = { u: imagePoints[0].u, v: imagePoints[0].v }

        const testZ = (zVal: number) => {
          const worldPos: [number, number, number] = [0, 0, zVal]
          const rel = [worldPos[0] - position[0], worldPos[1] - position[1], worldPos[2] - position[2]]
          const cam = [
            rotationMatrix[0][0] * rel[0] + rotationMatrix[0][1] * rel[1] + rotationMatrix[0][2] * rel[2],
            rotationMatrix[1][0] * rel[0] + rotationMatrix[1][1] * rel[1] + rotationMatrix[1][2] * rel[2],
            rotationMatrix[2][0] * rel[0] + rotationMatrix[2][1] * rel[1] + rotationMatrix[2][2] * rel[2]
          ]
          if (cam[2] <= 0) return Infinity
          const projU = principalPoint.u + focalLength * (cam[0] / cam[2])
          const projV = principalPoint.v - focalLength * (cam[1] / cam[2])
          return Math.sqrt((projU - observed.u) ** 2 + (projV - observed.v) ** 2)
        }

        const errPlus = testZ(10)
        const errMinus = testZ(-10)
        optimalZIsPositive = errPlus < errMinus

        log(`[VP RH] Z-axis point ${wp.name}: z=+10 err=${errPlus.toFixed(1)}px, z=-10 err=${errMinus.toFixed(1)}px -> ${optimalZIsPositive ? 'POSITIVE Z' : 'NEGATIVE Z'}`)
      }

      // Check for X-axis constraint: [null, 0, 0]
      if (locked[0] === null && locked[1] === 0 && locked[2] === 0) {
        const imagePoints = viewpoint.getImagePointsForWorldPoint(wp)
        if (imagePoints.length === 0) continue

        const observed = { u: imagePoints[0].u, v: imagePoints[0].v }

        const testX = (xVal: number) => {
          const worldPos: [number, number, number] = [xVal, 0, 0]
          const rel = [worldPos[0] - position[0], worldPos[1] - position[1], worldPos[2] - position[2]]
          const cam = [
            rotationMatrix[0][0] * rel[0] + rotationMatrix[0][1] * rel[1] + rotationMatrix[0][2] * rel[2],
            rotationMatrix[1][0] * rel[0] + rotationMatrix[1][1] * rel[1] + rotationMatrix[1][2] * rel[2],
            rotationMatrix[2][0] * rel[0] + rotationMatrix[2][1] * rel[1] + rotationMatrix[2][2] * rel[2]
          ]
          if (cam[2] <= 0) return Infinity
          const projU = principalPoint.u + focalLength * (cam[0] / cam[2])
          const projV = principalPoint.v - focalLength * (cam[1] / cam[2])
          return Math.sqrt((projU - observed.u) ** 2 + (projV - observed.v) ** 2)
        }

        const errPlus = testX(10)
        const errMinus = testX(-10)
        optimalXIsPositive = errPlus < errMinus

        log(`[VP RH] X-axis point ${wp.name}: x=+10 err=${errPlus.toFixed(1)}px, x=-10 err=${errMinus.toFixed(1)}px -> ${optimalXIsPositive ? 'POSITIVE X' : 'NEGATIVE X'}`)
      }
    }

    // For right-handed: X×Y should point in same direction as Z
    // If X and Z have same sign (both + or both -), then with Y at +Y, it's right-handed
    // If X and Z have opposite signs, it's left-handed
    const wouldBeRightHanded = (optimalXIsPositive === optimalZIsPositive)
    const rightHandedBonus = wouldBeRightHanded ? 300000 : 0

    log(`[VP RH] optimalX=${optimalXIsPositive ? '+' : '-'}, optimalZ=${optimalZIsPositive ? '+' : '-'} -> ${wouldBeRightHanded ? 'RIGHT-HANDED (+bonus)' : 'LEFT-HANDED (no bonus)'}`)

    // Score: points in front is primary (required), reprojection error is secondary (lower is better)
    // Use negative reproj error so higher score = better
    // Add right-handed bonus to prefer rotations with positive axis coordinates
    const score = pointsInFront * 1000000 + rightHandedBonus - totalReprojError
    const avgError = totalReprojError / effectivePointsData.length
    if (VP_SIGN_DEBUG) {
      log(
        `[VP Sign Debug] [${baseLabel} ${flipX},${flipY},${flipZ}]` +
        ` pointsInFront=${pointsInFront}/${effectivePointsData.length}, avgError=${avgError.toFixed(1)} px`
      )
      log(
        `[VP Sign Debug]   position=[${position.map(p => p.toFixed(2)).join(', ')}],` +
        ` score=${score.toFixed(1)}`
      )
    }

    if (score > bestScore) {
      bestScore = score
      bestRotation = rotation
      bestPosition = position
      bestPointsInFront = pointsInFront
      bestReprojError = totalReprojError / effectivePointsData.length
      log(`[VP Sign Debug] NEW BEST: [${baseLabel} ${flipX},${flipY},${flipZ}] score=${score.toFixed(1)}, avgError=${avgError.toFixed(1)}px`)
    }
  }
  } // end of baseRotations loop

  if (!bestRotation || !bestPosition) {
    log('[initializeCameraWithVanishingPoints] Failed to find valid camera orientation')
    return false
  }

  if (bestPointsInFront < effectivePointsData.length) {
    log(`[initializeCameraWithVanishingPoints] WARNING: Only ${bestPointsInFront}/${effectivePointsData.length} points are in front of camera`)
  }

  // If the best reprojection error is too high, fail and let PnP try instead.
  // This handles cases where vanishing lines are inconsistent with pixel observations.
  const maxAcceptableError = 100 // pixels - higher threshold to allow optimization to refine
  if (bestReprojError > maxAcceptableError) {
    log(`[initializeCameraWithVanishingPoints] Best reprojection error (${bestReprojError.toFixed(1)} px) exceeds threshold (${maxAcceptableError} px)`)
    log('[initializeCameraWithVanishingPoints] Vanishing lines may be inconsistent with pixel observations - failing to allow PnP fallback')
    return false
  }

  const rotation = bestRotation
  const position = bestPosition

  viewpoint.rotation = rotation
  viewpoint.position = position
  viewpoint.focalLength = focalLength
  // Reset ALL intrinsics to sane defaults.
  // The fixture may have garbage values from a previous failed optimization.
  // VP initialization assumes a standard pinhole camera model.
  viewpoint.skewCoefficient = 0
  viewpoint.aspectRatio = 1
  viewpoint.radialDistortion = [0, 0, 0]
  viewpoint.tangentialDistortion = [0, 0]

  const basis = {
    x: [1, 0, 0] as [number, number, number],
    y: [0, 1, 0] as [number, number, number],
    z: [0, 0, 1] as [number, number, number]
  }

  const rotationMatrix = [
    [1 - 2 * (rotation[2] * rotation[2] + rotation[3] * rotation[3]), 2 * (rotation[1] * rotation[2] - rotation[3] * rotation[0]), 2 * (rotation[1] * rotation[3] + rotation[2] * rotation[0])],
    [2 * (rotation[1] * rotation[2] + rotation[3] * rotation[0]), 1 - 2 * (rotation[1] * rotation[1] + rotation[3] * rotation[3]), 2 * (rotation[2] * rotation[3] - rotation[1] * rotation[0])],
    [2 * (rotation[1] * rotation[3] - rotation[2] * rotation[0]), 2 * (rotation[2] * rotation[3] + rotation[1] * rotation[0]), 1 - 2 * (rotation[1] * rotation[1] + rotation[2] * rotation[2])]
  ]

  const cameraVps: Record<string, { u: number; v: number }> = {}
  Object.entries(basis).forEach(([axis, dir]) => {
    const camDir = [
      rotationMatrix[0][0] * dir[0] + rotationMatrix[0][1] * dir[1] + rotationMatrix[0][2] * dir[2],
      rotationMatrix[1][0] * dir[0] + rotationMatrix[1][1] * dir[1] + rotationMatrix[1][2] * dir[2],
      rotationMatrix[2][0] * dir[0] + rotationMatrix[2][1] * dir[1] + rotationMatrix[2][2] * dir[2]
    ]

    if (Math.abs(camDir[2]) < 1e-6) {
      return
    }

    const u = principalPoint.u + focalLength * (camDir[0] / camDir[2])
    const v = principalPoint.v - focalLength * (camDir[1] / camDir[2])
    cameraVps[axis] = { u, v }
  })

  log('[initializeCameraWithVanishingPoints] Camera predicted vanishing points:')
  Object.entries(cameraVps).forEach(([axis, vp]) => {
    log(`  ${axis.toUpperCase()} axis -> VP at (${vp.u.toFixed(2)}, ${vp.v.toFixed(2)})`)
  })

  viewpointInitialVps.set(viewpoint, cameraVps)

  log(
    `[initializeCameraWithVanishingPoints] Success! Position: [${position.map(p => p.toFixed(2)).join(', ')}], ` +
    `Rotation: [${rotation.map(q => q.toFixed(3)).join(', ')}]`
  )

  return true
}
