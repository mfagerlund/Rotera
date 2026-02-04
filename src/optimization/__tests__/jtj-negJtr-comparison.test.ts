/**
 * Compare JtJ and negJtr matrices between sparse (autodiff) and analytical modes
 * at iteration 1 for the "3 Loose Cropped" fixture.
 *
 * This test investigates why analytical mode converges to worse local minima
 * than sparse mode, specifically with focal length optimization enabled.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Value, V } from 'scalar-autograd';
import { loadProjectFromJson } from '../../store/project-serialization';
import { ConstraintSystem } from '../constraint-system/ConstraintSystem';
import type { SolverOptions } from '../constraint-system/types';
import type { ValueMap } from '../IOptimizable';
import { accumulateNormalEquations } from '../analytical/accumulate-normal-equations';
import { computeJacobian } from '../autodiff-dense-lm';
import { Viewpoint } from '../../entities/viewpoint';

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'Calibration');

// Helper to write to stderr (bypasses Jest capture)
const log = (msg: string) => process.stderr.write(msg + '\n');

describe('JtJ/negJtr Comparison at Iteration 1', () => {
  it('compares normal equations between sparse and analytical for 3 Loose Cropped', () => {
    const jsonPath = path.join(FIXTURES_DIR, '3 Loose Cropped.json');
    const jsonData = fs.readFileSync(jsonPath, 'utf8');
    const project = loadProjectFromJson(jsonData);

    // Build constraint system with focal length optimization enabled
    const options: SolverOptions = {
      tolerance: 1e-6,
      maxIterations: 0, // Just setup, no solving
      verbose: false,
      // Enable focal length optimization (isPossiblyCropped=true behavior)
      optimizeCameraIntrinsics: (camera) => camera.isPossiblyCropped,
    };

    const system = new ConstraintSystem(options);

    for (const vp of project.viewpoints) {
      system.addCamera(vp as Viewpoint);
    }
    for (const wp of project.worldPoints) {
      system.addPoint(wp);
    }
    for (const ip of project.imagePoints) {
      system.addImagePoint(ip);
    }
    for (const line of project.lines) {
      system.addLine(line);
    }
    for (const constraint of project.constraints) {
      system.addConstraint(constraint);
    }

    // Build analytical providers
    const { providers, layout } = system.buildAnalyticalProviders();
    const numVariables = layout.numVariables;

    log('=== VARIABLE LAYOUT ===');
    log(`Total variables: ${numVariables}`);
    log(`Total providers: ${providers.length}`);

    // Log variable layout details
    log('\nWorld points:');
    for (const wp of project.worldPoints) {
      const indices = layout.getWorldPointIndices(wp);
      log(`  ${wp.name}: indices=[${indices.join(', ')}]`);
    }

    log('\nCameras:');
    for (const vp of project.viewpoints) {
      const posIndices = layout.getCameraPosIndices(vp.name);
      const quatIndices = layout.getCameraQuatIndices(vp.name);
      const intrinsicsIndices = layout.getCameraIntrinsicsIndices(vp.name);
      log(`  ${vp.name}:`);
      log(`    pos=[${posIndices.join(', ')}]`);
      log(`    quat=[${quatIndices.join(', ')}]`);
      log(`    intrinsics: focalLength=${intrinsicsIndices?.focalLength ?? 'N/A'}`);
    }

    // Get initial values
    const analyticalVars = layout.initialValues;
    log(`\nInitial values (first 20): ${Array.from(analyticalVars).slice(0, 20).map(v => v.toFixed(3)).join(', ')}`);

    // === ANALYTICAL NORMAL EQUATIONS ===
    const analyticalNE = accumulateNormalEquations(analyticalVars, providers, numVariables);
    log('\n=== ANALYTICAL ===');
    log(`Cost: ${analyticalNE.cost.toFixed(6)}`);

    // === AUTODIFF NORMAL EQUATIONS ===
    // Build autodiff variables and residual function
    const valueMap: ValueMap = {
      points: new Map(),
      cameras: new Map(),
      useIsZReflected: false,
    };
    const autoVars: Value[] = [];

    // Add points to value map (same order as layout)
    for (const point of project.worldPoints) {
      const pointVariables = point.addToValueMap(valueMap);
      autoVars.push(...pointVariables);
    }

    // Add cameras to value map
    for (const camera of project.viewpoints as Set<Viewpoint>) {
      const optimizeIntrinsics = camera.isPossiblyCropped;
      const cameraVariables = camera.addToValueMap(valueMap, {
        optimizePose: !camera.isPoseLocked,
        optimizeIntrinsics,
        optimizeDistortion: false,
      });
      autoVars.push(...cameraVariables);
    }

    log(`\nAutodiff variables: ${autoVars.length}`);

    // Build residual function with detailed logging
    let lineResidualCount = 0;
    let cameraResidualCount = 0;
    let reprojectionResidualCount = 0;
    let constraintResidualCount = 0;
    let vpResidualCount = 0;

    const residualFn = (vars: Value[]): Value[] => {
      const residuals: Value[] = [];

      // Line constraints
      for (const line of project.lines) {
        const lineResiduals = line.computeResiduals(valueMap);
        lineResidualCount += lineResiduals.length;
        residuals.push(...lineResiduals);
      }

      // Camera quaternion normalization + vanishing points
      for (const camera of project.viewpoints) {
        if ('computeResiduals' in camera && typeof camera.computeResiduals === 'function') {
          const cameraResiduals = (camera as Viewpoint).computeResiduals(valueMap);
          cameraResidualCount += cameraResiduals.length;
          residuals.push(...cameraResiduals);
        }

        // Count vanishing point residuals
        if (camera.vanishingLines && camera.vanishingLines.size > 0) {
          const cameraValues = valueMap.cameras.get(camera);
          if (cameraValues) {
            // Check each axis
            for (const axis of ['x', 'y', 'z'] as const) {
              const linesForAxis = Array.from(camera.vanishingLines).filter(
                (l: any) => l.axis === axis
              );
              if (linesForAxis.length >= 2) {
                vpResidualCount++;
              }
            }
          }
        }
      }

      // Reprojection residuals
      for (const imagePoint of project.imagePoints) {
        const reprojectionResiduals = imagePoint.computeResiduals(valueMap);
        reprojectionResidualCount += reprojectionResiduals.length;
        residuals.push(...reprojectionResiduals);
      }

      // Explicit constraints
      for (const constraint of project.constraints) {
        const constraintResiduals = constraint.computeResiduals(valueMap);
        constraintResidualCount += constraintResiduals.length;
        residuals.push(...constraintResiduals);
      }

      return residuals;
    };

    // Run once to count
    residualFn(autoVars);
    log(`\nResidual breakdown:`);
    log(`  Line residuals: ${lineResidualCount}`);
    log(`  Camera residuals: ${cameraResidualCount}`);
    log(`  Reprojection residuals: ${reprojectionResidualCount}`);
    log(`  Constraint residuals: ${constraintResidualCount}`);
    log(`  VP residuals (in cameras): ${vpResidualCount}`);

    // Compute Jacobian using autodiff
    const { jacobian, residuals: autodiffResiduals } = computeJacobian(autoVars, residualFn);
    const numResiduals = autodiffResiduals.length;

    log(`Autodiff residuals: ${numResiduals}`);
    log(`Analytical residuals: ${analyticalNE.residuals.length}`);

    // Compute autodiff J^T J
    const autodiffJtJ: number[][] = Array.from({ length: numVariables }, () =>
      new Array(numVariables).fill(0)
    );
    for (let i = 0; i < numVariables; i++) {
      for (let j = 0; j < numVariables; j++) {
        let sum = 0;
        for (let k = 0; k < numResiduals; k++) {
          sum += jacobian[k][i] * jacobian[k][j];
        }
        autodiffJtJ[i][j] = sum;
      }
    }

    // Compute autodiff -J^T r
    const autodiffNegJtr: number[] = new Array(numVariables).fill(0);
    for (let j = 0; j < numVariables; j++) {
      let sum = 0;
      for (let k = 0; k < numResiduals; k++) {
        sum += jacobian[k][j] * autodiffResiduals[k];
      }
      autodiffNegJtr[j] = -sum;
    }

    // Compute autodiff cost
    const autodiffCost = autodiffResiduals.reduce((sum, r) => sum + r * r, 0);

    log('\n=== AUTODIFF ===');
    log(`Cost: ${autodiffCost.toFixed(6)}`);

    // === COMPARISON ===
    log('\n=== COMPARISON ===');
    log(`Cost diff: ${Math.abs(analyticalNE.cost - autodiffCost).toExponential(3)}`);

    // Compare residual counts
    if (analyticalNE.residuals.length !== numResiduals) {
      log(`\n⚠️ RESIDUAL COUNT MISMATCH: analytical=${analyticalNE.residuals.length}, autodiff=${numResiduals}`);
    }

    // Find focal length variable indices
    const focalIndices: { camera: string; varIdx: number }[] = [];
    for (const vp of project.viewpoints) {
      const intrinsicsIndices = layout.getCameraIntrinsicsIndices(vp.name);
      if (intrinsicsIndices && intrinsicsIndices.focalLength >= 0) {
        focalIndices.push({ camera: vp.name, varIdx: intrinsicsIndices.focalLength });
      }
    }

    log('\nFocal length variable indices:');
    for (const { camera, varIdx } of focalIndices) {
      log(`  ${camera}: var[${varIdx}] = ${analyticalVars[varIdx].toFixed(2)}`);
    }

    // Compare negJtr for focal length variables
    log('\n=== negJtr COMPARISON (focal length variables) ===');
    for (const { camera, varIdx } of focalIndices) {
      const analytical = analyticalNE.negJtr[varIdx];
      const autodiff = autodiffNegJtr[varIdx];
      const diff = analytical - autodiff;
      const relDiff = Math.abs(diff) / Math.max(Math.abs(analytical), Math.abs(autodiff), 1);
      log(`  ${camera} [${varIdx}]:`);
      log(`    analytical: ${analytical.toExponential(4)}`);
      log(`    autodiff:   ${autodiff.toExponential(4)}`);
      log(`    diff:       ${diff.toExponential(4)} (${(relDiff * 100).toFixed(2)}%)`);
    }

    // Compare JtJ diagonal for focal length variables
    log('\n=== JtJ DIAGONAL COMPARISON (focal length variables) ===');
    for (const { camera, varIdx } of focalIndices) {
      const analytical = analyticalNE.JtJ.get(varIdx, varIdx);
      const autodiff = autodiffJtJ[varIdx][varIdx];
      const diff = analytical - autodiff;
      const relDiff = Math.abs(diff) / Math.max(Math.abs(analytical), Math.abs(autodiff), 1);
      log(`  ${camera} [${varIdx}]:`);
      log(`    analytical: ${analytical.toExponential(4)}`);
      log(`    autodiff:   ${autodiff.toExponential(4)}`);
      log(`    diff:       ${diff.toExponential(4)} (${(relDiff * 100).toFixed(2)}%)`);
    }

    // Compare off-diagonal JtJ entries involving focal length
    log('\n=== JtJ OFF-DIAGONAL COMPARISON (focal length vs other vars) ===');
    const significantDiffs: {
      i: number;
      j: number;
      analytical: number;
      autodiff: number;
      relDiff: number;
    }[] = [];

    for (const { camera, varIdx: focalIdx } of focalIndices) {
      for (let j = 0; j < numVariables; j++) {
        const analytical = analyticalNE.JtJ.get(focalIdx, j);
        const autodiff = autodiffJtJ[focalIdx][j];
        const diff = Math.abs(analytical - autodiff);
        const scale = Math.max(Math.abs(analytical), Math.abs(autodiff), 1);
        const relDiff = diff / scale;
        if (relDiff > 0.01) {
          significantDiffs.push({ i: focalIdx, j, analytical, autodiff, relDiff });
        }
      }
    }

    if (significantDiffs.length > 0) {
      log(`Found ${significantDiffs.length} entries with >1% difference:`);
      for (const { i, j, analytical, autodiff, relDiff } of significantDiffs.slice(0, 20)) {
        log(`  JtJ[${i},${j}]: analytical=${analytical.toExponential(4)}, autodiff=${autodiff.toExponential(4)}, relDiff=${(relDiff * 100).toFixed(2)}%`);
      }
    } else {
      log('No significant differences found in JtJ entries involving focal length!');
    }

    // Compare ALL JtJ and negJtr entries
    log('\n=== FULL JtJ COMPARISON ===');
    let maxJtJDiff = 0;
    let maxJtJDiffLocation = { i: -1, j: -1 };
    let totalJtJEntries = 0;
    let significantJtJEntries = 0;

    for (let i = 0; i < numVariables; i++) {
      for (let j = 0; j < numVariables; j++) {
        const analytical = analyticalNE.JtJ.get(i, j);
        const autodiff = autodiffJtJ[i][j];
        const diff = Math.abs(analytical - autodiff);
        const scale = Math.max(Math.abs(analytical), Math.abs(autodiff), 1);
        const relDiff = diff / scale;
        totalJtJEntries++;
        if (relDiff > 0.01) {
          significantJtJEntries++;
        }
        if (diff > maxJtJDiff) {
          maxJtJDiff = diff;
          maxJtJDiffLocation = { i, j };
        }
      }
    }

    log(`Max JtJ diff: ${maxJtJDiff.toExponential(4)} at [${maxJtJDiffLocation.i}, ${maxJtJDiffLocation.j}]`);
    log(`JtJ entries with >1% relative diff: ${significantJtJEntries}/${totalJtJEntries}`);

    // List all significant JtJ differences
    if (significantJtJEntries > 0) {
      log('\nSignificant JtJ differences:');
      for (let i = 0; i < numVariables; i++) {
        for (let j = 0; j < numVariables; j++) {
          const analytical = analyticalNE.JtJ.get(i, j);
          const autodiff = autodiffJtJ[i][j];
          const diff = Math.abs(analytical - autodiff);
          const scale = Math.max(Math.abs(analytical), Math.abs(autodiff), 1);
          const relDiff = diff / scale;
          if (relDiff > 0.01) {
            log(`  JtJ[${i},${j}]: analytical=${analytical.toExponential(4)}, autodiff=${autodiff.toExponential(4)}, diff=${diff.toExponential(4)}, relDiff=${(relDiff * 100).toFixed(2)}%`);
          }
        }
      }
    }

    // Compare negJtr
    log('\n=== FULL negJtr COMPARISON ===');
    let maxNegJtrDiff = 0;
    let maxNegJtrDiffLocation = -1;
    let significantNegJtrEntries = 0;

    for (let i = 0; i < numVariables; i++) {
      const analytical = analyticalNE.negJtr[i];
      const autodiff = autodiffNegJtr[i];
      const diff = Math.abs(analytical - autodiff);
      const scale = Math.max(Math.abs(analytical), Math.abs(autodiff), 1);
      const relDiff = diff / scale;
      if (relDiff > 0.01) {
        significantNegJtrEntries++;
      }
      if (diff > maxNegJtrDiff) {
        maxNegJtrDiff = diff;
        maxNegJtrDiffLocation = i;
      }
    }

    log(`Max negJtr diff: ${maxNegJtrDiff.toExponential(4)} at [${maxNegJtrDiffLocation}]`);
    log(`negJtr entries with >1% relative diff: ${significantNegJtrEntries}/${numVariables}`);

    // List significant negJtr differences
    if (significantNegJtrEntries > 0) {
      log('\nSignificant negJtr differences:');
      for (let i = 0; i < numVariables; i++) {
        const analytical = analyticalNE.negJtr[i];
        const autodiff = autodiffNegJtr[i];
        const diff = Math.abs(analytical - autodiff);
        const scale = Math.max(Math.abs(analytical), Math.abs(autodiff), 1);
        const relDiff = diff / scale;
        if (relDiff > 0.01) {
          log(`  [${i}]: analytical=${analytical.toExponential(4)}, autodiff=${autodiff.toExponential(4)}, relDiff=${(relDiff * 100).toFixed(2)}%`);
        }
      }
    }

    // Report final verdict
    const hasSignificantJtJDiff = significantJtJEntries > 0;
    const hasSignificantNegJtrDiff = significantNegJtrEntries > 0;

    if (!hasSignificantJtJDiff && !hasSignificantNegJtrDiff) {
      log('\n✓ JtJ and negJtr match between analytical and autodiff (no >1% relative differences)');
    } else {
      log('\n⚠️ Significant relative differences found between analytical and autodiff!');
    }

    // Note: Analytical mode may legitimately differ from autodiff in some ways:
    // - Analytical uses scalar triple product for coplanar (same as autodiff)
    // - But analytical uses rotating base triangles for N>4 points (better)
    // - There may be small structural differences in Jacobian construction
    //
    // The key check is that costs match (residuals are the same).
    // JtJ differences don't prevent convergence if negJtr directions match.
    expect(significantNegJtrEntries).toBe(0); // Gradient direction should match
  });
});
