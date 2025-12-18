/**
 * Camera Initialization Strategies
 *
 * This module contains functions for initializing camera poses using different methods:
 * - Vanishing Point (VP) initialization
 * - PnP (Perspective-n-Point) initialization
 * - Essential Matrix initialization
 * - Stepped VP initialization (VP on one camera, PnP on rest)
 *
 * These are extracted from optimize-project.ts for better modularity and testability.
 */

import { Viewpoint } from '../entities/viewpoint';
import { WorldPoint } from '../entities/world-point';
import { ImagePoint } from '../entities/imagePoint';
import {
  initializeCameraWithVanishingPoints,
  canInitializeWithVanishingPoints,
  validateVanishingPoints,
  computeRotationsFromVPs,
  estimateFocalLength,
} from './vanishing-points';
import { initializeCameraWithPnP } from './pnp';
import { initializeCamerasWithEssentialMatrix } from './essential-matrix';
import { log } from './optimization-logger';
import type {
  VPInitResult,
  SteppedVPInitResult,
  EssentialMatrixInitResult,
  CameraInitializationResult,
} from './initialization-types';
import { createDefaultDiagnostics } from './initialization-types';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Count how many fully constrained points are visible in a camera.
 */
function getConstrainedPointCount(camera: Viewpoint): number {
  return Array.from(camera.imagePoints).filter(ip =>
    (ip.worldPoint as WorldPoint).isFullyConstrained()
  ).length;
}

/**
 * Set up locked points for initialization by copying effective coordinates to optimizedXyz.
 */
function setupLockedPointsForInitialization(lockedPoints: WorldPoint[]): void {
  for (const wp of lockedPoints) {
    const effective = wp.getEffectiveXyz();
    wp.optimizedXyz = [effective[0]!, effective[1]!, effective[2]!];
  }
}

/**
 * Camera state for backup/restore during initialization attempts.
 */
interface CameraState {
  position: [number, number, number];
  rotation: [number, number, number, number];
  focalLength: number;
}

function saveCameraState(camera: Viewpoint): CameraState {
  return {
    position: [...camera.position] as [number, number, number],
    rotation: [...camera.rotation] as [number, number, number, number],
    focalLength: camera.focalLength,
  };
}

function restoreCameraState(camera: Viewpoint, state: CameraState): void {
  camera.position = state.position;
  camera.rotation = state.rotation;
  camera.focalLength = state.focalLength;
}

// ============================================================================
// Initialization Strategies
// ============================================================================

/**
 * Try to initialize a single camera using vanishing points.
 *
 * @param camera - The camera to initialize
 * @param worldPoints - Set of all world points in the scene
 * @param options - Options for VP initialization
 * @returns Result indicating success/failure and diagnostics
 */
export function tryVPInitForCamera(
  camera: Viewpoint,
  worldPoints: Set<WorldPoint>,
  options: {
    allowSinglePoint: boolean;
    lockedPointCount: number;
    totalUninitializedCameras: number;
  }
): VPInitResult {
  const { allowSinglePoint, lockedPointCount, totalUninitializedCameras } = options;

  // For single-camera scenes with only 1-2 locked points AND no actual vanishing lines,
  // skip VP init and use late PnP instead. Late PnP uses ALL constrained points (including
  // inferred) and gives better results. VP init with only 1 locked point and only virtual VLs
  // (from axis-aligned Lines) gives unreliable camera positions.
  // If camera has actual VLs, VP init should be used - it handles handedness correctly.
  const hasActualVanishingLines = camera.getVanishingLineCount() > 0;
  const skipVPForLatePnP = totalUninitializedCameras === 1 && lockedPointCount < 3 && !hasActualVanishingLines;

  log(`[Init Path] skipVPForLatePnP=${skipVPForLatePnP} (uninit=${totalUninitializedCameras}, locked=${lockedPointCount}, hasVL=${hasActualVanishingLines})`);

  if (skipVPForLatePnP) {
    return { success: false };
  }

  // Check if VP init is possible
  if (!canInitializeWithVanishingPoints(camera, worldPoints, { allowSinglePoint })) {
    return { success: false };
  }

  // Try VP initialization
  const success = initializeCameraWithVanishingPoints(camera, worldPoints, { allowSinglePoint });
  if (success) {
    log(`[Init] ${camera.name} via VP, f=${camera.focalLength.toFixed(0)}`);
    return {
      success: true,
      camera,
      focalLength: camera.focalLength,
      rotation: [...camera.rotation] as [number, number, number, number],
    };
  }

  return { success: false };
}

