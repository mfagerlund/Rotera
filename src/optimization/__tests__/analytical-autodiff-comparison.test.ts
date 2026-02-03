/**
 * Compare analytical vs autodiff residual computation
 * to identify why analytical mode produces different results.
 */
import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { ConstraintSystem } from '../constraint-system/ConstraintSystem';
import type { SolverOptions } from '../constraint-system/types';
import { setSolverMode, getSolverMode, SolverMode } from '../solver-config';
import { Viewpoint } from '../../entities/viewpoint';

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'Calibration');

describe('Analytical vs Autodiff Comparison', () => {
  it('should compare constraint system residuals', () => {
    const jsonPath = path.join(FIXTURES_DIR, 'Tower 1 - 1 Img NEW.json');
    const jsonData = fs.readFileSync(jsonPath, 'utf8');

    // IMPORTANT: Load project FRESH for each system to ensure same initial state
    // (solve() modifies entity positions in place)

    const options: SolverOptions = {
      tolerance: 1e-6,
      maxIterations: 0,  // 0 iterations to see INITIAL residuals only
      verbose: true,
      optimizeCameraIntrinsics: false,
    };

    // Build and solve with sparse mode (fresh project)
    console.log('\n=== SPARSE MODE ===');
    const sparseProject = loadProjectFromJson(jsonData);
    setSolverMode('sparse');
    const sparseSystem = new ConstraintSystem(options);

    for (const vp of sparseProject.viewpoints) {
      sparseSystem.addCamera(vp as Viewpoint);
    }
    for (const wp of sparseProject.worldPoints) {
      sparseSystem.addPoint(wp);
    }
    for (const ip of sparseProject.imagePoints) {
      sparseSystem.addImagePoint(ip);
    }
    for (const line of sparseProject.lines) {
      sparseSystem.addLine(line);
    }
    for (const constraint of sparseProject.constraints) {
      sparseSystem.addConstraint(constraint);
    }

    const sparseResult = sparseSystem.solve();
    console.log(`Sparse mode: residual=${sparseResult.residual.toFixed(3)}, iterations=${sparseResult.iterations}, error=${sparseResult.error}`);

    // Build and solve with analytical mode (fresh project)
    console.log('\n=== ANALYTICAL MODE ===');
    const analyticalProject = loadProjectFromJson(jsonData);
    setSolverMode('analytical');
    const analyticalSystem = new ConstraintSystem(options);

    for (const vp of analyticalProject.viewpoints) {
      analyticalSystem.addCamera(vp as Viewpoint);
    }
    for (const wp of analyticalProject.worldPoints) {
      analyticalSystem.addPoint(wp);
    }
    for (const ip of analyticalProject.imagePoints) {
      analyticalSystem.addImagePoint(ip);
    }
    for (const line of analyticalProject.lines) {
      analyticalSystem.addLine(line);
    }
    for (const constraint of analyticalProject.constraints) {
      analyticalSystem.addConstraint(constraint);
    }

    // Check provider count before solving
    const analyticalProviders = analyticalSystem.buildAnalyticalProviders();
    const providerCount = analyticalProviders.providers.length;

    const analyticalResult = analyticalSystem.solve();
    console.log(`Analytical mode: residual=${analyticalResult.residual.toFixed(3)}, iterations=${analyticalResult.iterations}, error=${analyticalResult.error}`);

    // Reset mode
    setSolverMode('sparse');

    // Check that they produce similar results
    const residualDiff = Math.abs(sparseResult.residual - analyticalResult.residual);

    // Count constraints (use sparseProject since both should be identical)
    const pointCount = sparseProject.worldPoints.size;
    const cameraCount = sparseProject.viewpoints.size;
    const imagePointCount = sparseProject.imagePoints.size;
    const lineCount = sparseProject.lines.size;
    const constraintCount = sparseProject.constraints.size;

    // Compute expected autodiff residual count:
    // - 14 imagePoints × 2 (U + V) = 28 reprojection residuals
    // - 1 camera × 1 quat normalization = 1 residual
    // - 20 lines × direction residuals (if not 'free') + length residuals
    // - 6 constraints

    // Log comparison info
    console.log(`COMPARISON:`);
    console.log(`  Project: ${pointCount} points, ${cameraCount} cameras, ${imagePointCount} imagePoints, ${lineCount} lines, ${constraintCount} constraints`);
    console.log(`  Analytical providers: ${providerCount}`);
    console.log(`  Expected reprojection residuals: ${imagePointCount * 2}`);
    console.log(`  Sparse: residual=${sparseResult.residual.toFixed(3)}`);
    console.log(`  Analytical: residual=${analyticalResult.residual.toFixed(3)}`);
    console.log(`  Difference: ${residualDiff.toFixed(3)}`);

    // Initial residuals should be identical (within floating point tolerance)
    // If this fails, there's a fundamental mismatch between analytical and autodiff residual computation
    expect(residualDiff).toBeLessThan(0.001);
  });
});
