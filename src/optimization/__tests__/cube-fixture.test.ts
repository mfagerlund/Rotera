import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { ConstraintSystem } from '../constraint-system';
import { smartInitialization } from '../smart-initialization';
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

    console.log('\n=== CUBE FIXTURE TEST ===\n');

    // Check what cameras look like before we modify them
    console.log('=== CAMERAS BEFORE INITIALIZATION ===');
    for (const vp of project.viewpoints) {
      console.log(`${vp.name}: pos=${vp.position}, rot=${vp.rotation}`);
    }
    console.log();

    console.log('Initializing cube structure...');

    // Initialize cube corners at ACTUAL TARGET scale (10x10x10)
    // This gives bundle adjustment a good starting point
    const cubeCorners = [
      [10, 0, 0],     // WP1
      [10, 10, 0],     // WP2
      [0, 10, 0],     // WP3
      // WP4 at [0,0,0] is locked - skip
      [0, 0, 10],     // WP5
      [10, 0, 10],     // WP6
      [10, 10, 10],     // WP7
      [0, 10, 10],     // WP8
      [5, 5, 5],  // WP9 (center)
    ];

    let i = 0;
    for (const point of project.worldPoints) {
      if (!point.optimizedXyz && !point.isLocked()) {
        if (i < cubeCorners.length) {
          point.optimizedXyz = cubeCorners[i] as [number, number, number];
        } else {
          point.optimizedXyz = [i * 2.0, i * 1.5, i * 1.0];
        }
        i++;
      }
    }

    // Initialize cameras close to cube on -Z axis with slight variations
    // Cube center is at (5, 5, 5), cameras look at it from front
    // Start closer (~15 units) for better initial reprojections
    const cameraData = [
      { position: [5, 5, -15], rotation: [1, 0, 0, 0] },    // Camera 1: centered front view
      { position: [3, 7, -18], rotation: [1, 0, 0, 0] },    // Camera 2: offset front view
      { position: [7, 3, -12], rotation: [1, 0, 0, 0] },    // Camera 3: different offset
    ];

    const viewpoints = Array.from(project.viewpoints);
    for (let j = 0; j < Math.min(viewpoints.length, cameraData.length); j++) {
      viewpoints[j].position = cameraData[j].position as [number, number, number];
      viewpoints[j].rotation = cameraData[j].rotation as [number, number, number, number];
    }

    console.log(`Initialized ${i} world points and ${Math.min(viewpoints.length, cameraData.length)} cameras.\n`);
    console.log(`World Points: ${project.worldPoints.size}`);
    console.log(`Lines: ${project.lines.size}`);
    console.log(`Viewpoints: ${project.viewpoints.size}`);
    console.log(`Image Points: ${Array.from(project.viewpoints).reduce((sum, vp) => sum + vp.imagePoints.size, 0)}`);
    console.log(`Constraints: ${project.constraints.size}\n`);

    console.log('=== INITIAL STATE ===\n');

    for (const wp of project.worldPoints) {
      const locked = wp.lockedXyz.map(x => x !== null ? x.toFixed(3) : 'null').join(', ');
      const opt = wp.optimizedXyz ? wp.optimizedXyz.map(x => x.toFixed(3)).join(', ') : 'none';
      console.log(`${wp.name}:`);
      console.log(`  Locked: [${locked}]`);
      console.log(`  Optimized: [${opt}]`);
    }
    console.log();

    for (const line of project.lines) {
      console.log(`${line.name || 'Line'}:`);
      console.log(`  ${line.pointA.name} -> ${line.pointB.name}`);
      console.log(`  Target: ${line.targetLength}`);
      console.log(`  Direction: ${line.direction}`);
    }
    console.log();

    // STAGE 1: Bundle adjustment - find relative geometry from image observations
    console.log('=== STAGE 1: BUNDLE ADJUSTMENT (CAMERAS + IMAGE POINTS) ===\n');

    const system1 = new ConstraintSystem({
      maxIterations: 200,
      tolerance: 1e-6,
      damping: 10.0,  // Very high damping for stability in bundle adjustment
      verbose: true
    });

    project.worldPoints.forEach(p => system1.addPoint(p));
    project.viewpoints.forEach(v => system1.addCamera(v));
    project.imagePoints.forEach(ip => system1.addImagePoint(ip as any));
    // NO geometric constraints yet - let it find relative geometry

    const result1 = system1.solve();
    console.log(`Stage 1 Result: Converged=${result1.converged}, Iterations=${result1.iterations}, Residual=${result1.residual.toFixed(2)}`);

    console.log('\nStage 1 Camera Poses:');
    for (const vp of project.viewpoints) {
      console.log(`  ${vp.name}: pos=[${vp.position.map(x => x.toFixed(3)).join(', ')}], rot=[${vp.rotation.map(x => x.toFixed(3)).join(', ')}]`);
    }

    console.log('\nStage 1 Reprojection Errors:');
    for (const vp of project.viewpoints) {
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
        console.log(`  ${vp.name}: avg = ${(totalError / count).toFixed(2)} pixels`);
      }
    }

    console.log('\nStage 1 Point Positions:');
    for (const wp of project.worldPoints) {
      const pos = wp.optimizedXyz || wp.lockedXyz;
      if (pos && pos.some(x => x !== null)) {
        const coords = pos.map(x => x !== null ? x.toFixed(3) : 'null').join(', ');
        console.log(`  ${wp.name}: [${coords}]`);
      }
    }

    // Compute scale factor from a line with target length
    console.log('\n=== SCALING TO FIX METRIC ===');
    let scaleFactor = 1.0;
    for (const line of project.lines) {
      if (line.targetLength !== undefined && line.targetLength > 0) {
        const info = line.getOptimizationInfo();
        if (info.length && info.length > 0.001) {
          scaleFactor = line.targetLength / info.length;
          console.log(`Using ${line.name || 'Line'}: current=${info.length.toFixed(3)}, target=${line.targetLength}, scale=${scaleFactor.toFixed(3)}`);
          break;
        }
      }
    }

    // Apply scale to all world points (except locked WP4 at origin)
    for (const wp of project.worldPoints) {
      if (wp.optimizedXyz && !wp.isLocked()) {
        wp.optimizedXyz = wp.optimizedXyz.map(x => x * scaleFactor) as [number, number, number];
      }
    }

    // Also scale camera positions AND focal lengths to maintain reprojections
    for (const vp of project.viewpoints) {
      vp.position = vp.position.map(x => x * scaleFactor) as [number, number, number];
      vp.focalLength = vp.focalLength * scaleFactor;
    }

    console.log('Scaled world, cameras, and focal lengths by factor', scaleFactor.toFixed(3));
    console.log();

    // TRANSLATION: Align WP4 (locked point) to origin
    console.log('=== TRANSLATION TO ALIGN WP4 TO ORIGIN ===');
    const wp4 = Array.from(project.worldPoints).find(wp => wp.name === 'WP4');
    if (wp4 && wp4.optimizedXyz) {
      const offset = wp4.optimizedXyz.map(x => -x) as [number, number, number];
      console.log(`WP4 is at [${wp4.optimizedXyz.map(x => x.toFixed(3)).join(', ')}]`);
      console.log(`Translating by [${offset.map(x => x.toFixed(3)).join(', ')}]`);

      // Apply translation to all world points
      for (const wp of project.worldPoints) {
        if (wp.optimizedXyz) {
          wp.optimizedXyz = [
            wp.optimizedXyz[0] + offset[0],
            wp.optimizedXyz[1] + offset[1],
            wp.optimizedXyz[2] + offset[2]
          ];
        }
      }

      // Apply translation to all cameras to maintain reprojections
      for (const vp of project.viewpoints) {
        vp.position = [
          vp.position[0] + offset[0],
          vp.position[1] + offset[1],
          vp.position[2] + offset[2]
        ];
      }

      console.log(`After translation, WP4 is at [${wp4.optimizedXyz.map(x => x.toFixed(3)).join(', ')}]`);

      console.log('\nCamera poses after translation:');
      for (const vp of project.viewpoints) {
        console.log(`  ${vp.name}: pos=[${vp.position.map(x => x.toFixed(3)).join(', ')}], rot=[${vp.rotation.map(x => x.toFixed(3)).join(', ')}]`);
      }
    }
    console.log();

    // STAGE 2: Apply geometric constraints while maintaining reprojections
    // Include cameras and image points so they co-optimize with geometric constraints
    // Higher damping to prevent collapsing back to smaller scale
    console.log('=== STAGE 2: APPLY GEOMETRIC CONSTRAINTS + REFINE CAMERAS ===\n');

    const system2 = new ConstraintSystem({
      maxIterations: 500,
      tolerance: 1e-4,  // Relax tolerance since perfect fit may not be possible
      damping: 2.0,  // Medium damping
      verbose: true
    });

    project.worldPoints.forEach(p => system2.addPoint(p));
    project.lines.forEach(l => system2.addLine(l));
    project.viewpoints.forEach(v => system2.addCamera(v));
    project.imagePoints.forEach(ip => system2.addImagePoint(ip as any));
    project.constraints.forEach(c => system2.addConstraint(c));

    const result = system2.solve();

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