/**
 * Try to initialize a single camera using PnP (Perspective-n-Point).
 * Requires 3+ fully constrained points visible in the camera.
 *
 * @param camera - The camera to initialize
 * @param worldPoints - Set of all world points in the scene
 * @returns True if PnP succeeded and result is reliable
 */
export function tryPnPInitForCamera(
  camera: Viewpoint,
  worldPoints: Set<WorldPoint>
): { success: boolean; reliable: boolean; reason?: string } {
  const constrainedCount = getConstrainedPointCount(camera);

  if (constrainedCount < 3) {
    return { success: false, reliable: false, reason: `Only ${constrainedCount}/3 constrained points` };
  }

  const pnpResult = initializeCameraWithPnP(camera, worldPoints);

  if (pnpResult.success && pnpResult.reliable) {
    log(`[Init] ${camera.name} via PnP, pos=[${camera.position.map(x => x.toFixed(1)).join(',')}]`);
    return { success: true, reliable: true };
  } else if (pnpResult.success && !pnpResult.reliable) {
    log(`[Init] ${camera.name} PnP unreliable: ${pnpResult.reason}`);
    // Reset camera to uninitialized state
    camera.position = [0, 0, 0];
    camera.rotation = [1, 0, 0, 0];
    return { success: true, reliable: false, reason: pnpResult.reason };
  } else {
    return { success: false, reliable: false, reason: 'PnP failed' };
  }
}

/**
 * Run first-tier camera initialization (VP with 2+ points, then PnP with 3+ points).
 *
 * @param uninitializedCameras - Cameras that need initialization
 * @param worldPoints - Set of all world points
 * @param lockedPoints - Points with all 3 coordinates constrained
 * @returns Object with initialized camera names and VP-initialized cameras
 */
export function runFirstTierInitialization(
  uninitializedCameras: Viewpoint[],
  worldPoints: Set<WorldPoint>,
  lockedPoints: WorldPoint[]
): {
  camerasInitialized: string[];
  camerasInitializedViaVP: Set<Viewpoint>;
} {
  const camerasInitialized: string[] = [];
  const camerasInitializedViaVP = new Set<Viewpoint>();

  // CRITICAL: When multiple cameras can VP init but have < 3 locked points each,
  // only VP init ONE camera. Independent VP init for each camera gives inconsistent
  // world frames since VP determines rotation but not a consistent position.
  // After one camera is VP-initialized, triangulate points, then PnP for the rest.
  let vpInitializedOneCamera = false;

  for (const camera of uninitializedCameras) {
    // When multiple cameras exist and we've already VP-initialized one with < 3 locked points,
    // skip VP init for remaining cameras - they'll use late PnP after triangulation
    const skipVPForMultiCam = vpInitializedOneCamera && lockedPoints.length < 3;
    if (skipVPForMultiCam) {
      log(`[Init Path] ${camera.name}: skipping VP (already VP-inited one camera with < 3 locked points)`);
      continue;
    }

    // Try VP init (strict mode - requires 2+ constrained points)
    const vpResult = tryVPInitForCamera(camera, worldPoints, {
      allowSinglePoint: false,
      lockedPointCount: lockedPoints.length,
      totalUninitializedCameras: uninitializedCameras.length,
    });

    if (vpResult.success) {
      camerasInitialized.push(camera.name);
      camerasInitializedViaVP.add(camera);
      vpInitializedOneCamera = true;
      continue;
    }

    // Try PnP if VP didn't work
    const pnpResult = tryPnPInitForCamera(camera, worldPoints);
    if (pnpResult.success && pnpResult.reliable) {
      camerasInitialized.push(camera.name);
    }
    // Other cases (unreliable, not enough points) - camera will try other methods
  }

  return { camerasInitialized, camerasInitializedViaVP };
}

