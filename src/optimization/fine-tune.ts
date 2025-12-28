/**
 * Fine-tune optimization.
 * Runs a single LM optimization pass with all constraints,
 * without initialization phases, candidate testing, or retries.
 */

import { Project } from '../entities/project'
import { ConstraintSystem } from './constraint-system'
import { WorldPoint } from '../entities/world-point'
import { ImagePoint } from '../entities/imagePoint'
import { Viewpoint } from '../entities/viewpoint'
import { Line } from '../entities/line'
import { Constraint } from '../entities/constraints'
import { log, logDebug, clearOptimizationLogs, setVerbosity } from './optimization-logger'
import { triangulateRayRay } from './triangulation'
import { projectWorldPointToPixelQuaternion } from './camera-projection'
import { V, Vec3, Vec4 } from 'scalar-autograd'

export interface FineTuneOptions {
  tolerance?: number              // Default: 1e-8 (tight)
  maxIterations?: number          // Default: 5000
  damping?: number                // Default: 0.01 (aggressive)
  lockCameraPoses?: boolean       // Default: false
  verbose?: boolean               // Default: false
}

export interface FineTuneResult {
  converged: boolean
  iterations: number
  residual: number
  solveTimeMs: number
  error?: string
}

/**
 * Run a fine-tune optimization pass.
 * Unlike full optimization, this:
 * - Skips all initialization phases
 * - Uses current optimizedXyz values as starting point
 * - No candidate testing or retries
 * - Single LM solve pass
 */
