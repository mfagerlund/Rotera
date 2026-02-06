import type { Project } from '../entities/project'
import { createRng } from './seeded-random'

/**
 * Initialize world points with random positions.
 * Used by test data preparation utilities.
 */
export function randomInitialization(
  project: Project,
  sceneRadius: number = 10
): void {
  const rng = createRng(200);
  project.worldPoints.forEach(point => {
    if (!point.optimizedXyz) {
      point.optimizedXyz = [
        (rng.random() - 0.5) * 2 * sceneRadius,
        (rng.random() - 0.5) * 2 * sceneRadius,
        (rng.random() - 0.5) * 2 * sceneRadius
      ];
    }
  });
}
