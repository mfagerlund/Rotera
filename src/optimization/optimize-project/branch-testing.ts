/**
 * Branch-first optimization logic.
 * Handles inference branch generation and testing to find the best solution.
 */

import { Project } from '../../entities/project';
import { WorldPoint } from '../../entities/world-point';
import { generateAllInferenceBranches } from '../inference-branching';
import { log } from '../optimization-logger';
import type { OptimizeProjectOptions, OptimizeProjectResult } from './types';

/**
 * Test all inference branches and return the best result.
 * Returns null if no branching is needed (single branch).
 */
export async function testInferenceBranches(
  project: Project,
  options: OptimizeProjectOptions,
  optimizeProject: (project: Project, options: OptimizeProjectOptions) => Promise<OptimizeProjectResult>
): Promise<OptimizeProjectResult | null> {
  const { _skipBranching = false } = options;

  if (_skipBranching) {
    return null;
  }

  const branches = generateAllInferenceBranches(project);

  if (branches.length <= 1) {
    return null;
  }

  log(`[Branch] Found ${branches.length} inference branches - testing each from scratch`);

  // Save deterministic inferredXyz values BEFORE branching overwrites them
  project.propagateInferences();
  const savedDeterministicInferred = new Map<WorldPoint, [number | null, number | null, number | null]>();
  for (const wp of project.worldPoints) {
    const point = wp as WorldPoint;
    savedDeterministicInferred.set(point, [...point.inferredXyz] as [number | null, number | null, number | null]);
  }

  let bestResult: OptimizeProjectResult | null = null;
  let bestMedianError = Infinity;
  const GOOD_ENOUGH_THRESHOLD = 2.0;

  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i];
    const choiceStr = branch.choices.length > 0 ? branch.choices.join(', ') : 'default';

    // Run full optimization with this branch
    const branchResult = await optimizeProject(project, {
      ...options,
      _skipBranching: true,
      _branch: branch,
      verbose: false,
    });

    const medianError = branchResult.medianReprojectionError ?? Infinity;
    log(`[Branch] #${i + 1}: median=${medianError.toFixed(1)}px, choices=[${choiceStr}]`);

    if (medianError < GOOD_ENOUGH_THRESHOLD) {
      log(`[Branch] Selected #${i + 1} (good enough: ${medianError.toFixed(1)}px < ${GOOD_ENOUGH_THRESHOLD}px)`);
      // Restore deterministic inferred values
      for (const [point, inferred] of savedDeterministicInferred) {
        point.inferredXyz = inferred;
      }
      return branchResult;
    }

    if (medianError < bestMedianError) {
      bestMedianError = medianError;
      bestResult = branchResult;
    }
  }

  if (bestResult) {
    log(`[Branch] Selected best: median=${bestMedianError.toFixed(1)}px`);
    // Restore deterministic inferred values
    for (const [point, inferred] of savedDeterministicInferred) {
      point.inferredXyz = inferred;
    }
    return bestResult;
  }

  return null;
}
