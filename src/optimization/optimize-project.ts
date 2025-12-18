import { Project } from '../entities/project';
import { ConstraintSystem, SolverResult, SolverOptions } from './constraint-system';
import { initializeWorldPoints } from './entity-initialization';
import { initializeCameraWithPnP, PnPInitializationResult } from './pnp';
import { Viewpoint } from '../entities/viewpoint';
import { WorldPoint } from '../entities/world-point';
import { ImagePoint } from '../entities/imagePoint';
import { Line } from '../entities/line';
import { initializeCamerasWithEssentialMatrix } from './essential-matrix';
import { initializeWorldPoints as unifiedInitialize } from './unified-initialization';
import { triangulateRayRay } from './triangulation';
import { initializeSingleCameraPoints } from './single-camera-initialization';
import { initializeCameraWithVanishingPoints, canInitializeWithVanishingPoints, validateVanishingPoints, computeRotationsFromVPs, estimateFocalLength } from './vanishing-points';
import { alignSceneToLineDirections, alignSceneToLockedPoints, AlignmentQualityCallback, AlignmentResult } from './coordinate-alignment';
import type { IOptimizableCamera } from './IOptimizable';
import { log, clearOptimizationLogs, optimizationLogs } from './optimization-logger';
import type { ValidationResult } from './initialization-types';
import { runFirstTierInitialization } from './camera-initialization';

// Re-export for backwards compatibility
export { log, clearOptimizationLogs, optimizationLogs } from './optimization-logger';

// Version for tracking code updates
const OPTIMIZER_VERSION = '2.4.0-single-vp-init';

// WeakMaps for temporary storage during optimization (avoid polluting entity objects)
const viewpointInitialVps = new WeakMap<Viewpoint, Record<string, { u: number; v: number }>>();
const worldPointSavedInferredXyz = new WeakMap<WorldPoint, [number | null, number | null, number | null]>();

// Export for use in vanishing-points.ts
export { viewpointInitialVps };

// Type guard to check if constraint has points field
function hasPointsField(c: any): c is { points: WorldPoint[] } {
  return 'points' in c && Array.isArray(c.points);
}

/**
 * Reset all cached optimization state on project entities.
 * Call this before each solve to ensure no stale data is reused.
 */
export function resetOptimizationState(project: Project) {

  // Reset world points
  // NOTE: Do NOT clear optimizedXyz here - tests and callers may provide initial values.
  // The auto-initialization pipeline will overwrite if autoInitializeWorldPoints is true.
  for (const wp of project.worldPoints) {
    const point = wp as WorldPoint;
    point.inferredXyz = [null, null, null];
    point.lastResiduals = [];
  }

  // Reset viewpoints (cameras)
  // NOTE: Do NOT clear position/rotation here - tests and callers may provide initial values.
  // The auto-initialization pipeline will overwrite if autoInitializeCameras is true.
  for (const vp of project.viewpoints) {
    const viewpoint = vp as Viewpoint;
    viewpoint.lastResiduals = [];
    // Clear hidden VP cache
    viewpointInitialVps.delete(viewpoint);
  }

  // Reset image points
  for (const ip of project.imagePoints) {
    const imagePoint = ip as ImagePoint;
    imagePoint.lastResiduals = [];
    imagePoint.isOutlier = false;
    imagePoint.reprojectedU = undefined;
    imagePoint.reprojectedV = undefined;
  }

  // Reset lines
  for (const line of project.lines) {
    (line as Line).lastResiduals = [];
  }

  // Reset constraints
  for (const constraint of project.constraints) {
    constraint.lastResiduals = [];
  }

  // Re-run inference propagation to rebuild inferredXyz from constraints
  // CRITICAL: This MUST run synchronously before optimization starts
  project.propagateInferences();
}

function detectOutliers(
  project: Project,
  threshold: number
): { outliers: OutlierInfo[]; medianError: number; actualThreshold: number } {
  const errors: number[] = [];
  const imagePointErrors: Array<{ imagePoint: ImagePoint; error: number }> = [];

  for (const vp of project.viewpoints) {
    for (const ip of vp.imagePoints) {
      const ipConcrete = ip as ImagePoint;
      if (ipConcrete.lastResiduals && ipConcrete.lastResiduals.length === 2) {
        const error = Math.sqrt(ipConcrete.lastResiduals[0] ** 2 + ipConcrete.lastResiduals[1] ** 2);
        errors.push(error);
        imagePointErrors.push({ imagePoint: ipConcrete, error });
      }
    }
  }

  errors.sort((a, b) => a - b);
  const medianError = errors.length > 0 ? errors[Math.floor(errors.length / 2)] : 0;

  const outlierThreshold = medianError < 20
    ? Math.max(threshold * medianError, 50)
    : Math.min(threshold * medianError, 80);

  const outliers: OutlierInfo[] = [];
  for (const { imagePoint, error } of imagePointErrors) {
    if (error > outlierThreshold) {
      outliers.push({
        imagePoint,
        error,
        worldPointName: imagePoint.worldPoint.getName(),
        viewpointName: imagePoint.viewpoint.getName(),
      });
    }
  }

  outliers.sort((a, b) => b.error - a.error);

  return { outliers, medianError, actualThreshold: outlierThreshold };
}

export interface OutlierInfo {
  imagePoint: ImagePoint;
  error: number;
  worldPointName: string;
  viewpointName: string;
}

/**
 * Check which axes need to be flipped to match locked coordinate signs.
 * Returns { flipX, flipY, flipZ } indicating which axes have wrong signs.
 *
 * We compare solved coordinates against locked coordinates to detect sign errors.
 * This is more robust than just checking handedness (which only tells us IF
 * something is wrong, not WHICH axis is wrong).
 */
function checkAxisSigns(worldPoints: WorldPoint[]): { flipX: boolean; flipY: boolean; flipZ: boolean } {
  let flipX = false;
  let flipY = false;
  let flipZ = false;

  for (const wp of worldPoints) {
    const locked = wp.lockedXyz;
    const solved = wp.optimizedXyz;
    if (!locked || !solved) continue;

    // Check X axis: if locked X is non-zero and solved X has opposite sign
    if (locked[0] !== null && locked[0] !== 0 && solved[0] !== null) {
      if (Math.sign(locked[0]) !== Math.sign(solved[0])) {
        log(`[AxisSigns] X mismatch on ${wp.name}: locked=${locked[0]}, solved=${solved[0]}`);
        flipX = true;
      }
    }

    // Check Y axis: if locked Y is non-zero and solved Y has opposite sign
    if (locked[1] !== null && locked[1] !== 0 && solved[1] !== null) {
      if (Math.sign(locked[1]) !== Math.sign(solved[1])) {
        log(`[AxisSigns] Y mismatch on ${wp.name}: locked=${locked[1]}, solved=${solved[1]}`);
        flipY = true;
      }
    }

    // Check Z axis: if locked Z is non-zero and solved Z has opposite sign
    if (locked[2] !== null && locked[2] !== 0 && solved[2] !== null) {
      if (Math.sign(locked[2]) !== Math.sign(solved[2])) {
        log(`[AxisSigns] Z mismatch on ${wp.name}: locked=${locked[2]}, solved=${solved[2]}`);
        flipZ = true;
      }
    }
  }

  return { flipX, flipY, flipZ };
}

/**
 * Check if world points form a right-handed coordinate system.
 * Requires at least 3 axis points (on X, Y, Z axes from origin).
 * Returns null if not enough axis points are found.
 */
function checkHandedness(worldPoints: WorldPoint[]): { isRightHanded: boolean; origin: WorldPoint; xPoint: WorldPoint; yPoint: WorldPoint; zPoint: WorldPoint } | null {
  // Find origin (fully locked at [0,0,0])
  const origin = worldPoints.find(wp => {
    const locked = wp.lockedXyz;
    return locked && locked[0] === 0 && locked[1] === 0 && locked[2] === 0;
  });
  if (!origin) return null;

  // Find X-axis point (locked to [null, 0, 0] or inferred)
  const xPoint = worldPoints.find(wp => {
    if (wp === origin) return false;
    const locked = wp.lockedXyz;
    if (locked && locked[0] === null && locked[1] === 0 && locked[2] === 0) return true;
    const effective = wp.getEffectiveXyz();
    if (effective && effective[1] === 0 && effective[2] === 0 && effective[0] !== 0) return true;
    return false;
  });

  // Find Y-axis point (locked to [0, null, 0] or [0, value, 0])
  const yPoint = worldPoints.find(wp => {
    if (wp === origin || wp === xPoint) return false;
    const locked = wp.lockedXyz;
    if (locked && locked[0] === 0 && locked[2] === 0) return true;
    const effective = wp.getEffectiveXyz();
    if (effective && effective[0] === 0 && effective[2] === 0 && effective[1] !== 0) return true;
    return false;
  });

  // Find Z-axis point (locked to [0, 0, null] or inferred)
  const zPoint = worldPoints.find(wp => {
    if (wp === origin || wp === xPoint || wp === yPoint) return false;
    const locked = wp.lockedXyz;
    if (locked && locked[0] === 0 && locked[1] === 0 && locked[2] === null) return true;
    const effective = wp.getEffectiveXyz();
    if (effective && effective[0] === 0 && effective[1] === 0 && effective[2] !== 0) return true;
    return false;
  });

  if (!xPoint || !yPoint || !zPoint) return null;

  // Get optimized or effective coordinates
  const oPos = origin.optimizedXyz ?? origin.getEffectiveXyz() ?? [0, 0, 0];
  const xPos = xPoint.optimizedXyz ?? xPoint.getEffectiveXyz();
  const yPos = yPoint.optimizedXyz ?? yPoint.getEffectiveXyz();
  const zPos = zPoint.optimizedXyz ?? zPoint.getEffectiveXyz();

  // Check all coordinates are fully defined
  if (!xPos || !yPos || !zPos) return null;
  if (xPos[0] === null || xPos[1] === null || xPos[2] === null) return null;
  if (yPos[0] === null || yPos[1] === null || yPos[2] === null) return null;
  if (zPos[0] === null || zPos[1] === null || zPos[2] === null) return null;
  if (oPos[0] === null || oPos[1] === null || oPos[2] === null) return null;

  // Compute vectors from origin (now TypeScript knows these are all numbers)
  const vx = [xPos[0] - oPos[0], xPos[1] - oPos[1], xPos[2] - oPos[2]];
  const vy = [yPos[0] - oPos[0], yPos[1] - oPos[1], yPos[2] - oPos[2]];
  const vz = [zPos[0] - oPos[0], zPos[1] - oPos[1], zPos[2] - oPos[2]];

  // Cross product X × Y
  const xCrossY = [
    vx[1] * vy[2] - vx[2] * vy[1],
    vx[2] * vy[0] - vx[0] * vy[2],
    vx[0] * vy[1] - vx[1] * vy[0]
  ];

  // Dot with Z - positive for right-handed
  const dot = xCrossY[0] * vz[0] + xCrossY[1] * vz[1] + xCrossY[2] * vz[2];

  return { isRightHanded: dot > 0, origin, xPoint, yPoint, zPoint };
}

