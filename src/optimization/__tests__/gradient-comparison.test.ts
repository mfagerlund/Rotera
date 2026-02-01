/**
 * Direct Gradient Comparison Test
 *
 * Compares numerical gradients vs analytical gradients for each residual type.
 * This helps identify which specific gradient function is broken.
 *
 * Run with: npm test -- --watchAll=false --testPathPattern="gradient-comparison"
 */

import { describe, it, expect } from '@jest/globals';
import { createReprojectionProvider } from '../explicit-jacobian/providers/reprojection-provider';
import { createQuatNormProvider } from '../explicit-jacobian/providers/quat-norm-provider';
import { createLineLengthProvider } from '../explicit-jacobian/providers/line-length-provider';
import { createLineDirectionProvider } from '../explicit-jacobian/providers/line-direction-provider';
import { createCoplanarProvider } from '../explicit-jacobian/providers/coplanar-provider';
import type { ResidualWithJacobian } from '../explicit-jacobian/types';

const log = (msg: string) => process.stderr.write(msg + '\n');
const EPS = 1e-6;

/**
 * Compute numerical Jacobian for a provider using central differences.
 */
function computeNumericalJacobian(
  provider: ResidualWithJacobian,
  variables: number[]
): number[][] {
  const residualCount = provider.residualCount;
  const varIndices = provider.variableIndices;
  const jacobian: number[][] = [];

  for (let r = 0; r < residualCount; r++) {
    jacobian.push(new Array(varIndices.length).fill(0));
  }

  for (let localIdx = 0; localIdx < varIndices.length; localIdx++) {
    const globalIdx = varIndices[localIdx];

    const varsPlus = [...variables];
    varsPlus[globalIdx] += EPS;
    const residualsPlus = provider.computeResiduals(varsPlus);

    const varsMinus = [...variables];
    varsMinus[globalIdx] -= EPS;
    const residualsMinus = provider.computeResiduals(varsMinus);

    for (let r = 0; r < residualCount; r++) {
      const grad = (residualsPlus[r] - residualsMinus[r]) / (2 * EPS);
      jacobian[r][localIdx] = isFinite(grad) ? grad : 0;
    }
  }

  return jacobian;
}

/**
 * Compare analytical vs numerical Jacobian.
 */
function compareJacobians(
  analytical: number[][],
  numerical: number[][],
  tolerance: number = 1e-4
): { match: boolean; maxError: number; details: string[] } {
  const details: string[] = [];
  let maxError = 0;

  for (let r = 0; r < analytical.length; r++) {
    for (let c = 0; c < analytical[r].length; c++) {
      const a = analytical[r][c];
      const n = numerical[r][c];
      const error = Math.abs(a - n);
      const relError = Math.abs(a - n) / Math.max(Math.abs(a), Math.abs(n), 1e-10);

      if (error > tolerance && relError > 0.01) {
        details.push(`J[${r}][${c}]: analytical=${a.toExponential(4)}, numerical=${n.toExponential(4)}, error=${error.toExponential(4)}`);
      }
      maxError = Math.max(maxError, error);
    }
  }

  return {
    match: details.length === 0,
    maxError,
    details,
  };
}

