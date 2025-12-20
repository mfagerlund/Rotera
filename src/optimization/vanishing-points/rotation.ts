import { VanishingLineAxis } from '../../entities/vanishing-line'
import { log } from '../optimization-logger'
import { normalize, cross, matrixToQuaternion } from './math-utils'
import { VanishingPoint } from './types'

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

/**
 * Flip rotation matrix axes by applying sign changes, then convert back to quaternion
 */
export function flipRotationAxes(
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
