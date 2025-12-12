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
import { initializeSingleCameraPoints } from './single-camera-initialization';
import { initializeCameraWithVanishingPoints } from './vanishing-points';
import { alignSceneToLineDirections, alignSceneToLockedPoints } from './coordinate-alignment';
import { log, clearOptimizationLogs, optimizationLogs } from './optimization-logger';

// Re-export for backwards compatibility
export { log, clearOptimizationLogs, optimizationLogs } from './optimization-logger';

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
    delete (viewpoint as any).__initialCameraVps;
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
}

export interface OptimizeProjectResult extends SolverResult {
  camerasInitialized?: string[];
  camerasExcluded?: string[];
  outliers?: OutlierInfo[];
  medianReprojectionError?: number;
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
  } = options;

  // Clear logs and reset all cached state before solving
  clearOptimizationLogs();
  resetOptimizationState(project);

  log(`[Optimize] WP:${project.worldPoints.size} L:${project.lines.size} VP:${project.viewpoints.size} IP:${project.imagePoints.size} C:${project.constraints.size}`);

  const camerasInitialized: string[] = [];
  // Track cameras initialized via "late PnP" (using triangulated points) - these are vulnerable to degenerate solutions
  const camerasInitializedViaLatePnP = new Set<Viewpoint>();
  // Track cameras initialized via vanishing points - these have reliable pose estimates
  const camerasInitializedViaVP = new Set<Viewpoint>();
  // Track whether Essential Matrix was actually used for initialization
  let usedEssentialMatrix = false;

  if (autoInitializeCameras || autoInitializeWorldPoints) {
    const viewpointArray = Array.from(project.viewpoints);

    if (autoInitializeCameras) {
      for (const vp of viewpointArray) {
        const v = vp as Viewpoint;
        // Reset pose
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
        // Principal point should be within image bounds
        if (v.principalPointX < 0 || v.principalPointX > v.imageWidth ||
            v.principalPointY < 0 || v.principalPointY > v.imageHeight) {
          v.principalPointX = v.imageWidth / 2;
          v.principalPointY = v.imageHeight / 2;
        }
      }

      // Clear optimizedXyz on unconstrained world points
      const wpArray = Array.from(project.worldPoints) as WorldPoint[];
      for (const wp of wpArray) {
        if (!wp.isFullyConstrained() && wp.optimizedXyz) {
          wp.optimizedXyz = undefined;
        }
      }
    }

    const uninitializedCameras = viewpointArray.filter(vp => {
      const v = vp as Viewpoint;
      return v.position[0] === 0 && v.position[1] === 0 && v.position[2] === 0;
    });

    if (uninitializedCameras.length >= 1 && autoInitializeCameras) {
      const worldPointArray = Array.from(project.worldPoints) as WorldPoint[];
      const lockedPoints = worldPointArray.filter(wp => wp.isFullyConstrained());
      const worldPointSet = new Set<WorldPoint>(worldPointArray);

      if (lockedPoints.length >= 2 || uninitializedCameras.some(vp => (vp as Viewpoint).canInitializeWithVanishingPoints(worldPointSet))) {
        const canAnyCameraUsePnP = uninitializedCameras.some(vp => {
          const vpConcrete = vp as Viewpoint;
          const vpLockedPoints = Array.from(vpConcrete.imagePoints).filter(ip =>
            (ip.worldPoint as WorldPoint).isFullyConstrained()
          );
          return vpLockedPoints.length >= 3;
        });

        const canAnyCameraUseVP = uninitializedCameras.some(vp =>
          (vp as Viewpoint).canInitializeWithVanishingPoints(worldPointSet)
        );

        const willUseEssentialMatrix = !canAnyCameraUsePnP && !canAnyCameraUseVP;

        if (!willUseEssentialMatrix) {
          for (const wp of lockedPoints) {
            const effective = wp.getEffectiveXyz();
            wp.optimizedXyz = [effective[0]!, effective[1]!, effective[2]!];
          }
        }

        for (const vp of uninitializedCameras) {
          const vpConcrete = vp as Viewpoint;

          if (vpConcrete.canInitializeWithVanishingPoints(worldPointSet)) {
            const success = initializeCameraWithVanishingPoints(vpConcrete, worldPointSet);
            if (success) {
              log(`[Init] ${vpConcrete.name} via VP, f=${vpConcrete.focalLength.toFixed(0)}`);
              camerasInitialized.push(vpConcrete.name);
              camerasInitializedViaVP.add(vpConcrete);
              continue;
            }
          }

          const vpLockedPoints = Array.from(vpConcrete.imagePoints).filter(ip =>
            (ip.worldPoint as WorldPoint).isFullyConstrained()
          );

          if (vpLockedPoints.length >= 3) {
            const pnpResult = initializeCameraWithPnP(vpConcrete, worldPointSet);
            if (pnpResult.success && pnpResult.reliable) {
              log(`[Init] ${vpConcrete.name} via PnP, pos=[${vpConcrete.position.map(x => x.toFixed(1)).join(',')}]`);
              camerasInitialized.push(vpConcrete.name);
            } else if (pnpResult.success && !pnpResult.reliable) {
              log(`[Init] ${vpConcrete.name} PnP unreliable: ${pnpResult.reason}`);
              vpConcrete.position = [0, 0, 0];
              vpConcrete.rotation = [1, 0, 0, 0];
            } else {
              throw new Error(`PnP failed for ${vpConcrete.name} with ${vpLockedPoints.length} locked points`);
            }
          }
        }
      }

      if (camerasInitialized.length === 0) {
        if (uninitializedCameras.length < 2) {
          throw new Error(`Need 2+ cameras for Essential Matrix, have ${uninitializedCameras.length}. Lock 3+ WPs for PnP.`);
        }

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
        } else {
          throw new Error(`Essential Matrix failed: ${result.error || 'Unknown'}. Need 7+ shared points.`);
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
    });

    if (axisConstrainedLines.length > 0) {
      alignSceneToLineDirections(viewpointArray, pointArray, lineArray);

      // Apply scale from line target lengths
      const linesWithTargetLength = axisConstrainedLines.filter(l => l.targetLength !== undefined);
      if (linesWithTargetLength.length > 0 && usedEssentialMatrix) {
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
            // Move camera backward (opposite view direction) by 10 units
            vp.position = [
              vp.position[0] - viewDir[0] * 10,
              vp.position[1] - viewDir[1] * 10,
              vp.position[2] - viewDir[2] * 10,
            ];
            log(`[Fix] Camera ${vp.name} at locked point ${wp.name} - moved back`);
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
        (wp as any).savedInferredXyz = [...wp.inferredXyz];
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
        if ((wp as any).savedInferredXyz) {
          wp.inferredXyz = (wp as any).savedInferredXyz;
          delete (wp as any).savedInferredXyz;
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

  const shouldOptimizeIntrinsics = (vp: Viewpoint) => {
    if (typeof optimizeCameraIntrinsics === 'boolean') {
      return optimizeCameraIntrinsics;
    }
    // 'auto' mode:
    // - For cameras with vanishing lines: don't optimize (VL anchors focal length)
    // - For cameras initialized via late PnP: DO optimize focal length (PnP only gives pose, not focal)
    // - For other cameras (e.g., essential matrix): allow optimization
    if ((vp as Viewpoint).getVanishingLineCount() > 0) {
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
      const points = 'points' in c ? (c as any).points as WorldPoint[] : [];
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

  const result = system.solve();

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

  return {
    ...result,
    camerasInitialized: camerasInitialized.length > 0 ? camerasInitialized : undefined,
    camerasExcluded: excludedCameraNames.length > 0 ? excludedCameraNames : undefined,
    outliers,
    medianReprojectionError,
  };
}
