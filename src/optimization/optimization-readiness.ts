/**
 * Optimization readiness check - determines if a project can be optimized
 * and provides detailed status information.
 *
 * This is the SINGLE source of truth for optimization requirements.
 * Used by both OptimizationPanel and the main toolbar status display.
 */

import { Project } from '../entities/project'
import { WorldPoint } from '../entities/world-point'
import { Viewpoint } from '../entities/viewpoint'
import { canInitializeWithVanishingPoints } from './vanishing-points'

export interface OptimizationReadiness {
  // Counts
  pointCount: number
  unlockedPointCount: number
  lineCount: number
  viewpointCount: number
  constraintCount: number
  lineConstraintCount: number
  pnpObservationCount: number
  projectionConstraintCount: number

  // Degrees of freedom
  totalDOF: number
  constraintDOF: number
  netDOF: number

  // Readiness status
  canOptimize: boolean
  canInitialize: boolean

  // Issues (for display in UI)
  issues: OptimizationIssue[]
}

export interface OptimizationIssue {
  type: 'error' | 'warning' | 'info'
  code: string
  message: string
  shortMessage: string
}

/**
 * Check if a project is ready for optimization.
 * Returns detailed status including any issues preventing optimization.
 */
export function checkOptimizationReadiness(project: Project): OptimizationReadiness {
  const pointArray = Array.from(project.worldPoints.values())
  const lineArray = Array.from(project.lines.values())
  // Only count enabled viewpoints for optimization readiness
  const viewpointArray = Array.from(project.viewpoints.values()).filter(vp => vp.enabledInSolve)

  const unlockedPoints = pointArray.filter(p => !p.isLocked())
  const totalDOF = (unlockedPoints.length * 3) + (viewpointArray.length * 6)

  // Count intrinsic line constraints (direction and length)
  let lineConstraintCount = 0
  for (const line of lineArray) {
    if (line.direction !== 'free') {
      lineConstraintCount += 2
    }
    if (line.hasFixedLength()) {
      lineConstraintCount += 1
    }
  }

  const constraintDOF = project.constraints.size + lineConstraintCount
  const netDOF = Math.max(0, totalDOF - constraintDOF)

  // Count projection constraints
  const projectionCount = Array.from(project.constraints).filter(
    c => c.getConstraintType() === 'projection_point_camera'
  ).length

  // Count image observations from fully constrained world points (valid for PnP)
  // Use isFullyConstrained() to match what initialization actually does
  let pnpObservationCount = 0
  for (const vp of viewpointArray) {
    for (const ip of vp.imagePoints) {
      if (ip.worldPoint.isFullyConstrained()) {
        pnpObservationCount++
      }
    }
  }

  // Track issues
  const issues: OptimizationIssue[] = []

  // Check if any viewpoints are disabled
  const totalViewpoints = project.viewpoints.size
  const disabledViewpoints = totalViewpoints - viewpointArray.length
  if (disabledViewpoints > 0 && viewpointArray.length === 0) {
    issues.push({
      type: 'error',
      code: 'ALL_VIEWPOINTS_DISABLED',
      message: `All ${totalViewpoints} viewpoint(s) are disabled in solve`,
      shortMessage: 'All viewpoints disabled'
    })
  } else if (disabledViewpoints > 0) {
    issues.push({
      type: 'info',
      code: 'VIEWPOINTS_DISABLED',
      message: `${disabledViewpoints} of ${totalViewpoints} viewpoint(s) disabled`,
      shortMessage: `${disabledViewpoints} disabled`
    })
  }

  // Check basic requirements
  const effectiveConstraintCount = project.constraints.size + lineConstraintCount + pnpObservationCount
  const hasEnoughEntities = unlockedPoints.length > 0 || viewpointArray.length > 0

  if (!hasEnoughEntities) {
    issues.push({
      type: 'error',
      code: 'NO_ENTITIES',
      message: 'At least 1 unlocked point or viewpoint is required',
      shortMessage: 'No unlocked entities'
    })
  }

  if (effectiveConstraintCount === 0) {
    issues.push({
      type: 'error',
      code: 'NO_CONSTRAINTS',
      message: 'At least 1 constraint or image observation is required',
      shortMessage: 'No constraints'
    })
  }

  // Check camera initialization requirements
  let canInitialize = true
  const camerasNeedingInit = viewpointArray.length

  if (camerasNeedingInit >= 2) {
    // Use isFullyConstrained() to match what initialization actually does
    const constrainedPoints = pointArray.filter(wp => wp.isFullyConstrained())

    let anyCameraCanUsePnP = false
    if (constrainedPoints.length >= 2) {
      // Check if at least one camera can use PnP: needs 3+ constrained points visible
      for (const vp of viewpointArray) {
        const vpConcrete = vp as Viewpoint
        const vpConstrainedPoints = Array.from(vpConcrete.imagePoints).filter(ip =>
          (ip.worldPoint as WorldPoint).isFullyConstrained()
        )

        if (vpConstrainedPoints.length >= 3) {
          anyCameraCanUsePnP = true
          break
        }
      }
    }

    // Check if any camera can use vanishing point initialization
    // This includes both explicit VanishingLines AND direction-constrained Lines
    let anyCameraCanUseVanishingPoints = false
    if (!anyCameraCanUsePnP) {
      // Check if there's a scale reference from distance constraints
      const hasScaleReference = lineArray.some(l => l.hasFixedLength())
      // With a scale reference, only 1 locked point is needed instead of 2
      const allowSinglePoint = hasScaleReference

      for (const vp of viewpointArray) {
        const vpConcrete = vp as Viewpoint
        // Use the function from vanishing-points module which also considers
        // direction-constrained Lines as virtual vanishing lines
        if (canInitializeWithVanishingPoints(vpConcrete, new Set(pointArray), { allowSinglePoint })) {
          anyCameraCanUseVanishingPoints = true
          break
        }
      }
    }

    if (!anyCameraCanUsePnP && !anyCameraCanUseVanishingPoints) {
      // Fall back to Essential Matrix path: need at least 7 shared correspondences
      const vp1 = viewpointArray[0] as Viewpoint
      const vp2 = viewpointArray[1] as Viewpoint

      const sharedWorldPoints = new Set<WorldPoint>()
      for (const ip1 of vp1.imagePoints) {
        for (const ip2 of vp2.imagePoints) {
          if (ip1.worldPoint === ip2.worldPoint) {
            sharedWorldPoints.add(ip1.worldPoint as WorldPoint)
          }
        }
      }

      if (sharedWorldPoints.size < 7) {
        canInitialize = false
        issues.push({
          type: 'error',
          code: 'INIT_FAILED',
          message: `Need at least 7 shared point correspondences between "${vp1.name}" and "${vp2.name}" (currently have ${sharedWorldPoints.size}). Add more image points that are visible in both cameras, OR lock at least 3 world point coordinates visible in one camera for PnP initialization, OR use vanishing point initialization (2+ axes with 2+ lines each, 2+ locked points visible).`,
          shortMessage: `Need 7 shared points (have ${sharedWorldPoints.size})`
        })
      }
    }
  }

  // Check for scale constraint (at least one constrained point or length constraint)
  // Use isFullyConstrained() to match what optimization actually uses
  const hasConstrainedPoint = pointArray.some(p => p.isFullyConstrained())
  const hasLengthConstraint = lineArray.some(l => l.hasFixedLength())
  if (!hasConstrainedPoint && !hasLengthConstraint && viewpointArray.length > 0) {
    issues.push({
      type: 'warning',
      code: 'NO_SCALE',
      message: 'No fixed point or length constraint. Solution scale will be arbitrary.',
      shortMessage: 'No scale reference'
    })
  }

  // Check for axis definition (vanishing lines or locked coordinates)
  const hasVanishingLines = viewpointArray.some(vp => vp.vanishingLines.size > 0)
  const hasAxisLockedPoints = pointArray.some(p => {
    const xyz = p.lockedXyz
    return xyz[0] !== null || xyz[1] !== null || xyz[2] !== null
  })
  if (!hasVanishingLines && !hasAxisLockedPoints && viewpointArray.length > 0) {
    issues.push({
      type: 'warning',
      code: 'NO_AXIS',
      message: 'No vanishing lines or axis-locked coordinates. Solution orientation will be arbitrary.',
      shortMessage: 'No axis defined'
    })
  }

  const canOptimize = effectiveConstraintCount > 0 && hasEnoughEntities && canInitialize

  return {
    pointCount: pointArray.length,
    unlockedPointCount: unlockedPoints.length,
    lineCount: lineArray.length,
    viewpointCount: viewpointArray.length,
    constraintCount: project.constraints.size,
    lineConstraintCount,
    pnpObservationCount,
    projectionConstraintCount: projectionCount,
    totalDOF,
    constraintDOF,
    netDOF,
    canOptimize,
    canInitialize,
    issues
  }
}

/**
 * Get a simple status for display in compact UI (like toolbar)
 */
export function getOptimizationStatusSummary(readiness: OptimizationReadiness): {
  status: 'ready' | 'warning' | 'error' | 'empty'
  message: string
  color: string
} {
  if (readiness.viewpointCount === 0 && readiness.pointCount === 0) {
    return { status: 'empty', message: 'Empty project', color: '#95a5a6' }
  }

  const errors = readiness.issues.filter(i => i.type === 'error')
  const warnings = readiness.issues.filter(i => i.type === 'warning')

  if (errors.length > 0) {
    return {
      status: 'error',
      message: errors[0].shortMessage,
      color: '#e74c3c'
    }
  }

  if (warnings.length > 0) {
    return {
      status: 'warning',
      message: `Ready (${warnings.map(w => w.shortMessage).join(', ')})`,
      color: '#f39c12'
    }
  }

  return { status: 'ready', message: 'Ready to optimize', color: '#27ae60' }
}