export function fineTuneProject(project: Project, options: FineTuneOptions = {}): FineTuneResult {
  const {
    tolerance = 1e-8,
    maxIterations = 5000,
    damping = 0.01,
    lockCameraPoses = false,
    verbose = false
  } = options

  clearOptimizationLogs()
  setVerbosity(verbose ? 'verbose' : 'normal')
  log(`[FineTune] v2.1 - Starting fine-tune optimization`)
  logDebug(`[FineTune] WP:${project.worldPoints.size} L:${project.lines.size} VP:${project.viewpoints.size} IP:${project.imagePoints.size} C:${project.constraints.size}`)
  logDebug(`[FineTune] Options: tol=${tolerance}, maxIter=${maxIterations}, lockCameras=${lockCameraPoses}`)

  const startTime = performance.now()

  // Store original pose lock states to restore later
  const originalPoseLocks = new Map<Viewpoint, boolean>()

  // Set camera pose locks based on option
  // lockCameraPoses=true: Lock all cameras (no camera pose optimization)
  // lockCameraPoses=false: Unlock all cameras (allow camera pose optimization)
  // NOTE: We MUST explicitly set isPoseLocked because calibration locks cameras,
  // and fine-tune needs to override that to allow pose refinement.
  for (const vp of project.viewpoints) {
    const viewpoint = vp as Viewpoint
    originalPoseLocks.set(viewpoint, viewpoint.isPoseLocked)
    viewpoint.isPoseLocked = lockCameraPoses
  }

  try {
    // PHASE 0: Ensure all world points have valid initial positions
    // This is critical for fine-tune since we skip the full initialization pipeline
    const viewpointArray = Array.from(project.viewpoints) as Viewpoint[]
    const initializedCameras = viewpointArray.filter(vp =>
      vp.position[0] !== 0 || vp.position[1] !== 0 || vp.position[2] !== 0
    )

    logDebug(`[FineTune] Cameras: ${initializedCameras.length}/${viewpointArray.length} initialized`)
    if (initializedCameras.length === 0) {
      log(`[FineTune] ERROR: No cameras have valid positions - run full optimization first`)
    }

    let pointsInitialized = 0
    let pointsAlreadyInitialized = 0
    let pointsFromConstraints = 0
    let pointsTriangulated = 0
    let pointsFailed = 0

    for (const wp of project.worldPoints) {
      const point = wp as WorldPoint

      // Already has optimizedXyz - check if it's valid
      if (point.optimizedXyz) {
        const [x, y, z] = point.optimizedXyz
        const isAtOrigin = Math.abs(x) < 0.001 && Math.abs(y) < 0.001 && Math.abs(z) < 0.001

        // Points at origin are only suspicious if they're NOT supposed to be there
        // (i.e., they're not locked/inferred to be at origin)
        if (isAtOrigin && !point.isFullyConstrained()) {
          logDebug(`[FineTune] WARN: Point "${point.getName()}" has optimizedXyz at origin but is not constrained - will re-triangulate`)
          // Clear it so we can re-initialize
          point.optimizedXyz = undefined
        } else {
          pointsAlreadyInitialized++
          continue
        }
      }

      // Fully constrained by locks/inference - use effective coordinates
      if (point.isFullyConstrained()) {
        const effective = point.getEffectiveXyz()
        point.optimizedXyz = [effective[0]!, effective[1]!, effective[2]!]
        pointsFromConstraints++
        pointsInitialized++
        continue
      }

      // Try to triangulate from image observations
      const imagePoints = Array.from(point.imagePoints) as ImagePoint[]
      const observationsWithValidCameras = imagePoints.filter(ip =>
        initializedCameras.includes(ip.viewpoint as Viewpoint)
      )

      if (observationsWithValidCameras.length >= 2) {
        // Pick the first two observations for triangulation
        const ip1 = observationsWithValidCameras[0]
        const ip2 = observationsWithValidCameras[1]
        const vp1 = ip1.viewpoint as Viewpoint
        const vp2 = ip2.viewpoint as Viewpoint

        const triangulated = triangulateRayRay(ip1, ip2, vp1, vp2, 10.0)
        if (triangulated) {
          point.optimizedXyz = triangulated.worldPoint
          pointsTriangulated++
          pointsInitialized++
          continue
        }
      }

      // Failed to initialize - log warning
      pointsFailed++
      logDebug(`[FineTune] WARN: Point "${point.getName()}" has no valid initial position`)
    }

    logDebug(`[FineTune] Points: ${pointsAlreadyInitialized} valid, ${pointsFromConstraints} from constraints, ${pointsTriangulated} triangulated, ${pointsFailed} failed`)

    // NOTE: We intentionally do NOT clear inferredXyz here.
    // inferredXyz contains axis constraints (e.g., "point is on Y axis" = [0, null, 0])
    // that must be preserved for the solver to work correctly with line constraints.

    if (pointsFailed > 0 && pointsAlreadyInitialized + pointsInitialized === 0) {
      return {
        converged: false,
        iterations: 0,
        residual: Infinity,
        solveTimeMs: performance.now() - startTime,
        error: `No valid initial positions for any world points. Run full optimization first.`
      }
    }

    // Log camera lock status and isZReflected
    for (const vp of project.viewpoints) {
      const viewpoint = vp as Viewpoint
      const storedPPX = viewpoint.principalPointX
      const storedPPY = viewpoint.principalPointY
      const centerPPX = viewpoint.imageWidth / 2
      const centerPPY = viewpoint.imageHeight / 2
      const ppOffset = Math.sqrt((storedPPX - centerPPX) ** 2 + (storedPPY - centerPPY) ** 2)
      logDebug(`[FineTune] Camera "${viewpoint.name}": isPoseLocked=${viewpoint.isPoseLocked}, isZReflected=${viewpoint.isZReflected}, isPossiblyCropped=${viewpoint.isPossiblyCropped}`)
      if (ppOffset > 1 && !viewpoint.isPossiblyCropped) {
        logDebug(`[FineTune] WARNING: Camera "${viewpoint.name}" has PP offset ${ppOffset.toFixed(1)}px from center but isPossiblyCropped=false`)
        logDebug(`[FineTune]          Solver will use center (${centerPPX.toFixed(1)}, ${centerPPY.toFixed(1)}) but UI uses stored (${storedPPX.toFixed(1)}, ${storedPPY.toFixed(1)})`)
      }
    }

    // DIAGNOSTIC: Compute initial reprojection error using BOTH UI method and solver method
    // UI method: uses stored principal point
    // Solver method: uses image center if isPossiblyCropped=false
    let uiTotalSquaredError = 0
    let solverTotalSquaredError = 0
    let ipCount = 0
    let behindCameraCount = 0
    for (const ip of project.imagePoints) {
      const imagePoint = ip as ImagePoint
      const wp = imagePoint.worldPoint as WorldPoint
      const vp = imagePoint.viewpoint as Viewpoint

      if (!wp.optimizedXyz) continue

      try {
        const worldVec = new Vec3(
          V.C(wp.optimizedXyz[0]),
          V.C(wp.optimizedXyz[1]),
          V.C(wp.optimizedXyz[2])
        )
        const camPos = new Vec3(
          V.C(vp.position[0]),
          V.C(vp.position[1]),
          V.C(vp.position[2])
        )
        const camRot = new Vec4(
          V.C(vp.rotation[0]),
          V.C(vp.rotation[1]),
          V.C(vp.rotation[2]),
          V.C(vp.rotation[3])
        )

        // UI method: uses stored PP and isZReflected
        const projUI = projectWorldPointToPixelQuaternion(
          worldVec,
          camPos,
          camRot,
          V.C(vp.focalLength),
          V.C(vp.aspectRatio),
          V.C(vp.principalPointX),
          V.C(vp.principalPointY),
          V.C(vp.skewCoefficient),
          V.C(vp.radialDistortion[0]),
          V.C(vp.radialDistortion[1]),
          V.C(vp.radialDistortion[2]),
          V.C(vp.tangentialDistortion[0]),
          V.C(vp.tangentialDistortion[1]),
          vp.isZReflected
        )

        // Solver method: uses effective PP and isZReflected=false (like calibration)
        const effectivePPX = vp.isPossiblyCropped ? vp.principalPointX : vp.imageWidth / 2
        const effectivePPY = vp.isPossiblyCropped ? vp.principalPointY : vp.imageHeight / 2
        const projSolver = projectWorldPointToPixelQuaternion(
          worldVec,
          camPos,
          camRot,
          V.C(vp.focalLength),
          V.C(vp.aspectRatio),
          V.C(effectivePPX),
          V.C(effectivePPY),
          V.C(vp.skewCoefficient),
          V.C(vp.radialDistortion[0]),
          V.C(vp.radialDistortion[1]),
          V.C(vp.radialDistortion[2]),
          V.C(vp.tangentialDistortion[0]),
          V.C(vp.tangentialDistortion[1]),
          vp.isZReflected  // Use camera's setting (projection now correctly negates X,Y,Z)
        )

        if (projUI && projSolver) {
          const dxUI = projUI[0].data - imagePoint.u
          const dyUI = projUI[1].data - imagePoint.v
          uiTotalSquaredError += dxUI * dxUI + dyUI * dyUI

          const dxSolver = projSolver[0].data - imagePoint.u
          const dySolver = projSolver[1].data - imagePoint.v
          solverTotalSquaredError += dxSolver * dxSolver + dySolver * dySolver

          ipCount++
        } else {
          behindCameraCount++
        }
      } catch (e) {
        logDebug(`[FineTune] DIAG: IP "${imagePoint.getName()}" projection error: ${e}`)
      }
    }

    const uiRmsError = ipCount > 0 ? Math.sqrt(uiTotalSquaredError / ipCount) : 0
    const solverRmsError = ipCount > 0 ? Math.sqrt(solverTotalSquaredError / ipCount) : 0
    logDebug(`[FineTune] DIAGNOSTIC: Pre-solve RMS (UI method with stored PP) = ${uiRmsError.toFixed(4)} px`)
    logDebug(`[FineTune] DIAGNOSTIC: Pre-solve RMS (Solver method with effective PP) = ${solverRmsError.toFixed(4)} px`)
    logDebug(`[FineTune] DIAGNOSTIC: ${ipCount} image points computed, ${behindCameraCount} behind camera`)

    // Log point lock status
    let freeAxesTotal = 0
    for (const wp of project.worldPoints) {
      const point = wp as WorldPoint
      const xLocked = point.lockedXyz[0] !== null || point.inferredXyz[0] !== null
      const yLocked = point.lockedXyz[1] !== null || point.inferredXyz[1] !== null
      const zLocked = point.lockedXyz[2] !== null || point.inferredXyz[2] !== null
      const freeAxes = (xLocked ? 0 : 1) + (yLocked ? 0 : 1) + (zLocked ? 0 : 1)
      freeAxesTotal += freeAxes
      if (freeAxes === 0) {
        logDebug(`[FineTune] Point "${point.getName()}": ALL LOCKED (x=${point.lockedXyz[0]}, y=${point.lockedXyz[1]}, z=${point.lockedXyz[2]})`)
      }
    }
    logDebug(`[FineTune] Total free point axes: ${freeAxesTotal}`)

    const system = new ConstraintSystem({
      tolerance,
      maxIterations,
      damping,
      verbose,
      optimizeCameraIntrinsics: false, // Fine-tune should never change intrinsics
      regularizationWeight: 0,
      useIsZReflected: true  // Respect camera's isZReflected
    })

    // Fine-tune includes ALL constraints - it should never produce solutions
    // that violate the user's geometric constraints just for lower reprojection error.
    project.worldPoints.forEach(p => system.addPoint(p as WorldPoint))
    project.lines.forEach(l => system.addLine(l as Line))
    project.viewpoints.forEach(v => system.addCamera(v as Viewpoint))
    project.imagePoints.forEach(ip => system.addImagePoint(ip as ImagePoint))
    project.constraints.forEach(c => system.addConstraint(c as Constraint))

    const result = system.solve()
    const solveTimeMs = performance.now() - startTime

    log(`[FineTune] Complete: conv=${result.converged}, iter=${result.iterations}, residual=${result.residual.toFixed(4)}, time=${solveTimeMs.toFixed(0)}ms`)

    return {
      converged: result.converged,
      iterations: result.iterations,
      residual: result.residual,
      solveTimeMs,
      error: result.error ?? undefined
    }
  } catch (error) {
    const solveTimeMs = performance.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Fine-tune failed'
    log(`[FineTune] Error: ${errorMessage}`)

    return {
      converged: false,
      iterations: 0,
      residual: Infinity,
      solveTimeMs,
      error: errorMessage
    }
  } finally {
    // Restore original camera pose lock states
    for (const [viewpoint, wasLocked] of originalPoseLocks) {
      viewpoint.isPoseLocked = wasLocked
    }
  }
}
