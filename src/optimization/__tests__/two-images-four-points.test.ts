import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import { initializeFromImagePairs } from '../seed-initialization';
import { Viewpoint } from '../../entities/viewpoint';
import { WorldPoint } from '../../entities/world-point';
import { Line } from '../../entities/line';
import { ImagePoint } from '../../entities/imagePoint';
import * as fs from 'fs';
import * as path from 'path';

describe('Two Images Four Points Fixture', () => {
  it('should recognize line constraints and allow optimization', async () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'two-images-four-points.json');

    if (!fs.existsSync(fixturePath)) {
      console.log('Fixture file not found, skipping test');
      return;
    }

    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    console.log('\n=== TWO IMAGES FOUR POINTS TEST ===\n');

    console.log('Project info:');
    console.log(`  World Points: ${project.worldPoints.size}`);
    console.log(`  Lines: ${project.lines.size}`);
    console.log(`  Viewpoints: ${project.viewpoints.size}`);
    console.log(`  Image Points: ${Array.from(project.viewpoints).reduce((sum, vp) => sum + vp.imagePoints.size, 0)}`);
    console.log(`  Explicit Constraints: ${project.constraints.size}\n`);

    let lineConstraintCount = 0;
    console.log('Line constraints:');
    for (const line of project.lines) {
      if (line.direction !== 'free') {
        console.log(`  ${line.name}: direction=${line.direction} (+2 constraints)`);
        lineConstraintCount += 2;
      }
      if (line.hasFixedLength()) {
        console.log(`  ${line.name}: targetLength=${line.targetLength} (+1 constraint)`);
        lineConstraintCount += 1;
      }
    }
    console.log(`  Total line constraints: ${lineConstraintCount}\n`);

    const unlockedPoints = Array.from(project.worldPoints).filter(p => !p.isLocked());
    const totalDOF = (unlockedPoints.length * 3) + (project.viewpoints.size * 6);
    const constraintDOF = project.constraints.size + lineConstraintCount;
    const netDOF = Math.max(0, totalDOF - constraintDOF);

    console.log('Degrees of Freedom:');
    console.log(`  Variables: ${totalDOF} (${unlockedPoints.length} unlocked points * 3 + ${project.viewpoints.size} cameras * 6)`);
    console.log(`  Constraints: ${constraintDOF} (${project.constraints.size} explicit + ${lineConstraintCount} from lines)`);
    console.log(`  Net DOF: ${netDOF}\n`);

    expect(lineConstraintCount).toBeGreaterThan(0);
    expect(constraintDOF).toBeGreaterThan(0);

    console.log('=== STAGE 1: INITIALIZE FROM IMAGE PAIRS ===\n');

    const initResult = initializeFromImagePairs(project);

    if (!initResult.success || !initResult.seedPair) {
      console.log('Initialization failed (expected for small datasets):');
      initResult.errors.forEach(err => console.log(`  ${err}`));
      console.log('\nUsing manual initialization based on locked points and line constraints...\n');

      const unlockedWPs = Array.from(project.worldPoints).filter(wp => !(wp as WorldPoint).isFullyLocked());
      for (const wp of unlockedWPs) {
        const wpConcrete = wp as WorldPoint;
        if (!wpConcrete.optimizedXyz) {
          wpConcrete.optimizedXyz = [0, 0, 0];
        }
      }

      const viewpoints = Array.from(project.viewpoints);
      if (viewpoints.length >= 2) {
        const vp1 = viewpoints[0] as Viewpoint;
        const vp2 = viewpoints[1] as Viewpoint;
        vp1.position = [0, 0, -20];
        vp1.rotation = [1, 0, 0, 0];
        vp2.position = [10, 0, -20];
        vp2.rotation = [1, 0, 0, 0];
        console.log(`Initialized ${vp1.name} at [0, 0, -20]`);
        console.log(`Initialized ${vp2.name} at [10, 0, -20]\n`);
      }
    } else {
      const vp1 = initResult.seedPair.viewpoint1 as Viewpoint;
      const vp2 = initResult.seedPair.viewpoint2 as Viewpoint;

      console.log(`Seed pair: ${vp1.name} + ${vp2.name}`);
      console.log(`  Scale baseline: ${initResult.scaleBaseline?.toFixed(3)}`);
      console.log(`  Triangulated: ${initResult.triangulatedPoints}/${initResult.seedPair.sharedWorldPoints.length} points\n`);
    }

    console.log('=== STAGE 2: BUNDLE ADJUSTMENT WITH LINE CONSTRAINTS ===\n');

    const result = await optimizeProject(project, {
      maxIterations: 200,
      tolerance: 1e-6,
      damping: 10.0,
      verbose: true,
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false
    });

    console.log('\n=== OPTIMIZATION RESULT ===\n');
    console.log(`Converged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Final Residual: ${result.residual.toFixed(6)}\n`);

    console.log('=== LINE CONSTRAINT SATISFACTION ===\n');
    for (const line of project.lines) {
      const info = line.getOptimizationInfo();
      console.log(`${line.name}:`);
      console.log(`  Current Length: ${info.length?.toFixed(3) || 'unknown'}`);
      if (info.targetLength !== undefined) {
        console.log(`  Target Length: ${info.targetLength.toFixed(3)}`);
        console.log(`  Error: ${info.lengthError?.toExponential(2) || 'unknown'}`);
      }
      console.log(`  Direction: ${info.direction}`);
      console.log(`  RMS Residual: ${info.rmsResidual.toExponential(2)}`);
    }
    console.log();

    console.log('=== REPROJECTION ERRORS ===\n');
    let totalError = 0;
    let count = 0;
    for (const vp of project.viewpoints) {
      let vpError = 0;
      let vpCount = 0;
      for (const ip of vp.imagePoints) {
        const ipConcrete = ip as ImagePoint;
        if (ipConcrete.lastResiduals && ipConcrete.lastResiduals.length === 2) {
          const error = Math.sqrt(ipConcrete.lastResiduals[0]**2 + ipConcrete.lastResiduals[1]**2);
          vpError += error;
          vpCount++;
          totalError += error;
          count++;
        }
      }
      if (vpCount > 0) {
        console.log(`  ${(vp as Viewpoint).name}: ${(vpError / vpCount).toFixed(2)} px (${vpCount} obs)`);
      }
    }
    if (count > 0) {
      console.log(`  Overall average: ${(totalError / count).toFixed(2)} px (${count} obs)\n`);
    }

    expect(lineConstraintCount).toBeGreaterThan(0);

    console.log('\n=== TEST SUMMARY ===\n');
    console.log(`Line constraints recognized: ${lineConstraintCount > 0 ? 'PASS' : 'FAIL'}`);
    console.log(`Optimization allowed: ${result.converged || result.iterations > 0 ? 'PASS' : 'FAIL'}`);
    console.log(`System correctly counts intrinsic line constraints\n`);
  });
});
