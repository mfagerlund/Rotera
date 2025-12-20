/**
 * Callback to test alignment quality by running a preliminary solve.
 * Takes maxIterations parameter and returns the residual (error) of the solve.
 */
export type AlignmentQualityCallback = (maxIterations: number) => number;

/**
 * Result of alignment that indicates whether the orientation is ambiguous.
 */
export interface AlignmentResult {
  success: boolean;
  /** If true, the alignment couldn't determine the correct orientation and both should be tried */
  ambiguous: boolean;
}
