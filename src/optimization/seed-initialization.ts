import type { Project } from '../store/Project';
import { validateSolvingRequirements, type ViewpointPair } from './solving-requirements';
import { triangulateSharedPoints } from './triangulation';

export interface SeedInitializationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  seedPair?: ViewpointPair;
  scaleBaseline?: number;
  triangulatedPoints?: number;
  failedPoints?: number;
}

export function initializeFromImagePairs(
  project: Project,
  options: {
    baselineMultiplier?: number;
    cameraDistanceMultiplier?: number;
    cameraOffsetMultiplier?: number;
    defaultBaseline?: number;
  } = {}
): SeedInitializationResult {
  const {
    baselineMultiplier = 1.5,
    cameraDistanceMultiplier = 2.0,
    cameraOffsetMultiplier = 0.5,
    defaultBaseline = 10.0
  } = options;

  const requirements = validateSolvingRequirements(project);

  if (!requirements.isValid || !requirements.bestPair) {
    return {
      success: false,
      errors: requirements.errors,
      warnings: requirements.warnings
    };
  }

  const bestPair = requirements.bestPair;
  let scaleBaseline = defaultBaseline;

  if (bestPair.scaleInfo) {
    scaleBaseline = bestPair.scaleInfo.value * baselineMultiplier;
  }

  const cameraDistance = scaleBaseline * cameraDistanceMultiplier;
  const offset = scaleBaseline * cameraOffsetMultiplier;

  bestPair.viewpoint1.position = [offset, 0, -cameraDistance];
  bestPair.viewpoint1.rotation = [1, 0, 0, 0];

  bestPair.viewpoint2.position = [-offset, 0, -cameraDistance];
  bestPair.viewpoint2.rotation = [1, 0, 0, 0];

  const triangulationResult = triangulateSharedPoints(
    bestPair.sharedWorldPoints,
    bestPair.viewpoint1,
    bestPair.viewpoint2,
    cameraDistance
  );

  return {
    success: true,
    errors: requirements.errors,
    warnings: requirements.warnings,
    seedPair: bestPair,
    scaleBaseline,
    triangulatedPoints: triangulationResult.success,
    failedPoints: triangulationResult.failed
  };
}
