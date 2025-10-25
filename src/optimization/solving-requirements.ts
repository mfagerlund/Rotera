import type { IViewpoint, IWorldPoint, ILine } from '../entities/interfaces';
import type { WorldPoint } from '../entities/world-point';
import type { Project } from '../entities/project';

export interface ViewpointPair {
  viewpoint1: IViewpoint;
  viewpoint2: IViewpoint;
  sharedWorldPoints: IWorldPoint[];
  fullyLockedSharedPoints: IWorldPoint[];
  hasScaleConstraint: boolean;
  scaleInfo?: {
    type: 'distance' | 'line';
    value: number;
    point1?: IWorldPoint;
    point2?: IWorldPoint;
    line?: ILine;
  };
}

export function findBestViewpointPair(project: Project): ViewpointPair | null {
  const viewpoints = Array.from(project.viewpoints);

  if (viewpoints.length < 2) {
    return null;
  }

  const pairs: ViewpointPair[] = [];

  for (let i = 0; i < viewpoints.length; i++) {
    for (let j = i + 1; j < viewpoints.length; j++) {
      const vp1 = viewpoints[i];
      const vp2 = viewpoints[j];

      const worldPointsInVp1 = new Set(
        Array.from(vp1.imagePoints).map(ip => ip.worldPoint)
      );
      const worldPointsInVp2 = new Set(
        Array.from(vp2.imagePoints).map(ip => ip.worldPoint)
      );

      const sharedWorldPoints = Array.from(worldPointsInVp1).filter(wp =>
        worldPointsInVp2.has(wp)
      );

      const fullyLockedSharedPoints = sharedWorldPoints.filter(wp =>
        (wp as WorldPoint).isFullyLocked()
      );

      let hasScaleConstraint = false;
      let scaleInfo: ViewpointPair['scaleInfo'] = undefined;

      if (fullyLockedSharedPoints.length >= 2) {
        const wp1 = fullyLockedSharedPoints[0];
        const wp2 = fullyLockedSharedPoints[1];
        if (wp1.lockedXyz && wp2.lockedXyz) {
          const dx = wp2.lockedXyz[0]! - wp1.lockedXyz[0]!;
          const dy = wp2.lockedXyz[1]! - wp1.lockedXyz[1]!;
          const dz = wp2.lockedXyz[2]! - wp1.lockedXyz[2]!;
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (distance > 0.001) {
            hasScaleConstraint = true;
            scaleInfo = {
              type: 'distance',
              value: distance,
              point1: wp1,
              point2: wp2
            };
          }
        }
      }

      if (!hasScaleConstraint) {
        for (const line of project.lines) {
          if (line.targetLength && line.targetLength > 0) {
            const pointsShared = sharedWorldPoints.includes(line.pointA) &&
                                 sharedWorldPoints.includes(line.pointB);
            if (pointsShared) {
              hasScaleConstraint = true;
              scaleInfo = {
                type: 'line',
                value: line.targetLength,
                line
              };
              break;
            }
          }
        }
      }

      pairs.push({
        viewpoint1: vp1,
        viewpoint2: vp2,
        sharedWorldPoints,
        fullyLockedSharedPoints,
        hasScaleConstraint,
        scaleInfo
      });
    }
  }

  const validPairs = pairs.filter(p =>
    p.sharedWorldPoints.length >= 2 && p.fullyLockedSharedPoints.length >= 1
  );

  if (validPairs.length === 0) {
    return null;
  }

  validPairs.sort((a, b) => {
    if (a.hasScaleConstraint !== b.hasScaleConstraint) {
      return a.hasScaleConstraint ? -1 : 1;
    }

    if (a.fullyLockedSharedPoints.length !== b.fullyLockedSharedPoints.length) {
      return b.fullyLockedSharedPoints.length - a.fullyLockedSharedPoints.length;
    }

    return b.sharedWorldPoints.length - a.sharedWorldPoints.length;
  });

  return validPairs[0];
}

export interface SolvingRequirements {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  bestPair?: ViewpointPair;
}

export function validateSolvingRequirements(project: Project): SolvingRequirements {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (project.viewpoints.size < 2) {
    errors.push('Need at least 2 viewpoints for solving');
  }

  const bestPair = findBestViewpointPair(project);

  if (!bestPair) {
    errors.push('No valid viewpoint pair found');
    errors.push('Requirements: at least 2 shared world points visible in 2 viewpoints');
    errors.push('Requirements: at least 1 fully locked shared world point');
    return {
      isValid: false,
      errors,
      warnings
    };
  }

  if (bestPair.sharedWorldPoints.length === 2) {
    warnings.push(`Minimum shared points (2) - results may be poor. Recommended: 3+ shared points`);
  }

  if (!bestPair.hasScaleConstraint) {
    warnings.push('No scale constraint found. Provide either:');
    warnings.push('  - Two fully locked world points shared between viewpoints, OR');
    warnings.push('  - A line with targetLength connecting two shared world points');
    warnings.push('Without scale constraint, the reconstruction scale will be arbitrary.');
  }

  return {
    isValid: true,
    errors,
    warnings,
    bestPair
  };
}
