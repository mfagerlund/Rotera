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
import { log, clearOptimizationLogs } from './optimization-logger'

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
  log(`[FineTune] Starting fine-tune optimization`)
  log(`[FineTune] WP:${project.worldPoints.size} L:${project.lines.size} VP:${project.viewpoints.size} IP:${project.imagePoints.size} C:${project.constraints.size}`)
  log(`[FineTune] Options: tol=${tolerance}, maxIter=${maxIterations}, lockCameras=${lockCameraPoses}`)

  const startTime = performance.now()

  // Store original pose lock states to restore later
  const originalPoseLocks = new Map<Viewpoint, boolean>()

  // Optionally lock camera poses
  if (lockCameraPoses) {
    for (const vp of project.viewpoints) {
      const viewpoint = vp as Viewpoint
      originalPoseLocks.set(viewpoint, viewpoint.isPoseLocked)
      viewpoint.isPoseLocked = true
    }
  }

  try {
    const system = new ConstraintSystem({
      tolerance,
      maxIterations,
      damping,
      verbose,
      optimizeCameraIntrinsics: !lockCameraPoses, // Don't optimize intrinsics if poses are locked
      regularizationWeight: 0
    })

    // Add all entities
    project.worldPoints.forEach(p => system.addPoint(p as WorldPoint))
    project.lines.forEach(l => system.addLine(l))
    project.viewpoints.forEach(v => system.addCamera(v as Viewpoint))
    project.imagePoints.forEach(ip => system.addImagePoint(ip as ImagePoint))
    project.constraints.forEach(c => system.addConstraint(c))

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
    if (lockCameraPoses) {
      for (const [viewpoint, wasLocked] of originalPoseLocks) {
        viewpoint.isPoseLocked = wasLocked
      }
    }
  }
}
