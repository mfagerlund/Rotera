import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { ConstraintSystem } from '../constraint-system';
import { findBestViewpointPair, validateSolvingRequirements } from '../solving-requirements';
import { triangulateSharedPoints } from '../triangulation';
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

    console.log('=== STEP 1: VALIDATE REQUIREMENTS ===\n');

    const requirements = validateSolvingRequirements(project);

    console.log(`Valid: ${requirements.isValid}`);

    if (requirements.errors.length > 0) {
      console.log('\nErrors:');
      requirements.errors.forEach(err => console.log(`  - ${err}`));
    }

    if (requirements.warnings.length > 0) {
      console.log('\nWarnings:');
      requirements.warnings.forEach(warn => console.log(`  - ${warn}`));
    }

    if (!requirements.isValid || !requirements.bestPair) {
      expect(requirements.isValid).toBe(true);
      return;
    }

    console.log('\n=== STEP 2: USE BEST PAIR ===\n');

    const bestPair = requirements.bestPair;

    console.log(`Selected: ${bestPair.viewpoint1.name} + ${bestPair.viewpoint2.name}`);
    console.log(`  Shared points: ${bestPair.sharedWorldPoints.length} (${bestPair.sharedWorldPoints.map(wp => wp.name).join(', ')})`);
    console.log(`  Fully locked: ${bestPair.fullyLockedSharedPoints.length} (${bestPair.fullyLockedSharedPoints.map(wp => wp.name).join(', ')})`);
    console.log(`  Has scale constraint: ${bestPair.hasScaleConstraint}`);

    const lockedPoint = bestPair.fullyLockedSharedPoints[0];
    console.log(`  Using locked point: ${lockedPoint.name} at [${lockedPoint.lockedXyz.join(', ')}]`);

    console.log('\n=== STEP 3: DETERMINE SCALE ===\n');

    let scaleBaseline = 10.0;

    if (bestPair.scaleInfo) {
      if (bestPair.scaleInfo.type === 'distance') {
        scaleBaseline = bestPair.scaleInfo.value * 1.5;
        console.log(`Using distance between locked points: ${bestPair.scaleInfo.point1!.name}, ${bestPair.scaleInfo.point2!.name}`);
        console.log(`  Distance: ${bestPair.scaleInfo.value.toFixed(3)}`);
        console.log(`  Baseline: ${scaleBaseline.toFixed(3)}`);
      } else {
        scaleBaseline = bestPair.scaleInfo.value * 1.5;
        console.log(`Using line target length: ${bestPair.scaleInfo.line!.name || 'Line'}`);
        console.log(`  Target length: ${bestPair.scaleInfo.value}`);
        console.log(`  Baseline: ${scaleBaseline.toFixed(3)}`);
      }
    } else {
      console.log('Using default baseline: 10.0');
    }

    console.log('\n=== STEP 4: INITIALIZE CAMERAS (LOOKING AT LOCKED POINT) ===\n');

    const cameraDistance = scaleBaseline * 2;
    const offset = scaleBaseline * 0.5;

    bestPair.viewpoint1.position = [offset, 0, -cameraDistance];
    bestPair.viewpoint1.rotation = [1, 0, 0, 0];

    bestPair.viewpoint2.position = [-offset, 0, -cameraDistance];
    bestPair.viewpoint2.rotation = [1, 0, 0, 0];

    console.log(`Camera distance from origin: ${cameraDistance.toFixed(3)}`);
    console.log(`${bestPair.viewpoint1.name}: pos=[${offset.toFixed(3)}, 0, ${-cameraDistance.toFixed(3)}], rot=[1, 0, 0, 0]`);
    console.log(`${bestPair.viewpoint2.name}: pos=[${-offset.toFixed(3)}, 0, ${-cameraDistance.toFixed(3)}], rot=[1, 0, 0, 0]`);

    console.log('\n=== STEP 5: TRIANGULATE SHARED POINTS ===\n');

    const triangulationResult = triangulateSharedPoints(
      bestPair.sharedWorldPoints,
      bestPair.viewpoint1,
      bestPair.viewpoint2,
      scaleBaseline * 2
    );

    console.log(`Triangulation result: ${triangulationResult.success} succeeded, ${triangulationResult.failed} failed\n`);

    for (const wp of bestPair.sharedWorldPoints) {
      if (wp.optimizedXyz) {
        const status = wp.isFullyLocked() ? 'locked' : 'triangulated';
        console.log(`${wp.name}: ${status} at [${wp.optimizedXyz.map(x => x.toFixed(3)).join(', ')}]`);
      }
    }

    console.log('\n=== STEP 6: BUNDLE ADJUSTMENT (SEED PAIR ONLY) ===\n');

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
