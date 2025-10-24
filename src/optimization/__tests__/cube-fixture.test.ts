import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { ConstraintSystem } from '../constraint-system';
import { initializeFromImagePairs } from '../seed-initialization';
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

    console.log(`Seed pair: ${initResult.seedPair.viewpoint1.name} + ${initResult.seedPair.viewpoint2.name}`);
    console.log(`  Scale baseline: ${initResult.scaleBaseline?.toFixed(3)}`);
    console.log(`  Triangulated: ${initResult.triangulatedPoints}/${initResult.seedPair.sharedWorldPoints.length} points`);

    if (initResult.warnings.length > 0) {
      console.log('\nWarnings:');
      initResult.warnings.forEach(warn => console.log(`  - ${warn}`));
    }

    console.log('\n=== STAGE 1: BUNDLE ADJUSTMENT (SEED PAIR ONLY) ===\n');

    const system1 = new ConstraintSystem({
      maxIterations: 200,
      tolerance: 1e-6,
      damping: 10.0,
      verbose: true
    });

    const seedPair = initResult.seedPair;
    seedPair.sharedWorldPoints.forEach(p => system1.addPoint(p));
    system1.addCamera(seedPair.viewpoint1);
    system1.addCamera(seedPair.viewpoint2);

    const seedImagePoints = [
      ...Array.from(seedPair.viewpoint1.imagePoints).filter(ip =>
        seedPair.sharedWorldPoints.includes(ip.worldPoint)
      ),
      ...Array.from(seedPair.viewpoint2.imagePoints).filter(ip =>
        seedPair.sharedWorldPoints.includes(ip.worldPoint)
      )
    ];
    seedImagePoints.forEach(ip => system1.addImagePoint(ip as any));

    const result1 = system1.solve();
    console.log(`Converged: ${result1.converged}`);
    console.log(`Iterations: ${result1.iterations}`);
    console.log(`Residual: ${result1.residual.toFixed(2)}\n`);

    console.log('Seed pair camera poses:');
    console.log(`  ${seedPair.viewpoint1.name}: pos=[${seedPair.viewpoint1.position.map(x => x.toFixed(3)).join(', ')}]`);
    console.log(`  ${seedPair.viewpoint2.name}: pos=[${seedPair.viewpoint2.position.map(x => x.toFixed(3)).join(', ')}]`);

    console.log('\nSeed pair reprojection errors:');
    let totalErrorSeed = 0;
    let countSeed = 0;
    for (const ip of seedImagePoints) {
      if (ip.lastResiduals && ip.lastResiduals.length === 2) {
        const error = Math.sqrt(ip.lastResiduals[0]**2 + ip.lastResiduals[1]**2);
        totalErrorSeed += error;
        countSeed++;
      }
    }
    if (countSeed > 0) {
      console.log(`  Average: ${(totalErrorSeed / countSeed).toFixed(2)} pixels (${countSeed} observations)`);
    }

    console.log('\n=== STAGE 2: ADD REMAINING CAMERAS (if any) ===\n');

    const remainingViewpoints = Array.from(project.viewpoints).filter(vp =>
      vp !== seedPair.viewpoint1 && vp !== seedPair.viewpoint2
    );

    if (remainingViewpoints.length > 0) {
      console.log(`Found ${remainingViewpoints.length} additional camera(s) to initialize\n`);

      for (const vp of remainingViewpoints) {
        const scaleBaseline = initResult.scaleBaseline || 10.0;
        const cameraDistance = scaleBaseline * 2;
        const randomOffset = Math.random() * scaleBaseline - scaleBaseline / 2;

        vp.position = [randomOffset, 0, -cameraDistance];
        vp.rotation = [1, 0, 0, 0];

        console.log(`Initialized ${vp.name} at [${vp.position.map(x => x.toFixed(3)).join(', ')}]`);

        const vpWorldPoints = Array.from(vp.imagePoints).map(ip => ip.worldPoint);
        const sharedWithSeed = vpWorldPoints.filter(wp =>
          seedPair.sharedWorldPoints.includes(wp)
        );

        console.log(`  Shares ${sharedWithSeed.length} points with seed pair`);
      }
      console.log();
    } else {
      console.log('No additional cameras to initialize\n');
    }

    console.log('=== STAGE 3: BUNDLE ADJUSTMENT (ALL CAMERAS) ===\n');

    const system2 = new ConstraintSystem({
      maxIterations: 200,
      tolerance: 1e-6,
      damping: 10.0,
      verbose: true
    });

    project.worldPoints.forEach(p => system2.addPoint(p));
    project.viewpoints.forEach(v => system2.addCamera(v));
    project.imagePoints.forEach(ip => system2.addImagePoint(ip as any));

    const result2 = system2.solve();
    console.log(`\nConverged: ${result2.converged}`);
    console.log(`Iterations: ${result2.iterations}`);
    console.log(`Residual: ${result2.residual.toFixed(2)}\n`);

    console.log('All camera poses:');
    for (const vp of project.viewpoints) {
      console.log(`  ${vp.name}: pos=[${vp.position.map(x => x.toFixed(3)).join(', ')}]`);
    }

    console.log('\nAll reprojection errors:');
    let totalErrorAll = 0;
    let countAll = 0;
    for (const vp of project.viewpoints) {
      let vpError = 0;
      let vpCount = 0;
      for (const ip of vp.imagePoints) {
        if (ip.lastResiduals && ip.lastResiduals.length === 2) {
          const error = Math.sqrt(ip.lastResiduals[0]**2 + ip.lastResiduals[1]**2);
          vpError += error;
          vpCount++;
          totalErrorAll += error;
          countAll++;
        }
      }
      if (vpCount > 0) {
        console.log(`  ${vp.name}: ${(vpError / vpCount).toFixed(2)} px (${vpCount} obs)`);
      }
    }
    if (countAll > 0) {
      console.log(`  Overall average: ${(totalErrorAll / countAll).toFixed(2)} px (${countAll} obs)`);
    }

    console.log('\n=== STAGE 4: APPLY GEOMETRIC CONSTRAINTS ===\n');

    const system3 = new ConstraintSystem({
      maxIterations: 500,
      tolerance: 1e-4,
      damping: 2.0,
      verbose: true
    });

    project.worldPoints.forEach(p => system3.addPoint(p));
    project.lines.forEach(l => system3.addLine(l));
    project.viewpoints.forEach(v => system3.addCamera(v));
    project.imagePoints.forEach(ip => system3.addImagePoint(ip as any));
    project.constraints.forEach(c => system3.addConstraint(c));

    const result = system3.solve();

    console.log('\n=== OPTIMIZATION RESULT ===\n');
    console.log(`Converged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Final Residual: ${result.residual.toFixed(6)}\n`);

    console.log('=== FINAL CAMERA POSES ===\n');
    for (const vp of project.viewpoints) {
      console.log(`${vp.name}:`);
      console.log(`  Position: [${vp.position.map(x => x.toFixed(3)).join(', ')}]`);
      console.log(`  Rotation: [${vp.rotation.map(x => x.toFixed(3)).join(', ')}]`);
      console.log(`  Focal Length: ${vp.focalLength}`);
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

    // STAGE 3: Re-evaluate reprojection errors (without optimizing)
    console.log('=== STAGE 3: RE-EVALUATE REPROJECTION ERRORS ===\n');

    const systemEval = new ConstraintSystem({
      maxIterations: 0,  // Don't optimize, just evaluate
      tolerance: 1e-6,
      damping: 0.1,
      verbose: false
    });

    project.worldPoints.forEach(p => systemEval.addPoint(p));
    project.viewpoints.forEach(v => systemEval.addCamera(v));
    project.imagePoints.forEach(ip => systemEval.addImagePoint(ip as any));

    // This will compute and store residuals in lastResiduals without optimizing
    for (const ip of project.imagePoints) {
      const valueMap: ValueMap = {
        points: new Map(),
        cameras: new Map(),
      };
      for (const point of project.worldPoints) {
        point.addToValueMap(valueMap);
      }
      for (const camera of project.viewpoints) {
        if ('addToValueMap' in camera && typeof camera.addToValueMap === 'function') {
          (camera as any).addToValueMap(valueMap);
        }
      }
      ip.applyOptimizationResult(valueMap);
    }

    console.log('=== VIEWPOINT REPROJECTIONS (after Stage 2) ===\n');
    for (const vp of project.viewpoints) {
      console.log(`${vp.name}: ${vp.imagePoints.size} image points`);
      let totalError = 0;
      let count = 0;
      for (const ip of vp.imagePoints) {
        if (ip.lastResiduals && ip.lastResiduals.length === 2) {
          const error = Math.sqrt(ip.lastResiduals[0]**2 + ip.lastResiduals[1]**2);
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
