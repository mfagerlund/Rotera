/**
 * Type definitions for the optimize-project module.
 */

import type { SolverResult, SolverOptions } from '../constraint-system';
import type { OutlierInfo } from '../outlier-detection';
import type { InferenceBranch } from '../inference-branching';

/**
 * Solve quality assessment based on total residual error.
 * This is the SINGLE SOURCE OF TRUTH for quality classification.
 */
export interface SolveQuality {
  label: 'Excellent' | 'Good' | 'Poor' | 'Unknown';
  stars: 3 | 2 | 1 | 0;
  starDisplay: '★★★' | '★★' | '★' | '?';
  /** Muted color for text on badge backgrounds */
  color: string;
  /** Background color for badges */
  bgColor: string;
  /** Vivid color for standalone inline text */
  vividColor: string;
}

/**
 * Compute solve quality from total residual error.
 * CANONICAL function - use this everywhere, never duplicate the thresholds.
 *
 * Thresholds:
 * - Excellent (★★★): error < 2.5
 * - Good (★★): error < 5
 * - Poor (★): error >= 5
 */
export function getSolveQuality(totalError: number | undefined): SolveQuality {
  if (totalError === undefined) {
    return { label: 'Unknown', stars: 0, starDisplay: '?', color: '#666', bgColor: '#f0f0f0', vividColor: '#999' };
  }
  if (totalError < 2.5) {
    return { label: 'Excellent', stars: 3, starDisplay: '★★★', color: '#155724', bgColor: '#d4edda', vividColor: '#2ecc71' };
  }
  if (totalError < 5) {
    return { label: 'Good', stars: 2, starDisplay: '★★', color: '#856404', bgColor: '#fff3cd', vividColor: '#f1c40f' };
  }
  return { label: 'Poor', stars: 1, starDisplay: '★', color: '#721c24', bgColor: '#f8d7da', vividColor: '#e74c3c' };
}

export interface OptimizeProjectOptions extends Omit<SolverOptions, 'optimizeCameraIntrinsics'> {
  autoInitializeCameras?: boolean;
  autoInitializeWorldPoints?: boolean;
  detectOutliers?: boolean;
  outlierThreshold?: number;
  /**
   * Optional async yield function called at phase boundaries to allow UI updates.
   * If provided, the optimizer becomes async and yields between phases.
   * The phase name is passed as a parameter.
   */
  yieldToUI?: (phase: string) => Promise<void>;
  /**
   * If true, optimize camera intrinsics for all cameras.
   * If false, keep intrinsics fixed.
   * If 'auto' (default), optimize intrinsics only for cameras without vanishing lines.
   */
  optimizeCameraIntrinsics?: boolean | 'auto';
  /**
   * If true (default), cameras initialized via vanishing points will have their
   * pose (position and rotation) locked during the final solve. VP initialization
   * provides accurate calibration that shouldn't be disturbed by less-constrained cameras.
   */
  lockVPCameras?: boolean;
  /**
   * If true (default), apply XY-plane reflection after solving if the result
   * is left-handed, to ensure right-handed coordinate system for Blender compatibility.
   * Set to false to preserve the original coordinate sign convention.
   */
  forceRightHanded?: boolean;
  /**
   * Maximum number of solve attempts with different random seeds.
   * If a solve fails (median error > 2px), retry with a new seed.
   * Default: 3. Set to 1 to disable multi-attempt solving.
   */
  maxAttempts?: number;
  /** @internal Skip branch testing (used during recursive branch attempts) */
  _skipBranching?: boolean;
  /** @internal The branch to apply (used during recursive branch attempts) */
  _branch?: InferenceBranch;
  /** @internal Current attempt number (used during recursive multi-attempt) */
  _attempt?: number;
  /** @internal Seed for this attempt (used during recursive multi-attempt) */
  _seed?: number;
  /** @internal Perturbation scale for camera positions (used on retry attempts) */
  _perturbCameras?: number;
  /** @internal Skip candidate testing (used during recursive calls) */
  _skipCandidateTesting?: boolean;
  /** @internal Force specific alignment sign (used during candidate testing) */
  _alignmentSign?: 'positive' | 'negative';
}

export interface OptimizeProjectResult extends SolverResult {
  camerasInitialized?: string[];
  camerasExcluded?: string[];
  outliers?: OutlierInfo[];
  medianReprojectionError?: number;
  solveTimeMs?: number;
  /** Solve quality assessment - computed by optimizer, use this instead of computing locally */
  quality: SolveQuality;
}
