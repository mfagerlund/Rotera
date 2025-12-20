/**
 * Type definitions for Essential Matrix estimation.
 */

export interface Correspondence {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface EssentialMatrixResult {
  E: number[][];
  inliers: number[];
  numInliers: number;
}

export interface DecomposedEssentialMatrix {
  R: number[][];
  t: number[];
}

export interface CameraPose {
  position: number[];
  rotation: number[];
}

export interface RansacResult {
  E: number[][];
  R: number[][];
  t: number[];
  inlierCount: number;
  cheiralityScore: number;
  totalError: number;
}
