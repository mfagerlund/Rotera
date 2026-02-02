import {
  createFixedPointXProvider,
  createFixedPointYProvider,
  createFixedPointZProvider,
  createFixedPointProviders,
} from '../fixed-point-provider';
import { accumulateNormalEquations } from '../../accumulate-normal-equations';

describe('Fixed Point Providers', () => {
  describe('createFixedPointXProvider', () => {
    it('returns null for locked variable', () => {
      const provider = createFixedPointXProvider(-1, 5, () => 0);
      expect(provider).toBeNull();
    });

    it('computes correct residual', () => {
      const provider = createFixedPointXProvider(0, 5, (vars) => vars[0]);
      expect(provider).not.toBeNull();

      const variables = new Float64Array([7]); // x = 7, target = 5
      const residual = provider!.computeResidual(variables);
      expect(residual).toBe(2); // 7 - 5 = 2
    });

    it('computes correct gradient', () => {
      const provider = createFixedPointXProvider(0, 5, (vars) => vars[0]);
      expect(provider).not.toBeNull();

      const variables = new Float64Array([7]);
      const gradient = provider!.computeGradient(variables);

      expect(gradient.length).toBe(1);
      expect(gradient[0]).toBe(1); // d/dx (x - target) = 1
    });

    it('gradient matches numerical gradient', () => {
      const provider = createFixedPointXProvider(0, 5, (vars) => vars[0]);
      expect(provider).not.toBeNull();

      const x = 7;
      const h = 1e-7;
      const variables = new Float64Array([x]);
      const variablesPlus = new Float64Array([x + h]);

      const r = provider!.computeResidual(variables);
      const rPlus = provider!.computeResidual(variablesPlus);
      const numericalGrad = (rPlus - r) / h;

      const analyticalGrad = provider!.computeGradient(variables)[0];

      expect(analyticalGrad).toBeCloseTo(numericalGrad, 5);
    });
  });

  describe('createFixedPointYProvider', () => {
    it('computes correct residual and gradient', () => {
      const provider = createFixedPointYProvider(0, 3, (vars) => vars[0]);
      expect(provider).not.toBeNull();

      const variables = new Float64Array([10]); // y = 10, target = 3
      expect(provider!.computeResidual(variables)).toBe(7);
      expect(provider!.computeGradient(variables)[0]).toBe(1);
    });
  });

  describe('createFixedPointZProvider', () => {
    it('computes correct residual and gradient', () => {
      const provider = createFixedPointZProvider(0, -2, (vars) => vars[0]);
      expect(provider).not.toBeNull();

      const variables = new Float64Array([1]); // z = 1, target = -2
      expect(provider!.computeResidual(variables)).toBe(3);
      expect(provider!.computeGradient(variables)[0]).toBe(1);
    });
  });

  describe('createFixedPointProviders', () => {
    it('creates providers for all free coordinates', () => {
      const providers = createFixedPointProviders(
        [0, 1, 2], // All free
        [1, 2, 3], // Target
        (vars) => ({ x: vars[0], y: vars[1], z: vars[2] })
      );

      expect(providers.length).toBe(3);
    });

    it('skips locked coordinates', () => {
      const providers = createFixedPointProviders(
        [0, -1, 2], // Y is locked
        [1, 2, 3],
        (vars) => ({ x: vars[0], y: 999, z: vars[2] }) // Y is fixed at 999
      );

      expect(providers.length).toBe(2);
      expect(providers[0].variableIndices).toEqual([0]); // X
      expect(providers[1].variableIndices).toEqual([2]); // Z
    });

    it('returns empty array when all coordinates locked', () => {
      const providers = createFixedPointProviders(
        [-1, -1, -1], // All locked
        [1, 2, 3],
        () => ({ x: 1, y: 2, z: 3 })
      );

      expect(providers.length).toBe(0);
    });

    it('integrates with accumulateNormalEquations', () => {
      // Point at [5, 6, 7], target [1, 2, 3]
      // Residuals: [4, 4, 4], cost = 48
      const providers = createFixedPointProviders(
        [0, 1, 2],
        [1, 2, 3],
        (vars) => ({ x: vars[0], y: vars[1], z: vars[2] })
      );

      const variables = new Float64Array([5, 6, 7]);
      const result = accumulateNormalEquations(variables, providers, 3);

      expect(result.cost).toBe(48); // 4² + 4² + 4² = 48
      expect(result.residuals[0]).toBe(4);
      expect(result.residuals[1]).toBe(4);
      expect(result.residuals[2]).toBe(4);

      // J^T J is identity (each residual depends on one variable with gradient 1)
      expect(result.JtJ.get(0, 0)).toBe(1);
      expect(result.JtJ.get(1, 1)).toBe(1);
      expect(result.JtJ.get(2, 2)).toBe(1);
      expect(result.JtJ.get(0, 1)).toBe(0);

      // -J^T r = [-4, -4, -4] (descent direction)
      expect(result.negJtr[0]).toBe(-4);
      expect(result.negJtr[1]).toBe(-4);
      expect(result.negJtr[2]).toBe(-4);
    });
  });
});