/**
 * Run stepped VP initialization: VP on one camera with single point, PnP on rest.
 *
 * This is a fallback when first-tier initialization fails. It:
 * 1. Finds a camera that can use VP with single locked point
 * 2. Initializes that camera with VP
 * 3. Tries PnP on remaining cameras
 * 4. If all PnP attempts succeed, keeps the results
 * 5. If any PnP fails, reverts everything
 *
 * @param uninitializedCameras - Cameras that need initialization
 * @param worldPoints - Set of all world points
 * @param lockedPoints - Points with all 3 coordinates constrained
 * @returns Result with success flag, initialized cameras, and reverted flag
 */
export function runSteppedVPInitialization(
  uninitializedCameras: Viewpoint[],
  worldPoints: Set<WorldPoint>,
  lockedPoints: WorldPoint[]
): SteppedVPInitResult {
  // Set up locked points first
  setupLockedPointsForInitialization(lockedPoints);

  // Find and initialize the camera that can use VP with single point
  for (const camera of uninitializedCameras) {
    if (!canInitializeWithVanishingPoints(camera, worldPoints, { allowSinglePoint: true })) {
      continue;
    }

    // Save state in case we need to revert
    const savedState = saveCameraState(camera);

    const success = initializeCameraWithVanishingPoints(camera, worldPoints, { allowSinglePoint: true });
    if (!success) {
      continue;
    }

    log(`[Init Stepped] ${camera.name} via VP (single point), f=${camera.focalLength.toFixed(0)}`);

    // After VP init, try to initialize remaining cameras using PnP with constrained points
    const remainingCameras = uninitializedCameras.filter(c => c !== camera);
    let allRemainingReliable = true;
    const pnpCameras: Viewpoint[] = [];

    for (const remainingCamera of remainingCameras) {
      const constrainedCount = getConstrainedPointCount(remainingCamera);

      if (constrainedCount >= 3) {
        const pnpResult = initializeCameraWithPnP(remainingCamera, worldPoints);
        if (pnpResult.success && pnpResult.reliable) {
          log(`[Init Stepped] ${remainingCamera.name} via PnP (after VP), pos=[${remainingCamera.position.map(x => x.toFixed(1)).join(',')}]`);
          pnpCameras.push(remainingCamera);
        } else {
          log(`[Init Stepped] ${remainingCamera.name} PnP unreliable after VP: ${pnpResult.reason || 'unknown'}`);
          allRemainingReliable = false;
        }
      } else {
        log(`[Init Stepped] ${remainingCamera.name} needs ${constrainedCount}/3 constrained points for PnP`);
        allRemainingReliable = false;
      }
    }

    // If all remaining cameras were reliably initialized, commit the results
    if (allRemainingReliable && pnpCameras.length === remainingCameras.length) {
      return {
        success: true,
        reverted: false,
        vpCameras: [camera],
        pnpCameras,
      };
    }

    // Revert VP initialization and fall back to Essential Matrix
    log(`[Init Stepped] Reverting VP init - remaining cameras not reliably initialized, trying Essential Matrix`);
    restoreCameraState(camera, savedState);

    // Clear optimizedXyz for locked points so Essential Matrix can set them fresh
    for (const wp of lockedPoints) {
      wp.optimizedXyz = undefined;
    }

    return {
      success: false,
      reverted: true,
      vpCameras: [],
      pnpCameras: [],
    };
  }

  // No camera could use VP with single point
  return {
    success: false,
    reverted: false,
    vpCameras: [],
    pnpCameras: [],
  };
}

