/**
 * Multi-attempt solving with different random seeds.
 * Tries different seeds when solve fails to escape local minima.
 */

import { Project } from '../../entities/project';
import { Viewpoint } from '../../entities/viewpoint';
import { log } from '../optimization-logger';
import { setSeed, random } from '../seeded-random';
import type { OptimizeProjectOptions, OptimizeProjectResult } from './types';

/**
 * Try different random seeds and return the best result.
 * Returns null if multi-attempt is disabled or not needed.
 */
export async function tryMultipleAttempts(
  project: Project,
  options: OptimizeProjectOptions,
  optimizeProject: (project: Project, options: OptimizeProjectOptions) => Promise<OptimizeProjectResult>
): Promise<OptimizeProjectResult | null> {
  const { maxAttempts = 3, _attempt = 0 } = options;

  // Only run multi-attempt at top level
  if (_attempt !== 0 || maxAttempts <= 1) {
    return null;
  }

  const GOOD_ENOUGH_THRESHOLD = 2.0;
  let bestResult: OptimizeProjectResult | null = null;
  let bestMedianError = Infinity;
  let bestSeed = 42;

  // Use reduced iterations for exploratory attempts
  // If an attempt is going to work, it will show progress within 200 iterations
  const exploratoryIterations = Math.min(options.maxIterations ?? 500, 200);

  // Try different seeds
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Use deterministic seeds: 42, 12345, 98765 (easily reproducible)
    const seed = attempt === 1 ? 42 : attempt === 2 ? 12345 : 98765 + attempt;

    // On retry attempts, add camera perturbation to escape local minima
    // This helps with degenerate Essential Matrix solutions where cameras collapse
    const perturbScale = attempt > 1 ? 0.5 * attempt : undefined;

    const attemptResult = await optimizeProject(project, {
      ...options,
      maxIterations: exploratoryIterations,
      maxAttempts: 1, // Disable recursion
      _attempt: attempt,
      _seed: seed,
      _perturbCameras: perturbScale,
    });

    const medianError = attemptResult.medianReprojectionError ?? Infinity;

    // Log attempt result
    if (maxAttempts > 1) {
      log(`[Attempt] #${attempt}/${maxAttempts}: seed=${seed}, median=${medianError.toFixed(1)}px`);
    }

    // If good enough, return immediately
    if (medianError < GOOD_ENOUGH_THRESHOLD) {
      log(`[Attempt] Selected #${attempt} (good enough: ${medianError.toFixed(1)}px < ${GOOD_ENOUGH_THRESHOLD}px)`);
      return attemptResult;
    }

    // Track best result
    if (medianError < bestMedianError) {
      bestMedianError = medianError;
      bestResult = attemptResult;
      bestSeed = seed;
    }
  }

  // Return best result if none were good enough
  if (bestResult) {
    log(`[Attempt] Selected best: seed=${bestSeed}, median=${bestMedianError.toFixed(1)}px`);
    return bestResult;
  }

  return null;
}

/**
 * Apply camera perturbation for retry attempts.
 * Helps escape degenerate local minima from Essential Matrix initialization.
 */
export function applyCameraPerturbation(
  project: Project,
  perturbScale: number | undefined,
  usedEssentialMatrix: boolean
): void {
  if (!perturbScale || !usedEssentialMatrix) {
    return;
  }

  const viewpointArray = Array.from(project.viewpoints) as Viewpoint[];

  for (const vp of viewpointArray) {
    // Add random perturbation to camera position (seeded for reproducibility)
    vp.position = [
      vp.position[0] + (random() - 0.5) * perturbScale,
      vp.position[1] + (random() - 0.5) * perturbScale,
      vp.position[2] + (random() - 0.5) * perturbScale,
    ];
  }
  log(`[Perturb] Applied camera position perturbation (scale=${perturbScale.toFixed(2)})`);
}

/**
 * Set the random seed for this solve attempt.
 */
export function setAttemptSeed(seed: number | undefined, attempt: number): void {
  if (seed !== undefined) {
    setSeed(seed);
  } else if (attempt === 0) {
    // First solve with default seed for reproducibility
    setSeed(42);
  }
}
