import { accumulateNormalEquations } from '../accumulate-normal-equations';
import { AnalyticalResidualProvider } from '../types';

describe('accumulateNormalEquations', () => {
  it('computes correct J^T J and J^T r for single variable', () => {
    // Residual: r = x - 3, gradient: dr/dx = 1
    // J = [1], J^T J = [1], J^T r = [r] = [x - 3]
    const provider: AnalyticalResidualProvider = {
      variableIndices: [0],
      computeResidual: (vars) => vars[0] - 3,
      computeGradient: () => new Float64Array([1]),
    };

    const variables = new Float64Array([5]); // x = 5, so r = 2
    const result = accumulateNormalEquations(variables, [provider], 1);

    expect(result.cost).toBe(4); // r² = 4
    expect(result.residuals[0]).toBe(2); // r = 5 - 3 = 2

    // J^T J should be [[1]]
    expect(result.JtJ.get(0, 0)).toBe(1);

    // -J^T r should be [-2] (negative for descent)
    expect(result.negJtr[0]).toBe(-2);
  });

  it('computes correct J^T J for two residuals sharing a variable', () => {
    // r1 = x - 1, gradient: [1]
    // r2 = x - 4, gradient: [1]
    // J = [[1], [1]], J^T J = [[2]], J^T r = [r1 + r2]
    const provider1: AnalyticalResidualProvider = {
      variableIndices: [0],
      computeResidual: (vars) => vars[0] - 1,
      computeGradient: () => new Float64Array([1]),
    };
    const provider2: AnalyticalResidualProvider = {
      variableIndices: [0],
      computeResidual: (vars) => vars[0] - 4,
      computeGradient: () => new Float64Array([1]),
    };

    const variables = new Float64Array([2]); // x = 2
    // r1 = 1, r2 = -2
    const result = accumulateNormalEquations(variables, [provider1, provider2], 1);

    expect(result.cost).toBe(1 + 4); // 1² + (-2)² = 5
    expect(result.residuals[0]).toBe(1);
    expect(result.residuals[1]).toBe(-2);

    // J^T J = [[1*1 + 1*1]] = [[2]]
    expect(result.JtJ.get(0, 0)).toBe(2);

    // -J^T r = -[1*1 + 1*(-2)] = -[-1] = 1
    expect(result.negJtr[0]).toBe(1);
  });

  it('computes correct J^T J for multi-variable residual', () => {
    // Residual: r = 2x + 3y - 10
    // Gradient: [2, 3]
    // J = [[2, 3]]
    // J^T J = [[4, 6], [6, 9]]
    const provider: AnalyticalResidualProvider = {
      variableIndices: [0, 1],
      computeResidual: (vars) => 2 * vars[0] + 3 * vars[1] - 10,
      computeGradient: () => new Float64Array([2, 3]),
    };

    const variables = new Float64Array([1, 2]); // x=1, y=2, r = 2+6-10 = -2
    const result = accumulateNormalEquations(variables, [provider], 2);

    expect(result.cost).toBe(4); // (-2)² = 4
    expect(result.residuals[0]).toBe(-2);

    // J^T J = [[2*2, 2*3], [3*2, 3*3]] = [[4, 6], [6, 9]]
    expect(result.JtJ.get(0, 0)).toBe(4);
    expect(result.JtJ.get(0, 1)).toBe(6);
    expect(result.JtJ.get(1, 0)).toBe(6);
    expect(result.JtJ.get(1, 1)).toBe(9);

    // -J^T r = -[[2], [3]] * (-2) = [4, 6]
    expect(result.negJtr[0]).toBe(4);
    expect(result.negJtr[1]).toBe(6);
  });

  it('handles non-contiguous variable indices', () => {
    // Variables at indices 1 and 3 (not 0 and 1)
    // Residual: r = x1 - x3
    // Gradient w.r.t. [x1, x3]: [1, -1]
    const provider: AnalyticalResidualProvider = {
      variableIndices: [1, 3],
      computeResidual: (vars) => vars[1] - vars[3],
      computeGradient: () => new Float64Array([1, -1]),
    };

    const variables = new Float64Array([0, 5, 0, 2]); // x1=5, x3=2, r=3
    const result = accumulateNormalEquations(variables, [provider], 4);

    expect(result.cost).toBe(9); // 3² = 9

    // J^T J contributions at (1,1), (1,3), (3,1), (3,3)
    expect(result.JtJ.get(1, 1)).toBe(1); // 1*1
    expect(result.JtJ.get(1, 3)).toBe(-1); // 1*(-1)
    expect(result.JtJ.get(3, 1)).toBe(-1); // (-1)*1
    expect(result.JtJ.get(3, 3)).toBe(1); // (-1)*(-1)

    // No contributions at 0 or 2
    expect(result.JtJ.get(0, 0)).toBe(0);
    expect(result.JtJ.get(2, 2)).toBe(0);
  });

  it('skips locked variables (index -1)', () => {
    // Variable 0 is free, variable 1 is locked (index -1)
    // Only contributes to (0,0)
    const provider: AnalyticalResidualProvider = {
      variableIndices: [0, -1],
      computeResidual: (vars) => vars[0] - 5, // Uses only free variable
      computeGradient: () => new Float64Array([1, 2]), // Gradient for both, but -1 is skipped
    };

    const variables = new Float64Array([3]); // Only 1 free variable
    const result = accumulateNormalEquations(variables, [provider], 1);

    expect(result.residuals[0]).toBe(-2); // 3 - 5 = -2
    expect(result.cost).toBe(4);

    // Only (0,0) gets contribution from gradient[0]=1
    expect(result.JtJ.get(0, 0)).toBe(1);

    // -J^T r = -[1 * (-2)] = 2
    expect(result.negJtr[0]).toBe(2);
  });

  it('handles empty providers list', () => {
    const variables = new Float64Array([1, 2, 3]);
    const result = accumulateNormalEquations(variables, [], 3);

    expect(result.cost).toBe(0);
    expect(result.residuals.length).toBe(0);
    expect(result.JtJ.nonZeroCount).toBe(0);
    expect(result.negJtr.every((v) => v === 0)).toBe(true);
  });

  it('accumulates multiple providers correctly', () => {
    // Two residuals on different variables
    // r1 = x0 - 1 (at x0=2: r1=1)
    // r2 = x1 - 3 (at x1=5: r2=2)
    const provider1: AnalyticalResidualProvider = {
      variableIndices: [0],
      computeResidual: (vars) => vars[0] - 1,
      computeGradient: () => new Float64Array([1]),
    };
    const provider2: AnalyticalResidualProvider = {
      variableIndices: [1],
      computeResidual: (vars) => vars[1] - 3,
      computeGradient: () => new Float64Array([1]),
    };

    const variables = new Float64Array([2, 5]);
    const result = accumulateNormalEquations(variables, [provider1, provider2], 2);

    expect(result.cost).toBe(1 + 4); // 1² + 2² = 5

    // J^T J is diagonal: [[1, 0], [0, 1]]
    expect(result.JtJ.get(0, 0)).toBe(1);
    expect(result.JtJ.get(0, 1)).toBe(0);
    expect(result.JtJ.get(1, 0)).toBe(0);
    expect(result.JtJ.get(1, 1)).toBe(1);

    // -J^T r = [-1, -2]
    expect(result.negJtr[0]).toBe(-1);
    expect(result.negJtr[1]).toBe(-2);
  });
});