/**
 * Run Essential Matrix initialization for two cameras.
 *
 * This also applies VP+EM hybrid if cameras have vanishing lines:
 * - Uses VP rotation to align the world frame
 * - Applies VP-estimated focal length if available
 *
 * @param vp1 - First camera
 * @param vp2 - Second camera
 * @param skipVPHybrid - If true, skip the VP+EM hybrid step
 * @returns Result with success, cameras, and vpEmHybridApplied flag
 */
export function runEssentialMatrixInitialization(
  vp1: Viewpoint,
  vp2: Viewpoint,
  skipVPHybrid: boolean
): EssentialMatrixInitResult {
  // Reset intrinsics to safe defaults for Essential Matrix
  for (const vp of [vp1, vp2]) {
    vp.focalLength = Math.max(vp.imageWidth, vp.imageHeight);
    vp.principalPointX = vp.imageWidth / 2;
    vp.principalPointY = vp.imageHeight / 2;
  }

  const result = initializeCamerasWithEssentialMatrix(vp1, vp2, 10.0);

  if (!result.success) {
    return {
      success: false,
      error: result.error || 'Unknown error',
      cameras: [],
      vpEmHybridApplied: false,
    };
  }

  log(`[Init] EssentialMatrix: ${vp1.name}=[${vp1.position.map(x => x.toFixed(1)).join(',')}], ${vp2.name}=[${vp2.position.map(x => x.toFixed(1)).join(',')}]`);

  // HYBRID VP+EM: If cameras have vanishing lines, use VP rotation BEFORE triangulation
  // This ensures the coordinate frame is world-axis-aligned from the start
  let vpEmHybridApplied = false;

  if (skipVPHybrid) {
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
          const q_em_2 = [...vp2.rotation] as [number, number, number, number];
          const pos_2 = [...vp2.position] as [number, number, number];

          // Apply VP rotation as global rotation to the scene
          // vp1 gets the VP rotation directly
          vp1.rotation = q_vp;

          // Quaternion multiplication helper
          const qMult = (a: number[], b: number[]): [number, number, number, number] => {
            return [
              a[0]*b[0] - a[1]*b[1] - a[2]*b[2] - a[3]*b[3],
              a[0]*b[1] + a[1]*b[0] + a[2]*b[3] - a[3]*b[2],
              a[0]*b[2] - a[1]*b[3] + a[2]*b[0] + a[3]*b[1],
              a[0]*b[3] + a[1]*b[2] - a[2]*b[1] + a[3]*b[0]
            ];
          };

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
  }

  return {
    success: true,
    cameras: [vp1, vp2],
    vpEmHybridApplied,
  };
}

/**
 * Options for the camera initialization orchestrator.
 */
export interface InitializeCamerasOptions {
  /** Cameras that need initialization (position at origin) */
  uninitializedCameras: Viewpoint[];

  /** All world points in the scene */
  worldPoints: Set<WorldPoint>;

  /** Fully constrained points (locked or inferred) */
  lockedPoints: WorldPoint[];

  /** Whether any camera can use VP with strict mode (2+ constrained points) */
  canAnyUseVPStrict: boolean;

  /** Whether any camera can use VP with relaxed mode (1 constrained point) */
  canAnyUseVPRelaxed: boolean;
}

/**
 * Main camera initialization orchestrator.
 *
 * This function orchestrates the camera initialization flow:
 * 1. First-tier: VP with 2+ points, then PnP with 3+ points
 * 2. Stepped: VP on one camera with single point, PnP on rest
 * 3. Essential Matrix: For 2+ cameras when VP/PnP unavailable
 *
 * @param options - Options with cameras and constraint info
 * @returns Result with initialized cameras and diagnostics
 */
