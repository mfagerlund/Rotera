import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import { initializeFromImagePairs } from '../seed-initialization';
import { initializeCameraWithPnP } from '../pnp';
import { Viewpoint } from '../../entities/viewpoint';
import { WorldPoint } from '../../entities/world-point';
import { Line } from '../../entities/line';
import { ImagePoint } from '../../entities/imagePoint';
import { Project } from '../../entities/project';
import type { ValueMap } from '../IOptimizable';
import * as fs from 'fs';

describe('Cube Fixture Optimization', () => {
  it('should optimize the cube fixture correctly', () => {
    const fixturePath = 'C:\\Slask\\Untitled Project-optimization-2025-10-22.json';

    if (!fs.existsSync(fixturePath)) {
      console.log('Fixture file not found, skipping test');
      return;
    }

    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    console.log('\n=== CUBE FIXTURE TEST (SfM INITIALIZATION) ===\n');

    console.log('Project info:');
    console.log(`  World Points: ${project.worldPoints.size}`);
    console.log(`  Lines: ${project.lines.size}`);
    console.log(`  Viewpoints: ${project.viewpoints.size}`);
    console.log(`  Image Points: ${Array.from(project.viewpoints).reduce((sum, vp) => sum + vp.imagePoints.size, 0)}`);
    console.log(`  Constraints: ${project.constraints.size}\n`);

    console.log('=== STAGE 0: INITIALIZE SEED PAIR FROM IMAGE CORRESPONDENCES ===\n');

    const initResult = initializeFromImagePairs(project);

    if (!initResult.success || !initResult.seedPair) {
      console.log('Initialization failed!');
      initResult.errors.forEach(err => console.log(`  ERROR: ${err}`));
      expect(initResult.success).toBe(true);
      return;
    }

    const vp1 = initResult.seedPair.viewpoint1 as Viewpoint;
    const vp2 = initResult.seedPair.viewpoint2 as Viewpoint;

    console.log(`Seed pair: ${vp1.name} + ${vp2.name}`);
    console.log(`  Scale baseline: ${initResult.scaleBaseline?.toFixed(3)}`);
    console.log(`  Triangulated: ${initResult.triangulatedPoints}/${initResult.seedPair.sharedWorldPoints.length} points`);

    if (initResult.warnings.length > 0) {
      console.log('\nWarnings:');
      initResult.warnings.forEach(warn => console.log(`  - ${warn}`));
    }

    console.log('\nCamera positions AFTER initialization, BEFORE bundle adjustment:');
    console.log(`  ${vp1.name}: focal=${vp1.focalLength}, pos=[${vp1.position.map(x => x.toFixed(3)).join(', ')}]`);
    console.log(`  ${vp2.name}: focal=${vp2.focalLength}, pos=[${vp2.position.map(x => x.toFixed(3)).join(', ')}]`);

    // DON'T lock cameras - let them optimize freely
    console.log('\nCameras will be free to optimize in bundle adjustment');

    console.log('\n=== STAGE 1: BUNDLE ADJUSTMENT (SEED PAIR ONLY - cameras locked) ===\n');

    const seedPair = initResult.seedPair;
    const seedImagePoints = [
      ...Array.from(vp1.imagePoints).filter(ip =>
        seedPair.sharedWorldPoints.includes(ip.worldPoint)
      ),
      ...Array.from(vp2.imagePoints).filter(ip =>
        seedPair.sharedWorldPoints.includes(ip.worldPoint)
      )
    ].map(ip => ip as ImagePoint);

    const seedProject1 = Project.create('Seed Pair Bundle Adjustment');
    seedPair.sharedWorldPoints.forEach(p => seedProject1.addWorldPoint(p as WorldPoint));
    seedProject1.addViewpoint(vp1);
    seedProject1.addViewpoint(vp2);
    seedImagePoints.forEach(ip => seedProject1.addImagePoint(ip));

    const result1 = optimizeProject(seedProject1, {
      maxIterations: 200,
      tolerance: 1e-6,
      damping: 10.0,
      verbose: true,
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false
    });
    console.log(`Converged: ${result1.converged}`);
    console.log(`Iterations: ${result1.iterations}`);
    console.log(`Residual: ${result1.residual.toFixed(2)}\n`);

    console.log('Seed pair camera poses:');
    console.log(`  ${vp1.name}: pos=[${vp1.position.map(x => x.toFixed(3)).join(', ')}]`);
    console.log(`  ${vp2.name}: pos=[${vp2.position.map(x => x.toFixed(3)).join(', ')}]`);

    console.log('\nSeed pair reprojection errors:');
    let totalErrorSeed = 0;
    let countSeed = 0;
    const seedErrors: {ip: ImagePoint, error: number}[] = [];
    for (const ip of seedImagePoints) {
      if (ip.lastResiduals && ip.lastResiduals.length === 2) {
        const error = Math.sqrt(ip.lastResiduals[0]**2 + ip.lastResiduals[1]**2);
        totalErrorSeed += error;
        countSeed++;
        seedErrors.push({ip, error});
      }
    }
    if (countSeed > 0) {
      console.log(`  Average: ${(totalErrorSeed / countSeed).toFixed(2)} pixels (${countSeed} observations)`);
    }

    console.log('\n=== OUTLIER DETECTION IN SEED PAIR ===\n');

    const outlierThreshold = 1000;
    const seedOutliers = seedErrors.filter(({error}) => error > outlierThreshold);

    if (seedOutliers.length > 0) {
      seedOutliers.sort((a, b) => b.error - a.error);
      console.log(`Found ${seedOutliers.length} outliers in seed pair (error > ${outlierThreshold}px):`);
      for (const {ip, error} of seedOutliers) {
        console.log(`  - ${ip.worldPoint.getName()} @ ${ip.viewpoint.getName()}: ${error.toFixed(1)} px`);
        const vp = ip.viewpoint as Viewpoint;
        vp.removeImagePoint(ip);
        project.removeImagePoint(ip);
      }
      console.log(`\nRemoved ${seedOutliers.length} outlier image points from project\n`);
    } else {
      console.log('No outliers detected in seed pair\n');
    }

    console.log('\n=== RESCALE TO FIX METRIC (using scale constraint) ===\n');

    let rescaledSceneScale = initResult.scaleBaseline || 10.0;

    if (seedPair.scaleInfo) {
      let actualValue = 0;
      let expectedValue = seedPair.scaleInfo.value;
      rescaledSceneScale = expectedValue;

      if (seedPair.scaleInfo.type === 'distance') {
        const wp1 = seedPair.scaleInfo.point1! as WorldPoint;
        const wp2 = seedPair.scaleInfo.point2! as WorldPoint;
        if (wp1.optimizedXyz && wp2.optimizedXyz) {
          const dx = wp2.optimizedXyz[0] - wp1.optimizedXyz[0];
          const dy = wp2.optimizedXyz[1] - wp1.optimizedXyz[1];
          const dz = wp2.optimizedXyz[2] - wp1.optimizedXyz[2];
          actualValue = Math.sqrt(dx * dx + dy * dy + dz * dz);
          console.log(`Distance constraint: ${wp1.name} -> ${wp2.name}`);
        }
      } else {
        const line = seedPair.scaleInfo.line! as Line;
        const info = line.getOptimizationInfo();
        actualValue = info.length || 0;
        console.log(`Line constraint: ${line.name || 'Line'} (${(line.pointA as WorldPoint).name} -> ${(line.pointB as WorldPoint).name})`);
      }

      if (actualValue > 0.001) {
        const scaleFactor = expectedValue / actualValue;
        console.log(`  Current: ${actualValue.toFixed(3)}`);
        console.log(`  Expected: ${expectedValue.toFixed(3)}`);
        console.log(`  Scale factor: ${scaleFactor.toFixed(3)}\n`);

        console.log('Camera positions BEFORE rescaling:');
        console.log(`  ${vp1.name}: pos=[${vp1.position.map(x => x.toFixed(2)).join(', ')}]`);
        console.log(`  ${vp2.name}: pos=[${vp2.position.map(x => x.toFixed(2)).join(', ')}]\n`);

        for (const wp of project.worldPoints) {
          if (wp.optimizedXyz && !wp.isFullyLocked()) {
            wp.optimizedXyz = [
              wp.optimizedXyz[0] * scaleFactor,
              wp.optimizedXyz[1] * scaleFactor,
              wp.optimizedXyz[2] * scaleFactor
            ];
          }
        }

        vp1.position = [
          vp1.position[0] * scaleFactor,
          vp1.position[1] * scaleFactor,
          vp1.position[2] * scaleFactor
        ];

        vp2.position = [
          vp2.position[0] * scaleFactor,
          vp2.position[1] * scaleFactor,
          vp2.position[2] * scaleFactor
        ];

        console.log('Scaled all world points and seed camera positions (focal length unchanged)');
        console.log(`  ${vp1.name}: focal=${vp1.focalLength.toFixed(2)}, pos=[${vp1.position.map(x => x.toFixed(3)).join(', ')}]`);
        console.log(`  ${vp2.name}: focal=${vp2.focalLength.toFixed(2)}, pos=[${vp2.position.map(x => x.toFixed(3)).join(', ')}]`);

        console.log('\nVerifying scale constraint after rescaling:');
        if (seedPair.scaleInfo.type === 'distance') {
          const wp1 = seedPair.scaleInfo.point1! as WorldPoint;
          const wp2 = seedPair.scaleInfo.point2! as WorldPoint;
          if (wp1.optimizedXyz && wp2.optimizedXyz) {
            const dx = wp2.optimizedXyz[0] - wp1.optimizedXyz[0];
            const dy = wp2.optimizedXyz[1] - wp1.optimizedXyz[1];
            const dz = wp2.optimizedXyz[2] - wp1.optimizedXyz[2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            console.log(`  Distance ${wp1.name} -> ${wp2.name}: ${dist.toFixed(3)} (expected ${expectedValue.toFixed(3)})`);
          }
        } else {
          const line = seedPair.scaleInfo.line! as Line;
          const info = line.getOptimizationInfo();
          console.log(`  Line ${line.name}: ${info.length?.toFixed(3)} (expected ${expectedValue.toFixed(3)})`);
        }

        vp1.isPoseLocked = false;
        vp2.isPoseLocked = false;
        console.log('\nUnlocking camera poses for refinement with constraints');

        console.log('\n=== REFINE SEED PAIR WITH CONSTRAINTS (hold scale) ===\n');

        const seedProjectConstrained = Project.create('Seed Pair with Constraints');
        seedPair.sharedWorldPoints.forEach(p => seedProjectConstrained.addWorldPoint(p as WorldPoint));
        project.lines.forEach(l => {
          if (seedPair.sharedWorldPoints.includes(l.pointA) && seedPair.sharedWorldPoints.includes(l.pointB)) {
            seedProjectConstrained.addLine(l);
          }
        });
        seedProjectConstrained.addViewpoint(vp1);
        seedProjectConstrained.addViewpoint(vp2);
        seedImagePoints.forEach(ip => seedProjectConstrained.addImagePoint(ip));
        project.constraints.forEach(c => {
          const cAny = c as any;
          const constraintPoints = [cAny.pointA, cAny.pointB, cAny.pointC].filter(p => p);
          if (constraintPoints.every(p => seedPair.sharedWorldPoints.includes(p!))) {
            seedProjectConstrained.addConstraint(c);
          }
        });

        const resultConstrained = optimizeProject(seedProjectConstrained, {
          maxIterations: 100,
          tolerance: 1e-6,
          damping: 5.0,
          verbose: true,
          autoInitializeCameras: false,
          autoInitializeWorldPoints: false
        });
        console.log(`\nConverged: ${resultConstrained.converged}`);
        console.log(`Iterations: ${resultConstrained.iterations}`);
        console.log(`Residual: ${resultConstrained.residual.toFixed(2)}\n`);

        console.log('Verifying scale after constraint refinement:');
        const lineAfter = seedPair.scaleInfo.line! as Line;
        const infoAfter = lineAfter.getOptimizationInfo();
        console.log(`  Line ${lineAfter.name}: ${infoAfter.length?.toFixed(3)} (target ${expectedValue.toFixed(3)})`);

      } else {
        console.log('WARNING: Could not compute actual value for scale constraint');
      }
    } else {
      console.log('No scale constraint available - skipping rescaling');
    }

    console.log('\n=== STAGE 2: ADD REMAINING CAMERAS (if any) ===\n');

    const remainingViewpoints = Array.from(project.viewpoints).filter(vp =>
      vp !== seedPair.viewpoint1 && vp !== seedPair.viewpoint2
    );

    if (remainingViewpoints.length > 0) {
      console.log(`Found ${remainingViewpoints.length} additional camera(s) to initialize\n`);

      for (const vp of remainingViewpoints) {
        const vpConcrete = vp as Viewpoint;

        const vpWorldPoints = Array.from(vpConcrete.imagePoints).map(ip => ip.worldPoint);
        const sharedWithSeed = vpWorldPoints.filter(wp =>
          seedPair.sharedWorldPoints.includes(wp)
        );

        console.log(`Initializing ${vpConcrete.name} (shares ${sharedWithSeed.length} points with seed pair)`);

        const success = initializeCameraWithPnP(vpConcrete, project.worldPoints);

        if (!success) {
          console.log(`  WARNING: PnP initialization failed, using fallback\n`);
          const scaleBaseline = rescaledSceneScale;
          const cameraDistance = scaleBaseline * 2;
          const randomOffset = Math.random() * scaleBaseline - scaleBaseline / 2;
          vpConcrete.position = [randomOffset, 0, -cameraDistance];
          vpConcrete.rotation = [1, 0, 0, 0];
        }
        console.log();
      }
    } else {
      console.log('No additional cameras to initialize\n');
    }

    console.log('=== STAGE 3: BUNDLE ADJUSTMENT (ALL CAMERAS) WITH CONSTRAINTS ===\n');

    const result2 = optimizeProject(project, {
      maxIterations: 200,
      tolerance: 1e-6,
      damping: 5.0,
      verbose: true,
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false
    });
    console.log(`\nConverged: ${result2.converged}`);
    console.log(`Iterations: ${result2.iterations}`);
    console.log(`Residual: ${result2.residual.toFixed(2)}\n`);

    console.log('All camera poses:');
    for (const vp of project.viewpoints) {
      const vpConcrete = vp as Viewpoint;
      console.log(`  ${vpConcrete.name}: pos=[${vpConcrete.position.map(x => x.toFixed(3)).join(', ')}]`);
    }

    console.log('\nAll reprojection errors:');
    let totalErrorAll = 0;
    let countAll = 0;
    for (const vp of project.viewpoints) {
      let vpError = 0;
      let vpCount = 0;
      for (const ip of vp.imagePoints) {
        const ipConcrete = ip as ImagePoint;
        if (ipConcrete.lastResiduals && ipConcrete.lastResiduals.length === 2) {
          const error = Math.sqrt(ipConcrete.lastResiduals[0]**2 + ipConcrete.lastResiduals[1]**2);
          vpError += error;
          vpCount++;
          totalErrorAll += error;
          countAll++;
        }
      }
      if (vpCount > 0) {
        console.log(`  ${(vp as Viewpoint).name}: ${(vpError / vpCount).toFixed(2)} px (${vpCount} obs)`);
      }
    }
    if (countAll > 0) {
      console.log(`  Overall average: ${(totalErrorAll / countAll).toFixed(2)} px (${countAll} obs)`);
    }

    console.log('\n=== PRE-STAGE 4 DIAGNOSTICS ===\n');

    console.log('Line lengths BEFORE Stage 4:');
    for (const line of project.lines) {
      const info = line.getOptimizationInfo();
      console.log(`  ${line.name || 'Line'}: ${info.length?.toFixed(3) || 'unknown'} (target: ${info.targetLength})`);
    }
    console.log();

    console.log('Sample world point positions BEFORE Stage 4:');
    let sampleCount = 0;
    for (const wp of project.worldPoints) {
      if (sampleCount < 4) {
        const info = wp.getOptimizationInfo();
        const opt = info.optimizedXyz ? info.optimizedXyz.map(x => x.toFixed(3)).join(', ') : 'none';
        console.log(`  ${wp.name}: [${opt}]`);
        sampleCount++;
      }
    }
    console.log();

    console.log('\n=== STAGE 4: APPLY GEOMETRIC CONSTRAINTS ===\n');

    const result = optimizeProject(project, {
      maxIterations: 1000,
      tolerance: 1e-8,
      damping: 20.0,
      verbose: true,
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false
    });

    console.log('\n=== OPTIMIZATION RESULT ===\n');
    console.log(`Converged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Final Residual: ${result.residual.toFixed(6)}\n`);

    console.log('=== FINAL CAMERA POSES ===\n');
    for (const vp of project.viewpoints) {
      const vpConcrete = vp as Viewpoint;
      console.log(`${vpConcrete.name}:`);
      console.log(`  Position: [${vpConcrete.position.map(x => x.toFixed(3)).join(', ')}]`);
      console.log(`  Rotation: [${vpConcrete.rotation.map(x => x.toFixed(3)).join(', ')}]`);
      console.log(`  Focal Length: ${vpConcrete.focalLength}`);
    }
    console.log();

    console.log('=== OPTIMIZED POSITIONS ===\n');

    for (const wp of project.worldPoints) {
      const info = wp.getOptimizationInfo();
      const locked = info.lockedXyz?.map(x => x !== null ? x.toFixed(3) : 'null').join(', ') || 'none';
      const opt = info.optimizedXyz ? info.optimizedXyz.map(x => x.toFixed(3)).join(', ') : 'none';

      console.log(`${wp.name}:`);
      console.log(`  Locked: [${locked}]`);
      console.log(`  Optimized: [${opt}]`);
      console.log(`  RMS Residual: ${info.rmsResidual.toExponential(2)}`);
    }
    console.log();

    console.log('=== LINE CONSTRAINTS ===\n');

    for (const line of project.lines) {
      const info = line.getOptimizationInfo();
      console.log(`${line.name || 'Line'}:`);
      console.log(`  Current Length: ${info.length?.toFixed(3) || 'unknown'}`);
      console.log(`  Target Length: ${info.targetLength}`);
      console.log(`  Error: ${info.lengthError?.toExponential(2) || 'unknown'}`);
      console.log(`  Direction: ${info.direction}`);
      console.log(`  RMS Residual: ${info.rmsResidual.toExponential(2)}`);
    }
    console.log();

    console.log('\n=== OUTLIER DETECTION AND REMOVAL (AFTER STAGE 4) ===\n');

    console.log('Line lengths BEFORE outlier removal:');
    for (const line of project.lines) {
      const info = line.getOptimizationInfo();
      const target = info.targetLength !== undefined ? info.targetLength.toFixed(1) : 'none';
      console.log(`  ${line.name || 'Line'}: ${info.length?.toFixed(3) || 'unknown'} (target: ${target})`);
    }
    console.log();

    interface OutlierInfo {
      imagePoint: ImagePoint;
      worldPointName: string;
      viewpointName: string;
      error: number;
    }

    const outliers: OutlierInfo[] = [];
    const errors: number[] = [];

    for (const vp of project.viewpoints) {
      for (const ip of vp.imagePoints) {
        const ipConcrete = ip as ImagePoint;
        if (ipConcrete.lastResiduals && ipConcrete.lastResiduals.length === 2) {
          const error = Math.sqrt(ipConcrete.lastResiduals[0]**2 + ipConcrete.lastResiduals[1]**2);
          errors.push(error);
        }
      }
    }

    errors.sort((a, b) => a - b);
    const medianError = errors.length > 0 ? errors[Math.floor(errors.length / 2)] : 0;
    const threshold = 80;

    console.log(`Median reprojection error: ${medianError.toFixed(2)} px`);
    console.log(`Outlier threshold: ${threshold.toFixed(2)} px (any point > ${threshold}px is considered an outlier)\n`);

    for (const vp of project.viewpoints) {
      for (const ip of vp.imagePoints) {
        const ipConcrete = ip as ImagePoint;
        if (ipConcrete.lastResiduals && ipConcrete.lastResiduals.length === 2) {
          const error = Math.sqrt(ipConcrete.lastResiduals[0]**2 + ipConcrete.lastResiduals[1]**2);
          if (error > threshold) {
            outliers.push({
              imagePoint: ipConcrete,
              worldPointName: ipConcrete.worldPoint.getName(),
              viewpointName: ipConcrete.viewpoint.getName(),
              error: error
            });
          }
        }
      }
    }

    outliers.sort((a, b) => b.error - a.error);

    if (outliers.length > 0) {
      console.log(`Removed ${outliers.length} outlier image points (error > ${threshold}px):`);
      for (const outlier of outliers) {
        console.log(`  - ${outlier.imagePoint.worldPoint.getName()} @ ${outlier.imagePoint.viewpoint.getName()}: ${outlier.error.toFixed(1)} px`);
        const vp = outlier.imagePoint.viewpoint as Viewpoint;
        vp.removeImagePoint(outlier.imagePoint);
        project.removeImagePoint(outlier.imagePoint);
      }
      console.log();

      const totalImagePoints = Array.from(project.viewpoints).reduce((sum, vp) => sum + vp.imagePoints.size, 0);
      console.log(`Remaining: ${totalImagePoints} good image points\n`);

      console.log('=== RE-OPTIMIZATION WITH CLEAN DATA ===\n');

      const resultClean = optimizeProject(project, {
        maxIterations: 1000,
        tolerance: 1e-8,
        damping: 20.0,
        verbose: true,
        autoInitializeCameras: false,
        autoInitializeWorldPoints: false
      });

      console.log('\n=== CLEAN OPTIMIZATION RESULT ===\n');
      console.log(`Converged: ${resultClean.converged}`);
      console.log(`Iterations: ${resultClean.iterations}`);
      console.log(`Final Residual: ${resultClean.residual.toFixed(6)}\n`);

      console.log('\n=== FINAL LINE LENGTHS (AFTER OUTLIER REMOVAL) ===\n');
      for (const line of project.lines) {
        const info = line.getOptimizationInfo();
        if (info.targetLength !== undefined) {
          const diff = info.length ? Math.abs(info.length - info.targetLength) : 999;
          const status = diff < 0.5 ? 'GOOD' : 'POOR';
          const lengthStr = info.length?.toFixed(2) || 'unknown';
          const targetStr = info.targetLength.toFixed(1);
          const diffStr = diff < 999 ? diff.toFixed(2) : 'N/A';
          console.log(`  ${line.name}: ${lengthStr} (target: ${targetStr}, error: ${diffStr}) ${status}`);
        } else {
          console.log(`  ${line.name || 'Line'}: ${info.length?.toFixed(3) || 'unknown'} (target: none)`);
        }
      }
      console.log();
    } else {
      console.log('No outliers detected - all reprojection errors below threshold\n');
    }

    console.log('=== STAGE 3: RE-EVALUATE REPROJECTION ERRORS ===\n');

    optimizeProject(project, {
      maxIterations: 0,
      tolerance: 1e-6,
      damping: 0.1,
      verbose: false,
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false
    });

    console.log('=== VIEWPOINT REPROJECTIONS (after Stage 2) ===\n');
    for (const vp of project.viewpoints) {
      const vpConcrete = vp as Viewpoint;
      console.log(`${vpConcrete.name}: ${vpConcrete.imagePoints.size} image points`);
      let totalError = 0;
      let count = 0;
      for (const ip of vpConcrete.imagePoints) {
        const ipConcrete = ip as ImagePoint;
        if (ipConcrete.lastResiduals && ipConcrete.lastResiduals.length === 2) {
          const error = Math.sqrt(ipConcrete.lastResiduals[0]**2 + ipConcrete.lastResiduals[1]**2);
          totalError += error;
          count++;
        }
      }
      if (count > 0) {
        console.log(`  Average reprojection error: ${(totalError / count).toFixed(2)} pixels`);
      }
    }
    console.log();

    expect(result.converged).toBe(true);
  });
});
