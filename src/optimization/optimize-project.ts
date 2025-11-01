import { Project } from '../entities/project';
import { ConstraintSystem, SolverResult, SolverOptions } from './constraint-system';
import { initializeWorldPoints } from './entity-initialization';
import { initializeCameraWithPnP } from './pnp';
import { Viewpoint } from '../entities/viewpoint';
import { WorldPoint } from '../entities/world-point';
import { ImagePoint } from '../entities/imagePoint';
import { initializeCamerasWithEssentialMatrix } from './essential-matrix';
import { initializeWorldPoints as unifiedInitialize } from './unified-initialization';
import { initializeCameraWithVanishingPoints } from './vanishing-points';

// Global log buffer for export
export const optimizationLogs: string[] = [];

function log(message: string) {
  console.log(message);
  optimizationLogs.push(message);
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

export interface OptimizeProjectOptions extends SolverOptions {
  autoInitializeCameras?: boolean;
  autoInitializeWorldPoints?: boolean;
  detectOutliers?: boolean;
  outlierThreshold?: number;
}

export interface OptimizeProjectResult extends SolverResult {
  camerasInitialized?: string[];
  outliers?: OutlierInfo[];
  medianReprojectionError?: number;
}

export function optimizeProject(
  project: Project,
  options: OptimizeProjectOptions = {}
): OptimizeProjectResult {
  const {
    autoInitializeCameras = true,
    autoInitializeWorldPoints = true,
    detectOutliers: shouldDetectOutliers = true,
    outlierThreshold = 3.0,
    tolerance = 1e-6,
    maxIterations = 100,
    damping = 1e-3,
    verbose = false,
  } = options;

  console.log('[optimizeProject] Starting optimization...');
  console.log(`  World Points: ${project.worldPoints.size}`);
  console.log(`  Lines: ${project.lines.size}`);
  console.log(`  Viewpoints: ${project.viewpoints.size}`);
  console.log(`  Image Points: ${project.imagePoints.size}`);
  console.log(`  Constraints: ${project.constraints.size}`);

  // DEBUG: Check world point initialization
  const wpArray = Array.from(project.worldPoints);
  const wpWithOptimizedXyz = wpArray.filter(p => (p as WorldPoint).optimizedXyz !== null);
  console.log(`[optimizeProject] World points with optimizedXyz: ${wpWithOptimizedXyz.length}/${wpArray.length}`);

  // DEBUG: Check camera positions
  Array.from(project.viewpoints).forEach(vp => {
    const v = vp as Viewpoint;
    console.log(`[optimizeProject] Camera ${v.name} position: [${v.position.join(', ')}], imagePoints: ${v.imagePoints.size}`);
  });

  const camerasInitialized: string[] = [];

  if (autoInitializeCameras || autoInitializeWorldPoints) {
    console.log('[optimizeProject] Running initialization pipeline...');

    const viewpointArray = Array.from(project.viewpoints);

    if (autoInitializeCameras) {
      console.log('[optimizeProject] Resetting all camera positions to [0,0,0]');
      for (const vp of viewpointArray) {
        const v = vp as Viewpoint;
        v.position = [0, 0, 0];
        v.rotation = [1, 0, 0, 0];
      }
    }

    const uninitializedCameras = viewpointArray.filter(vp => {
      const v = vp as Viewpoint;
      return v.position[0] === 0 && v.position[1] === 0 && v.position[2] === 0;
    });

    console.log(`[optimizeProject] Cameras needing initialization: ${uninitializedCameras.length}/${viewpointArray.length}`);

    if (uninitializedCameras.length >= 1 && autoInitializeCameras) {
      const worldPointArray = Array.from(project.worldPoints) as WorldPoint[];
      const lockedPoints = worldPointArray.filter(wp => wp.isFullyConstrained());
      const worldPointSet = new Set<WorldPoint>(worldPointArray);

      if (lockedPoints.length >= 2 || uninitializedCameras.some(vp => (vp as Viewpoint).canInitializeWithVanishingPoints(worldPointSet))) {
        console.log(`[optimizeProject] Found ${lockedPoints.length} constrained points`);

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
            console.log(`  ${wp.name}: [${wp.optimizedXyz.join(', ')}]`);
          }
        } else {
          console.log(`[optimizeProject] Skipping locked point initialization (will use Essential Matrix with scale resolution)`);
        }

        for (const vp of uninitializedCameras) {
          const vpConcrete = vp as Viewpoint;

          if (vpConcrete.canInitializeWithVanishingPoints(worldPointSet)) {
            console.log(`[optimizeProject] Checking vanishing point initialization for ${vpConcrete.name}...`);
            console.log(`  Vanishing lines: ${vpConcrete.getVanishingLineCount()}`);

            const success = initializeCameraWithVanishingPoints(vpConcrete, worldPointSet);
            if (success) {
              vpConcrete.setPoseLocked(true);
              console.log(`[optimizeProject] ${vpConcrete.name} initialized with vanishing points (pose locked)`);
              console.log(`  Position: [${vpConcrete.position.map(x => x.toFixed(3)).join(', ')}]`);
              console.log(`  Focal length: ${vpConcrete.focalLength.toFixed(1)}`);
              camerasInitialized.push(vpConcrete.name);
              continue;
            } else {
              console.log(`[optimizeProject] Vanishing point initialization failed for ${vpConcrete.name}, falling back to PnP`);
            }
          }

          const vpLockedPoints = Array.from(vpConcrete.imagePoints).filter(ip =>
            (ip.worldPoint as WorldPoint).isFullyConstrained()
          );

          if (vpLockedPoints.length >= 3) {
            console.log(`[optimizeProject] Initializing ${vpConcrete.name} with PnP (${vpLockedPoints.length} constrained points visible)...`);
            const success = initializeCameraWithPnP(vpConcrete, worldPointSet);
            if (success) {
              console.log(`[optimizeProject] ${vpConcrete.name} initialized: pos=[${vpConcrete.position.map(x => x.toFixed(3)).join(', ')}]`);
              camerasInitialized.push(vpConcrete.name);
            } else {
              const errorMsg = `Cannot initialize ${vpConcrete.name}: PnP failed with ${vpLockedPoints.length} locked points. Check that locked points have valid coordinates and are visible in the image.`;
              console.error(`[optimizeProject] ${errorMsg}`);
              throw new Error(errorMsg);
            }
          } else {
            console.log(`[optimizeProject] ${vpConcrete.name} has only ${vpLockedPoints.length} locked points (need 3 for PnP) - will try later with triangulated points`);
          }
        }
      }

      if (camerasInitialized.length === 0) {
        console.log('[optimizeProject] No locked points - using Essential Matrix initialization');

        const vp1 = uninitializedCameras[0] as Viewpoint;
        const vp2 = uninitializedCameras[1] as Viewpoint;

        const result = initializeCamerasWithEssentialMatrix(vp1, vp2, 10.0);

        if (result.success) {
          console.log('[optimizeProject] Essential Matrix initialization successful');
          console.log(`  ${vp1.name}: [${vp1.position.map(x => x.toFixed(3)).join(', ')}]`);
          console.log(`  ${vp2.name}: [${vp2.position.map(x => x.toFixed(3)).join(', ')}]`);
          camerasInitialized.push(vp1.name, vp2.name);
        } else {
          const errorMsg = `Cannot initialize cameras: ${result.error || 'Unknown error'}. Need at least 7 shared point correspondences between two cameras for Essential Matrix initialization. Add more image points or lock some world point coordinates to use PnP instead.`;
          console.error(`[optimizeProject] ${errorMsg}`);
          throw new Error(errorMsg);
        }
      }
    }
  }

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

    unifiedInitialize(pointArray, lineArray, constraintArray, {
      sceneScale: 10.0,
      verbose: false,
      initializedViewpoints: initializedViewpointSet
    });

    const lockedPoints = pointArray.filter(wp => wp.isFullyConstrained());
    if (lockedPoints.length >= 2) {
      const triangulatedLockedPoints = lockedPoints.filter(wp => wp.optimizedXyz !== undefined);

      if (triangulatedLockedPoints.length >= 2) {
        console.log(`[optimizeProject] Computing scale from ${triangulatedLockedPoints.length} locked points...`);

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

            const triDist = Math.sqrt(
              (tri2[0] - tri1[0]) ** 2 +
              (tri2[1] - tri1[1]) ** 2 +
              (tri2[2] - tri1[2]) ** 2
            );

            const lockDist = Math.sqrt(
              (lock2[0]! - lock1[0]!) ** 2 +
              (lock2[1]! - lock1[1]!) ** 2 +
              (lock2[2]! - lock1[2]!) ** 2
            );

            if (triDist > 0.01) {
              const scale = lockDist / triDist;
              console.log(`  ${wp1.name} <-> ${wp2.name}: triangulated=${triDist.toFixed(3)}, locked=${lockDist.toFixed(3)}, scale=${scale.toFixed(4)}`);
              console.log(`    ${wp1.name}: tri=[${tri1.map(v => v.toFixed(2)).join(', ')}], lock=[${lock1.map(v => v!.toFixed(2)).join(', ')}]`);
              console.log(`    ${wp2.name}: tri=[${tri2.map(v => v.toFixed(2)).join(', ')}], lock=[${lock2.map(v => v!.toFixed(2)).join(', ')}]`);
              sumScale += scale;
              count++;
            }
          }
        }

        if (count > 0) {
          const scale = sumScale / count;
          console.log(`[optimizeProject] Computed scale factor: ${scale.toFixed(4)}`);

          for (const wp of pointArray) {
            if (wp.optimizedXyz) {
              wp.optimizedXyz = [
                wp.optimizedXyz[0] * scale,
                wp.optimizedXyz[1] * scale,
                wp.optimizedXyz[2] * scale
              ];
            }
          }

          const viewpointArray = Array.from(project.viewpoints);
          for (const vp of viewpointArray) {
            const vpConcrete = vp as Viewpoint;
            vpConcrete.position = [
              vpConcrete.position[0] * scale,
              vpConcrete.position[1] * scale,
              vpConcrete.position[2] * scale
            ];
          }

          console.log('[optimizeProject] Applied scale to all cameras and world points');
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

    for (const vp of stillUninitializedCameras) {
      const vpConcrete = vp as Viewpoint;
      const hasImagePoints = vpConcrete.imagePoints.size > 0;
      const hasTriangulatedPoints = Array.from(vpConcrete.imagePoints).some(ip =>
        (ip.worldPoint as WorldPoint).optimizedXyz !== null
      );

      if (hasImagePoints && hasTriangulatedPoints) {
        console.log(`[optimizeProject] Initializing camera ${vpConcrete.name} with PnP...`);
        const success = initializeCameraWithPnP(vpConcrete, worldPointSet);
        if (success) {
          camerasInitialized.push(vpConcrete.name);
          console.log(`[optimizeProject] Camera ${vpConcrete.name} initialized successfully`);
        } else {
          console.warn(`[optimizeProject] PnP initialization failed for ${vpConcrete.name}`);
        }
      }
    }
  }

  const system = new ConstraintSystem({
    tolerance,
    maxIterations,
    damping,
    verbose,
  });

  console.log('[optimizeProject] Adding entities to constraint system...');

  project.worldPoints.forEach(p => system.addPoint(p as WorldPoint));
  console.log(`  Added ${project.worldPoints.size} world points`);

  project.lines.forEach(l => system.addLine(l));
  console.log(`  Added ${project.lines.size} lines`);

  project.viewpoints.forEach(v => system.addCamera(v as Viewpoint));
  console.log(`  Added ${project.viewpoints.size} cameras`);

  project.imagePoints.forEach(ip => system.addImagePoint(ip as ImagePoint));
  console.log(`  Added ${project.imagePoints.size} image points`);

  project.constraints.forEach(c => system.addConstraint(c));
  console.log(`  Added ${project.constraints.size} constraints`);

  console.log('[optimizeProject] Running optimization...');
  const result = system.solve();

  console.log('[optimizeProject] Optimization complete');
  console.log(`  Converged: ${result.converged}`);
  console.log(`  Iterations: ${result.iterations}`);
  console.log(`  Residual: ${result.residual.toFixed(6)}`);

  let outliers: OutlierInfo[] | undefined;
  let medianReprojectionError: number | undefined;

  if (shouldDetectOutliers && project.imagePoints.size > 0) {
    console.log('\n=== OUTLIER DETECTION ===');

    // Clear all previous outlier flags before re-detecting
    for (const vp of project.viewpoints) {
      for (const ip of vp.imagePoints) {
        (ip as ImagePoint).isOutlier = false;
      }
    }

    const detection = detectOutliers(project, outlierThreshold);
    outliers = detection.outliers;
    medianReprojectionError = detection.medianError;

    console.log(`Median reprojection error: ${medianReprojectionError.toFixed(2)} px`);
    console.log(`Outlier threshold: ${detection.actualThreshold.toFixed(2)} px (adaptive based on median quality)`);

    if (outliers.length > 0) {
      console.log(`\nFound ${outliers.length} potential outlier image points (error > ${detection.actualThreshold.toFixed(1)} px):`);
      for (const outlier of outliers) {
        console.log(`  - ${outlier.worldPointName} @ ${outlier.viewpointName}: ${outlier.error.toFixed(1)} px (median: ${medianReprojectionError.toFixed(1)} px)`);
        outlier.imagePoint.isOutlier = true;
      }
      console.log('\nThese points may have incorrect manual clicks.');
      console.log('Consider reviewing or removing them.');
    } else {
      console.log('No outliers detected - all reprojection errors are within acceptable range.');
    }
  }

  return {
    ...result,
    camerasInitialized: camerasInitialized.length > 0 ? camerasInitialized : undefined,
    outliers,
    medianReprojectionError,
  };
}
