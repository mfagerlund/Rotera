/**
 * Initialization strategy types and viability checks.
 *
 * Instead of the orchestrator picking ONE strategy via an if/else cascade,
 * we enumerate all viable strategies and let the candidate testing system
 * probe each one. The best strategy wins based on objective residual scoring.
 */

import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';
import { canInitializeWithVanishingPoints } from '../vanishing-points';
import { getConstrainedPointCount, countSharedPoints } from './helpers';

export type InitStrategyId = 'vp-pnp' | 'stepped-vp' | 'essential-matrix' | 'late-pnp-only';

export interface InitStrategy {
  id: InitStrategyId;
  description: string;
  /** Only EM has alignment sign ambiguity */
  hasAlignmentAmbiguity: boolean;
  /** VP-based strategies are deterministic from geometry, not seed */
  isDeterministic: boolean;
}

export const STRATEGIES: Record<InitStrategyId, InitStrategy> = {
  'vp-pnp': {
    id: 'vp-pnp',
    description: 'VP + PnP',
    hasAlignmentAmbiguity: false,
    isDeterministic: true,
  },
  'stepped-vp': {
    id: 'stepped-vp',
    description: 'Stepped VP',
    hasAlignmentAmbiguity: false,
    isDeterministic: true,
  },
  'essential-matrix': {
    id: 'essential-matrix',
    description: 'Essential Matrix',
    hasAlignmentAmbiguity: true,
    isDeterministic: false,
  },
  'late-pnp-only': {
    id: 'late-pnp-only',
    description: 'Late PnP only',
    hasAlignmentAmbiguity: false,
    isDeterministic: true,
  },
};

export interface ViabilityInput {
  uninitializedCameras: Viewpoint[];
  worldPoints: Set<WorldPoint>;
  lockedPoints: WorldPoint[];
  canAnyUseVPStrict: boolean;
  canAnyUseVPRelaxed: boolean;
}

/**
 * Determine which initialization strategies are viable for the given scene.
 * Conditions are extracted from the current orchestrator's if/else tree.
 */
export function getViableStrategies(input: ViabilityInput): InitStrategyId[] {
  const { uninitializedCameras, worldPoints, lockedPoints, canAnyUseVPStrict, canAnyUseVPRelaxed } = input;
  const cameraCount = uninitializedCameras.length;
  const lockedCount = lockedPoints.length;
  const canAnyUseVP = canAnyUseVPStrict || canAnyUseVPRelaxed;

  const viable: InitStrategyId[] = [];

  // vp-pnp: Current tier 1 condition (orchestrator line 64)
  // lockedPoints >= 2 OR canAnyUseVP OR (single camera AND 1+ locked point)
  if (lockedCount >= 2 || canAnyUseVP || (cameraCount === 1 && lockedCount >= 1)) {
    viable.push('vp-pnp');
  }

  // stepped-vp: Current tier 2 condition (orchestrator line 90)
  // cameras >= 2 AND canAnyUseVPRelaxed AND lockedPoints >= 1
  if (cameraCount >= 2 && canAnyUseVPRelaxed && lockedCount >= 1) {
    viable.push('stepped-vp');
  }

  // essential-matrix: Current tier 3 multi-camera path
  // cameras >= 2 AND first two cameras share 7+ points
  if (cameraCount >= 2) {
    const sharedCount = countSharedPoints(uninitializedCameras[0], uninitializedCameras[1]);
    if (sharedCount >= 7) {
      viable.push('essential-matrix');
    }
  }

  // late-pnp-only: Current tier 3 single-camera path (orchestrator line 111-112)
  // single camera AND has constrained points visible
  if (cameraCount === 1 && getConstrainedPointCount(uninitializedCameras[0]) > 0) {
    viable.push('late-pnp-only');
  }

  return viable;
}
