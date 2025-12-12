import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import { initializeFromImagePairs } from '../seed-initialization';
import { Viewpoint } from '../../entities/viewpoint';
import { WorldPoint } from '../../entities/world-point';
import { ImagePoint } from '../../entities/imagePoint';
import { Project } from '../../entities/project';
import * as fs from 'fs';

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
    const vp1 = bestPair.viewpoint1 as Viewpoint;
    const vp2 = bestPair.viewpoint2 as Viewpoint;

    console.log(`\nSeed pair: ${vp1.name} + ${vp2.name}`);
    console.log(`  Shared points: ${bestPair.sharedWorldPoints.length}`);
    console.log(`  Fully locked: ${bestPair.fullyLockedSharedPoints.length}`);
    console.log(`  Scale baseline: ${initResult.scaleBaseline?.toFixed(3)}`);
    console.log(`  Triangulated: ${initResult.triangulatedPoints} points`);
    console.log(`  Failed: ${initResult.failedPoints} points`);

    console.log('\n=== STEP 2: CAMERA POSITIONS ===\n');

    console.log(`${vp1.name}: pos=[${vp1.position.map(x => x.toFixed(3)).join(', ')}]`);
    console.log(`${vp2.name}: pos=[${vp2.position.map(x => x.toFixed(3)).join(', ')}]`);

    console.log('\n=== STEP 3: WORLD POINT POSITIONS ===\n');

    for (const wp of bestPair.sharedWorldPoints) {
      const wpConcrete = wp as WorldPoint;
      if (wpConcrete.optimizedXyz) {
        const status = wpConcrete.isFullyLocked() ? 'locked' : 'triangulated';
        console.log(`${wpConcrete.name}: ${status} at [${wpConcrete.optimizedXyz.map(x => x.toFixed(3)).join(', ')}]`);
      }
    }

    console.log('\n=== STEP 4: BUNDLE ADJUSTMENT (SEED PAIR ONLY) ===\n');

    const ipsForVp1 = Array.from(vp1.imagePoints).filter(ip =>
      bestPair.sharedWorldPoints.includes(ip.worldPoint)
    ).map(ip => ip as ImagePoint);
    const ipsForVp2 = Array.from(vp2.imagePoints).filter(ip =>
      bestPair.sharedWorldPoints.includes(ip.worldPoint)
    ).map(ip => ip as ImagePoint);

    console.log(`Optimizing:`);
    console.log(`  Points: ${bestPair.sharedWorldPoints.length}`);
    console.log(`  Cameras: 2`);
    console.log(`  Image points: ${ipsForVp1.length + ipsForVp2.length}\n`);

    const seedProject = Project.create('Seed Pair Optimization');
    bestPair.sharedWorldPoints.forEach(p => seedProject.addWorldPoint(p as WorldPoint));
    seedProject.addViewpoint(vp1);
    seedProject.addViewpoint(vp2);
    ipsForVp1.forEach(ip => seedProject.addImagePoint(ip));
    ipsForVp2.forEach(ip => seedProject.addImagePoint(ip));

    const result = optimizeProject(seedProject, {
      maxIterations: 500,
      tolerance: 1e-4,
      damping: 10.0,
      verbose: false,
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false
    });

    console.log('\n=== OPTIMIZATION RESULT ===\n');
    console.log(`Converged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Final Residual: ${result.residual.toFixed(6)}\n`);

    console.log('Camera poses after BA:');
    console.log(`  ${vp1.name}: pos=[${vp1.position.map(x => x.toFixed(3)).join(', ')}]`);
    console.log(`  ${vp2.name}: pos=[${vp2.position.map(x => x.toFixed(3)).join(', ')}]\n`);

    console.log('Point positions after BA:');
    for (const wp of bestPair.sharedWorldPoints) {
      const wpConcrete = wp as WorldPoint;
      if (wpConcrete.optimizedXyz) {
        console.log(`  ${wpConcrete.name}: [${wpConcrete.optimizedXyz.map(x => x.toFixed(3)).join(', ')}]`);
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
