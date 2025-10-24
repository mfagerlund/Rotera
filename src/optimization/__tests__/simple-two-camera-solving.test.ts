import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { ConstraintSystem } from '../constraint-system';
import { findBestViewpointPair, validateSolvingRequirements } from '../solving-requirements';
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

    console.log('\n=== STEP 5: TRIANGULATE SHARED POINTS (RAY-RAY CLOSEST POINT) ===\n');

    for (const wp of bestPair.sharedWorldPoints) {
      if (wp.isFullyLocked()) {
        wp.optimizedXyz = [wp.lockedXyz[0]!, wp.lockedXyz[1]!, wp.lockedXyz[2]!];
        console.log(`${wp.name}: using locked position [${wp.optimizedXyz.join(', ')}]`);
        continue;
      }

      const ip1 = Array.from(bestPair.viewpoint1.imagePoints).find(ip => ip.worldPoint === wp);
      const ip2 = Array.from(bestPair.viewpoint2.imagePoints).find(ip => ip.worldPoint === wp);

      if (!ip1 || !ip2) {
        console.log(`${wp.name}: ERROR - missing image point`);
        continue;
      }

      const ray1_x = (ip1.u - bestPair.viewpoint1.principalPointX) / bestPair.viewpoint1.focalLength;
      const ray1_y = (ip1.v - bestPair.viewpoint1.principalPointY) / bestPair.viewpoint1.focalLength;
      const ray1_z = 1.0;
      const ray1_norm = Math.sqrt(ray1_x * ray1_x + ray1_y * ray1_y + ray1_z * ray1_z);
      const d1_x = ray1_x / ray1_norm;
      const d1_y = ray1_y / ray1_norm;
      const d1_z = ray1_z / ray1_norm;

      const ray2_x = (ip2.u - bestPair.viewpoint2.principalPointX) / bestPair.viewpoint2.focalLength;
      const ray2_y = (ip2.v - bestPair.viewpoint2.principalPointY) / bestPair.viewpoint2.focalLength;
      const ray2_z = 1.0;
      const ray2_norm = Math.sqrt(ray2_x * ray2_x + ray2_y * ray2_y + ray2_z * ray2_z);
      const d2_x = ray2_x / ray2_norm;
      const d2_y = ray2_y / ray2_norm;
      const d2_z = ray2_z / ray2_norm;

      const o1_x = bestPair.viewpoint1.position[0];
      const o1_y = bestPair.viewpoint1.position[1];
      const o1_z = bestPair.viewpoint1.position[2];

      const o2_x = bestPair.viewpoint2.position[0];
      const o2_y = bestPair.viewpoint2.position[1];
      const o2_z = bestPair.viewpoint2.position[2];

      const w_x = o1_x - o2_x;
      const w_y = o1_y - o2_y;
      const w_z = o1_z - o2_z;

      const a = d1_x * d1_x + d1_y * d1_y + d1_z * d1_z;
      const b = d1_x * d2_x + d1_y * d2_y + d1_z * d2_z;
      const c = d2_x * d2_x + d2_y * d2_y + d2_z * d2_z;
      const d = d1_x * w_x + d1_y * w_y + d1_z * w_z;
      const e = d2_x * w_x + d2_y * w_y + d2_z * w_z;

      const denom = a * c - b * b;
      let t1, t2;
      if (Math.abs(denom) < 1e-10) {
        t1 = scaleBaseline * 2;
        t2 = scaleBaseline * 2;
      } else {
        t1 = (b * e - c * d) / denom;
        t2 = (a * e - b * d) / denom;
        if (t1 < 0) t1 = scaleBaseline * 2;
        if (t2 < 0) t2 = scaleBaseline * 2;
      }

      const p1_x = o1_x + d1_x * t1;
      const p1_y = o1_y + d1_y * t1;
      const p1_z = o1_z + d1_z * t1;

      const p2_x = o2_x + d2_x * t2;
      const p2_y = o2_y + d2_y * t2;
      const p2_z = o2_z + d2_z * t2;

      const mid_x = (p1_x + p2_x) / 2;
      const mid_y = (p1_y + p2_y) / 2;
      const mid_z = (p1_z + p2_z) / 2;

      wp.optimizedXyz = [mid_x, mid_y, mid_z];
      console.log(`${wp.name}: triangulated to [${mid_x.toFixed(3)}, ${mid_y.toFixed(3)}, ${mid_z.toFixed(3)}]`);
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