/**
 * Apply XY-plane reflection to make coordinate system right-handed.
 *
 * The transformation:
 * - World points: W' = (Wx, Wy, -Wz)
 * - Camera position: C' = (Cx, Cy, -Cz)
 * - Camera rotation: Q' = Q * Qz_180 (multiply by 180° rotation around Z)
 *
 * Why this works:
 * - After Z-flip: rel' = W' - C' = (rel_x, rel_y, -rel_z)
 * - Rz_180 transforms: (rel_x, rel_y, -rel_z) -> (-rel_x, -rel_y, -rel_z)
 * - So: cam' = R * Rz_180 * rel' = R * (-rel_x, -rel_y, -rel_z) = -cam
 * - Projection: u' = f * (-camX) / (-camZ) = f * camX / camZ = u ✓
 *
 * The key insight: R * Sz (reflection) has det=-1 and can't be a quaternion,
 * but R * Rz_180 (rotation) has det=+1 and CAN be a quaternion!
 *
 * Quaternion multiplication: [w,x,y,z] * [0,0,0,1] = [-z, y, -x, w]
 */
/**
 * Apply axis flips to correct coordinate signs.
 *
 * For each flipped axis, we negate that coordinate in world points and camera position.
 * The camera rotation is transformed to preserve projection.
 *
 * Key insight: flipping an axis is a reflection (det=-1), which can't be a quaternion.
 * But an EVEN number of axis flips IS a rotation (det=+1).
 *
 * Algorithm:
 * - If odd number of flips: add one more flip (Z) to make it even, set isZReflected=true
 * - Apply the equivalent rotation to the camera quaternion
 *
 * Rotation equivalents for axis flips:
 * - X+Y flip = Rz_180: [w,x,y,z] * [0,0,0,1] = [-z, y, -x, w]
 * - X+Z flip = Ry_180: [w,x,y,z] * [0,0,1,0] = [-y, -z, w, x]
 * - Y+Z flip = Rx_180: [w,x,y,z] * [0,1,0,0] = [-x, w, z, -y]
 * - X+Y+Z flip = point inversion = no rotation change but isZReflected
 */
function applyAxisFlips(
  worldPoints: WorldPoint[],
  viewpoints: Viewpoint[],
  flipX: boolean,
  flipY: boolean,
  flipZ: boolean
): void {
  const flips = [flipX, flipY, flipZ].filter(f => f).length;

  if (flips === 0) {
    log('[AxisFlips] No flips needed');
    return;
  }

  log(`[AxisFlips] Applying flips: X=${flipX}, Y=${flipY}, Z=${flipZ} (${flips} total)`);

  // Determine if we need isZReflected (odd number of flips)
  let needsZReflected = flips % 2 === 1;
  let actualFlipX = flipX;
  let actualFlipY = flipY;
  let actualFlipZ = flipZ;

  // If odd flips, we add one more Z flip to make it even for quaternion
  // But we still set isZReflected so rendering knows the sign convention
  if (needsZReflected) {
    // Keep track that the effective transform includes the extra Z flip
    // The world coordinates get the original flips, camera gets adjusted
    log('[AxisFlips] Odd number of flips - will set isZReflected=true');
  }

  // Apply flips to world points
  for (const wp of worldPoints) {
    if (wp.optimizedXyz) {
      wp.optimizedXyz = [
        actualFlipX ? -wp.optimizedXyz[0] : wp.optimizedXyz[0],
        actualFlipY ? -wp.optimizedXyz[1] : wp.optimizedXyz[1],
        actualFlipZ ? -wp.optimizedXyz[2] : wp.optimizedXyz[2]
      ];
    }
  }

  // Apply flips to camera position and rotation
  for (const vp of viewpoints) {
    // Flip position coordinates
    vp.position = [
      actualFlipX ? -vp.position[0] : vp.position[0],
      actualFlipY ? -vp.position[1] : vp.position[1],
      actualFlipZ ? -vp.position[2] : vp.position[2]
    ];

    // Transform quaternion based on which axes are flipped
    // We need to apply a rotation that compensates for the coordinate flip
    let [w, x, y, z] = vp.rotation;

    if (actualFlipX && actualFlipY && !actualFlipZ) {
      // X+Y flip = Rz_180: [w,x,y,z] * [0,0,0,1] = [-z, y, -x, w]
      [w, x, y, z] = [-z, y, -x, w];
    } else if (actualFlipX && !actualFlipY && actualFlipZ) {
      // X+Z flip = Ry_180: [w,x,y,z] * [0,0,1,0] = [-y, -z, w, x]
      [w, x, y, z] = [-y, -z, w, x];
    } else if (!actualFlipX && actualFlipY && actualFlipZ) {
      // Y+Z flip = Rx_180: [w,x,y,z] * [0,1,0,0] = [-x, w, z, -y]
      [w, x, y, z] = [-x, w, z, -y];
    } else if (actualFlipX && actualFlipY && actualFlipZ) {
      // X+Y+Z flip = point inversion = no rotation change needed
      // (The even part is X+Y which is Rz_180, plus Z flip makes it odd -> use Rz_180 + isZReflected)
      [w, x, y, z] = [-z, y, -x, w];
    } else if (actualFlipX && !actualFlipY && !actualFlipZ) {
      // X only: X flip = Ry_180 * Sz, so apply Ry_180 and flip Z back (via isZReflected)
      // Ry_180: [w,x,y,z] * [0,0,1,0] = [-y, -z, w, x]
      [w, x, y, z] = [-y, -z, w, x];
    } else if (!actualFlipX && actualFlipY && !actualFlipZ) {
      // Y only: Y flip = Rx_180 * Sz, so apply Rx_180 and flip Z back (via isZReflected)
      // Rx_180: [w,x,y,z] * [0,1,0,0] = [-x, w, z, -y]
      [w, x, y, z] = [-x, w, z, -y];
    } else if (!actualFlipX && !actualFlipY && actualFlipZ) {
      // Z only: our original Rz_180 trick
      // [w,x,y,z] * [0,0,0,1] = [-z, y, -x, w]
      [w, x, y, z] = [-z, y, -x, w];
    }

    vp.rotation = [w, x, y, z];
    vp.isZReflected = needsZReflected;

    log(`[AxisFlips] Camera ${vp.name}: position and rotation transformed, isZReflected=${needsZReflected}`);
  }
}

/**
 * Validate that the project has the minimum requirements for optimization.
 *
 * TIER 1: At least one fully constrained point (locked or inferred).
 * TIER 2: Scale constraint (2+ locked points OR line with targetLength).
 */
function validateProjectConstraints(project: Project): ValidationResult {
  const worldPointArray = Array.from(project.worldPoints) as WorldPoint[];
  const lockedPoints = worldPointArray.filter(wp => wp.isFullyConstrained());

  // TIER 1: Must have at least one fully locked point to anchor the scene
  if (lockedPoints.length === 0) {
    return {
      valid: false,
      error: 'No fully locked world points found. At least one point must have all three ' +
        'coordinates (X, Y, Z) locked to anchor the scene. Lock a point at the origin [0,0,0] ' +
        'or another known position.',
      lockedPoints: 0,
      hasScaleConstraint: false,
    };
  }

  // TIER 2: Must have scale constraint
  const hasLengthConstrainedLine = Array.from(project.lines).some(
    line => line.targetLength !== undefined && line.targetLength > 0
  );
  const hasScaleConstraint = lockedPoints.length >= 2 || hasLengthConstrainedLine;

  if (!hasScaleConstraint) {
    return {
      valid: false,
      error: 'No scale constraint found. The scene needs a known distance to establish scale. Provide either:\n' +
        '  - Two fully locked world points (the distance between them defines scale), OR\n' +
        '  - A line with a defined length (targetLength)',
      lockedPoints: lockedPoints.length,
      hasScaleConstraint: false,
    };
  }

  return {
    valid: true,
    lockedPoints: lockedPoints.length,
    hasScaleConstraint: true,
  };
}

/**
 * Reset cameras and world points for a fresh initialization.
 * Called when autoInitializeCameras is true.
 */
function resetCamerasForInitialization(project: Project): void {
  const viewpointArray = Array.from(project.viewpoints);

  for (const vp of viewpointArray) {
    const v = vp as Viewpoint;
    // Reset pose - always reset when autoInitializeCameras is true
    v.position = [0, 0, 0];
    v.rotation = [1, 0, 0, 0];
    // Reset intrinsics that could be garbage from a previous failed solve
    v.skewCoefficient = 0;
    v.aspectRatio = 1;
    v.radialDistortion = [0, 0, 0];
    v.tangentialDistortion = [0, 0];

    // Reset clearly garbage focalLength
    const minFocalLength = Math.min(v.imageWidth, v.imageHeight) * 0.3;
    const maxFocalLength = Math.max(v.imageWidth, v.imageHeight) * 5;
    if (v.focalLength < minFocalLength || v.focalLength > maxFocalLength) {
      v.focalLength = Math.max(v.imageWidth, v.imageHeight);
    }

    // BUG FIX: Reset focal length for cameras without vanishing lines if it looks optimized
    // Optimized focal lengths are typically 1.5x-3x the sensor-based default.
    // If focal length is far from sensor-based default, reset it to avoid using stale values from previous solve.
    if (v.getVanishingLineCount() === 0) {
      const sensorBasedFocal = Math.max(v.imageWidth, v.imageHeight);
      const ratio = v.focalLength / sensorBasedFocal;
      // If focal length is 1.3x-3x the sensor-based default, it's probably optimized - reset it
      if (ratio > 1.3 || ratio < 0.7) {
        v.focalLength = sensorBasedFocal;
      }
    }

    // Principal point should be within image bounds
    if (v.principalPointX < 0 || v.principalPointX > v.imageWidth ||
        v.principalPointY < 0 || v.principalPointY > v.imageHeight) {
      v.principalPointX = v.imageWidth / 2;
      v.principalPointY = v.imageHeight / 2;
    }
  }

  // BUG FIX: Clear optimizedXyz on ALL world points, not just unconstrained
  // Stale optimizedXyz from previous solve can poison initialization
  const wpArray = Array.from(project.worldPoints) as WorldPoint[];
  for (const wp of wpArray) {
    wp.optimizedXyz = undefined;
  }
}

export interface OptimizeProjectOptions extends Omit<SolverOptions, 'optimizeCameraIntrinsics'> {
  autoInitializeCameras?: boolean;
  autoInitializeWorldPoints?: boolean;
  detectOutliers?: boolean;
  outlierThreshold?: number;
  /**
   * If true, optimize camera intrinsics for all cameras.
   * If false, keep intrinsics fixed.
   * If 'auto' (default), optimize intrinsics only for cameras without vanishing lines.
   */
  optimizeCameraIntrinsics?: boolean | 'auto';
  /**
   * If true (default), cameras initialized via vanishing points will have their
   * pose (position and rotation) locked during the final solve. VP initialization
   * provides accurate calibration that shouldn't be disturbed by less-constrained cameras.
   */
  lockVPCameras?: boolean;
  /**
   * If true (default), apply XY-plane reflection after solving if the result
   * is left-handed, to ensure right-handed coordinate system for Blender compatibility.
   * Set to false to preserve the original coordinate sign convention.
   */
  forceRightHanded?: boolean;
}

export interface OptimizeProjectResult extends SolverResult {
  camerasInitialized?: string[];
  camerasExcluded?: string[];
  outliers?: OutlierInfo[];
  medianReprojectionError?: number;
  solveTimeMs?: number;
}

