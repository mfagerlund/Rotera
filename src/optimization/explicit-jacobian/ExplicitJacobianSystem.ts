/**
 * Explicit Jacobian System Implementation
 *
 * Aggregates multiple residual providers and builds the full Jacobian matrix.
 */

import {
  ExplicitJacobianSystem as IExplicitJacobianSystem,
  ResidualWithJacobian,
} from './types';

export class ExplicitJacobianSystemImpl implements IExplicitJacobianSystem {
  public variables: number[];
  public residualProviders: ResidualWithJacobian[];

  private _totalResiduals: number = 0;
  private _residualOffsets: Map<string, number> = new Map();

  constructor(initialVariables: number[] = []) {
    this.variables = [...initialVariables];
    this.residualProviders = [];
  }

  /**
   * Add a residual provider to the system
   */
  addResidualProvider(provider: ResidualWithJacobian): void {
    this._residualOffsets.set(provider.id, this._totalResiduals);
    this._totalResiduals += provider.residualCount;
    this.residualProviders.push(provider);
  }

  /**
   * Remove a residual provider by ID
   */
  removeResidualProvider(id: string): void {
    const index = this.residualProviders.findIndex((p) => p.id === id);
    if (index >= 0) {
      this.residualProviders.splice(index, 1);
      this._rebuildOffsets();
    }
  }

  /**
   * Rebuild residual offsets after modification
   */
  private _rebuildOffsets(): void {
    this._totalResiduals = 0;
    this._residualOffsets.clear();
    for (const provider of this.residualProviders) {
      this._residualOffsets.set(provider.id, this._totalResiduals);
      this._totalResiduals += provider.residualCount;
    }
  }

  get totalResiduals(): number {
    return this._totalResiduals;
  }

  get totalVariables(): number {
    return this.variables.length;
  }

  /**
   * Compute all residuals concatenated
   */
  computeAllResiduals(): number[] {
    const result: number[] = new Array(this._totalResiduals);
    let offset = 0;

    for (const provider of this.residualProviders) {
      const residuals = provider.computeResiduals(this.variables);
      for (let i = 0; i < residuals.length; i++) {
        result[offset + i] = residuals[i];
      }
      offset += provider.residualCount;
    }

    return result;
  }

  /**
   * Build the full Jacobian matrix (dense)
   * @returns Matrix of shape [totalResiduals x totalVariables]
   */
  computeFullJacobian(): number[][] {
    const m = this._totalResiduals;
    const n = this.variables.length;

    // Initialize with zeros
    const jacobian: number[][] = Array.from({ length: m }, () =>
      new Array(n).fill(0)
    );

    let residualOffset = 0;

    for (const provider of this.residualProviders) {
      const localJacobian = provider.computeJacobian(this.variables);
      const variableIndices = provider.variableIndices;

      // Copy local Jacobian to global Jacobian at correct positions
      for (let i = 0; i < localJacobian.length; i++) {
        const globalRow = residualOffset + i;
        for (let j = 0; j < variableIndices.length; j++) {
          const globalCol = variableIndices[j];
          jacobian[globalRow][globalCol] = localJacobian[i][j];
        }
      }

      residualOffset += provider.residualCount;
    }

    return jacobian;
  }

  /**
   * Get the offset of a residual provider's residuals in the full residual vector
   */
  getResidualOffset(providerId: string): number {
    return this._residualOffsets.get(providerId) ?? -1;
  }

  /**
   * Compute the sum of squared residuals (cost)
   */
  computeCost(): number {
    const residuals = this.computeAllResiduals();
    let sum = 0;
    for (const r of residuals) {
      sum += r * r;
    }
    return 0.5 * sum;
  }

  /**
   * Compute the RMS error
   */
  computeRMS(): number {
    const residuals = this.computeAllResiduals();
    if (residuals.length === 0) return 0;

    let sum = 0;
    for (const r of residuals) {
      sum += r * r;
    }
    return Math.sqrt(sum / residuals.length);
  }
}
