import type { Project } from '../entities/project';
import type { Viewpoint } from '../entities/viewpoint';
import type { WorldPoint } from '../entities/world-point';
import { validateSolvingRequirements, type ViewpointPair } from './solving-requirements';
import { initializeCamerasWithEssentialMatrix } from './essential-matrix';
import { initializeWorldPoints } from './unified-initialization';

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

  const pointsArray = Array.from(project.worldPoints) as WorldPoint[];
  const linesArray = Array.from(project.lines);
  const constraintsArray = Array.from(project.constraints);

  initializeWorldPoints(pointsArray, linesArray, constraintsArray, {
    sceneScale: scaleBaseline,
    verbose: true
  });

  const triangulatedCount = pointsArray.filter(p => p.optimizedXyz !== null && p.optimizedXyz !== undefined).length;
  const failedCount = pointsArray.length - triangulatedCount;

  return {
    success: true,
    errors: requirements.errors,
    warnings: requirements.warnings,
    seedPair: bestPair,
    scaleBaseline,
    triangulatedPoints: triangulatedCount,
    failedPoints: failedCount
  };
}