export function optimizeProject(
  project: Project,
  options: OptimizeProjectOptions = {}
): OptimizeProjectResult {
  // GUARD: Ensure we have an actual Project instance, not a plain object
  // This catches the bug where someone does `{ ...project }` or creates a fake project object
  if (typeof project.propagateInferences !== 'function') {
    throw new Error(
      'optimizeProject received a plain object instead of a Project instance. ' +
      'DO NOT use spread operator on Project or create fake project objects. ' +
      'Pass the actual Project instance from the store.'
    );
  }

  const {
    autoInitializeCameras = true,
    autoInitializeWorldPoints = true,
    detectOutliers: shouldDetectOutliers = true,
    outlierThreshold = 3.0,
    tolerance = 1e-6,
    maxIterations = 10000,
    damping = 0.1,
    verbose = false,
    optimizeCameraIntrinsics = 'auto',
    lockVPCameras = false,
    forceRightHanded = true,
  } = options;

  // Clear logs and reset all cached state before solving
  clearOptimizationLogs();
  resetOptimizationState(project);

  const startTime = performance.now();

  log(`[Optimize] v${OPTIMIZER_VERSION}`);
  log(`[Optimize] WP:${project.worldPoints.size} L:${project.lines.size} VP:${project.viewpoints.size} IP:${project.imagePoints.size} C:${project.constraints.size}`);

  const camerasInitialized: string[] = [];
  // Track cameras initialized via "late PnP" (using triangulated points) - these are vulnerable to degenerate solutions
  const camerasInitializedViaLatePnP = new Set<Viewpoint>();
  // Track cameras initialized via vanishing points - these have reliable pose estimates
  const camerasInitializedViaVP = new Set<Viewpoint>();
  // Track whether Essential Matrix was actually used for initialization
  let usedEssentialMatrix = false;
  // Track if alignment was ambiguous (could be either +Y or -Y)
  let alignmentWasAmbiguous = false;
  // Track which sign was used for alignment (for retry with opposite)
  let alignmentSignUsed: 'positive' | 'negative' | undefined;
  // Track the scale factor applied during initialization (for consistent offsets)
  let appliedScaleFactor = 1.0;
  // Track if stepped VP init was reverted - if so, VPs are known problematic
  let steppedVPInitReverted = false;
  // Track if VP+EM hybrid was applied - if so, skip alignment since VPs already define frame
  let vpEmHybridApplied = false;

  if (autoInitializeCameras || autoInitializeWorldPoints) {
    const viewpointArray = Array.from(project.viewpoints);

    if (autoInitializeCameras) {
      resetCamerasForInitialization(project);
    }

    const uninitializedCameras = viewpointArray.filter(vp => {
      const v = vp as Viewpoint;
      return v.position[0] === 0 && v.position[1] === 0 && v.position[2] === 0;
    });

    if (uninitializedCameras.length >= 1 && autoInitializeCameras) {
      const worldPointArray = Array.from(project.worldPoints) as WorldPoint[];
      // Use isFullyConstrained() - this includes both locked AND inferred coordinates
      // VP initialization can use inferred coordinates for camera position solving
      const lockedPoints = worldPointArray.filter(wp => wp.isFullyConstrained());
      const worldPointSet = new Set<WorldPoint>(worldPointArray);

      // Validate project constraints (Tier 1: locked point, Tier 2: scale constraint)
      const validation = validateProjectConstraints(project);
      if (!validation.valid) {
        throw new Error(validation.error!);
      }

      // Check VP capability with both strict (2+ points) and relaxed (1 point) modes
      const canAnyUninitCameraUseVPStrict = uninitializedCameras.some(vp =>
        canInitializeWithVanishingPoints(vp as Viewpoint, worldPointSet, { allowSinglePoint: false })
      );
      const canAnyUninitCameraUseVPRelaxed = uninitializedCameras.some(vp =>
        canInitializeWithVanishingPoints(vp as Viewpoint, worldPointSet, { allowSinglePoint: true })
      );
      // Use strict mode for decision-making, but note if relaxed mode is available
      const canAnyUninitCameraUseVP = canAnyUninitCameraUseVPStrict || (uninitializedCameras.length === 1 && canAnyUninitCameraUseVPRelaxed);

      // Debug logging for initialization path
      // lockedPts = fully constrained (locked OR inferred), trulyLocked = only user-locked points
      const trulyLockedCount = worldPointArray.filter(wp => wp.isFullyLocked()).length;
      log(`[Init Debug] uninitCameras=${uninitializedCameras.length}, lockedPts=${lockedPoints.length} (trulyLocked=${trulyLockedCount}), canVP=${canAnyUninitCameraUseVP} (relaxed=${canAnyUninitCameraUseVPRelaxed})`);

      if (lockedPoints.length >= 2 || canAnyUninitCameraUseVP || (uninitializedCameras.length === 1 && lockedPoints.length >= 1)) {
        const canAnyCameraUsePnP = uninitializedCameras.some(vp => {
          const vpConcrete = vp as Viewpoint;
          const vpLockedPoints = Array.from(vpConcrete.imagePoints).filter(ip =>
            (ip.worldPoint as WorldPoint).isFullyConstrained()
          );
          return vpLockedPoints.length >= 3;
        });

        // Use standalone function that counts direction-constrained Lines as virtual VLs
        const canAnyCameraUseVP = uninitializedCameras.some(vp =>
          canInitializeWithVanishingPoints(vp as Viewpoint, worldPointSet, { allowSinglePoint: uninitializedCameras.length === 1 })
        );

        const willUseEssentialMatrix = !canAnyCameraUsePnP && !canAnyCameraUseVP;

        if (!willUseEssentialMatrix) {
          for (const wp of lockedPoints) {
            const effective = wp.getEffectiveXyz();
            wp.optimizedXyz = [effective[0]!, effective[1]!, effective[2]!];
          }
        }

        // Run first-tier initialization (VP with 2+ points, then PnP with 3+ points)
        const firstTierResult = runFirstTierInitialization(
          uninitializedCameras as Viewpoint[],
          worldPointSet,
          lockedPoints
        );

        // Merge results into outer scope
        camerasInitialized.push(...firstTierResult.camerasInitialized);
        for (const vp of firstTierResult.camerasInitializedViaVP) {
          camerasInitializedViaVP.add(vp);
        }
      }

      if (camerasInitialized.length === 0) {
        // STEPPED INITIALIZATION: Try VP init with single point for multi-camera scenes
        // If a camera has good VLs and sees a locked point, initialize it first,
        // then use the resulting points to help initialize other cameras
        // NOTE: Only use stepped init if remaining cameras can be reliably initialized via PnP.
        // If PnP fails or is unreliable, fall back to Essential Matrix.
        if (uninitializedCameras.length >= 2 && canAnyUninitCameraUseVPRelaxed && lockedPoints.length >= 1) {
          log(`[Init Stepped] Trying VP init with single locked point before Essential Matrix...`);

          // Set up locked points first
          for (const wp of lockedPoints) {
            const effective = wp.getEffectiveXyz();
            wp.optimizedXyz = [effective[0]!, effective[1]!, effective[2]!];
          }

          // Find and initialize the camera that can use VP with single point
          let steppedInitSucceeded = false;
          for (const vp of uninitializedCameras) {
            const vpConcrete = vp as Viewpoint;
            if (canInitializeWithVanishingPoints(vpConcrete, worldPointSet, { allowSinglePoint: true })) {
              // Save state in case we need to revert
              const savedPosition = [...vpConcrete.position] as [number, number, number];
              const savedRotation = [...vpConcrete.rotation] as [number, number, number, number];
              const savedFocalLength = vpConcrete.focalLength;

              const success = initializeCameraWithVanishingPoints(vpConcrete, worldPointSet, { allowSinglePoint: true });
              if (success) {
                log(`[Init Stepped] ${vpConcrete.name} via VP (single point), f=${vpConcrete.focalLength.toFixed(0)}`);
                camerasInitialized.push(vpConcrete.name);
                camerasInitializedViaVP.add(vpConcrete);

                // After VP init, try to initialize remaining cameras using PnP with constrained points
                // The inference system should have propagated coordinates to points on axis lines
                const remainingCameras = uninitializedCameras.filter(c => c !== vpConcrete);
                let allRemainingReliable = true;
                const remainingCameraResults: { vp: Viewpoint, success: boolean }[] = [];

                for (const remainingVp of remainingCameras) {
                  const remVpConcrete = remainingVp as Viewpoint;
                  const remConstrainedPoints = Array.from(remVpConcrete.imagePoints).filter(ip =>
                    (ip.worldPoint as WorldPoint).isFullyConstrained()
                  );
                  if (remConstrainedPoints.length >= 3) {
                    const pnpResult = initializeCameraWithPnP(remVpConcrete, worldPointSet);
                    if (pnpResult.success && pnpResult.reliable) {
                      log(`[Init Stepped] ${remVpConcrete.name} via PnP (after VP), pos=[${remVpConcrete.position.map(x => x.toFixed(1)).join(',')}]`);
                      remainingCameraResults.push({ vp: remVpConcrete, success: true });
                    } else {
                      log(`[Init Stepped] ${remVpConcrete.name} PnP unreliable after VP: ${pnpResult.reason || 'unknown'}`);
                      allRemainingReliable = false;
                    }
                  } else {
                    log(`[Init Stepped] ${remVpConcrete.name} needs ${remConstrainedPoints.length}/3 constrained points for PnP`);
                    allRemainingReliable = false;
                  }
                }

                // If all remaining cameras were reliably initialized, commit the results
                if (allRemainingReliable && remainingCameraResults.length === remainingCameras.length) {
                  for (const result of remainingCameraResults) {
                    camerasInitialized.push(result.vp.name);
                  }
                  steppedInitSucceeded = true;
                } else {
                  // Revert VP initialization and fall back to Essential Matrix
                  log(`[Init Stepped] Reverting VP init - remaining cameras not reliably initialized, trying Essential Matrix`);
                  vpConcrete.position = savedPosition;
                  vpConcrete.rotation = savedRotation;
                  vpConcrete.focalLength = savedFocalLength;
                  camerasInitialized.pop(); // Remove the VP-initialized camera
                  camerasInitializedViaVP.delete(vpConcrete);
                  steppedVPInitReverted = true; // Mark that VP init failed - skip VP+EM hybrid
                  // Clear optimizedXyz for locked points so Essential Matrix can set them fresh
                  for (const wp of lockedPoints) {
                    wp.optimizedXyz = undefined;
                  }
                }
                break; // Done with stepped initialization attempt
              }
            }
          }

          // If stepped init didn't fully succeed, camerasInitialized is empty and we fall through to Essential Matrix
          if (!steppedInitSucceeded && camerasInitialized.length > 0) {
            // Partial success - some cameras initialized but not all reliably
            // This shouldn't happen with the revert logic above, but just in case
            log(`[Init Stepped] Partial success - continuing with ${camerasInitialized.length} cameras`);
          }
        }
      }

      if (camerasInitialized.length === 0) {
        // For single-camera scenes, check if late PnP is viable (has constrained points from inference)
        const singleCameraWithConstrainedPoints = uninitializedCameras.length === 1 &&
          Array.from((uninitializedCameras[0] as Viewpoint).imagePoints).some(ip =>
            (ip.worldPoint as WorldPoint).isFullyConstrained()
          );

        log(`[Init Debug] No cameras initialized. uninitCameras=${uninitializedCameras.length}, canUseLatePnP=${singleCameraWithConstrainedPoints}`);

        if (uninitializedCameras.length < 2 && !singleCameraWithConstrainedPoints) {
          log(`[Init Debug] FAILING: Single camera needs constrained points visible`);
          throw new Error(
            'Single camera optimization requires the locked point(s) to be visible in the image. ' +
            'Either: (1) add image points for your locked world points, or (2) add a second camera ' +
            'with 7+ shared points for Essential Matrix initialization.'
          );
        }

        // Single camera will use late PnP - skip Essential Matrix
        if (singleCameraWithConstrainedPoints) {
          log(`[Init Debug] Single camera will use late PnP with constrained points`);
          // Skip Essential Matrix - camera will be initialized via late PnP
        } else {
          // Essential Matrix path requires 2+ cameras (already validated above)
          const vp1 = uninitializedCameras[0] as Viewpoint;
          const vp2 = uninitializedCameras[1] as Viewpoint;

          // Reset intrinsics to safe defaults for Essential Matrix
          for (const vp of [vp1, vp2]) {
            vp.focalLength = Math.max(vp.imageWidth, vp.imageHeight);
            vp.principalPointX = vp.imageWidth / 2;
            vp.principalPointY = vp.imageHeight / 2;
          }

          const result = initializeCamerasWithEssentialMatrix(vp1, vp2, 10.0);

          if (result.success) {
            log(`[Init] EssentialMatrix: ${vp1.name}=[${vp1.position.map(x => x.toFixed(1)).join(',')}], ${vp2.name}=[${vp2.position.map(x => x.toFixed(1)).join(',')}]`);
            camerasInitialized.push(vp1.name, vp2.name);
            usedEssentialMatrix = true;

            // HYBRID VP+EM: If cameras have vanishing lines, use VP rotation BEFORE triangulation
            // This ensures the coordinate frame is world-axis-aligned from the start
            // Skip if stepped VP init was reverted - the VP rotation may not be compatible with EM
            if (steppedVPInitReverted) {
              log(`[VP+EM] Skipping - stepped VP init was reverted`);
            } else {
            log(`[VP+EM] Checking cameras for VP rotation...`);
            for (const vp of [vp1, vp2]) {
              const vpValidation = validateVanishingPoints(vp);
              const vpCount = vpValidation.vanishingPoints ? Object.keys(vpValidation.vanishingPoints).length : 0;
              log(`[VP+EM] ${vp.name}: isValid=${vpValidation.isValid}, vpCount=${vpCount}`);
              if (vpValidation.isValid && vpCount >= 2) {
                // Compute focal length from VPs if we have 2+
                const vps = vpValidation.vanishingPoints!;
                const pp = { u: vp.principalPointX, v: vp.principalPointY };
                const vpKeys = Object.keys(vps) as ('x' | 'y' | 'z')[];

                // Try to estimate focal length from orthogonal VPs
                let vpFocalLength: number | null = null;
                if (vpKeys.length >= 2) {
                  vpFocalLength = estimateFocalLength(vps[vpKeys[0]]!, vps[vpKeys[1]]!, pp);
                }
                const focalLength = vpFocalLength && vpFocalLength > 100 ? vpFocalLength : vp.focalLength;

                const vpRotations = computeRotationsFromVPs(vps, focalLength, pp);
                if (vpRotations && vpRotations.length > 0) {
                  const q_vp = vpRotations[0]; // Use first candidate rotation

                  // Save the EM-derived rotation before overwriting
                  const q_em_1 = [...vp1.rotation] as [number, number, number, number];
                  const q_em_2 = [...vp2.rotation] as [number, number, number, number];
                  const pos_2 = [...vp2.position] as [number, number, number];

                  // Apply VP rotation as global rotation to the scene
                  // vp1 gets the VP rotation directly
                  vp1.rotation = q_vp;

                  // vp2's rotation: q_vp * (q_em_1^-1 * q_em_2) = q_vp * relative_rotation
                  // Since q_em_1 = identity, relative = q_em_2, so: q_vp * q_em_2
                  const qMult = (a: number[], b: number[]): [number, number, number, number] => {
                    return [
                      a[0]*b[0] - a[1]*b[1] - a[2]*b[2] - a[3]*b[3],
                      a[0]*b[1] + a[1]*b[0] + a[2]*b[3] - a[3]*b[2],
                      a[0]*b[2] - a[1]*b[3] + a[2]*b[0] + a[3]*b[1],
                      a[0]*b[3] + a[1]*b[2] - a[2]*b[1] + a[3]*b[0]
                    ];
                  };

                  // vp2's rotation needs to account for the global rotation change
                  // Original: R_em_2 in EM frame. New frame: rotate by R_vp
                  // New rotation: R_vp (since the world frame is rotated by R_vp)
                  // But R_em_2 = R_vp * R_relative, so R_relative = R_vp^-1 * R_em_2
                  // In new frame: R_new_2 = R_vp * R_relative = R_em_2
                  // Wait, that's not quite right. Let me think again...
                  //
                  // In EM frame: cam1 at identity, cam2 at q_em_2
                  // We want cam1 at q_vp instead
                  // This is a global rotation of the world by q_vp
                  // In new frame: cam1 = q_vp, cam2 = q_vp * q_em_2 (quaternion multiply)
                  vp2.rotation = qMult(q_vp, q_em_2);

                  // Rotate vp2's position by q_vp (since we're rotating the world frame)
                  const rotateVec = (q: number[], v: number[]): [number, number, number] => {
                    const qw = q[0], qx = q[1], qy = q[2], qz = q[3];
                    const vx = v[0], vy = v[1], vz = v[2];
                    const tx = 2 * (qy * vz - qz * vy);
                    const ty = 2 * (qz * vx - qx * vz);
                    const tz = 2 * (qx * vy - qy * vx);
                    return [
                      vx + qw * tx + (qy * tz - qz * ty),
                      vy + qw * ty + (qz * tx - qx * tz),
                      vz + qw * tz + (qx * ty - qy * tx)
                    ];
                  };
                  vp2.position = rotateVec(q_vp, pos_2);

                  // Update focal length if VP-estimated was better
                  if (vpFocalLength && vpFocalLength > 100) {
                    vp.focalLength = vpFocalLength;
                    log(`[Init] VP focal: ${vp.name} f=${vpFocalLength.toFixed(0)}`);
                  }

                  log(`[Init] VP+EM hybrid: Applied VP rotation from ${vp.name} to align world frame`);
                  log(`[Init] VP+EM: ${vp1.name} rot=[${vp1.rotation.map(x => x.toFixed(3)).join(',')}]`);
                  log(`[Init] VP+EM: ${vp2.name} pos=[${vp2.position.map(x => x.toFixed(1)).join(',')}] rot=[${vp2.rotation.map(x => x.toFixed(3)).join(',')}]`);
                  vpEmHybridApplied = true;
                  break; // Only apply from first camera with good VPs
                }
              }
            }
            } // end of VP+EM hybrid
          } else {
            throw new Error(`Essential Matrix failed: ${result.error || 'Unknown'}. Need 7+ shared points.`);
          }
        }
      }
    }
  }

  const wpArrayForCheck = Array.from(project.worldPoints) as WorldPoint[];
  const lockedPointsForCheck = wpArrayForCheck.filter(wp => wp.isFullyConstrained());

  // Track if we have under-constrained axis configuration (single axis = 1 unresolved DoF)
  let hasSingleAxisConstraint = false;

  if (autoInitializeWorldPoints) {
    const pointArray = Array.from(project.worldPoints);
    const lineArray = Array.from(project.lines);
    const constraintArray = Array.from(project.constraints);

    // Note: We used to clear all optimizedXyz here, but that breaks some fixtures
    // that rely on the pre-computed values. The initialization pipeline should
    // overwrite these anyway when needed.

    const initializedViewpointSet = new Set<Viewpoint>();
    for (const vpName of camerasInitialized) {
      const vp = Array.from(project.viewpoints).find(v => v.name === vpName);
      if (vp) {
        initializedViewpointSet.add(vp as Viewpoint);
      }
    }

    // Compute axis-constrained lines early so we know if free-solve is needed
    const viewpointArray = Array.from(project.viewpoints) as Viewpoint[];
    const axisConstrainedLines = lineArray.filter(l => l.direction && ['x', 'y', 'z'].includes(l.direction));

    // Count unique axis directions - single axis leaves rotation underconstrained
    const uniqueAxisDirections = new Set(axisConstrainedLines.map(l => l.direction));
    const hasSingleAxisOnly = uniqueAxisDirections.size === 1;

    // Essential Matrix places a camera at origin [0,0,0]. If a locked point is also at origin,
    // triangulated points will be in a coordinate system where camera and locked point coincide.
    // After scaling/translation, the camera ends up AT the locked point, causing a singularity.
    // The camera-at-origin fix later moves the camera back, but this creates geometric inconsistency
    // because all triangulated points were computed assuming camera was at origin.
    // Apply offset when:
    // - Single-axis cases (rotation underconstrained, camera-at-origin fix causes problems)
    // - OR stepped VP init was reverted (VPs are problematic, Essential Matrix is fallback)
    if (usedEssentialMatrix && (hasSingleAxisOnly || steppedVPInitReverted)) {
      const hasLockedPointAtOrigin = lockedPointsForCheck.some(wp => {
        const eff = wp.getEffectiveXyz();
        const distFromOrigin = Math.sqrt((eff[0] ?? 0)**2 + (eff[1] ?? 0)**2 + (eff[2] ?? 0)**2);
        return distFromOrigin < 0.1;
      });

      // Check if ANY camera is at origin (Essential Matrix can place either camera at origin)
      const anyCameraAtOrigin = viewpointArray.some(vp =>
        Math.sqrt(vp.position[0]**2 + vp.position[1]**2 + vp.position[2]**2) < 0.1
      );

      if (hasLockedPointAtOrigin && anyCameraAtOrigin) {
        // Offset all cameras so none are at origin
        // This preserves relative poses while avoiding the origin conflict
        const offset: [number, number, number] = [0, 0, -10];
        log(`[Init] Camera at origin conflicts with locked point - offsetting cameras by [${offset.join(',')}]`);
        for (const vp of viewpointArray) {
          vp.position = [
            vp.position[0] + offset[0],
            vp.position[1] + offset[1],
            vp.position[2] + offset[2],
          ];
        }
      }
    }

    // For Essential Matrix WITHOUT axis constraints, use "free solve then align" approach:
    // 1. DON'T pre-set locked points to their target positions
    // 2. Triangulate everything in the Essential Matrix coordinate frame
    // 3. Run a preliminary optimization to satisfy geometric constraints
    // 4. Apply a similarity transform to align with locked points
    // This is ONLY needed when axis constraints don't exist to fix orientation.
    const useFreeSolve = usedEssentialMatrix && axisConstrainedLines.length === 0;
    if (useFreeSolve) {
      log('[FreeSolve] No axis constraints - using free solve then align');
    }

    unifiedInitialize(pointArray, lineArray, constraintArray, {
      sceneScale: 10.0,
      verbose: false,
      initializedViewpoints: initializedViewpointSet,
      skipLockedPoints: useFreeSolve,
      // For Essential Matrix with single axis, skip inference so scale is computed from triangulated geometry
      // Multi-axis cases need inference to properly constrain the geometry
      skipAxisLineInference: usedEssentialMatrix && hasSingleAxisOnly,
    });

    if (axisConstrainedLines.length > 0) {
      // Create quality callback for degenerate Essential Matrix cases.
      // This runs a preliminary solve and returns the residual.
      const qualityCallback: AlignmentQualityCallback | undefined = usedEssentialMatrix
        ? (maxIterations: number) => {
            // Apply scale and translation before testing
            const linesWithTargetLength = axisConstrainedLines.filter(l => l.targetLength !== undefined);
            if (linesWithTargetLength.length > 0) {
              let sumScale = 0;
              let count = 0;
              for (const line of linesWithTargetLength) {
                const posA = line.pointA.optimizedXyz;
                const posB = line.pointB.optimizedXyz;
                if (posA && posB && line.targetLength) {
                  const currentLength = Math.sqrt(
                    (posB[0] - posA[0]) ** 2 + (posB[1] - posA[1]) ** 2 + (posB[2] - posA[2]) ** 2
                  );
                  if (currentLength > 0.01) {
                    sumScale += line.targetLength / currentLength;
                    count++;
                  }
                }
              }
              if (count > 0) {
                const scale = sumScale / count;
                for (const wp of pointArray) {
                  if (wp.optimizedXyz) {
                    wp.optimizedXyz = [wp.optimizedXyz[0] * scale, wp.optimizedXyz[1] * scale, wp.optimizedXyz[2] * scale];
                  }
                }
                for (const vp of viewpointArray) {
                  vp.position = [vp.position[0] * scale, vp.position[1] * scale, vp.position[2] * scale];
                }
              }
            }

            // Translate to anchor point
            const anchorPoint = lockedPointsForCheck.find(wp => wp.optimizedXyz !== undefined);
            if (anchorPoint && anchorPoint.optimizedXyz) {
              const target = anchorPoint.getEffectiveXyz();
              const current = anchorPoint.optimizedXyz;
              const translation = [
                target[0]! - current[0],
                target[1]! - current[1],
                target[2]! - current[2],
              ];
              for (const wp of pointArray) {
                if (wp.optimizedXyz) {
                  wp.optimizedXyz = [
                    wp.optimizedXyz[0] + translation[0],
                    wp.optimizedXyz[1] + translation[1],
                    wp.optimizedXyz[2] + translation[2],
                  ];
                }
              }
              for (const vp of viewpointArray) {
                vp.position = [
                  vp.position[0] + translation[0],
                  vp.position[1] + translation[1],
                  vp.position[2] + translation[2],
                ];
              }
            }

            // Run a solve to test alignment quality
            const testSystem = new ConstraintSystem({
              maxIterations,
              tolerance: 1e-4,
              verbose: false,
            });
            pointArray.forEach(p => testSystem.addPoint(p));
            lineArray.forEach(l => testSystem.addLine(l));
            viewpointArray.forEach(v => testSystem.addCamera(v));
            for (const ip of project.imagePoints) {
              testSystem.addImagePoint(ip as ImagePoint);
            }
            for (const c of constraintArray) {
              testSystem.addConstraint(c);
            }
            const testResult = testSystem.solve();
            return testResult.residual ?? Infinity;
          }
        : undefined;

      // Align scene to line directions
      // Skip if VP+EM hybrid was applied - the VP rotation already defines the world frame
      let alignmentResult: AlignmentResult;
      if (vpEmHybridApplied) {
        log(`[Align] Skipping - VP+EM hybrid already aligned world frame`);
        alignmentResult = { success: true, ambiguous: false };
      } else {
        alignmentResult = alignSceneToLineDirections(viewpointArray, pointArray, lineArray, usedEssentialMatrix, qualityCallback);
      }

      // Track if alignment was ambiguous for potential retry
      alignmentWasAmbiguous = alignmentResult.ambiguous;
      // Track which sign was used (positive = dotPreferPositive direction)
      // Since alignment returns ambiguous when it couldn't decide, we know it used positive
      // (see coordinate-alignment.ts line ~509: usePositive = dotPreferPositive)
      alignmentSignUsed = 'positive';

      // Apply scale from line target lengths
      // Only use lines with TRIANGULATED endpoints - skip lines where both endpoints are inferred/locked
      // because those are already at their target length (scale=1) and would corrupt the average
      const linesWithTargetLength = axisConstrainedLines.filter(l => l.targetLength !== undefined);
      log(`[Scale] axisConstrainedLines=${axisConstrainedLines.length}, linesWithTargetLength=${linesWithTargetLength.length}, usedEssentialMatrix=${usedEssentialMatrix}`);
      if (linesWithTargetLength.length > 0 && usedEssentialMatrix) {
        let sumScale = 0;
        let count = 0;
        for (const line of linesWithTargetLength) {
          const posA = line.pointA.optimizedXyz;
          const posB = line.pointB.optimizedXyz;
          // Check if each point's position came from inference (matches effective coords on constrained axes)
          // rather than triangulation. If so, skip this line for scale computation.
          const isFromInference = (wp: WorldPoint): boolean => {
            if (!wp.optimizedXyz) return false;
            const eff = wp.getEffectiveXyz();
            // Check each constrained axis - if they all match, position is from inference
            let hasConstraint = false;
            for (let i = 0; i < 3; i++) {
              if (eff[i] !== null) {
                hasConstraint = true;
                // Allow small tolerance for floating point
                if (Math.abs(wp.optimizedXyz[i] - eff[i]!) > 0.01) {
                  return false; // Position differs from constraint, so it was triangulated
                }
              }
            }
            return hasConstraint; // Has constraints and position matches them
          };
          const aFromInference = isFromInference(line.pointA);
          const bFromInference = isFromInference(line.pointB);
          if (aFromInference && bFromInference) {
            log(`[Scale] Line ${line.pointA.name}-${line.pointB.name}: skipped (both endpoints from inference)`);
            continue;
          }
          if (posA && posB && line.targetLength) {
            const currentLength = Math.sqrt(
              (posB[0] - posA[0]) ** 2 + (posB[1] - posA[1]) ** 2 + (posB[2] - posA[2]) ** 2
            );
            if (currentLength > 0.01) {
              sumScale += line.targetLength / currentLength;
              count++;
              log(`[Scale] Line ${line.pointA.name}-${line.pointB.name}: current=${currentLength.toFixed(3)}, target=${line.targetLength}, scale=${(line.targetLength / currentLength).toFixed(3)}`);
            }
          }
        }
        if (count > 0) {
          const scale = sumScale / count;
          appliedScaleFactor = scale;
          log(`[Scale] Axis lines: scale=${scale.toFixed(3)} from ${count} lines`);
          for (const wp of pointArray) {
            if (wp.optimizedXyz) {
              wp.optimizedXyz = [wp.optimizedXyz[0] * scale, wp.optimizedXyz[1] * scale, wp.optimizedXyz[2] * scale];
            }
          }
          for (const vp of viewpointArray) {
            vp.position = [vp.position[0] * scale, vp.position[1] * scale, vp.position[2] * scale];
          }
        }
      }

      // After axis alignment and scaling, translate scene to align with locked points
      // This ensures locked points (especially origin) are at their correct positions
      if (usedEssentialMatrix && lockedPointsForCheck.length >= 1) {
        // Find the first fully-locked point with an optimized position
        const anchorPoint = lockedPointsForCheck.find(wp => wp.optimizedXyz !== undefined);
        if (anchorPoint && anchorPoint.optimizedXyz) {
          const target = anchorPoint.getEffectiveXyz();
          const current = anchorPoint.optimizedXyz;
          const translation = [
            target[0]! - current[0],
            target[1]! - current[1],
            target[2]! - current[2],
          ];

          // Only apply if translation is significant
          const translationMag = Math.sqrt(translation[0]**2 + translation[1]**2 + translation[2]**2);
          if (translationMag > 0.001) {
            log(`[Translate] Aligning ${anchorPoint.name} by [${translation.map(t => t.toFixed(2)).join(', ')}]`);

            // Translate all world points
            for (const wp of pointArray) {
              if (wp.optimizedXyz) {
                wp.optimizedXyz = [
                  wp.optimizedXyz[0] + translation[0],
                  wp.optimizedXyz[1] + translation[1],
                  wp.optimizedXyz[2] + translation[2],
                ];
              }
            }

            // Translate all cameras
            for (const vp of viewpointArray) {
              vp.position = [
                vp.position[0] + translation[0],
                vp.position[1] + translation[1],
                vp.position[2] + translation[2],
              ];
            }
          }
        }
      }

      const uniqueAxes = new Set(axisConstrainedLines.map(l => l.direction));
      if (usedEssentialMatrix && uniqueAxes.size < 2) {
        log('[WARN] Single axis constraint - one rotational DoF unresolved');
        hasSingleAxisConstraint = true;
      }

      // Check for degenerate case: camera at same position as a LOCKED point it observes
      // This causes numerical singularity (can't project a point at camera center)
      for (const vp of viewpointArray) {
        for (const wp of lockedPointsForCheck) {
          // Check if this camera observes this world point
          const observes = Array.from(vp.imagePoints).some(ip => (ip as ImagePoint).worldPoint === wp);
          if (!observes) continue;

          const target = wp.getEffectiveXyz();
          const dx = vp.position[0] - target[0]!;
          const dy = vp.position[1] - target[1]!;
          const dz = vp.position[2] - target[2]!;
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

          if (dist < 0.5) {
            // Camera is AT the locked world point - move it back
            // Camera viewing direction in world space (rotate [0,0,1] by camera rotation)
            const q = vp.rotation;
            const viewDir = [
              2 * (q[1] * q[3] + q[0] * q[2]),
              2 * (q[2] * q[3] - q[0] * q[1]),
              q[0]*q[0] - q[1]*q[1] - q[2]*q[2] + q[3]*q[3],
            ];
            // Move camera backward (opposite view direction) by 10 units (scaled for large scenes)
            const backwardDistance = 10 * appliedScaleFactor;
            vp.position = [
              vp.position[0] - viewDir[0] * backwardDistance,
              vp.position[1] - viewDir[1] * backwardDistance,
              vp.position[2] - viewDir[2] * backwardDistance,
            ];
            log(`[Fix] Camera ${vp.name} at locked point ${wp.name} - moved back by ${backwardDistance.toFixed(2)}`);
          }
        }
      }
    } else if (usedEssentialMatrix && lockedPointsForCheck.length < 2) {
      log('[WARN] No axis constraints + <2 locked points - orientation arbitrary');
    }

    // For Essential Matrix WITHOUT axis constraints: Run preliminary optimization
    // with all points free, then align to locked points via similarity transform.
    if (useFreeSolve && constraintArray.length > 0) {
      // Temporarily unlock points for free optimization
      const savedLockedXyz = new Map<WorldPoint, [number | null, number | null, number | null]>();
      for (const wp of lockedPointsForCheck) {
        savedLockedXyz.set(wp, [...wp.lockedXyz] as [number | null, number | null, number | null]);
        wp.lockedXyz = [null, null, null];
        worldPointSavedInferredXyz.set(wp, [...wp.inferredXyz] as [number | null, number | null, number | null]);
        wp.inferredXyz = [null, null, null];
      }

      const freeSystem = new ConstraintSystem({
        tolerance,
        maxIterations: 200,
        damping,
        verbose: false,
        optimizeCameraIntrinsics: false,
      });

      pointArray.forEach(p => freeSystem.addPoint(p));
      lineArray.forEach(l => freeSystem.addLine(l));
      const vpArray = Array.from(project.viewpoints) as Viewpoint[];
      vpArray.forEach(v => freeSystem.addCamera(v));
      for (const ip of project.imagePoints) {
        freeSystem.addImagePoint(ip as ImagePoint);
      }
      for (const c of constraintArray) {
        freeSystem.addConstraint(c);
      }

      const freeResult = freeSystem.solve();
      log(`[FreeSolve] Prelim: conv=${freeResult.converged}, iter=${freeResult.iterations}, res=${freeResult.residual.toFixed(3)}`);

      // Restore locks
      for (const [wp, lockedXyz] of savedLockedXyz) {
        wp.lockedXyz = lockedXyz;
        const savedInferred = worldPointSavedInferredXyz.get(wp);
        if (savedInferred) {
          wp.inferredXyz = savedInferred;
          worldPointSavedInferredXyz.delete(wp);
        }
      }
    }

    // Apply similarity transform to align with locked points (free-solve path)
    if (useFreeSolve && lockedPointsForCheck.length >= 1) {
      const vpArrayForAlignment = Array.from(project.viewpoints) as Viewpoint[];
      alignSceneToLockedPoints(vpArrayForAlignment, pointArray, lockedPointsForCheck);
    } else if (!usedEssentialMatrix && lockedPointsForCheck.length >= 2) {
      // PnP initialization path - compute and apply scale
      const triangulatedLockedPoints = lockedPointsForCheck.filter(wp => wp.optimizedXyz !== undefined);

      if (triangulatedLockedPoints.length >= 2) {
        let sumScale = 0;
        let count = 0;

        for (let i = 0; i < triangulatedLockedPoints.length; i++) {
          for (let j = i + 1; j < triangulatedLockedPoints.length; j++) {
            const wp1 = triangulatedLockedPoints[i];
            const wp2 = triangulatedLockedPoints[j];
            const tri1 = wp1.optimizedXyz!;
            const tri2 = wp2.optimizedXyz!;
            const lock1 = wp1.getEffectiveXyz();
            const lock2 = wp2.getEffectiveXyz();

            const triDist = Math.sqrt((tri2[0] - tri1[0]) ** 2 + (tri2[1] - tri1[1]) ** 2 + (tri2[2] - tri1[2]) ** 2);
            const lockDist = Math.sqrt((lock2[0]! - lock1[0]!) ** 2 + (lock2[1]! - lock1[1]!) ** 2 + (lock2[2]! - lock1[2]!) ** 2);

            if (triDist > 0.01) {
              sumScale += lockDist / triDist;
              count++;
            }
          }
        }

        if (count > 0) {
          const scale = sumScale / count;
          log(`[Scale] Applied scale=${scale.toFixed(3)} from ${count} point pairs`);

          for (const wp of pointArray) {
            if (wp.optimizedXyz) {
              wp.optimizedXyz = [wp.optimizedXyz[0] * scale, wp.optimizedXyz[1] * scale, wp.optimizedXyz[2] * scale];
            }
          }
          for (const vp of Array.from(project.viewpoints) as Viewpoint[]) {
            vp.position = [vp.position[0] * scale, vp.position[1] * scale, vp.position[2] * scale];
          }
        }
      }
    }
  }

  if (autoInitializeCameras) {
    const viewpointArray = Array.from(project.viewpoints);
    const worldPointSet = new Set(project.worldPoints);

    const stillUninitializedCameras = viewpointArray.filter(vp => {
      return !camerasInitialized.includes(vp.name);
    });

    // Check if any uninitialized cameras will need late PnP (not enough constrained points for regular PnP)
    const camerasNeedingLatePnP = stillUninitializedCameras.filter(vp => {
      const vpConcrete = vp as Viewpoint;
      const hasImagePoints = vpConcrete.imagePoints.size > 0;
      const vpConstrainedPoints = Array.from(vpConcrete.imagePoints).filter(ip =>
        (ip.worldPoint as WorldPoint).isFullyConstrained()
      );
      const canUseVP = vpConcrete.canInitializeWithVanishingPoints(worldPointSet);
      // Needs late PnP if: has image points, not enough for regular PnP, and can't use VP
      return hasImagePoints && vpConstrainedPoints.length < 3 && !canUseVP;
    });

    // Check if late-PnP cameras share enough points with each other for multi-camera triangulation.
    // If they do, they can constrain each other and don't need preliminary solve.
    let latePnPCamerasCanSelfConstrain = false;
    if (camerasNeedingLatePnP.length >= 2) {
      // Count shared world points between late-PnP cameras
      const worldPointsSeenByLatePnP = new Map<WorldPoint, number>();
      for (const vp of camerasNeedingLatePnP) {
        const vpConcrete = vp as Viewpoint;
        for (const ip of vpConcrete.imagePoints) {
          const wp = ip.worldPoint as WorldPoint;
          const count = worldPointsSeenByLatePnP.get(wp) ?? 0;
          worldPointsSeenByLatePnP.set(wp, count + 1);
        }
      }
      // Count how many world points are seen by 2+ late-PnP cameras
      const sharedPoints = Array.from(worldPointsSeenByLatePnP.values()).filter(count => count >= 2).length;
      // If 5+ shared points, they can triangulate together well
      if (sharedPoints >= 5) {
        latePnPCamerasCanSelfConstrain = true;
        log(`[Prelim] Skip: ${camerasNeedingLatePnP.length} late-PnP cameras share ${sharedPoints} points`);
      }
    }

    // If we have VP-initialized cameras and cameras that will need late PnP,
    // run a preliminary solve with just the VP cameras to establish accurate
    // world point positions BEFORE late PnP initialization.
    // This is critical because single-camera triangulation gives unreliable depth.
    // BUT: skip if late-PnP cameras share enough points to constrain each other.
    if (camerasInitialized.length > 0 && camerasNeedingLatePnP.length > 0 && !latePnPCamerasCanSelfConstrain) {
      log(`[Prelim] ${camerasInitialized.length} init camera(s), ${camerasNeedingLatePnP.length} need late PnP`);
      const prelimSystem = new ConstraintSystem({
        tolerance,
        maxIterations: 500,
        damping,
        verbose: false,
        optimizeCameraIntrinsics: false,
      });

      // Add world points visible in initialized cameras
      // If only 1 camera is initialized, include all points visible in it
      // If 2+ cameras are initialized, include only points visible in 2+ (for stability)
      const worldPointArray = Array.from(project.worldPoints) as WorldPoint[];
      const initializedCameraSet = new Set(camerasInitialized);
      const prelimPoints = new Set<WorldPoint>();
      const minVisibility = camerasInitialized.length === 1 ? 1 : 2;
      for (const wp of worldPointArray) {
        const visibleInCount = Array.from(wp.imagePoints).filter(ip =>
          initializedCameraSet.has((ip as ImagePoint).viewpoint.name)
        ).length;
        if (visibleInCount >= minVisibility) {
          prelimSystem.addPoint(wp);
          prelimPoints.add(wp);
        }
      }

      // Add lines where both endpoints are in prelimPoints
      for (const line of project.lines) {
        if (prelimPoints.has(line.pointA as WorldPoint) && prelimPoints.has(line.pointB as WorldPoint)) {
          prelimSystem.addLine(line);
        }
      }

      // Add only initialized cameras
      for (const vp of viewpointArray) {
        if (initializedCameraSet.has(vp.name)) {
          prelimSystem.addCamera(vp as Viewpoint);
        }
      }

      // Add image points only for points in prelimPoints AND initialized cameras
      for (const ip of project.imagePoints) {
        const ipConcrete = ip as ImagePoint;
        if (prelimPoints.has(ipConcrete.worldPoint as WorldPoint) &&
            initializedCameraSet.has(ipConcrete.viewpoint.name)) {
          prelimSystem.addImagePoint(ipConcrete);
        }
      }

      // Add constraints
      for (const c of project.constraints) {
        prelimSystem.addConstraint(c);
      }

      const prelimResult = prelimSystem.solve();
      log(`[Prelim] Single-cam solve: conv=${prelimResult.converged}, iter=${prelimResult.iterations}, res=${prelimResult.residual.toFixed(3)}`);
    }

    for (const vp of stillUninitializedCameras) {
      const vpConcrete = vp as Viewpoint;
      const hasImagePoints = vpConcrete.imagePoints.size > 0;
      const hasTriangulatedPoints = Array.from(vpConcrete.imagePoints).some(ip =>
        (ip.worldPoint as WorldPoint).optimizedXyz !== null
      );

      if (hasImagePoints && hasTriangulatedPoints) {
        // Late PnP: use triangulated points from already-initialized cameras
        const pnpResult = initializeCameraWithPnP(vpConcrete, worldPointSet, { useTriangulatedPoints: true });
        if (pnpResult.success && pnpResult.reliable) {
          camerasInitialized.push(vpConcrete.name);
          camerasInitializedViaLatePnP.add(vpConcrete);
          log(`[Init] ${vpConcrete.name} via late PnP`);
        } else if (pnpResult.success && !pnpResult.reliable) {
          log(`[Init] ${vpConcrete.name} late PnP unreliable: ${pnpResult.reason}`);
          vpConcrete.position = [0, 0, 0];
          vpConcrete.rotation = [1, 0, 0, 0];
        }
      }
    }
  }

  const shouldOptimizeIntrinsics = (vp: IOptimizableCamera) => {
    if (typeof optimizeCameraIntrinsics === 'boolean') {
      return optimizeCameraIntrinsics;
    }
    // 'auto' mode:
    // - For cameras with vanishing lines: don't optimize (VL anchors focal length)
    // - For single-axis constraint: don't optimize (underconstrained geometry causes instability)
    // - For cameras initialized via late PnP: DO optimize focal length (PnP only gives pose, not focal)
    // - For other cameras (e.g., essential matrix): allow optimization
    if (vp.vanishingLines.size > 0) {
      return false;
    }
    // Single-axis constraint leaves geometry underconstrained - optimizing focal length
    // causes unrealistic values as the optimizer compensates for missing DoF
    if (hasSingleAxisConstraint) {
      return false;
    }
    // Late PnP cameras need focal length optimization since PnP doesn't determine focal length.
    // The pose is reasonably constrained by the multi-camera triangulated points.
    return true;
  };

  // Build set of initialized viewpoints
  const initializedViewpointSet = new Set<Viewpoint>();
  for (const vpName of camerasInitialized) {
    const vp = Array.from(project.viewpoints).find(v => v.name === vpName);
    if (vp) {
      initializedViewpointSet.add(vp as Viewpoint);
    }
  }

  // Identify multi-camera vs single-camera world points
  const worldPointArray = Array.from(project.worldPoints) as WorldPoint[];
  const multiCameraPoints = new Set<WorldPoint>();
  const singleCameraPoints = new Set<WorldPoint>();

  for (const wp of worldPointArray) {
    const visibleInCameras = Array.from(wp.imagePoints)
      .filter(ip => initializedViewpointSet.has((ip as ImagePoint).viewpoint as Viewpoint))
      .length;

    if (visibleInCameras >= 2) {
      multiCameraPoints.add(wp);
    } else if (visibleInCameras === 1) {
      singleCameraPoints.add(wp);
    }
  }

  // TWO-STAGE OPTIMIZATION: First multi-camera points, then single-camera
  // Run Stage1 when:
  // 1. We have single-camera points that need stable cameras for initialization, OR
  // 2. We used Essential Matrix (which needs refinement before adding constraints)
  const needsStage1 = (singleCameraPoints.size > 0 || usedEssentialMatrix) && multiCameraPoints.size >= 4;
  if (needsStage1) {
    // Stage1 refines the Essential Matrix solution by optimizing multi-camera points
    // Use moderate regularization (0.5) to prevent unconstrained points from diverging
    // while allowing sufficient movement to find good solutions.
    const stage1System = new ConstraintSystem({
      tolerance, maxIterations, damping, verbose, optimizeCameraIntrinsics: false,
      regularizationWeight: 0.5,
    });

    multiCameraPoints.forEach(p => stage1System.addPoint(p));
    let stage1Lines = 0;
    project.lines.forEach(l => {
      if (multiCameraPoints.has(l.pointA as WorldPoint) && multiCameraPoints.has(l.pointB as WorldPoint)) {
        stage1System.addLine(l);
        stage1Lines++;
      }
    });
    // CRITICAL: Only add INITIALIZED cameras to Stage1, not all cameras!
    // Adding uninitialized cameras (position=[0,0,0]) corrupts the optimization.
    for (const vp of project.viewpoints) {
      if (initializedViewpointSet.has(vp as Viewpoint)) {
        stage1System.addCamera(vp as Viewpoint);
      }
    }
    let stage1ImagePoints = 0;
    project.imagePoints.forEach(ip => {
      const ipConcrete = ip as ImagePoint;
      // Only add image points for multi-camera points AND initialized cameras
      if (multiCameraPoints.has(ipConcrete.worldPoint as WorldPoint) &&
          initializedViewpointSet.has(ipConcrete.viewpoint as Viewpoint)) {
        stage1System.addImagePoint(ipConcrete);
        stage1ImagePoints++;
      }
    });
    project.constraints.forEach(c => {
      const points = hasPointsField(c) ? c.points : [];
      if (points.length === 0 || points.every(p => multiCameraPoints.has(p))) {
        stage1System.addConstraint(c);
      }
    });

    // Log world point positions BEFORE Stage1 for debugging
    if (verbose) {
      log(`[Stage1] WP positions BEFORE:`);
      for (const wp of multiCameraPoints) {
        const pos = wp.optimizedXyz;
        if (pos) {
          const dist = Math.sqrt(pos[0]**2 + pos[1]**2 + pos[2]**2);
          log(`  ${wp.name}: dist=${dist.toFixed(1)}, pos=[${pos.map(x => x.toFixed(1)).join(', ')}]`);
        }
      }
    }

    const stage1Result = stage1System.solve();
    log(`[Stage1] Multi-cam only: WP:${multiCameraPoints.size} L:${stage1Lines} IP:${stage1ImagePoints} -> conv=${stage1Result.converged}, iter=${stage1Result.iterations}, res=${stage1Result.residual.toFixed(3)}`);


    // Log world point positions AFTER Stage1 for debugging
    if (verbose) {
      log(`[Stage1] WP positions AFTER:`);
      for (const wp of multiCameraPoints) {
        const pos = wp.optimizedXyz;
        if (pos) {
          const dist = Math.sqrt(pos[0]**2 + pos[1]**2 + pos[2]**2);
          if (dist > 100) {
            log(`  ${wp.name}: dist=${dist.toFixed(1)} [DIVERGED!]`);
          }
        }
      }
    }

    // Clear stale single-camera points and re-initialize (if any)
    if (singleCameraPoints.size > 0) {
      for (const wp of singleCameraPoints) { wp.optimizedXyz = undefined; }

      const initResult = initializeSingleCameraPoints(
        worldPointArray, Array.from(project.lines), Array.from(project.constraints),
        initializedViewpointSet, { verbose: false }
      );
      log(`[Stage2] Single-cam init: ${initResult.initialized} ok, ${initResult.failed} failed`);
    }
  }

  // Full optimization with all points
  // Use light regularization ONLY for single-axis constraint cases (under-constrained).
  // Single-axis = 1 rotational DoF unresolved, causing unconstrained points to diverge.
  // Other Essential Matrix cases (e.g., coplanar constraints) don't need this.
  const system = new ConstraintSystem({
    tolerance, maxIterations, damping, verbose, optimizeCameraIntrinsics: shouldOptimizeIntrinsics,
    regularizationWeight: hasSingleAxisConstraint ? 0.1 : 0,
  });

  project.worldPoints.forEach(p => system.addPoint(p as WorldPoint));
  project.lines.forEach(l => system.addLine(l));
  const excludedCameras = new Set<Viewpoint>();
  const excludedCameraNames: string[] = [];

  // Lock VP-initialized cameras if requested - their pose is well-calibrated
  // and shouldn't be disturbed by less-constrained cameras during joint solve
  if (lockVPCameras && camerasInitializedViaVP.size > 0) {
    for (const vp of camerasInitializedViaVP) {
      vp.isPoseLocked = true;
    }
    log(`[Lock] ${camerasInitializedViaVP.size} VP camera(s) pose-locked for final solve`);
  }

  project.viewpoints.forEach(v => system.addCamera(v as Viewpoint));

  project.imagePoints.forEach(ip => {
    if (!excludedCameras.has((ip as ImagePoint).viewpoint as Viewpoint)) {
      system.addImagePoint(ip as ImagePoint);
    }
  });
  project.constraints.forEach(c => system.addConstraint(c));

  let result = system.solve();

  // RETRY LOGIC: If alignment was ambiguous and residual is poor, try opposite sign
  // The threshold of 50 is chosen because good solutions typically have residual < 5,
  // and 50 indicates the solver got stuck in a bad local minimum.
  const AMBIGUOUS_RETRY_THRESHOLD = 50;
  if (alignmentWasAmbiguous && result.residual > AMBIGUOUS_RETRY_THRESHOLD && usedEssentialMatrix) {
    log(`[Retry] Ambiguous alignment with poor result (${result.residual.toFixed(2)} > ${AMBIGUOUS_RETRY_THRESHOLD}), trying opposite sign`);

    // Save current result for comparison
    const firstResult = { ...result };
    const firstResidual = result.residual;

    // Save current state (we'll restore if retry is worse)
    const savedWorldPoints = new Map<WorldPoint, [number, number, number] | undefined>();
    const savedCameras = new Map<Viewpoint, { position: [number, number, number]; rotation: [number, number, number, number]; focalLength: number }>();

    for (const wp of project.worldPoints) {
      const wpConcrete = wp as WorldPoint;
      savedWorldPoints.set(wpConcrete, wpConcrete.optimizedXyz ? [...wpConcrete.optimizedXyz] as [number, number, number] : undefined);
    }
    for (const vp of project.viewpoints) {
      const vpConcrete = vp as Viewpoint;
      savedCameras.set(vpConcrete, {
        position: [...vpConcrete.position] as [number, number, number],
        rotation: [...vpConcrete.rotation] as [number, number, number, number],
        focalLength: vpConcrete.focalLength,
      });
    }

    // Reset state for retry
    resetOptimizationState(project);

    // Determine opposite sign
    const oppositeSign: 'positive' | 'negative' = alignmentSignUsed === 'positive' ? 'negative' : 'positive';
    log(`[Retry] Was ${alignmentSignUsed}, now trying ${oppositeSign}`);

    // Re-run camera initialization
    const viewpointArray = Array.from(project.viewpoints) as Viewpoint[];
    for (const vp of viewpointArray) {
      vp.position = [0, 0, 0];
      vp.rotation = [1, 0, 0, 0];
      vp.focalLength = Math.max(vp.imageWidth, vp.imageHeight);
      vp.principalPointX = vp.imageWidth / 2;
      vp.principalPointY = vp.imageHeight / 2;
    }

    // Clear world point optimizedXyz
    const wpArray = Array.from(project.worldPoints) as WorldPoint[];
    for (const wp of wpArray) {
      wp.optimizedXyz = undefined;
    }

    // Re-run Essential Matrix initialization (same as initial)
    const vp1 = viewpointArray[0];
    const vp2 = viewpointArray[1];
    const emResult = initializeCamerasWithEssentialMatrix(vp1, vp2, 10.0);
    if (!emResult.success) {
      log(`[Retry] Essential Matrix failed, keeping original result`);
      // Restore original state
      for (const [wp, xyz] of savedWorldPoints) {
        wp.optimizedXyz = xyz;
      }
      for (const [vp, state] of savedCameras) {
        vp.position = state.position;
        vp.rotation = state.rotation;
        vp.focalLength = state.focalLength;
      }
    } else {
      // Re-run world point initialization
      const pointArray = Array.from(project.worldPoints) as WorldPoint[];
      const lineArray = Array.from(project.lines);
      const constraintArray = Array.from(project.constraints);

      unifiedInitialize(pointArray, lineArray, constraintArray, {
        sceneScale: 10.0,
        verbose: false,
        initializedViewpoints: new Set<Viewpoint>([vp1, vp2]),
        skipLockedPoints: false,
      });

      // Re-run alignment with FORCED opposite sign
      const axisConstrainedLines = lineArray.filter(l => l.direction && ['x', 'y', 'z'].includes(l.direction));
      alignSceneToLineDirections(viewpointArray, pointArray, lineArray, true, undefined, oppositeSign);

      // Apply scale from line target lengths
      const linesWithTargetLength = axisConstrainedLines.filter(l => l.targetLength !== undefined);
      if (linesWithTargetLength.length > 0) {
        let sumScale = 0;
        let count = 0;
        for (const line of linesWithTargetLength) {
          const posA = line.pointA.optimizedXyz;
          const posB = line.pointB.optimizedXyz;
          if (posA && posB && line.targetLength) {
            const currentLength = Math.sqrt(
              (posB[0] - posA[0]) ** 2 + (posB[1] - posA[1]) ** 2 + (posB[2] - posA[2]) ** 2
            );
            if (currentLength > 0.01) {
              sumScale += line.targetLength / currentLength;
              count++;
            }
          }
        }
        if (count > 0) {
          const scale = sumScale / count;
          for (const wp of pointArray) {
            if (wp.optimizedXyz) {
              wp.optimizedXyz = [wp.optimizedXyz[0] * scale, wp.optimizedXyz[1] * scale, wp.optimizedXyz[2] * scale];
            }
          }
          for (const vp of viewpointArray) {
            vp.position = [vp.position[0] * scale, vp.position[1] * scale, vp.position[2] * scale];
          }
        }
      }

      // Translate to anchor point
      const lockedPointsForRetry = wpArray.filter(wp => wp.isFullyConstrained());
      const anchorPoint = lockedPointsForRetry.find(wp => wp.optimizedXyz !== undefined);
      if (anchorPoint && anchorPoint.optimizedXyz) {
        const target = anchorPoint.getEffectiveXyz();
        const current = anchorPoint.optimizedXyz;
        const translation = [
          target[0]! - current[0],
          target[1]! - current[1],
          target[2]! - current[2],
        ];
        for (const wp of pointArray) {
          if (wp.optimizedXyz) {
            wp.optimizedXyz = [
              wp.optimizedXyz[0] + translation[0],
              wp.optimizedXyz[1] + translation[1],
              wp.optimizedXyz[2] + translation[2],
            ];
          }
        }
        for (const vp of viewpointArray) {
          vp.position = [
            vp.position[0] + translation[0],
            vp.position[1] + translation[1],
            vp.position[2] + translation[2],
          ];
        }
      }

      // Check for degenerate case: camera at same position as a LOCKED point
      for (const vp of viewpointArray) {
        for (const wp of lockedPointsForRetry) {
          const observes = Array.from(vp.imagePoints).some(ip => (ip as ImagePoint).worldPoint === wp);
          if (!observes) continue;

          const target = wp.getEffectiveXyz();
          const dx = vp.position[0] - target[0]!;
          const dy = vp.position[1] - target[1]!;
          const dz = vp.position[2] - target[2]!;
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

          if (dist < 0.5) {
            const q = vp.rotation;
            const viewDir = [
              2 * (q[1] * q[3] + q[0] * q[2]),
              2 * (q[2] * q[3] - q[0] * q[1]),
              q[0]*q[0] - q[1]*q[1] - q[2]*q[2] + q[3]*q[3],
            ];
            vp.position = [
              vp.position[0] - viewDir[0] * 10,
              vp.position[1] - viewDir[1] * 10,
              vp.position[2] - viewDir[2] * 10,
            ];
            log(`[Retry] Camera ${vp.name} at locked point ${wp.name} - moved back`);
          }
        }
      }

      // Run Stage1 multi-camera optimization (critical for EM refinement)
      const retryMultiCameraPoints = new Set<WorldPoint>();
      for (const wp of pointArray) {
        const visibleInCameras = Array.from(wp.imagePoints)
          .filter(ip => (ip as ImagePoint).viewpoint === vp1 || (ip as ImagePoint).viewpoint === vp2)
          .length;
        if (visibleInCameras >= 2) {
          retryMultiCameraPoints.add(wp);
        }
      }

      if (retryMultiCameraPoints.size >= 4) {
        const stage1System = new ConstraintSystem({
          tolerance, maxIterations, damping, verbose: false,
          optimizeCameraIntrinsics: false,
          regularizationWeight: 0.5,
        });

        retryMultiCameraPoints.forEach(p => stage1System.addPoint(p));
        lineArray.forEach(l => {
          if (retryMultiCameraPoints.has(l.pointA as WorldPoint) && retryMultiCameraPoints.has(l.pointB as WorldPoint)) {
            stage1System.addLine(l);
          }
        });
        stage1System.addCamera(vp1);
        stage1System.addCamera(vp2);
        project.imagePoints.forEach(ip => {
          const ipConcrete = ip as ImagePoint;
          if (retryMultiCameraPoints.has(ipConcrete.worldPoint as WorldPoint) &&
              (ipConcrete.viewpoint === vp1 || ipConcrete.viewpoint === vp2)) {
            stage1System.addImagePoint(ipConcrete);
          }
        });
        constraintArray.forEach(c => stage1System.addConstraint(c));

        const stage1Result = stage1System.solve();
        log(`[Retry] Stage1: conv=${stage1Result.converged}, iter=${stage1Result.iterations}, res=${stage1Result.residual.toFixed(3)}`);
      }

      // Run retry solve
      const retrySystem = new ConstraintSystem({
        tolerance, maxIterations, damping, verbose,
        optimizeCameraIntrinsics: shouldOptimizeIntrinsics,
        regularizationWeight: hasSingleAxisConstraint ? 0.1 : 0,
      });

      project.worldPoints.forEach(p => retrySystem.addPoint(p as WorldPoint));
      project.lines.forEach(l => retrySystem.addLine(l));
      project.viewpoints.forEach(v => {
        if (!excludedCameras.has(v as Viewpoint)) {
          retrySystem.addCamera(v as Viewpoint);
        }
      });
      project.imagePoints.forEach(ip => {
        if (!excludedCameras.has((ip as ImagePoint).viewpoint as Viewpoint)) {
          retrySystem.addImagePoint(ip as ImagePoint);
        }
      });
      project.constraints.forEach(c => retrySystem.addConstraint(c));

      const retryResult = retrySystem.solve();
      log(`[Retry] ${oppositeSign} result: conv=${retryResult.converged}, res=${retryResult.residual.toFixed(3)}`);

      // Compare and keep better result
      if (retryResult.residual < firstResidual) {
        log(`[Retry] ${oppositeSign} is BETTER (${retryResult.residual.toFixed(3)} < ${firstResidual.toFixed(3)}), keeping it`);
        result = retryResult;
      } else {
        log(`[Retry] ${oppositeSign} is WORSE (${retryResult.residual.toFixed(3)} >= ${firstResidual.toFixed(3)}), restoring original`);
        // Restore original state
        for (const [wp, xyz] of savedWorldPoints) {
          wp.optimizedXyz = xyz;
        }
        for (const [vp, state] of savedCameras) {
          vp.position = state.position;
          vp.rotation = state.rotation;
          vp.focalLength = state.focalLength;
        }
        result = firstResult as typeof result;
      }
    }
  }

  let outliers: OutlierInfo[] | undefined;
  let medianReprojectionError: number | undefined;

  if (shouldDetectOutliers && project.imagePoints.size > 0) {
    // Clear previous outlier flags
    for (const vp of project.viewpoints) {
      for (const ip of vp.imagePoints) { (ip as ImagePoint).isOutlier = false; }
    }

    const detection = detectOutliers(project, outlierThreshold);
    outliers = detection.outliers;
    medianReprojectionError = detection.medianError;
  }

  // Log solve result with camera info
  const vpArray = Array.from(project.viewpoints) as Viewpoint[];
  const camInfo = vpArray.map(v => `${v.name}:f=${v.focalLength.toFixed(0)}`).join(' ');
  log(`[Solve] conv=${result.converged}, iter=${result.iterations}, median=${medianReprojectionError?.toFixed(2) ?? '?'}px | ${camInfo}${result.error ? ` | err=${result.error}` : ''}`);

  if (outliers && outliers.length > 0) {
    log(`[Outliers] ${outliers.length} found (threshold=${Math.round(medianReprojectionError! * 3)}px):`);
    for (const outlier of outliers) {
      log(`  ${outlier.worldPointName}@${outlier.viewpointName}: ${outlier.error.toFixed(1)}px`);
      outlier.imagePoint.isOutlier = true;
    }

    // Check for cameras where ALL image points are outliers (failed late PnP)
    const outliersByCamera = new Map<Viewpoint, number>();
    for (const outlier of outliers) {
      const vp = outlier.imagePoint.viewpoint as Viewpoint;
      outliersByCamera.set(vp, (outliersByCamera.get(vp) || 0) + 1);
    }

    const camerasToExclude: Viewpoint[] = [];
    for (const [vp, outlierCount] of outliersByCamera) {
      if (camerasInitializedViaLatePnP.has(vp) && !excludedCameras.has(vp) && vp.imagePoints) {
        const totalImagePoints = Array.from(vp.imagePoints).filter(ip => !excludedCameras.has(ip.viewpoint as Viewpoint)).length;
        if (outlierCount === totalImagePoints && totalImagePoints > 0) {
          log(`[WARN] ${vp.name}: 100% outliers - failed late PnP`);
          camerasToExclude.push(vp);
        }
      }
    }

    if (camerasToExclude.length > 0) {
      log(`[Rerun] Excluding: ${camerasToExclude.map(c => c.name).join(', ')}`);

      for (const vp of camerasToExclude) {
        excludedCameras.add(vp);
        excludedCameraNames.push(vp.name);
      }

      // Reset world points and excluded cameras
      for (const wp of project.worldPoints) {
        if (!(wp as WorldPoint).isFullyConstrained()) { (wp as WorldPoint).optimizedXyz = undefined; }
      }
      for (const vp of camerasToExclude) {
        vp.position = [0, 0, 0];
        vp.rotation = [1, 0, 0, 0];
      }

      // Re-triangulate with good cameras only
      const goodCameras = Array.from(project.viewpoints).filter(v => !excludedCameras.has(v as Viewpoint)) as Viewpoint[];
      unifiedInitialize(
        Array.from(project.worldPoints), Array.from(project.lines), Array.from(project.constraints),
        { sceneScale: 10.0, verbose: false, initializedViewpoints: new Set<Viewpoint>(goodCameras) }
      );

      // Re-run optimization
      const system2 = new ConstraintSystem({
        tolerance, maxIterations, damping, verbose, optimizeCameraIntrinsics: shouldOptimizeIntrinsics,
      });
      project.worldPoints.forEach(p => system2.addPoint(p as WorldPoint));
      project.lines.forEach(l => system2.addLine(l));
      project.viewpoints.forEach(v => { if (!excludedCameras.has(v as Viewpoint)) system2.addCamera(v as Viewpoint); });
      project.imagePoints.forEach(ip => { if (!excludedCameras.has((ip as ImagePoint).viewpoint as Viewpoint)) system2.addImagePoint(ip as ImagePoint); });
      project.constraints.forEach(c => system2.addConstraint(c));

      const result2 = system2.solve();
      log(`[Rerun] conv=${result2.converged}, iter=${result2.iterations}, res=${result2.residual.toFixed(3)}`);

      result.converged = result2.converged;
      result.iterations = result2.iterations;
      result.residual = result2.residual;
      result.error = result2.error;

      const detection2 = detectOutliers(project, outlierThreshold);
      outliers = detection2.outliers;
      medianReprojectionError = detection2.medianError;
      for (const outlier of outliers) { outlier.imagePoint.isOutlier = true; }
    }
  }

  // POST-SOLVE: Check axis signs and apply flips if needed
  // This ensures coordinates match locked values and system is right-handed for Blender
  if (forceRightHanded) {
    const wpArray = Array.from(project.worldPoints) as WorldPoint[];
    const vpArray = Array.from(project.viewpoints) as Viewpoint[];

    // First, check if any axis signs are wrong compared to locked coordinates
    const { flipX, flipY, flipZ } = checkAxisSigns(wpArray);

    if (flipX || flipY || flipZ) {
      log(`[Handedness] Axis sign corrections needed: flipX=${flipX}, flipY=${flipY}, flipZ=${flipZ}`);
      applyAxisFlips(wpArray, vpArray, flipX, flipY, flipZ);

      // Verify the signs are now correct
      const afterFlips = checkAxisSigns(wpArray);
      log(`[Handedness] After flips: flipX=${afterFlips.flipX}, flipY=${afterFlips.flipY}, flipZ=${afterFlips.flipZ}`);
    } else {
      // No sign corrections needed based on locked coordinates
      // Still check handedness using axis points if available
      const handedness = checkHandedness(wpArray);
      if (handedness && !handedness.isRightHanded) {
        log('[Handedness] Result is LEFT-HANDED (no locked coords to determine axis), applying Z-flip');
        applyAxisFlips(wpArray, vpArray, false, false, true);
      } else if (handedness) {
        log('[Handedness] Result is already RIGHT-HANDED');
      } else {
        log('[Handedness] Cannot determine handedness (no axis points found)');
      }
    }
  }

  // Log final summary with quality assessment
  const solveTimeMs = performance.now() - startTime;
  const quality = result.residual < 1 ? 'Excellent' : result.residual < 5 ? 'Good' : 'Poor';
  const qualityStars = result.residual < 1 ? '***' : result.residual < 5 ? '**' : '*';
  log(`[Summary] ${qualityStars} ${quality} | error=${result.residual.toFixed(3)} | median=${medianReprojectionError?.toFixed(2) ?? '?'}px | iter=${result.iterations} | conv=${result.converged} | ${solveTimeMs.toFixed(0)}ms`);

  return {
    ...result,
    camerasInitialized: camerasInitialized.length > 0 ? camerasInitialized : undefined,
    camerasExcluded: excludedCameraNames.length > 0 ? excludedCameraNames : undefined,
    outliers,
    medianReprojectionError,
    solveTimeMs,
  };
}
