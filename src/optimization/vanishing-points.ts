import { VanishingLine, VanishingLineAxis } from '../entities/vanishing-line'
import { Viewpoint } from '../entities/viewpoint'
import { WorldPoint } from '../entities/world-point'

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

export function computeVanishingPoint(
  lines: VanishingLine[]
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
    console.log('[VP] WARNING: VP very far from origin:', result, 'eigenvector:', vp)
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

  const linesByAxis: Record<VanishingLineAxis, VanishingLine[]> = {
    x: [],
    y: [],
    z: []
  }

  Array.from(viewpoint.vanishingLines).forEach(line => {
    linesByAxis[line.axis].push(line)
  })

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
  worldPoints: Set<WorldPoint>
): boolean {
  const validation = validateVanishingPoints(viewpoint)
  if (!validation.isValid) {
    return false
  }

  const vpCount = Object.keys(validation.vanishingPoints || {}).length
  if (vpCount < 2) {
    return false
  }

  // IMPORTANT: Only use LOCKED points (not inferred) for camera position solving
  // Inferred coordinates depend on line constraints which may not be accurate yet
  const fullyConstrainedPoints = Array.from(worldPoints).filter(wp => {
    const lockedXyz = wp.lockedXyz
    return lockedXyz.every(coord => coord !== null)
  })

  if (fullyConstrainedPoints.length >= 2) {
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

export function computeRotationFromVPs(
  vanishingPoints: {
    x?: VanishingPoint
    y?: VanishingPoint
    z?: VanishingPoint
  },
  focalLength: number,
  principalPoint: { u: number; v: number }
): [number, number, number, number] | null {
  const availableAxes = Object.keys(vanishingPoints).filter(
    axis => vanishingPoints[axis as VanishingLineAxis] !== undefined
  ) as VanishingLineAxis[]

  if (availableAxes.length < 2) {
    return null
  }

  const directions: Record<VanishingLineAxis, number[]> = {} as any

  availableAxes.forEach(axis => {
    const vp = vanishingPoints[axis]!
    const u = vp.u - principalPoint.u
    const v = vp.v - principalPoint.v

    const dir = normalize([u / focalLength, v / focalLength, 1])
    directions[axis] = dir
  })

  let d_x: number[], d_y: number[], d_z: number[]

  if (directions.x && directions.z) {
    d_x = directions.x
    d_z = directions.z
    d_y = cross(d_z, d_x)
    d_y = normalize(d_y)
  } else if (directions.x && directions.y) {
    d_x = directions.x
    d_y = directions.y
    d_z = cross(d_x, d_y)
    d_z = normalize(d_z)
  } else if (directions.y && directions.z) {
    d_y = directions.y
    d_z = directions.z
    d_x = cross(d_y, d_z)
    d_x = normalize(d_x)
  } else {
    return null
  }

  const R = [
    [d_x[0], d_y[0], d_z[0]],
    [d_x[1], d_y[1], d_z[1]],
    [d_x[2], d_y[2], d_z[2]]
  ]

  return matrixToQuaternion(R)
}

export function computeCameraPosition(
  rotation: [number, number, number, number],
  focalLength: number,
  principalPoint: { u: number; v: number },
  lockedPoints: Array<{
    worldPoint: WorldPoint
    imagePoint: { u: number; v: number }
  }>
): [number, number, number] | null {
  if (lockedPoints.length < 2) {
    return null
  }

  const qw = rotation[0]
  const qx = rotation[1]
  const qy = rotation[2]
  const qz = rotation[3]

  const R = [
    [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qw * qz), 2 * (qx * qz + qw * qy)],
    [2 * (qx * qy + qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qw * qx)],
    [2 * (qx * qz - qw * qy), 2 * (qy * qz + qw * qx), 1 - 2 * (qx * qx + qy * qy)]
  ]

  const Rt = [
    [R[0][0], R[1][0], R[2][0]],
    [R[0][1], R[1][1], R[2][1]],
    [R[0][2], R[1][2], R[2][2]]
  ]

  const A: number[][] = []
  const b: number[] = []

  lockedPoints.forEach(({ worldPoint, imagePoint }) => {
    // Use lockedXyz directly (not getEffectiveXyz which includes inferred coordinates)
    const lockedXyz = worldPoint.lockedXyz
    const P = [lockedXyz[0]!, lockedXyz[1]!, lockedXyz[2]!]

    const u_norm = (imagePoint.u - principalPoint.u) / focalLength
    const v_norm = (imagePoint.v - principalPoint.v) / focalLength

    const ray = [u_norm, v_norm, 1]
    const ray_world = [
      Rt[0][0] * ray[0] + Rt[0][1] * ray[1] + Rt[0][2] * ray[2],
      Rt[1][0] * ray[0] + Rt[1][1] * ray[1] + Rt[1][2] * ray[2],
      Rt[2][0] * ray[0] + Rt[2][1] * ray[1] + Rt[2][2] * ray[2]
    ]

    A.push([ray_world[1], -ray_world[0], 0])
    b.push(P[0] * ray_world[1] - P[1] * ray_world[0])

    A.push([ray_world[2], 0, -ray_world[0]])
    b.push(P[0] * ray_world[2] - P[2] * ray_world[0])

    A.push([0, ray_world[2], -ray_world[1]])
    b.push(P[1] * ray_world[2] - P[2] * ray_world[1])
  })

  const AtA: number[][] = Array(3).fill(0).map(() => Array(3).fill(0))
  const Atb: number[] = Array(3).fill(0)

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < A.length; k++) {
        AtA[i][j] += A[k][i] * A[k][j]
      }
    }
    for (let k = 0; k < A.length; k++) {
      Atb[i] += A[k][i] * b[k]
    }
  }

  const C = solveLinearSystem3x3(AtA, Atb)
  if (!C) {
    return null
  }

  return [C[0], C[1], C[2]]
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

