/**
 * Outlier detection for optimization results.
 * Identifies image points with unusually high reprojection errors.
 */

import { Project } from '../entities/project';
import { ImagePoint } from '../entities/imagePoint';

export interface OutlierInfo {
  imagePoint: ImagePoint;
  error: number;
  worldPointName: string;
  viewpointName: string;
}

/**
 * Detect outliers based on reprojection error relative to median.
 *
 * @param project The project to analyze
 * @param threshold Multiplier for median error to determine outlier threshold
 * @param viewpoints Optional array of viewpoints to analyze. If not provided, uses all enabled viewpoints.
 * @returns Object containing outliers array, error statistics, and actual threshold used
 */
export function detectOutliers(
  project: Project,
  threshold: number,
  viewpoints?: import('../entities/viewpoint').Viewpoint[]
): { outliers: OutlierInfo[]; medianError: number; meanError: number; rmsError: number; actualThreshold: number } {
  const errors: number[] = [];
  const imagePointErrors: Array<{ imagePoint: ImagePoint; error: number }> = [];

  // Use provided viewpoints or filter to enabled ones
  const vpsToAnalyze = viewpoints ?? Array.from(project.viewpoints).filter(vp => vp.enabledInSolve);

  for (const vp of vpsToAnalyze) {
    for (const ip of vp.imagePoints) {
      const ipConcrete = ip as ImagePoint;
      if (ipConcrete.lastResiduals && ipConcrete.lastResiduals.length === 2) {
        const error = Math.sqrt(ipConcrete.lastResiduals[0] ** 2 + ipConcrete.lastResiduals[1] ** 2);
        errors.push(error);
        imagePointErrors.push({ imagePoint: ipConcrete, error });
      }
    }
  }

  errors.sort((a, b) => a - b);
  const medianError = errors.length > 0 ? errors[Math.floor(errors.length / 2)] : 0;

  // Compute mean and RMS (more sensitive to outliers than median)
  const sumError = errors.reduce((sum, e) => sum + e, 0);
  const sumSquaredError = errors.reduce((sum, e) => sum + e * e, 0);
  const meanError = errors.length > 0 ? sumError / errors.length : 0;
  const rmsError = errors.length > 0 ? Math.sqrt(sumSquaredError / errors.length) : 0;

  const outlierThreshold = medianError < 20
    ? Math.max(threshold * medianError, 50)
    : Math.min(threshold * medianError, 80);

  const outliers: OutlierInfo[] = [];
  for (const { imagePoint, error } of imagePointErrors) {
    if (error > outlierThreshold) {
      outliers.push({
        imagePoint,
        error,
        worldPointName: imagePoint.worldPoint.getName(),
        viewpointName: imagePoint.viewpoint.getName(),
      });
    }
  }

  outliers.sort((a, b) => b.error - a.error);

  return { outliers, medianError, meanError, rmsError, actualThreshold: outlierThreshold };
}
