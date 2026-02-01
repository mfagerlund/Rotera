/**
 * Debug test for explicit Jacobian system
 *
 * Investigates why explicit-sparse backend gets high residuals
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { fineTuneProject } from '../fine-tune';
import { optimizeProject } from '../optimize-project';
import { WorldPoint } from '../../entities/world-point';
import { Line } from '../../entities/line';
import { Viewpoint } from '../../entities/viewpoint';
import { ImagePoint } from '../../entities/imagePoint';
import { setSolverBackend, getSolverBackend, SolverBackend } from '../solver-config';
import { ConstraintSystem } from '../constraint-system';
import { solveWithExplicitJacobian } from '../explicit-jacobian';
import { VariableLayout } from '../explicit-jacobian/adapter/variable-layout';
import { ProviderFactory } from '../explicit-jacobian/adapter/provider-factory';
import { ExplicitJacobianSystemImpl } from '../explicit-jacobian/ExplicitJacobianSystem';
import type { ResidualWithJacobian } from '../explicit-jacobian/types';
import type { IOptimizableCamera } from '../IOptimizable';

const CALIBRATION_FIXTURES_DIR = path.join(__dirname, 'fixtures', 'Calibration');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

let originalBackend: SolverBackend;

beforeEach(() => {
  originalBackend = getSolverBackend();
});

afterEach(() => {
  setSolverBackend(originalBackend);
});

describe('Explicit Jacobian Debug', () => {
  it('compares residuals before optimization', async () => {
    // Load and optimize with autodiff first
    const fixturePath = path.join(CALIBRATION_FIXTURES_DIR, 'Fixture With 2 Image 2.json');
    if (!fs.existsSync(fixturePath)) {
      console.log('Skipping: fixture not found');
      return;
    }

    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    // Initialize with full optimization first
    setSolverBackend('autodiff');
    await optimizeProject(project, {
      maxIterations: 500,
      maxAttempts: 1,
      verbose: false
    });

    // Now we have a calibrated project - compare residuals
    const points = Array.from(project.worldPoints) as WorldPoint[];
    const lines = Array.from(project.lines) as Line[];
    const cameras = (Array.from(project.viewpoints) as Viewpoint[]).filter(vp => vp.enabledInSolve);
    const imagePoints = (Array.from(project.imagePoints) as ImagePoint[]).filter(ip =>
      cameras.includes(ip.viewpoint as Viewpoint)
    );

    console.log(`Project: ${points.length} points, ${lines.length} lines, ${cameras.length} cameras, ${imagePoints.length} image points`);

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

    // Line providers
    for (const line of lines) {
      const lineProviders = factory.createLineProviders(line);
      providers.push(...lineProviders);
    }

    // Reprojection providers
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
      const reproj = factory.createReprojectionProviders(point, pointIPs, cameraData, false);
      providers.push(...reproj);
    }

    console.log(`\nBuilt ${providers.length} providers with ${layout.variableCount} variables`);

    // Compute residuals
    const system = new ExplicitJacobianSystemImpl([...layout.initialValues]);
    for (const provider of providers) {
      system.addResidualProvider(provider);
    }

    const residuals = system.computeAllResiduals();
    const totalSquared = residuals.reduce((sum, r) => sum + r * r, 0);
    const rms = Math.sqrt(totalSquared / residuals.length);

    console.log(`\nExplicit system initial residuals:`);
    console.log(`  Total: ${residuals.length}`);
    console.log(`  Sum of squares: ${totalSquared.toFixed(4)}`);
    console.log(`  RMS: ${rms.toFixed(4)}`);

    // Check for NaN/Infinity
    const hasNaN = residuals.some(r => isNaN(r));
    const hasInf = residuals.some(r => !isFinite(r));
    console.log(`  Has NaN: ${hasNaN}`);
    console.log(`  Has Inf: ${hasInf}`);

    // Show per-provider breakdown
    console.log(`\nPer-provider breakdown:`);
    let residualIdx = 0;
    for (const provider of providers) {
      const count = provider.residualCount;
      const providerResiduals = residuals.slice(residualIdx, residualIdx + count);
      const maxAbs = Math.max(...providerResiduals.map(Math.abs));
      const providerSumSq = providerResiduals.reduce((sum, r) => sum + r * r, 0);
      if (maxAbs > 1) {
        console.log(`  ${provider.name || provider.id}: ${count} res, max=|${maxAbs.toFixed(2)}|, sumSq=${providerSumSq.toFixed(2)}`);
      }
      residualIdx += count;
    }

    // Now compare with fineTune results
    console.log('\n--- Fine-tune comparison ---');

    // Save current optimizedXyz values
    const savedPositions = new Map<WorldPoint, [number, number, number]>();
    for (const wp of points) {
      if (wp.optimizedXyz) {
        savedPositions.set(wp, [...wp.optimizedXyz] as [number, number, number]);
      }
    }

    // Run autodiff fine-tune
    setSolverBackend('autodiff');
    const autodiffResult = fineTuneProject(project, {
      tolerance: 1e-6,
      maxIterations: 100,
      lockCameraPoses: true,
      verbose: false
    });
    console.log(`Autodiff: converged=${autodiffResult.converged}, residual=${autodiffResult.residual.toFixed(4)}`);

    // Restore and run explicit-sparse
    for (const [wp, pos] of savedPositions) {
      wp.optimizedXyz = [...pos] as [number, number, number];
    }

    setSolverBackend('explicit-sparse');
    const explicitResult = fineTuneProject(project, {
      tolerance: 1e-6,
      maxIterations: 100,
      lockCameraPoses: true,
      verbose: false
    });
    console.log(`Explicit-sparse: converged=${explicitResult.converged}, residual=${explicitResult.residual.toFixed(4)}`);

    // The residuals should be similar
    expect(hasNaN).toBe(false);
    expect(hasInf).toBe(false);
  });

  it('investigates residual differences on minimal-1-image fixture', async () => {
    const fixturePath = path.join(FIXTURES_DIR, 'minimal-1-image.rotera');
    if (!fs.existsSync(fixturePath)) {
      console.log('Skipping: fixture not found');
      return;
    }

    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    // CRITICAL: First calibrate with autodiff before testing explicit-jacobian
    setSolverBackend('autodiff');
    await optimizeProject(project, {
      maxIterations: 500,
      maxAttempts: 1,
      verbose: false
    });

    const points = Array.from(project.worldPoints) as WorldPoint[];
    const lines = Array.from(project.lines) as Line[];
    const cameras = (Array.from(project.viewpoints) as Viewpoint[]).filter(vp => vp.enabledInSolve);
    const imagePoints = (Array.from(project.imagePoints) as ImagePoint[]).filter(ip =>
      cameras.includes(ip.viewpoint as Viewpoint)
    );

    console.log(`Minimal-1-image (after calibration): ${points.length} points, ${lines.length} lines, ${cameras.length} cameras, ${imagePoints.length} IPs`);

    // Collect camera/point details
    let cameraPointDetails = '';
    for (const cam of cameras) {
      cameraPointDetails += `Camera ${cam.name}: pos=[${cam.position.map(v => v.toFixed(2)).join(', ')}], rot=[${cam.rotation.map(v => v.toFixed(3)).join(', ')}], isZReflected=${cam.isZReflected}\n`;
    }
    for (const pt of points) {
      const xyz = pt.optimizedXyz || pt.getEffectiveXyz();
      cameraPointDetails += `Point ${pt.getName()}: xyz=[${xyz.map(v => v?.toFixed(2) ?? 'null').join(', ')}]\n`;
    }

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

    for (const line of lines) {
      providers.push(...factory.createLineProviders(line));
    }

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

    const system = new ExplicitJacobianSystemImpl([...layout.initialValues]);
    for (const provider of providers) {
      system.addResidualProvider(provider);
    }

    const residuals = system.computeAllResiduals();
    const totalCost = 0.5 * residuals.reduce((sum, r) => sum + r * r, 0);

    let output = '';
    const log = (msg: string) => { output += msg + '\n'; };
    log(`\nExplicit system:`);
    log(`  Variables: ${layout.variableCount}`);
    log(`  Providers: ${providers.length}`);
    log(`  Residuals: ${residuals.length}`);
    log(`  Total cost: ${totalCost.toFixed(4)}`);

    // Log each provider
    let idx = 0;
    for (const p of providers) {
      const r = residuals.slice(idx, idx + p.residualCount);
      const sumSq = r.reduce((s, v) => s + v * v, 0);
      log(`  ${p.name || p.id}: ${r.map(v => v.toFixed(4)).join(', ')} (sumSq=${sumSq.toFixed(4)})`);
      idx += p.residualCount;
    }

    // Run autodiff fine-tune to see what it gets
    const autodiffResult = fineTuneProject(project, {
      tolerance: 1e-6,
      maxIterations: 100,
      lockCameraPoses: true,
      verbose: false
    });

    output += `\nAutodiff fine-tune: residual=${autodiffResult.residual.toFixed(4)}\n`;

    if (totalCost >= 10) {
      throw new Error(`Total cost ${totalCost.toFixed(4)} >= 10.\n${cameraPointDetails}\n${output}`);
    }
  });
});