describe('Direct Gradient Comparison', () => {
  describe('Reprojection gradient', () => {
    it('compares analytical vs numerical for basic case', () => {
      log('');
      log('=== Reprojection Gradient Comparison ===');
      log('');

      // Create a reprojection provider with known values
      // Camera looking down -Z axis at a point in front
      const worldPointIndices: [number, number, number] = [0, 1, 2];
      const cameraPosIndices: [number, number, number] = [3, 4, 5];
      const quaternionIndices: [number, number, number, number] = [6, 7, 8, 9];

      const provider = createReprojectionProvider(
        'test-reproj',
        worldPointIndices,
        cameraPosIndices,
        quaternionIndices,
        {
          fx: 1000,
          fy: 1000,
          cx: 500,
          cy: 400,
          k1: 0,
          k2: 0,
          k3: 0,
          p1: 0,
          p2: 0,
          observedU: 600,
          observedV: 350,
          isZReflected: false,
        }
      );

      // Variables: worldPoint at (1, -0.5, 10), camera at origin, identity quaternion
      const variables = [
        1, -0.5, 10,  // world point x, y, z
        0, 0, 0,      // camera pos x, y, z
        1, 0, 0, 0,   // quaternion w, x, y, z (identity)
      ];

      // Compute residuals
      const residuals = provider.computeResiduals(variables);
      log(`Residuals: [${residuals.map(r => r.toFixed(4)).join(', ')}]`);

      // Compute analytical Jacobian
      const analyticalJ = provider.computeJacobian(variables);
      log('');
      log('Analytical Jacobian:');
      for (let r = 0; r < analyticalJ.length; r++) {
        log(`  Row ${r}: [${analyticalJ[r].map(v => v.toFixed(4)).join(', ')}]`);
      }

      // Compute numerical Jacobian
      const numericalJ = computeNumericalJacobian(provider, variables);
      log('');
      log('Numerical Jacobian:');
      for (let r = 0; r < numericalJ.length; r++) {
        log(`  Row ${r}: [${numericalJ[r].map(v => v.toFixed(4)).join(', ')}]`);
      }

      // Compare
      const comparison = compareJacobians(analyticalJ, numericalJ);
      log('');
      log(`Match: ${comparison.match}, Max error: ${comparison.maxError.toExponential(4)}`);
      if (comparison.details.length > 0) {
        log('Differences:');
        for (const detail of comparison.details) {
          log(`  ${detail}`);
        }
      }
      log('');

      expect(comparison.match).toBe(true);
    });

    it('compares for Z-reflected camera', () => {
      log('');
      log('=== Reprojection Gradient (Z-reflected) ===');
      log('');

      const worldPointIndices: [number, number, number] = [0, 1, 2];
      const cameraPosIndices: [number, number, number] = [3, 4, 5];
      const quaternionIndices: [number, number, number, number] = [6, 7, 8, 9];

      const provider = createReprojectionProvider(
        'test-reproj-zref',
        worldPointIndices,
        cameraPosIndices,
        quaternionIndices,
        {
          fx: 1000,
          fy: 1000,
          cx: 500,
          cy: 400,
          k1: 0,
          k2: 0,
          k3: 0,
          p1: 0,
          p2: 0,
          observedU: 600,
          observedV: 350,
          isZReflected: true,  // Z-reflected!
        }
      );

      // Point at z=-10 (in front of Z-reflected camera)
      const variables = [
        1, -0.5, -10, // world point x, y, z (negative Z for Z-reflected)
        0, 0, 0,      // camera pos x, y, z
        1, 0, 0, 0,   // quaternion w, x, y, z (identity)
      ];

      const residuals = provider.computeResiduals(variables);
      log(`Residuals: [${residuals.map(r => r.toFixed(4)).join(', ')}]`);

      const analyticalJ = provider.computeJacobian(variables);
      const numericalJ = computeNumericalJacobian(provider, variables);

      log('');
      log('Analytical Jacobian:');
      for (let r = 0; r < analyticalJ.length; r++) {
        log(`  Row ${r}: [${analyticalJ[r].map(v => v.toFixed(4)).join(', ')}]`);
      }
      log('');
      log('Numerical Jacobian:');
      for (let r = 0; r < numericalJ.length; r++) {
        log(`  Row ${r}: [${numericalJ[r].map(v => v.toFixed(4)).join(', ')}]`);
      }

      const comparison = compareJacobians(analyticalJ, numericalJ);
      log('');
      log(`Match: ${comparison.match}, Max error: ${comparison.maxError.toExponential(4)}`);
      if (comparison.details.length > 0) {
        log('Differences:');
        for (const detail of comparison.details) {
          log(`  ${detail}`);
        }
      }
      log('');

      expect(comparison.match).toBe(true);
    });

    it('compares for rotated camera', () => {
      log('');
      log('=== Reprojection Gradient (rotated camera) ===');
      log('');

      const worldPointIndices: [number, number, number] = [0, 1, 2];
      const cameraPosIndices: [number, number, number] = [3, 4, 5];
      const quaternionIndices: [number, number, number, number] = [6, 7, 8, 9];

      const provider = createReprojectionProvider(
        'test-reproj-rot',
        worldPointIndices,
        cameraPosIndices,
        quaternionIndices,
        {
          fx: 1000,
          fy: 1000,
          cx: 500,
          cy: 400,
          k1: 0,
          k2: 0,
          k3: 0,
          p1: 0,
          p2: 0,
          observedU: 550,
          observedV: 380,
          isZReflected: false,
        }
      );

      // 30-degree rotation around Y axis (less extreme than 45°)
      const angle = Math.PI / 6;
      const halfAngle = angle / 2;
      const qw = Math.cos(halfAngle);
      const qy = Math.sin(halfAngle);

      // Point at (2, 1, 10) - clearly in front of camera even after rotation
      const variables = [
        2, 1, 10,     // world point x, y, z
        0, 0, 0,      // camera pos x, y, z
        qw, 0, qy, 0, // quaternion w, x, y, z
      ];

      const residuals = provider.computeResiduals(variables);
      log(`Residuals: [${residuals.map(r => r.toFixed(4)).join(', ')}]`);

      const analyticalJ = provider.computeJacobian(variables);
      const numericalJ = computeNumericalJacobian(provider, variables);

      log('');
      log('Analytical Jacobian:');
      for (let r = 0; r < analyticalJ.length; r++) {
        log(`  Row ${r}: [${analyticalJ[r].map(v => v.toFixed(4)).join(', ')}]`);
      }
      log('');
      log('Numerical Jacobian:');
      for (let r = 0; r < numericalJ.length; r++) {
        log(`  Row ${r}: [${numericalJ[r].map(v => v.toFixed(4)).join(', ')}]`);
      }

      const comparison = compareJacobians(analyticalJ, numericalJ);
      log('');
      log(`Match: ${comparison.match}, Max error: ${comparison.maxError.toExponential(4)}`);
      if (comparison.details.length > 0) {
        log('Differences:');
        for (const detail of comparison.details) {
          log(`  ${detail}`);
        }
      }
      log('');

      expect(comparison.match).toBe(true);
    });

    it('compares with radial distortion', () => {
      log('');
      log('=== Reprojection Gradient (with distortion) ===');
      log('');

      const worldPointIndices: [number, number, number] = [0, 1, 2];
      const cameraPosIndices: [number, number, number] = [3, 4, 5];
      const quaternionIndices: [number, number, number, number] = [6, 7, 8, 9];

      const provider = createReprojectionProvider(
        'test-reproj-dist',
        worldPointIndices,
        cameraPosIndices,
        quaternionIndices,
        {
          fx: 1000,
          fy: 1000,
          cx: 500,
          cy: 400,
          k1: 0.1,   // Some radial distortion
          k2: 0.01,
          k3: 0,
          p1: 0.001, // Some tangential distortion
          p2: 0.001,
          observedU: 650,
          observedV: 320,
          isZReflected: false,
        }
      );

      const variables = [
        2, -1, 8,     // world point x, y, z
        0, 0, 0,      // camera pos x, y, z
        1, 0, 0, 0,   // quaternion w, x, y, z (identity)
      ];

      const residuals = provider.computeResiduals(variables);
      log(`Residuals: [${residuals.map(r => r.toFixed(4)).join(', ')}]`);

      const analyticalJ = provider.computeJacobian(variables);
      const numericalJ = computeNumericalJacobian(provider, variables);

      log('');
      log('Analytical Jacobian:');
      for (let r = 0; r < analyticalJ.length; r++) {
        log(`  Row ${r}: [${analyticalJ[r].map(v => v.toFixed(4)).join(', ')}]`);
      }
      log('');
      log('Numerical Jacobian:');
      for (let r = 0; r < numericalJ.length; r++) {
        log(`  Row ${r}: [${numericalJ[r].map(v => v.toFixed(4)).join(', ')}]`);
      }

      const comparison = compareJacobians(analyticalJ, numericalJ);
      log('');
      log(`Match: ${comparison.match}, Max error: ${comparison.maxError.toExponential(4)}`);
      if (comparison.details.length > 0) {
        log('Differences:');
        for (const detail of comparison.details) {
          log(`  ${detail}`);
        }
      }
      log('');

      expect(comparison.match).toBe(true);
    });
  });

  describe('Quaternion normalization gradient', () => {
    it('compares analytical vs numerical', () => {
      log('');
      log('=== Quat Norm Gradient ===');
      log('');

      const quatIndices: [number, number, number, number] = [0, 1, 2, 3];
      const provider = createQuatNormProvider('test-quat', quatIndices);

      // Slightly non-normalized quaternion
      const variables = [0.9, 0.3, 0.2, 0.1];

      const residuals = provider.computeResiduals(variables);
      log(`Residuals: [${residuals.map(r => r.toFixed(6)).join(', ')}]`);

      const analyticalJ = provider.computeJacobian(variables);
      const numericalJ = computeNumericalJacobian(provider, variables);

      log('Analytical: ' + analyticalJ[0].map(v => v.toFixed(4)).join(', '));
      log('Numerical:  ' + numericalJ[0].map(v => v.toFixed(4)).join(', '));

      const comparison = compareJacobians(analyticalJ, numericalJ);
      log(`Match: ${comparison.match}, Max error: ${comparison.maxError.toExponential(4)}`);
      if (comparison.details.length > 0) {
        comparison.details.forEach(d => log(`  ${d}`));
      }
      log('');

      expect(comparison.match).toBe(true);
    });
  });

  describe('Line length gradient', () => {
    it('compares analytical vs numerical', () => {
      log('');
      log('=== Line Length Gradient ===');
      log('');

      const pointAIndices: [number, number, number] = [0, 1, 2];
      const pointBIndices: [number, number, number] = [3, 4, 5];
      const targetLength = 5.0;

      const provider = createLineLengthProvider('test-linelen', pointAIndices, pointBIndices, targetLength);

      // Points with length ~5.196
      const variables = [0, 0, 0, 3, 3, 3];

      const residuals = provider.computeResiduals(variables);
      log(`Residuals: [${residuals.map(r => r.toFixed(4)).join(', ')}]`);

      const analyticalJ = provider.computeJacobian(variables);
      const numericalJ = computeNumericalJacobian(provider, variables);

      log('Analytical: ' + analyticalJ[0].map(v => v.toFixed(4)).join(', '));
      log('Numerical:  ' + numericalJ[0].map(v => v.toFixed(4)).join(', '));

      const comparison = compareJacobians(analyticalJ, numericalJ);
      log(`Match: ${comparison.match}, Max error: ${comparison.maxError.toExponential(4)}`);
      if (comparison.details.length > 0) {
        comparison.details.forEach(d => log(`  ${d}`));
      }
      log('');

      expect(comparison.match).toBe(true);
    });
  });

  describe('Line direction gradient', () => {
    it('compares Y-aligned direction analytical vs numerical', () => {
      log('');
      log('=== Line Direction Y Gradient ===');
      log('');

      const pointAIndices: [number, number, number] = [0, 1, 2];
      const pointBIndices: [number, number, number] = [3, 4, 5];

      const provider = createLineDirectionProvider('test-linedir-y', pointAIndices, pointBIndices, 'y');
      if (!provider) {
        log('Provider is null!');
        return;
      }

      // Points roughly aligned with Y (with some deviation)
      const variables = [0, 0, 0, 0.1, 5, 0.05];

      const residuals = provider.computeResiduals(variables);
      log(`Residuals: [${residuals.map(r => r.toFixed(4)).join(', ')}]`);
      log(`Residual count: ${provider.residualCount}`);

      const analyticalJ = provider.computeJacobian(variables);
      const numericalJ = computeNumericalJacobian(provider, variables);

      log('Analytical Jacobian:');
      analyticalJ.forEach((row, i) => log(`  Row ${i}: ${row.map(v => v.toFixed(4)).join(', ')}`));
      log('Numerical Jacobian:');
      numericalJ.forEach((row, i) => log(`  Row ${i}: ${row.map(v => v.toFixed(4)).join(', ')}`));

      const comparison = compareJacobians(analyticalJ, numericalJ);
      log(`Match: ${comparison.match}, Max error: ${comparison.maxError.toExponential(4)}`);
      if (comparison.details.length > 0) {
        comparison.details.forEach(d => log(`  ${d}`));
      }
      log('');

      expect(comparison.match).toBe(true);
    });

    it('compares XZ plane direction analytical vs numerical', () => {
      log('');
      log('=== Line Direction XZ Gradient ===');
      log('');

      const pointAIndices: [number, number, number] = [0, 1, 2];
      const pointBIndices: [number, number, number] = [3, 4, 5];

      const provider = createLineDirectionProvider('test-linedir-xz', pointAIndices, pointBIndices, 'xz');
      if (!provider) {
        log('Provider is null!');
        return;
      }

      // Points in XZ plane with small Y deviation
      const variables = [0, 0, 0, 3, 0.1, 4];

      const residuals = provider.computeResiduals(variables);
      log(`Residuals: [${residuals.map(r => r.toFixed(4)).join(', ')}]`);

      const analyticalJ = provider.computeJacobian(variables);
      const numericalJ = computeNumericalJacobian(provider, variables);

      log('Analytical: ' + analyticalJ[0].map(v => v.toFixed(4)).join(', '));
      log('Numerical:  ' + numericalJ[0].map(v => v.toFixed(4)).join(', '));

      const comparison = compareJacobians(analyticalJ, numericalJ);
      log(`Match: ${comparison.match}, Max error: ${comparison.maxError.toExponential(4)}`);
      if (comparison.details.length > 0) {
        comparison.details.forEach(d => log(`  ${d}`));
      }
      log('');

      expect(comparison.match).toBe(true);
    });
  });

  describe('Coplanar gradient', () => {
    it('compares analytical vs numerical for coplanar points', () => {
      log('');
      log('=== Coplanar Gradient ===');
      log('');

      const p0Indices: [number, number, number] = [0, 1, 2];
      const p1Indices: [number, number, number] = [3, 4, 5];
      const p2Indices: [number, number, number] = [6, 7, 8];
      const p3Indices: [number, number, number] = [9, 10, 11];

      const provider = createCoplanarProvider('test-coplanar', p0Indices, p1Indices, p2Indices, p3Indices);

      // Four points forming a tetrahedron (NOT coplanar)
      const variables = [
        0, 0, 0,     // p0 at origin
        1, 0, 0,     // p1 along X
        0, 1, 0,     // p2 along Y
        0.5, 0.5, 1, // p3 above the XY plane (not coplanar with first 3)
      ];

      const residuals = provider.computeResiduals(variables);
      log(`Residuals: [${residuals.map(r => r.toFixed(6)).join(', ')}]`);

      const analyticalJ = provider.computeJacobian(variables);
      const numericalJ = computeNumericalJacobian(provider, variables);

      log('Analytical: ' + analyticalJ[0].map(v => v.toFixed(6)).join(', '));
      log('Numerical:  ' + numericalJ[0].map(v => v.toFixed(6)).join(', '));

      const comparison = compareJacobians(analyticalJ, numericalJ);
      log(`Match: ${comparison.match}, Max error: ${comparison.maxError.toExponential(4)}`);
      if (comparison.details.length > 0) {
        comparison.details.forEach(d => log(`  ${d}`));
      }
      log('');

      expect(comparison.match).toBe(true);
    });

    it('compares analytical vs numerical for nearly coplanar points', () => {
      log('');
      log('=== Coplanar Gradient (nearly coplanar) ===');
      log('');

      const p0Indices: [number, number, number] = [0, 1, 2];
      const p1Indices: [number, number, number] = [3, 4, 5];
      const p2Indices: [number, number, number] = [6, 7, 8];
      const p3Indices: [number, number, number] = [9, 10, 11];

      const provider = createCoplanarProvider('test-coplanar2', p0Indices, p1Indices, p2Indices, p3Indices);

      // Four points nearly coplanar (small deviation)
      const variables = [
        0, 0, 0,        // p0 at origin
        5, 0, 0,        // p1 along X
        0, 5, 0,        // p2 along Y
        2.5, 2.5, 0.1,  // p3 almost in the XY plane
      ];

      const residuals = provider.computeResiduals(variables);
      log(`Residuals: [${residuals.map(r => r.toFixed(6)).join(', ')}]`);

      const analyticalJ = provider.computeJacobian(variables);
      const numericalJ = computeNumericalJacobian(provider, variables);

      log('Analytical: ' + analyticalJ[0].map(v => v.toFixed(6)).join(', '));
      log('Numerical:  ' + numericalJ[0].map(v => v.toFixed(6)).join(', '));

      const comparison = compareJacobians(analyticalJ, numericalJ);
      log(`Match: ${comparison.match}, Max error: ${comparison.maxError.toExponential(4)}`);
      if (comparison.details.length > 0) {
        comparison.details.forEach(d => log(`  ${d}`));
      }
      log('');

      expect(comparison.match).toBe(true);
    });
  });
});
