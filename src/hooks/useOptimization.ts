/**
 * Hook for running client-side constraint optimization
 * Connects ConstraintSystem to the UI layer
 */

import { useState, useCallback, useRef } from 'react';
import { ConstraintSystem, SolverResult } from '../optimization/constraint-system';
import { WorldPoint } from '../entities/world-point/WorldPoint';
import { Line } from '../entities/line/Line';
import { Viewpoint } from '../entities/viewpoint/Viewpoint';
import { Constraint } from '../entities/constraints/base-constraint';
import { optimizeProject, OptimizeProjectResult } from '../optimization/optimize-project';
import { Project } from '../entities/project';

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

  // Ref to track cancellation requests
  const cancelRequestedRef = useRef(false);

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
      viewpoints.forEach((v) => {
        system.addCamera(v);
        v.imagePoints.forEach((ip) => system.addImagePoint(ip));
      });
      constraints.forEach((c) => system.addConstraint(c));

      // Build value map
      const valueMap = {
        points: new Map(),
        cameras: new Map(),
      };

      points.forEach((p) => p.addToValueMap(valueMap));
      viewpoints.forEach((v) => {
        v.addToValueMap(valueMap, {
          optimizePose: !v.isPoseLocked,
          optimizeIntrinsics: false,
          optimizeDistortion: false,
        });
      });

      // Compute residuals for each constraint
      const residuals: ConstraintResidual[] = [];

      for (const constraint of constraints) {
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
        // Yield to event loop before starting heavy computation
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        // Check for cancellation before starting
        if (cancelRequestedRef.current) {
          const cancelledResult: OptimizeProjectResult = {
            converged: false,
            iterations: 0,
            residual: Infinity,
            error: 'Cancelled by user',
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

        const result = await new Promise<OptimizeProjectResult>((resolve, reject) => {
          // Use requestAnimationFrame to ensure UI updates before blocking
          requestAnimationFrame(() => {
            try {
              const solverResult = optimizeProject(project, {
                tolerance: options.tolerance ?? 1e-6,
                maxIterations: options.maxIterations ?? 500,
                damping: options.damping ?? 0.1,
                verbose: options.verbose ?? false,
                autoInitializeCameras: true,
                autoInitializeWorldPoints: true,
              });
              resolve(solverResult);
            } catch (error) {
              reject(error);
            }
          });
        });

        // Check for cancellation after optimization completes
        if (cancelRequestedRef.current) {
          const cancelledResult: OptimizeProjectResult = {
            converged: false,
            iterations: result.iterations,
            residual: result.residual,
            error: 'Cancelled by user',
          };
          setState({
            isRunning: false,
            currentIteration: result.iterations,
            currentResidual: result.residual,
            result: cancelledResult,
            constraintResiduals: [],
          });
          return cancelledResult;
        }

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
