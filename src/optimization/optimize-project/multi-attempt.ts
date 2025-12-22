/**
 * Utilities for multi-attempt solving.
 * Camera perturbation and seed management for candidate testing.
 */

import { Project } from '../../entities/project';
import { Viewpoint } from '../../entities/viewpoint';
import { log } from '../optimization-logger';
import { setSeed, random } from '../seeded-random';

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
