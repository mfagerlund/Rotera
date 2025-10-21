/**
 * Hook for running client-side constraint optimization
 * Connects ConstraintSystem to the UI layer
 */

import { useState, useCallback } from 'react';
import { ConstraintSystem, SolverResult } from '../optimization/constraint-system';
import { WorldPoint } from '../entities/world-point/WorldPoint';
import { Line } from '../entities/line/Line';
import { Viewpoint } from '../entities/viewpoint/Viewpoint';
import { Constraint } from '../entities/constraints/base-constraint';

type ConstraintId = string;

export interface OptimizationOptions {
  maxIterations?: number;
  tolerance?: number;
  damping?: number;
  verbose?: boolean;
}

export interface ConstraintResidual {
  constraintId: ConstraintId;
  residual: number;
  satisfied: boolean;
}

export interface OptimizationState {
  isRunning: boolean;
  currentIteration: number;
  currentResidual: number;
  result: SolverResult | null;
  constraintResiduals: ConstraintResidual[];
}

export const useOptimization = () => {
  const [state, setState] = useState<OptimizationState>({
    isRunning: false,
    currentIteration: 0,
    currentResidual: Infinity,
    result: null,
    constraintResiduals: [],
  });

  /**
   * Compute residuals for all constraints without optimizing
   */
  const computeResiduals = useCallback(
    (
      points: WorldPoint[],
      lines: Line[],
      viewpoints: Viewpoint[],
      constraints: Constraint[]
    ): ConstraintResidual[] => {
      const system = new ConstraintSystem({
        tolerance: 1e-6,
        maxIterations: 0, // Don't optimize, just evaluate
        verbose: false,
      });

      // Add entities
      points.forEach((p) => system.addPoint(p));
      lines.forEach((l) => system.addLine(l));
      viewpoints.forEach((v) => system.addCamera(v));
      constraints.forEach((c) => system.addConstraint(c));

      // Build value map
      const valueMap = {
        points: new Map(),
        cameras: new Map(),
      };

      points.forEach((p) => p.addToValueMap(valueMap));
      viewpoints.forEach((v) => {
        if ('addToValueMap' in v && typeof v.addToValueMap === 'function') {
          (v as any).addToValueMap(valueMap);
        }
      });

      // Compute residuals for each constraint
      const residuals: ConstraintResidual[] = [];

      for (const constraint of constraints) {
        if (!constraint.isEnabled) continue;

        const constraintResiduals = constraint.computeResiduals(valueMap);
        const residualMagnitude = Math.sqrt(
          constraintResiduals.reduce((sum, r) => sum + r.data ** 2, 0)
        );

        residuals.push({
          constraintId: constraint.getName(),
          residual: residualMagnitude,
          satisfied: residualMagnitude < 1e-6,
        });
      }

      return residuals;
    },
    []
  );

  /**
   * Run optimization to satisfy all constraints
   */
  const optimize = useCallback(
    async (
      points: WorldPoint[],
      lines: Line[],
      viewpoints: Viewpoint[],
      constraints: Constraint[],
      options: OptimizationOptions = {}
    ): Promise<SolverResult> => {
      setState((prev) => ({
        ...prev,
        isRunning: true,
        currentIteration: 0,
        currentResidual: Infinity,
      }));

      try {
        // Build constraint system
        const system = new ConstraintSystem({
          tolerance: options.tolerance ?? 1e-6,
          maxIterations: options.maxIterations ?? 100,
          damping: options.damping ?? 1e-3,
          verbose: options.verbose ?? false,
        });

        // Initialize optimizedXyz using smart initialization
        initializeWorldPoints(points, lines, constraints);

        // Add all entities
        points.forEach((p) => system.addPoint(p));
        lines.forEach((l) => system.addLine(l));
        viewpoints.forEach((v) => system.addCamera(v));
        constraints.forEach((c) => system.addConstraint(c));

        // Run optimization (this updates entity positions in-place)
        const result = await new Promise<SolverResult>((resolve) => {
          // Use setTimeout to allow UI to update
          setTimeout(() => {
            const solverResult = system.solve();
            resolve(solverResult);
          }, 0);
        });

        // Compute final residuals per constraint
        const constraintResiduals = computeResiduals(points, lines, viewpoints, constraints);

        setState({
          isRunning: false,
          currentIteration: result.iterations,
          currentResidual: result.residual,
          result,
          constraintResiduals,
        });

        return result;
      } catch (error) {
        const errorResult: SolverResult = {
          converged: false,
          iterations: 0,
          residual: Infinity,
          error: error instanceof Error ? error.message : 'Unknown error',
        };

        setState({
          isRunning: false,
          currentIteration: 0,
          currentResidual: Infinity,
          result: errorResult,
          constraintResiduals: [],
        });

        return errorResult;
      }
    },
    [computeResiduals]
  );

  return {
    ...state,
    optimize,
    computeResiduals,
  };
};
