import { Value } from 'scalar-autograd';
import { transparentLM } from '../../autodiff-dense-lm';
import { createFixedPointProviders } from '../providers/fixed-point-provider';
import { AnalyticalResidualProvider } from '../types';

describe('Analytical Validation in transparentLM', () => {
  it('validates fixed-point constraint matches autodiff', () => {
    // Simple problem: find x such that x = 5
    // Residual: x - 5
    const target = 5;
    const initialValue = 10;

    const variables = [new Value(initialValue, 'x', true)];

    // Autodiff residual function
    const residualFn = (vars: Value[]) => [vars[0].sub(target)];

    // Analytical providers for the same constraint
    const providers = createFixedPointProviders(
      [0, -1, -1], // Only x is a variable (y, z locked)
      [target, 0, 0],
      (vars) => ({ x: vars[0], y: 0, z: 0 })
    );

    // Should not throw - validation passes
    const result = transparentLM(variables, residualFn, {
      analyticalProviders: providers,
      analyticalValidationTolerance: 1e-10,
      maxIterations: 100,
    });

    expect(result.success).toBe(true);
    expect(result.variableValues[0]).toBeCloseTo(target, 5);
  });

  it('validates multiple fixed-point constraints match autodiff', () => {
    // Problem: find (x, y, z) = (1, 2, 3)
    const target = [1, 2, 3];
    const initial = [10, 20, 30];

    const variables = initial.map((v, i) => new Value(v, `v${i}`, true));

    // Autodiff residual function: 3 residuals
    const residualFn = (vars: Value[]) => [
      vars[0].sub(target[0]),
      vars[1].sub(target[1]),
      vars[2].sub(target[2]),
    ];

    // Analytical providers
    const providers = createFixedPointProviders(
      [0, 1, 2],
      [target[0], target[1], target[2]],
      (vars) => ({ x: vars[0], y: vars[1], z: vars[2] })
    );

    const result = transparentLM(variables, residualFn, {
      analyticalProviders: providers,
      analyticalValidationTolerance: 1e-10,
      maxIterations: 100,
    });

    expect(result.success).toBe(true);
    expect(result.variableValues[0]).toBeCloseTo(target[0], 5);
    expect(result.variableValues[1]).toBeCloseTo(target[1], 5);
    expect(result.variableValues[2]).toBeCloseTo(target[2], 5);
  });

  it('throws on mismatch between autodiff and analytical', () => {
    // Create a provider that intentionally returns wrong gradient
    const wrongProvider: AnalyticalResidualProvider = {
      variableIndices: [0],
      computeResidual: (vars) => vars[0] - 5, // Correct residual
      computeGradient: () => new Float64Array([2]), // WRONG gradient (should be 1)
    };

    const variables = [new Value(10, 'x', true)];
    const residualFn = (vars: Value[]) => [vars[0].sub(5)];

    // Should throw because gradient is wrong
    expect(() => {
      transparentLM(variables, residualFn, {
        analyticalProviders: [wrongProvider],
        analyticalValidationTolerance: 1e-6,
        maxIterations: 10,
      });
    }).toThrow(/JtJ mismatch/);
  });

  it('throws on residual mismatch', () => {
    // Create a provider that returns wrong residual
    const wrongProvider: AnalyticalResidualProvider = {
      variableIndices: [0],
      computeResidual: () => 999, // WRONG residual
      computeGradient: () => new Float64Array([1]),
    };

    const variables = [new Value(10, 'x', true)];
    const residualFn = (vars: Value[]) => [vars[0].sub(5)]; // r = 5

    // Should throw because residual/cost is wrong
    expect(() => {
      transparentLM(variables, residualFn, {
        analyticalProviders: [wrongProvider],
        analyticalValidationTolerance: 1e-6,
        maxIterations: 10,
      });
    }).toThrow(/Cost mismatch/);
  });

  it('validates at every iteration', () => {
    // Use a larger tolerance and track iterations
    const target = 5;
    const variables = [new Value(100, 'x', true)]; // Far from target, needs multiple iterations

    const residualFn = (vars: Value[]) => [vars[0].sub(target)];

    const providers = createFixedPointProviders(
      [0, -1, -1],
      [target, 0, 0],
      (vars) => ({ x: vars[0], y: 0, z: 0 })
    );

    const result = transparentLM(variables, residualFn, {
      analyticalProviders: providers,
      analyticalValidationTolerance: 1e-10,
      maxIterations: 50,
      costTolerance: 1e-12, // Very tight to force more iterations
    });

    expect(result.success).toBe(true);
    // LM should converge quickly for this simple problem
    expect(result.iterations).toBeGreaterThan(0);
  });
});
