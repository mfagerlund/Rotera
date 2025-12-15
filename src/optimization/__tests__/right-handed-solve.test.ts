/**
 * Test that solving produces RIGHT-HANDED coordinate system.
 *
 * The "From Below" fixture has:
 * - Origin O at (0, 0, 0)
 * - Point Y along +Y axis
 * - Point X along +X axis
 * - Point Z along +Z axis (or should be!)
 *
 * Currently broken: Z ends up at negative Z coordinate, making system left-handed.
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import { WorldPoint } from '../../entities/world-point';
import { optimizationLogs, clearOptimizationLogs } from '../optimization-logger';

const LOG_FILE = path.join(__dirname, 'right-handed-debug.txt');
const logLines: string[] = [];
function log(...args: unknown[]) {
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  logLines.push(line);
}
function flushLog() {
  fs.writeFileSync(LOG_FILE, logLines.join('\n'), 'utf-8');
}

function loadFixture(filename: string) {
  const fixturePath = path.join(__dirname, 'fixtures', filename);
  const json = fs.readFileSync(fixturePath, 'utf-8');
  return loadProjectFromJson(json);
}

// Helper to check if coordinate system is right-handed
function isRightHanded(origin: [number, number, number], x: [number, number, number], y: [number, number, number], z: [number, number, number]): boolean {
  // Vectors from origin
  const vx = [x[0] - origin[0], x[1] - origin[1], x[2] - origin[2]];
  const vy = [y[0] - origin[0], y[1] - origin[1], y[2] - origin[2]];
  const vz = [z[0] - origin[0], z[1] - origin[1], z[2] - origin[2]];

  // Cross product X × Y
  const crossXY = [
    vy[1] * vz[2] - vy[2] * vz[1],  // Wait, this should be vx × vy
    vy[2] * vz[0] - vy[0] * vz[2],
    vy[0] * vz[1] - vy[1] * vz[0]
  ];

  // Actually compute X × Y properly
  const xCrossY = [
    vx[1] * vy[2] - vx[2] * vy[1],
    vx[2] * vy[0] - vx[0] * vy[2],
    vx[0] * vy[1] - vx[1] * vy[0]
  ];

  // Dot with Z - should be positive for right-handed
  const dot = xCrossY[0] * vz[0] + xCrossY[1] * vz[1] + xCrossY[2] * vz[2];

  log('[Handedness Check]');
  log('  Origin:', origin);
  log('  X point:', x, '-> vector:', vx);
  log('  Y point:', y, '-> vector:', vy);
  log('  Z point:', z, '-> vector:', vz);
  log('  X × Y:', xCrossY);
  log('  (X × Y) · Z =', dot, dot > 0 ? '(RIGHT-HANDED)' : '(LEFT-HANDED)');

  return dot > 0;
}

describe('Right-handed coordinate system', () => {
  it('should produce right-handed result from "From Below" fixture', () => {
    const project = loadFixture('from-below-rh-test.json');

    // Verify fixture structure
    expect(project.worldPoints.size).toBe(4);
    expect(project.viewpoints.size).toBe(1);

    // Get the points by name
    const points = Array.from(project.worldPoints) as WorldPoint[];
    const O = points.find(p => p.name === 'O')!;
    const X = points.find(p => p.name === 'X')!;
    const Y = points.find(p => p.name === 'Y')!;
    const Z = points.find(p => p.name === 'Z')!;

    expect(O).toBeDefined();
    expect(X).toBeDefined();
    expect(Y).toBeDefined();
    expect(Z).toBeDefined();

    // O is fully locked at origin
    expect(O.lockedXyz).toEqual([0, 0, 0]);

    // Debug: check Z point locks
    log('Z point lockedXyz:', Z.lockedXyz);

    log('\n=== BEFORE OPTIMIZATION ===');
    log('O:', O.optimizedXyz ?? O.getEffectiveXyz());
    log('X:', X.optimizedXyz ?? X.getEffectiveXyz());
    log('Y:', Y.optimizedXyz ?? Y.getEffectiveXyz());
    log('Z:', Z.optimizedXyz ?? Z.getEffectiveXyz());

    // Clear optimization logs before running
    clearOptimizationLogs();

    // Run optimization
    const result = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      maxIterations: 100,
      tolerance: 1e-6,
      verbose: true,  // Enable verbose to see VP debug output
    });

    // Capture VP debug logs
    log('\n=== VP DEBUG LOGS ===');
    for (const line of optimizationLogs) {
      if (line.includes('[VP Debug]') || line.includes('[VP Init]') || line.includes('[initializeCamera') || line.includes('[VP Sign') || line.includes('[VP RH]')) {
        log(line);
      }
    }

    log('\n=== OPTIMIZATION RESULT ===');
    log('Converged:', result.converged);
    log('Iterations:', result.iterations);
    log('Median error:', result.medianReprojectionError, 'px');
    log('Error:', result.error);

    log('\n=== AFTER OPTIMIZATION ===');
    const oPos = O.optimizedXyz ?? O.getEffectiveXyz() ?? [0, 0, 0];
    const xPos = X.optimizedXyz ?? X.getEffectiveXyz();
    const yPos = Y.optimizedXyz ?? Y.getEffectiveXyz();
    const zPos = Z.optimizedXyz ?? Z.getEffectiveXyz();

    log('O:', oPos);
    log('X:', xPos);
    log('Y:', yPos);
    log('Z:', zPos);

    // Write logs before any assertions
    flushLog();

    // Basic sanity: solve should work
    expect(result.medianReprojectionError).toBeDefined();
    expect(result.medianReprojectionError!).toBeLessThan(10);

    // THE CRITICAL TEST: Result should be right-handed
    expect(xPos).toBeDefined();
    expect(yPos).toBeDefined();
    expect(zPos).toBeDefined();

    const rightHanded = isRightHanded(
      oPos as [number, number, number],
      xPos as [number, number, number],
      yPos as [number, number, number],
      zPos as [number, number, number]
    );

    // This is the test that currently FAILS
    expect(rightHanded).toBe(true);

    // Also check: Z point should have POSITIVE Z coordinate
    // (it's along the +Z axis from origin, so z > 0)
    expect(zPos![2]).toBeGreaterThan(0);
  });
});
