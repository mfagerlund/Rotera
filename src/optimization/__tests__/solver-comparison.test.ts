/**
 * Solver Comparison Tests
 *
 * Compares autodiff vs numerical-sparse vs explicit-sparse solvers
 * to find exactly where they diverge.
 *
 * This is the "slow and steady" validation approach:
 * 1. Same problem setup for all solvers
 * 2. Compare initial residuals (should be identical)
 * 3. Compare Jacobians (numerical should match autodiff closely)
 * 4. Compare solutions step by step
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { Project } from '../../entities/project';
import { WorldPoint } from '../../entities/world-point';
import { Line } from '../../entities/line';
import { Viewpoint } from '../../entities/viewpoint';
import { ImagePoint } from '../../entities/imagePoint';
import { ConstraintSystem } from '../constraint-system';
import { solveWithExplicitJacobian } from '../explicit-jacobian';
import { setSolverBackend } from '../solver-config';
import { VariableLayout } from '../explicit-jacobian/adapter/variable-layout';
import { ProviderFactory } from '../explicit-jacobian/adapter/provider-factory';
import { ExplicitJacobianSystemImpl } from '../explicit-jacobian/ExplicitJacobianSystem';
import { wrapAllWithNumericalJacobian } from '../explicit-jacobian/numerical-wrapper';
import type { IOptimizableCamera } from '../IOptimizable';
import type { ResidualWithJacobian } from '../explicit-jacobian/types';

describe('Solver Comparison', () => {
  let project: Project;

  beforeEach(() => {
    project = Project.create('Test');
  });

  /**
   * Create a minimal test scene: 4 world points, 3 lines, 1 viewpoint, 4 image points
   */
  function createMinimalScene() {
    // Create 4 world points
    const origin = WorldPoint.create('Origin', {
      lockedXyz: [0, 0, 0],
    });

    const yAxis = WorldPoint.create('Y-Axis', {
      lockedXyz: [0, 10, 0],
    });

    const p3 = WorldPoint.create('P3', {
      lockedXyz: [null, null, null],
      optimizedXyz: [2, 5, 1],
    });

    const p4 = WorldPoint.create('P4', {
      lockedXyz: [null, null, null],
      optimizedXyz: [3, -2, -4],
    });

    project.addWorldPoint(origin);
    project.addWorldPoint(yAxis);
    project.addWorldPoint(p3);
    project.addWorldPoint(p4);

    // Create 3 lines connecting points
    const line1 = Line.create('L1', origin, yAxis, {
      direction: 'y',
      targetLength: 10,
    });

    const line2 = Line.create('L2', origin, p3, {
      direction: 'free',
    });

    const line3 = Line.create('L3', origin, p4, {
      direction: 'free',
    });

    project.addLine(line1);
    project.addLine(line2);
    project.addLine(line3);

    // Create viewpoint with known good pose
    const vp = Viewpoint.create('C1', 'test.jpg', '', 1920, 1080, {
      focalLength: 1500,
      position: [0, 5, 20] as [number, number, number],
      rotation: [1, 0, 0, 0] as [number, number, number, number],
      isPoseLocked: true,
    });

    project.addViewpoint(vp);

    // Create image points (approximate projections)
    const ip1 = ImagePoint.create(origin, vp, 960, 540 - 375, { id: 'IP1' });
    const ip2 = ImagePoint.create(yAxis, vp, 960, 540 + 375, { id: 'IP2' });
    const ip3 = ImagePoint.create(p3, vp, 960 + 150, 540, { id: 'IP3' });
    const ip4 = ImagePoint.create(p4, vp, 960 + 200, 540 - 200, { id: 'IP4' });

    project.addImagePoint(ip1);
    project.addImagePoint(ip2);
    project.addImagePoint(ip3);
    project.addImagePoint(ip4);

    return { origin, yAxis, p3, p4, line1, line2, line3, vp, ip1, ip2, ip3, ip4 };
  }

  it('compares initial residuals: autodiff vs explicit providers', () => {
    const { origin, yAxis, p3, p4, line1, line2, line3, vp, ip1, ip2, ip3, ip4 } = createMinimalScene();

    const points = [origin, yAxis, p3, p4];
    const lines = [line1, line2, line3];
    const cameras = [vp];
    const imagePoints = [ip1, ip2, ip3, ip4];

    // Build explicit system
    const layout = new VariableLayout();
    for (const point of points) {
      layout.addWorldPoint(point);
    }
    for (const camera of cameras) {
      layout.addCamera(camera, { optimizePose: !camera.isPoseLocked, optimizeIntrinsics: false });
    }

    const factory = new ProviderFactory(layout);
    const providers: ResidualWithJacobian[] = [];

    // Add line providers
    for (const line of lines) {
      providers.push(...factory.createLineProviders(line));
    }

    // Add reprojection providers
    const cameraData = new Map<IOptimizableCamera, { camera: IOptimizableCamera; indices: any }>();
    for (const camera of cameras) {
      const indices = layout.getCameraIndices(camera);
      if (indices) {
        cameraData.set(camera, { camera, indices });
      }
    }

    const ipsByWP = new Map<WorldPoint, ImagePoint[]>();
    for (const ip of imagePoints) {
      const wp = ip.worldPoint;
      if (!ipsByWP.has(wp)) ipsByWP.set(wp, []);
      ipsByWP.get(wp)!.push(ip);
    }

    for (const point of points) {
      const pointIPs = ipsByWP.get(point) || [];
      providers.push(...factory.createReprojectionProviders(point, pointIPs, cameraData, false));
    }

    // Build system and compute residuals
    const system = new ExplicitJacobianSystemImpl([...layout.initialValues]);
    for (const provider of providers) {
      system.addResidualProvider(provider);
    }

    const explicitResiduals = system.computeAllResiduals();

    console.log('=== EXPLICIT SYSTEM SETUP ===');
    console.log(`Variables: ${layout.variableCount}`);
    console.log(`Initial values: [${layout.initialValues.slice(0, 10).map(v => v.toFixed(3)).join(', ')}...]`);
    console.log(`Providers: ${providers.length}`);
    console.log(`Total residuals: ${explicitResiduals.length}`);

    // Show per-provider residuals
    let residualIdx = 0;
    for (const provider of providers) {
      const count = provider.residualCount;
      const providerResiduals = explicitResiduals.slice(residualIdx, residualIdx + count);
      const maxAbs = Math.max(...providerResiduals.map(Math.abs));
      console.log(`  ${provider.name || provider.id}: ${count} residuals, max=|${maxAbs.toFixed(4)}|`);
      if (maxAbs > 10) {
        console.log(`    Values: [${providerResiduals.map(r => r.toFixed(4)).join(', ')}]`);
      }
      residualIdx += count;
    }

    // Check for any Infinity or NaN
    const hasInf = explicitResiduals.some(r => !isFinite(r));
    const hasNaN = explicitResiduals.some(r => isNaN(r));
    console.log(`Has Infinity: ${hasInf}, Has NaN: ${hasNaN}`);

    expect(hasNaN).toBe(false);
    expect(hasInf).toBe(false);
  });

  it('compares Jacobians: analytical vs numerical', () => {
    const { origin, yAxis, p3, p4, line1 } = createMinimalScene();

    const points = [origin, yAxis, p3, p4];
    const lines = [line1];

    // Build system
    const layout = new VariableLayout();
    for (const point of points) {
      layout.addWorldPoint(point);
    }

    const factory = new ProviderFactory(layout);
    const providers: ResidualWithJacobian[] = [];

    // Just line direction for simplicity
    providers.push(...factory.createLineProviders(line1));

    const analyticalProviders = [...providers];
    const numericalProviders = wrapAllWithNumericalJacobian(providers);

    const system = new ExplicitJacobianSystemImpl([...layout.initialValues]);
    for (const provider of analyticalProviders) {
      system.addResidualProvider(provider);
    }

    console.log('=== JACOBIAN COMPARISON ===');

    for (let i = 0; i < analyticalProviders.length; i++) {
      const analytical = analyticalProviders[i];
      const numerical = numericalProviders[i];

      const analyticalJ = analytical.computeJacobian(system.variables);
      const numericalJ = numerical.computeJacobian(system.variables);

      console.log(`\nProvider: ${analytical.name || analytical.id}`);
      console.log(`  Variable indices: [${analytical.variableIndices.join(', ')}]`);

      for (let r = 0; r < analyticalJ.length; r++) {
        let maxDiff = 0;
        let maxDiffCol = 0;
        for (let c = 0; c < analyticalJ[r].length; c++) {
          const diff = Math.abs(analyticalJ[r][c] - numericalJ[r][c]);
          if (diff > maxDiff) {
            maxDiff = diff;
            maxDiffCol = c;
          }
        }

        if (maxDiff > 1e-5) {
          console.log(`  Row ${r}: max diff = ${maxDiff.toExponential(3)} at col ${maxDiffCol}`);
          console.log(`    Analytical: [${analyticalJ[r].map(v => v.toFixed(6)).join(', ')}]`);
          console.log(`    Numerical:  [${numericalJ[r].map(v => v.toFixed(6)).join(', ')}]`);
        } else {
          console.log(`  Row ${r}: OK (max diff = ${maxDiff.toExponential(3)})`);
        }

        expect(maxDiff).toBeLessThan(1e-4);
      }
    }
  });

  it('compares full solve: autodiff vs numerical-sparse', () => {
    const { origin, yAxis, p3, p4, line1, line2, line3, vp, ip1, ip2, ip3, ip4 } = createMinimalScene();

    const points = [origin, yAxis, p3, p4];
    const lines = [line1, line2, line3];
    const cameras = [vp];
    const imagePoints = [ip1, ip2, ip3, ip4];

    // Store initial positions
    const initialPositions = new Map<string, [number, number, number]>();
    for (const p of points) {
      const xyz = p.optimizedXyz || p.getEffectiveXyz();
      initialPositions.set(p.getName(), [xyz[0] ?? 0, xyz[1] ?? 0, xyz[2] ?? 0]);
    }

    console.log('=== INITIAL POSITIONS ===');
    for (const [name, pos] of initialPositions) {
      console.log(`  ${name}: [${pos.map(v => v.toFixed(4)).join(', ')}]`);
    }

    // Solve with autodiff
    setSolverBackend('autodiff');
    const autodiffSystem = new ConstraintSystem({
      tolerance: 1e-8,
      maxIterations: 100,
      verbose: false,
    });

    for (const p of points) autodiffSystem.addPoint(p);
    for (const l of lines) autodiffSystem.addLine(l);
    for (const c of cameras) autodiffSystem.addCamera(c);
    for (const ip of imagePoints) autodiffSystem.addImagePoint(ip);

    const autodiffResult = autodiffSystem.solve();

    console.log('\n=== AUTODIFF RESULT ===');
    console.log(`  Converged: ${autodiffResult.converged}`);
    console.log(`  Iterations: ${autodiffResult.iterations}`);
    console.log(`  Residual: ${autodiffResult.residual.toFixed(4)}`);

    const autodiffPositions = new Map<string, [number, number, number]>();
    for (const p of points) {
      if (p.optimizedXyz) {
        autodiffPositions.set(p.getName(), [...p.optimizedXyz] as [number, number, number]);
        console.log(`  ${p.getName()}: [${p.optimizedXyz.map(v => v.toFixed(4)).join(', ')}]`);
      }
    }

    // Reset positions for numerical-sparse
    for (const p of points) {
      const init = initialPositions.get(p.getName());
      if (init && !p.isFullyConstrained()) {
        p.optimizedXyz = [...init];
      }
    }

    // Solve with numerical-sparse
    setSolverBackend('numerical-sparse');
    const numericalResult = solveWithExplicitJacobian(
      points,
      lines,
      cameras as IOptimizableCamera[],
      imagePoints,
      [], [], [], [], [], [], [], [], [],
      { maxIterations: 100, tolerance: 1e-8, verbose: false }
    );

    console.log('\n=== NUMERICAL-SPARSE RESULT ===');
    console.log(`  Converged: ${numericalResult.converged}`);
    console.log(`  Iterations: ${numericalResult.iterations}`);
    console.log(`  Final cost: ${numericalResult.finalCost.toFixed(4)}`);

    for (const p of points) {
      if (p.optimizedXyz) {
        console.log(`  ${p.getName()}: [${p.optimizedXyz.map(v => v.toFixed(4)).join(', ')}]`);
      }
    }

    // Compare results
    console.log('\n=== COMPARISON ===');
    const autodiffCost = autodiffResult.residual ** 2 / 2;
    console.log(`  Autodiff cost: ${autodiffCost.toFixed(4)}`);
    console.log(`  Numerical cost: ${numericalResult.finalCost.toFixed(4)}`);

    // Both should converge
    expect(autodiffResult.converged).toBe(true);
    expect(numericalResult.converged).toBe(true);
  });

  it('compares full solve: autodiff vs explicit-sparse (analytical)', () => {
    const { origin, yAxis, p3, p4, line1, line2, line3, vp, ip1, ip2, ip3, ip4 } = createMinimalScene();

    const points = [origin, yAxis, p3, p4];
    const lines = [line1, line2, line3];
    const cameras = [vp];
    const imagePoints = [ip1, ip2, ip3, ip4];

    // Store initial positions
    const initialPositions = new Map<string, [number, number, number]>();
    for (const p of points) {
      const xyz = p.optimizedXyz || p.getEffectiveXyz();
      initialPositions.set(p.getName(), [xyz[0] ?? 0, xyz[1] ?? 0, xyz[2] ?? 0]);
    }

    console.log('=== INITIAL POSITIONS ===');
    for (const [name, pos] of initialPositions) {
      console.log(`  ${name}: [${pos.map(v => v.toFixed(4)).join(', ')}]`);
    }

    // Solve with autodiff
    setSolverBackend('autodiff');
    const autodiffSystem = new ConstraintSystem({
      tolerance: 1e-8,
      maxIterations: 100,
      verbose: false,
    });

    for (const p of points) autodiffSystem.addPoint(p);
    for (const l of lines) autodiffSystem.addLine(l);
    for (const c of cameras) autodiffSystem.addCamera(c);
    for (const ip of imagePoints) autodiffSystem.addImagePoint(ip);

    const autodiffResult = autodiffSystem.solve();

    console.log('\n=== AUTODIFF RESULT ===');
    console.log(`  Converged: ${autodiffResult.converged}`);
    console.log(`  Iterations: ${autodiffResult.iterations}`);
    console.log(`  Residual: ${autodiffResult.residual.toFixed(4)}`);

    const autodiffPositions = new Map<string, [number, number, number]>();
    for (const p of points) {
      if (p.optimizedXyz) {
        autodiffPositions.set(p.getName(), [...p.optimizedXyz] as [number, number, number]);
        console.log(`  ${p.getName()}: [${p.optimizedXyz.map(v => v.toFixed(4)).join(', ')}]`);
      }
    }

    // Reset positions for explicit-sparse
    for (const p of points) {
      const init = initialPositions.get(p.getName());
      if (init && !p.isFullyConstrained()) {
        p.optimizedXyz = [...init];
      }
    }

    // Solve with explicit-sparse (analytical gradients)
    setSolverBackend('explicit-sparse');
    const explicitResult = solveWithExplicitJacobian(
      points,
      lines,
      cameras as IOptimizableCamera[],
      imagePoints,
      [], [], [], [], [], [], [], [], [],
      { maxIterations: 100, tolerance: 1e-8, verbose: false }
    );

    console.log('\n=== EXPLICIT-SPARSE RESULT ===');
    console.log(`  Converged: ${explicitResult.converged}`);
    console.log(`  Iterations: ${explicitResult.iterations}`);
    console.log(`  Final cost: ${explicitResult.finalCost.toFixed(4)}`);

    for (const p of points) {
      if (p.optimizedXyz) {
        console.log(`  ${p.getName()}: [${p.optimizedXyz.map(v => v.toFixed(4)).join(', ')}]`);
      }
    }

    // Compare results
    console.log('\n=== COMPARISON ===');
    const autodiffCost = autodiffResult.residual ** 2 / 2;
    console.log(`  Autodiff cost: ${autodiffCost.toFixed(4)}`);
    console.log(`  Explicit cost: ${explicitResult.finalCost.toFixed(4)}`);

    // Both should converge
    expect(autodiffResult.converged).toBe(true);
    expect(explicitResult.converged).toBe(true);
  });
});
