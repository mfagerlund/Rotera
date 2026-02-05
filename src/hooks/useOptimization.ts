/**
 * Hook for running client-side constraint optimization
 * Connects ConstraintSystem to the UI layer
 */

import { useState, useCallback, useRef } from 'react';
import { SolverResult } from '../optimization/constraint-system';
import { WorldPoint } from '../entities/world-point/WorldPoint';
import { Line } from '../entities/line/Line';
import { Viewpoint } from '../entities/viewpoint/Viewpoint';
import { Constraint } from '../entities/constraints/base-constraint';
import { optimizeProject, OptimizeProjectResult, getSolveQuality } from '../optimization/optimize-project';
import { Project } from '../entities/project';

type ConstraintId = string;

export interface OptimizationOptions {
  maxIterations?: number;
  tolerance?: number;
  damping?: number;
  verbose?: boolean;
  /** Optional callback for UI updates between phases */
  yieldToUI?: (phase: string) => Promise<void>;
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

  // Ref to track cancellation requests
  const cancelRequestedRef = useRef(false);

  /**
   * Get residuals for all constraints from their lastResiduals field.
   * Residuals are populated during optimization via analytical providers.
   */
  const computeResiduals = useCallback(
    (
      _points: WorldPoint[],
      _lines: Line[],
      _viewpoints: Viewpoint[],
      constraints: Constraint[]
    ): ConstraintResidual[] => {
      // Read residuals from each constraint's lastResiduals field
      // (populated during optimization by distributeResiduals)
      const residuals: ConstraintResidual[] = [];

      for (const constraint of constraints) {
        const lastResiduals = constraint.lastResiduals || [];
        const residualMagnitude = Math.sqrt(
          lastResiduals.reduce((sum, r) => sum + r ** 2, 0)
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
      project: Project,
      options: OptimizationOptions = {}
    ): Promise<OptimizeProjectResult> => {
      cancelRequestedRef.current = false;

      setState((prev) => ({
        ...prev,
        isRunning: true,
        currentIteration: 0,
        currentResidual: Infinity,
      }));

      try {
        // Check for cancellation before starting
        if (cancelRequestedRef.current) {
          const cancelledResult: OptimizeProjectResult = {
            converged: false,
            iterations: 0,
            residual: Infinity,
            error: 'Cancelled by user',
            quality: getSolveQuality(undefined),
          };
          setState({
            isRunning: false,
            currentIteration: 0,
            currentResidual: Infinity,
            result: cancelledResult,
            constraintResiduals: [],
          });
          return cancelledResult;
        }

        // Run optimization with optional UI yield callback
        const result = await optimizeProject(project, {
          tolerance: options.tolerance ?? 1e-6,
          maxIterations: options.maxIterations ?? 500,
          damping: options.damping ?? 0.1,
          verbose: options.verbose ?? false,
          autoInitializeCameras: true,
          autoInitializeWorldPoints: true,
          yieldToUI: options.yieldToUI,
        });

        const points = Array.from(project.worldPoints);
        const lines = Array.from(project.lines);
        const viewpoints = Array.from(project.viewpoints);
        const constraints = Array.from(project.constraints);
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
        const errorResult: OptimizeProjectResult = {
          converged: false,
          iterations: 0,
          residual: Infinity,
          error: error instanceof Error ? error.message : 'Unknown error',
          quality: getSolveQuality(undefined),
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

  /**
   * Request cancellation of the running optimization.
   * Note: The optimization runs synchronously in the main thread,
   * so cancellation will only take effect after the current solve completes.
   */
  const cancel = useCallback(() => {
    cancelRequestedRef.current = true;
  }, []);

  return {
    ...state,
    optimize,
    cancel,
    computeResiduals,
  };
};