export function initializeCameras(options: InitializeCamerasOptions): CameraInitializationResult {
  const { uninitializedCameras, worldPoints, lockedPoints, canAnyUseVPStrict, canAnyUseVPRelaxed } = options;

  const diagnostics = createDefaultDiagnostics();
  const camerasInitialized: string[] = [];
  const camerasInitializedViaVP = new Set<Viewpoint>();

  // Use strict mode for decision-making, but note if relaxed mode is available
  const canAnyUseVP = canAnyUseVPStrict || (uninitializedCameras.length === 1 && canAnyUseVPRelaxed);

  // Debug logging for initialization path
  const trulyLockedCount = Array.from(worldPoints).filter(wp => wp.isFullyLocked()).length;
  log(`[Init Debug] uninitCameras=${uninitializedCameras.length}, lockedPts=${lockedPoints.length} (trulyLocked=${trulyLockedCount}), canVP=${canAnyUseVP} (relaxed=${canAnyUseVPRelaxed})`);

  if (lockedPoints.length >= 2 || canAnyUseVP || (uninitializedCameras.length === 1 && lockedPoints.length >= 1)) {
    const canAnyCameraUsePnP = uninitializedCameras.some(vp => getConstrainedPointCount(vp) >= 3);
    const canAnyCameraUseVPInit = uninitializedCameras.some(vp =>
      canInitializeWithVanishingPoints(vp, worldPoints, { allowSinglePoint: uninitializedCameras.length === 1 })
    );
    const willUseEssentialMatrix = !canAnyCameraUsePnP && !canAnyCameraUseVPInit;

    // Set up locked points for VP/PnP initialization (not needed for Essential Matrix)
    if (!willUseEssentialMatrix) {
      setupLockedPointsForInitialization(lockedPoints);
    }

    // Run first-tier initialization (VP with 2+ points, then PnP with 3+ points)
    const firstTierResult = runFirstTierInitialization(uninitializedCameras, worldPoints, lockedPoints);

    camerasInitialized.push(...firstTierResult.camerasInitialized);
    for (const vp of firstTierResult.camerasInitializedViaVP) {
      camerasInitializedViaVP.add(vp);
    }
  }

  if (camerasInitialized.length === 0) {
    // STEPPED INITIALIZATION: Try VP init with single point for multi-camera scenes
    if (uninitializedCameras.length >= 2 && canAnyUseVPRelaxed && lockedPoints.length >= 1) {
      log(`[Init Stepped] Trying VP init with single locked point before Essential Matrix...`);

      const steppedResult = runSteppedVPInitialization(uninitializedCameras, worldPoints, lockedPoints);

      if (steppedResult.success) {
        for (const vp of steppedResult.vpCameras) {
          camerasInitialized.push(vp.name);
          camerasInitializedViaVP.add(vp);
        }
        for (const vp of steppedResult.pnpCameras) {
          camerasInitialized.push(vp.name);
        }
      } else if (steppedResult.reverted) {
        diagnostics.steppedVPInitReverted = true;
      }
    }
  }

  if (camerasInitialized.length === 0) {
    // For single-camera scenes, check if late PnP is viable
    const singleCameraWithConstrainedPoints = uninitializedCameras.length === 1 &&
      getConstrainedPointCount(uninitializedCameras[0]) > 0;

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
      // Essential Matrix path requires 2+ cameras
      const vp1 = uninitializedCameras[0];
      const vp2 = uninitializedCameras[1];

      const emResult = runEssentialMatrixInitialization(vp1, vp2, diagnostics.steppedVPInitReverted);

      if (emResult.success) {
        camerasInitialized.push(vp1.name, vp2.name);
        diagnostics.usedEssentialMatrix = true;
        diagnostics.vpEmHybridApplied = emResult.vpEmHybridApplied;
      } else {
        throw new Error(`Essential Matrix failed: ${emResult.error || 'Unknown'}. Need 7+ shared points.`);
      }
    }
  }

  return {
    camerasInitialized,
    camerasInitializedViaVP,
    camerasInitializedViaLatePnP: new Set<Viewpoint>(),
    diagnostics,
  };
}
