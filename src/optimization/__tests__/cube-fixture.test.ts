import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { ConstraintSystem } from '../constraint-system';
import { initializeFromImagePairs } from '../seed-initialization';
import { Viewpoint } from '../../entities/viewpoint';
import { WorldPoint } from '../../entities/world-point';
import { Line } from '../../entities/line';
import { ImagePoint } from '../../entities/imagePoint';
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

    console.log('\n=== STAGE 1: BUNDLE ADJUSTMENT (SEED PAIR ONLY) ===\n');

    const system1 = new ConstraintSystem({
      maxIterations: 200,
      tolerance: 1e-6,
      damping: 10.0,
      verbose: true
    });

    const seedPair = initResult.seedPair;
    seedPair.sharedWorldPoints.forEach(p => system1.addPoint(p as WorldPoint));
    system1.addCamera(vp1);
    system1.addCamera(vp2);

    const seedImagePoints = [
      ...Array.from(vp1.imagePoints).filter(ip =>
        seedPair.sharedWorldPoints.includes(ip.worldPoint)
      ),
      ...Array.from(vp2.imagePoints).filter(ip =>
        seedPair.sharedWorldPoints.includes(ip.worldPoint)
      )
    ].map(ip => ip as ImagePoint);
    seedImagePoints.forEach(ip => system1.addImagePoint(ip));

    const result1 = system1.solve();
    console.log(`Converged: ${result1.converged}`);
    console.log(`Iterations: ${result1.iterations}`);
    console.log(`Residual: ${result1.residual.toFixed(2)}\n`);

    console.log('Seed pair camera poses:');
    console.log(`  ${vp1.name}: pos=[${vp1.position.map(x => x.toFixed(3)).join(', ')}]`);
    console.log(`  ${vp2.name}: pos=[${vp2.position.map(x => x.toFixed(3)).join(', ')}]`);

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
        vp1.focalLength = vp1.focalLength * scaleFactor;

        vp2.position = [
          vp2.position[0] * scaleFactor,
          vp2.position[1] * scaleFactor,
          vp2.position[2] * scaleFactor
        ];
        vp2.focalLength = vp2.focalLength * scaleFactor;

        console.log('Scaled all world points, seed camera positions, and focal lengths');
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

        console.log('\n=== REFINE SEED PAIR WITH CONSTRAINTS (hold scale) ===\n');

        const systemConstrained = new ConstraintSystem({
          maxIterations: 100,
          tolerance: 1e-6,
          damping: 5.0,
          verbose: true
        });

        seedPair.sharedWorldPoints.forEach(p => systemConstrained.addPoint(p as WorldPoint));
        project.lines.forEach(l => {
          if (seedPair.sharedWorldPoints.includes(l.pointA) && seedPair.sharedWorldPoints.includes(l.pointB)) {
            systemConstrained.addLine(l);
          }
        });
        systemConstrained.addCamera(vp1);
        systemConstrained.addCamera(vp2);
        seedImagePoints.forEach(ip => systemConstrained.addImagePoint(ip));
        project.constraints.forEach(c => {
          const cAny = c as any;
          const constraintPoints = [cAny.pointA, cAny.pointB, cAny.pointC].filter(p => p);
          if (constraintPoints.every(p => seedPair.sharedWorldPoints.includes(p!))) {
            systemConstrained.addConstraint(c);
          }
        });

        const resultConstrained = systemConstrained.solve();
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
      console.log(`Using rescaled scene scale: ${rescaledSceneScale.toFixed(3)}\n`);

      for (const vp of remainingViewpoints) {
        const vpConcrete = vp as Viewpoint;
        const scaleBaseline = rescaledSceneScale;
        const cameraDistance = scaleBaseline * 2;
        const randomOffset = Math.random() * scaleBaseline - scaleBaseline / 2;

        vpConcrete.position = [randomOffset, 0, -cameraDistance];
        vpConcrete.rotation = [1, 0, 0, 0];

        console.log(`Initialized ${vpConcrete.name} at [${vpConcrete.position.map(x => x.toFixed(3)).join(', ')}]`);

        const vpWorldPoints = Array.from(vpConcrete.imagePoints).map(ip => ip.worldPoint);
        const sharedWithSeed = vpWorldPoints.filter(wp =>
          seedPair.sharedWorldPoints.includes(wp)
        );

        console.log(`  Shares ${sharedWithSeed.length} points with seed pair`);
      }
      console.log();
    } else {
      console.log('No additional cameras to initialize\n');
    }

    console.log('=== STAGE 3: BUNDLE ADJUSTMENT (ALL CAMERAS) WITH CONSTRAINTS ===\n');

    const system2 = new ConstraintSystem({
      maxIterations: 200,
      tolerance: 1e-6,
      damping: 5.0,
      verbose: true
    });

    project.worldPoints.forEach(p => system2.addPoint(p));
    project.lines.forEach(l => system2.addLine(l));
    project.viewpoints.forEach(v => system2.addCamera(v));
    project.imagePoints.forEach(ip => system2.addImagePoint(ip as ImagePoint));
    project.constraints.forEach(c => system2.addConstraint(c));

    const result2 = system2.solve();
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
    project.imagePoints.forEach(ip => system3.addImagePoint(ip as ImagePoint));
    project.constraints.forEach(c => system3.addConstraint(c));

    const result = system3.solve();

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
    project.imagePoints.forEach(ip => systemEval.addImagePoint(ip as ImagePoint));

    // This will compute and store residuals in lastResiduals without optimizing
    for (const ip of project.imagePoints) {
      const ipConcrete = ip as ImagePoint;
      const valueMap: ValueMap = {
        points: new Map(),
        cameras: new Map(),
      };
      for (const point of project.worldPoints) {
        (point as WorldPoint).addToValueMap(valueMap);
      }
      for (const camera of project.viewpoints) {
        (camera as Viewpoint).addToValueMap(valueMap);
      }
      ipConcrete.applyOptimizationResult(valueMap);
    }

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
