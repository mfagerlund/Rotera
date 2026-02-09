/**
 * Centralized quality thresholds for optimization results.
 *
 * Quality is based on RMS reprojection error (in pixels).
 * RMS = sqrt(sum(pixel_error²) / count) where count = number of image point observations
 *
 * This metric:
 * - Doesn't grow with project size (normalized per observation)
 * - Is the industry standard for photogrammetry/camera calibration
 * - Is intuitive (always in pixels)
 */

/**
 * Quality thresholds in pixels for RMS reprojection error.
 * These values are based on typical photogrammetry standards.
 */
export const QUALITY_THRESHOLDS = {
  /** Survey-grade accuracy (sub-pixel) */
  SURVEY_GRADE: 0.3,
  /** Excellent accuracy for most applications */
  EXCELLENT: 0.5,
  /** Good accuracy, suitable for visualization */
  GOOD: 1.0,
  /** Acceptable but noticeable errors */
  ACCEPTABLE: 2.0,
  // Anything >= 2.0 is considered Poor
} as const;

/**
 * Quality level definitions with visual styling.
 */
export type QualityLevel = 'Survey-Grade' | 'Excellent' | 'Good' | 'Acceptable' | 'Poor' | 'Unknown';

export interface SolveQuality {
  label: QualityLevel;
  stars: 5 | 4 | 3 | 2 | 1 | 0;
  starDisplay: string;
  /** Muted color for text on badge backgrounds */
  color: string;
  /** Background color for badges */
  bgColor: string;
  /** Vivid color for standalone inline text */
  vividColor: string;
}

/**
 * Quality level definitions - single source of truth for styling.
 */
const QUALITY_LEVELS: Record<QualityLevel, Omit<SolveQuality, 'label'> & { label: QualityLevel }> = {
  'Survey-Grade': {
    label: 'Survey-Grade',
    stars: 5,
    starDisplay: '★★★★★',
    color: '#0d5929',      // Dark green text
    bgColor: '#c6efce',    // Light green background
    vividColor: '#27ae60', // Vivid green
  },
  'Excellent': {
    label: 'Excellent',
    stars: 4,
    starDisplay: '★★★★',
    color: '#155724',      // Green text
    bgColor: '#d4edda',    // Green background
    vividColor: '#2ecc71', // Vivid green
  },
  'Good': {
    label: 'Good',
    stars: 3,
    starDisplay: '★★★',
    color: '#1a5276',      // Blue text
    bgColor: '#d6eaf8',    // Blue background
    vividColor: '#3498db', // Vivid blue
  },
  'Acceptable': {
    label: 'Acceptable',
    stars: 2,
    starDisplay: '★★',
    color: '#856404',      // Yellow/amber text
    bgColor: '#fff3cd',    // Yellow background
    vividColor: '#f1c40f', // Vivid yellow
  },
  'Poor': {
    label: 'Poor',
    stars: 1,
    starDisplay: '★',
    color: '#721c24',      // Red text
    bgColor: '#f8d7da',    // Red background
    vividColor: '#e74c3c', // Vivid red
  },
  'Unknown': {
    label: 'Unknown',
    stars: 0,
    starDisplay: '?',
    color: '#666',
    bgColor: '#f0f0f0',
    vividColor: '#999',
  },
};

/**
 * Compute solve quality from RMS reprojection error.
 * CANONICAL function - use this everywhere, never duplicate the thresholds.
 *
 * @param rmsReprojError - RMS reprojection error in pixels (required)
 * @returns Quality assessment with stars, colors, and label
 */
export function getSolveQuality(rmsReprojError: number | undefined, residual?: number): SolveQuality {
  if (rmsReprojError === undefined || !isFinite(rmsReprojError)) {
    return { ...QUALITY_LEVELS['Unknown'] };
  }

  // Sanity check: rms ≈ 0 but high residual means degenerate solution (e.g., no points projected)
  if (residual !== undefined && rmsReprojError < 0.01 && residual > 100) {
    return { ...QUALITY_LEVELS['Poor'] };
  }

  if (rmsReprojError < QUALITY_THRESHOLDS.SURVEY_GRADE) {
    return { ...QUALITY_LEVELS['Survey-Grade'] };
  }
  if (rmsReprojError < QUALITY_THRESHOLDS.EXCELLENT) {
    return { ...QUALITY_LEVELS['Excellent'] };
  }
  if (rmsReprojError < QUALITY_THRESHOLDS.GOOD) {
    return { ...QUALITY_LEVELS['Good'] };
  }
  if (rmsReprojError < QUALITY_THRESHOLDS.ACCEPTABLE) {
    return { ...QUALITY_LEVELS['Acceptable'] };
  }
  return { ...QUALITY_LEVELS['Poor'] };
}

/**
 * Format RMS error for display.
 * @param rms - RMS reprojection error in pixels
 * @returns Formatted string like "0.56px"
 */
export function formatRmsError(rms: number | undefined): string {
  if (rms === undefined || !isFinite(rms)) {
    return '-';
  }
  return `${rms.toFixed(2)}px`;
}

/**
 * Render a quality badge component props.
 * Returns an object with all the styling info needed to render consistently.
 */
export function getQualityBadgeProps(rmsReprojError: number | undefined): {
  quality: SolveQuality;
  rmsDisplay: string;
} {
  return {
    quality: getSolveQuality(rmsReprojError),
    rmsDisplay: formatRmsError(rmsReprojError),
  };
}
