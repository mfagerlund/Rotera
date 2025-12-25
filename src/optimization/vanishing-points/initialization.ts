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

import { Viewpoint } from '../../entities/viewpoint'
import { WorldPoint } from '../../entities/world-point'
import { log } from '../optimization-logger'
import { viewpointInitialVps } from '../optimize-project'
import { validateVanishingPoints } from './validation'
import { estimatePrincipalPoint, estimateFocalLength } from './detection'
import { computeRotationsFromVPs, flipRotationAxes } from './rotation'
import { computeCameraPosition, refineTranslation, isPointInFrontOfCamera } from './camera-solve'
import { quaternionToMatrix } from '../math-utils-common'

// Debug flag - set to true to enable verbose VP sign debug output
const VP_SIGN_DEBUG = false

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
  const vpArray = Object.values(vps).filter(vp => vp !== undefined)

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

    const rotationMatrix = quaternionToMatrix(rotation)

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

  const rotationMatrix = quaternionToMatrix(rotation)

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
