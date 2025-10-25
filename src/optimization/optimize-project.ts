import { Project } from '../entities/project';
import { ConstraintSystem, SolverResult, SolverOptions } from './constraint-system';
import { initializeWorldPoints } from './entity-initialization';
import { initializeCameraWithPnP } from './pnp';
import { Viewpoint } from '../entities/viewpoint';
import { WorldPoint } from '../entities/world-point';
import { ImagePoint } from '../entities/imagePoint';

// Global log buffer for export
export const optimizationLogs: string[] = [];

function log(message: string) {
  console.log(message);
  optimizationLogs.push(message);
}

export interface OptimizeProjectOptions extends SolverOptions {
  autoInitializeCameras?: boolean;
  autoInitializeWorldPoints?: boolean;
}

export interface OptimizeProjectResult extends SolverResult {
  camerasInitialized?: string[];
}

export function optimizeProject(
  project: Project,
  options: OptimizeProjectOptions = {}
): OptimizeProjectResult {
  const {
    autoInitializeCameras = true,
    autoInitializeWorldPoints = true,
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

  if (autoInitializeWorldPoints) {
    const pointArray = Array.from(project.worldPoints);
    const lineArray = Array.from(project.lines);
    const constraintArray = Array.from(project.constraints);
    initializeWorldPoints(pointArray, lineArray, constraintArray);
  }

  if (autoInitializeCameras) {
    const viewpointArray = Array.from(project.viewpoints);
    const worldPointSet = new Set(project.worldPoints);

    for (const vp of viewpointArray) {
      const vpConcrete = vp as Viewpoint;
      const hasImagePoints = vpConcrete.imagePoints.size > 0;
      const hasTriangulatedPoints = Array.from(vpConcrete.imagePoints).some(ip =>
        (ip.worldPoint as WorldPoint).optimizedXyz !== null
      );

      // Run PnP if camera has image points and world points are triangulated
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

  return {
    ...result,
    camerasInitialized: camerasInitialized.length > 0 ? camerasInitialized : undefined,
  };
}