export function computeLineLength(line: VanishingLine): number {
  const dx = line.p2.u - line.p1.u
  const dy = line.p2.v - line.p1.v
  return Math.sqrt(dx * dx + dy * dy)
}

export function computeAngleBetweenLines(
  line1: VanishingLine,
  line2: VanishingLine
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
  line: VanishingLine,
  allLinesForAxis: VanishingLine[]
): LineQualityIssue[] {
  const issues: LineQualityIssue[] = []

  const length = computeLineLength(line)
  if (length < 50) {
    issues.push({
      type: 'warning',
      message: `Line too short (${length.toFixed(0)}px). Draw longer lines for better accuracy.`
    })
  }

  const otherLines = allLinesForAxis.filter(l => l.id !== line.id)

  if (otherLines.length > 0) {
    const minAngle = Math.min(...otherLines.map(other => computeAngleBetweenLines(line, other)))

    if (minAngle < 5) {
      issues.push({
        type: 'error',
        message: `Line nearly parallel to another (${minAngle.toFixed(1)}°). Lines should spread out.`
      })
    } else if (minAngle < 15) {
      issues.push({
        type: 'warning',
        message: `Line close to parallel with another (${minAngle.toFixed(1)}°). More spread recommended.`
      })
    }
  }

  return issues
}

export function validateAxisLineDistribution(
  lines: VanishingLine[]
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
  worldPoints: Set<WorldPoint>
): boolean {
  console.log('[initializeCameraWithVanishingPoints] Starting vanishing point initialization...')

  const validation = validateVanishingPoints(viewpoint)
  if (!validation.isValid || !validation.vanishingPoints) {
    console.log('[initializeCameraWithVanishingPoints] Validation failed:', validation.errors)
    return false
  }

  const vps = validation.vanishingPoints
  const vpArray = Object.values(vps).filter(vp => vp !== undefined) as VanishingPoint[]

  if (vpArray.length < 2) {
    console.log('[initializeCameraWithVanishingPoints] Not enough vanishing points')
    return false
  }

  const principalPoint = {
    u: viewpoint.principalPointX,
    v: viewpoint.principalPointY
  }

  let focalLength = viewpoint.focalLength
  const estimatedF = estimateFocalLength(vpArray[0], vpArray[1], principalPoint)
  if (estimatedF && estimatedF > 0 && estimatedF < viewpoint.imageWidth * 2) {
    focalLength = estimatedF
    console.log(`[initializeCameraWithVanishingPoints] Estimated focal length: ${focalLength.toFixed(1)}`)
  } else {
    console.log(`[initializeCameraWithVanishingPoints] Using existing focal length: ${focalLength.toFixed(1)}`)
  }

  const rotation = computeRotationFromVPs(vps, focalLength, principalPoint)
  if (!rotation) {
    console.log('[initializeCameraWithVanishingPoints] Failed to compute rotation')
    return false
  }

  // IMPORTANT: Only use LOCKED points (not inferred) for camera position solving
  // Inferred coordinates depend on line constraints which may not be accurate yet
  const fullyConstrainedPoints = Array.from(worldPoints).filter(wp => {
    const lockedXyz = wp.lockedXyz
    return lockedXyz.every(coord => coord !== null)
  })

  const lockedPointsData = fullyConstrainedPoints
    .map(wp => {
      const imagePoints = viewpoint.getImagePointsForWorldPoint(wp)
      if (imagePoints.length === 0) {
        return null
      }
      return {
        worldPoint: wp,
        imagePoint: { u: imagePoints[0].u, v: imagePoints[0].v }
      }
    })
    .filter(p => p !== null) as Array<{
    worldPoint: WorldPoint
    imagePoint: { u: number; v: number }
  }>

  if (lockedPointsData.length < 2) {
    console.log('[initializeCameraWithVanishingPoints] Not enough locked points with image observations')
    return false
  }

  const position = computeCameraPosition(rotation, focalLength, principalPoint, lockedPointsData)
  if (!position) {
    console.log('[initializeCameraWithVanishingPoints] Failed to compute camera position')
    return false
  }

  viewpoint.rotation = rotation
  viewpoint.position = position
  viewpoint.focalLength = focalLength

  console.log(
    `[initializeCameraWithVanishingPoints] Success! Position: [${position.map(p => p.toFixed(2)).join(', ')}], ` +
    `Rotation: [${rotation.map(q => q.toFixed(3)).join(', ')}]`
  )

  return true
}
