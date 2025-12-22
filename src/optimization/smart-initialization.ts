import type { Project } from '../entities/project'
import { random } from './seeded-random'

/**
 * Initialize world points with random positions.
 * Used by test data preparation utilities.
 */
export function randomInitialization(
  project: Project,
  sceneRadius: number = 10
): void {
  project.worldPoints.forEach(point => {
    if (!point.optimizedXyz) {
      point.optimizedXyz = [
        (random() - 0.5) * 2 * sceneRadius,
        (random() - 0.5) * 2 * sceneRadius,
        (random() - 0.5) * 2 * sceneRadius
      ];
    }
  });
}
