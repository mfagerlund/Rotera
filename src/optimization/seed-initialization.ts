import type { Project } from '../entities/project';
import type { Viewpoint } from '../entities/viewpoint';
import { validateSolvingRequirements, type ViewpointPair } from './solving-requirements';
import { triangulateSharedPoints } from './triangulation';
import { initializeCamerasWithEssentialMatrix } from './essential-matrix';

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

  const vp1 = bestPair.viewpoint1 as Viewpoint;
  const vp2 = bestPair.viewpoint2 as Viewpoint;

  const essentialMatrixResult = initializeCamerasWithEssentialMatrix(vp1, vp2, scaleBaseline);

  if (!essentialMatrixResult.success) {
    return {
      success: false,
      errors: [essentialMatrixResult.error || 'Essential matrix initialization failed'],
      warnings: requirements.warnings
    };
  }

  const cameraDistance = scaleBaseline;

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
