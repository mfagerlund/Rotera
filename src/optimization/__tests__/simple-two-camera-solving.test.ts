import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { ConstraintSystem } from '../constraint-system';
import { initializeFromImagePairs } from '../seed-initialization';
import * as fs from 'fs';
import type { IViewpoint, IWorldPoint, IImagePoint } from '../../entities/interfaces';

describe('Simple Two-Camera Solving (Proof of Concept)', () => {
  it('should manually solve seed pair with shared points', () => {
    const fixturePath = 'C:\\Slask\\Untitled Project-optimization-2025-10-22.json';

    if (!fs.existsSync(fixturePath)) {
      console.log('Fixture file not found, skipping test');
      return;
    }

    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    console.log('\n=== PHASE 1: MANUAL TWO-CAMERA SOLVING PROOF OF CONCEPT ===\n');

    console.log('Project loaded:');
    console.log(`  World Points: ${project.worldPoints.size}`);
    console.log(`  Viewpoints: ${project.viewpoints.size}`);
    console.log(`  Image Points: ${Array.from(project.viewpoints).reduce((sum, vp) => sum + vp.imagePoints.size, 0)}`);
    console.log(`  Lines: ${project.lines.size}\n`);

    console.log('=== STEP 1: INITIALIZE FROM IMAGE PAIRS ===\n');

    const initResult = initializeFromImagePairs(project);

    console.log(`Success: ${initResult.success}`);

    if (initResult.errors.length > 0) {
      console.log('\nErrors:');
      initResult.errors.forEach(err => console.log(`  - ${err}`));
    }

    if (initResult.warnings.length > 0) {
      console.log('\nWarnings:');
      initResult.warnings.forEach(warn => console.log(`  - ${warn}`));
    }

    if (!initResult.success || !initResult.seedPair) {
      expect(initResult.success).toBe(true);
      return;
    }

    const bestPair = initResult.seedPair;

    console.log(`\nSeed pair: ${bestPair.viewpoint1.name} + ${bestPair.viewpoint2.name}`);
    console.log(`  Shared points: ${bestPair.sharedWorldPoints.length}`);
    console.log(`  Fully locked: ${bestPair.fullyLockedSharedPoints.length}`);
    console.log(`  Scale baseline: ${initResult.scaleBaseline?.toFixed(3)}`);
    console.log(`  Triangulated: ${initResult.triangulatedPoints} points`);
    console.log(`  Failed: ${initResult.failedPoints} points`);

    console.log('\n=== STEP 2: CAMERA POSITIONS ===\n');

    console.log(`${bestPair.viewpoint1.name}: pos=[${bestPair.viewpoint1.position.map(x => x.toFixed(3)).join(', ')}]`);
    console.log(`${bestPair.viewpoint2.name}: pos=[${bestPair.viewpoint2.position.map(x => x.toFixed(3)).join(', ')}]`);

    console.log('\n=== STEP 3: WORLD POINT POSITIONS ===\n');

    for (const wp of bestPair.sharedWorldPoints) {
      if (wp.optimizedXyz) {
        const status = wp.isFullyLocked() ? 'locked' : 'triangulated';
        console.log(`${wp.name}: ${status} at [${wp.optimizedXyz.map(x => x.toFixed(3)).join(', ')}]`);
      }
    }

    console.log('\n=== STEP 4: BUNDLE ADJUSTMENT (SEED PAIR ONLY) ===\n');

    const system = new ConstraintSystem({
      maxIterations: 200,
      tolerance: 1e-6,
      damping: 10.0,
      verbose: true
    });

    bestPair.sharedWorldPoints.forEach(p => system.addPoint(p));
    system.addCamera(bestPair.viewpoint1);
    system.addCamera(bestPair.viewpoint2);

    const ipsForVp1 = Array.from(bestPair.viewpoint1.imagePoints).filter(ip =>
      bestPair.sharedWorldPoints.includes(ip.worldPoint)
    );
    const ipsForVp2 = Array.from(bestPair.viewpoint2.imagePoints).filter(ip =>
      bestPair.sharedWorldPoints.includes(ip.worldPoint)
    );

    ipsForVp1.forEach(ip => system.addImagePoint(ip as any));
    ipsForVp2.forEach(ip => system.addImagePoint(ip as any));

    console.log(`Optimizing:`);
    console.log(`  Points: ${bestPair.sharedWorldPoints.length}`);
    console.log(`  Cameras: 2`);
    console.log(`  Image points: ${ipsForVp1.length + ipsForVp2.length}\n`);

    const result = system.solve();

    console.log('\n=== OPTIMIZATION RESULT ===\n');
    console.log(`Converged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Final Residual: ${result.residual.toFixed(6)}\n`);

    console.log('Camera poses after BA:');
    console.log(`  ${bestPair.viewpoint1.name}: pos=[${bestPair.viewpoint1.position.map(x => x.toFixed(3)).join(', ')}]`);
    console.log(`  ${bestPair.viewpoint2.name}: pos=[${bestPair.viewpoint2.position.map(x => x.toFixed(3)).join(', ')}]\n`);

    console.log('Point positions after BA:');
    for (const wp of bestPair.sharedWorldPoints) {
      if (wp.optimizedXyz) {
        console.log(`  ${wp.name}: [${wp.optimizedXyz.map(x => x.toFixed(3)).join(', ')}]`);
      }
    }

    console.log('\nReprojection errors:');
    let totalError = 0;
    let count = 0;
    for (const ip of [...ipsForVp1, ...ipsForVp2]) {
      if (ip.lastResiduals && ip.lastResiduals.length === 2) {
        const error = Math.sqrt(ip.lastResiduals[0]**2 + ip.lastResiduals[1]**2);
        totalError += error;
        count++;
      }
    }
    if (count > 0) {
      console.log(`  Average: ${(totalError / count).toFixed(2)} pixels`);
      console.log(`  Total observations: ${count}`);
    }

    expect(result.converged).toBe(true);
    if (count > 0) {
      expect(totalError / count).toBeLessThan(50);
    }
  });
});
