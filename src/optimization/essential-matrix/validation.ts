/**
 * RANSAC-based validation and error computation for Essential Matrix estimation.
 */

import type { Correspondence, RansacResult } from './types';
import { estimateEssentialMatrix7Point } from './estimation';
import { decomposeEssentialMatrix, checkCheirality, isTranslationDegenerate } from './decomposition';
import { random } from '../seeded-random';

/**
 * Compute reprojection-based inlier count for a given R, t solution.
 * Uses the Sampson error (first-order approximation to geometric error).
 */
export function countInliersWithSampsonError(
  E: number[][],
  correspondences: Correspondence[],
  threshold: number = 0.01
): number {
  let inliers = 0;

  for (const c of correspondences) {
    const x1 = [c.x1, c.y1, 1];
    const x2 = [c.x2, c.y2, 1];

    // Compute Ex1
    const Ex1 = [
      E[0][0] * x1[0] + E[0][1] * x1[1] + E[0][2] * x1[2],
      E[1][0] * x1[0] + E[1][1] * x1[1] + E[1][2] * x1[2],
      E[2][0] * x1[0] + E[2][1] * x1[1] + E[2][2] * x1[2]
    ];

    // Compute E^T x2
    const Etx2 = [
      E[0][0] * x2[0] + E[1][0] * x2[1] + E[2][0] * x2[2],
      E[0][1] * x2[0] + E[1][1] * x2[1] + E[2][1] * x2[2],
      E[0][2] * x2[0] + E[1][2] * x2[1] + E[2][2] * x2[2]
    ];

    // x2^T * E * x1
    const x2tEx1 = x2[0] * Ex1[0] + x2[1] * Ex1[1] + x2[2] * Ex1[2];

    // Sampson error denominator
    const denom = Ex1[0] * Ex1[0] + Ex1[1] * Ex1[1] + Etx2[0] * Etx2[0] + Etx2[1] * Etx2[1];

    if (denom > 1e-10) {
      const sampsonError = (x2tEx1 * x2tEx1) / denom;
      if (sampsonError < threshold) {
        inliers++;
      }
    }
  }

  return inliers;
}

/**
 * Compute total Sampson error for an Essential Matrix.
 * Used as a tie-breaker when multiple solutions have the same inlier count.
 */
export function computeTotalSampsonError(
  E: number[][],
  correspondences: Correspondence[]
): number {
  let totalError = 0;

  for (const corr of correspondences) {
    const x1 = [corr.x1, corr.y1, 1];
    const x2 = [corr.x2, corr.y2, 1];

    // E * x1
    const Ex1 = [
      E[0][0] * x1[0] + E[0][1] * x1[1] + E[0][2] * x1[2],
      E[1][0] * x1[0] + E[1][1] * x1[1] + E[1][2] * x1[2],
      E[2][0] * x1[0] + E[2][1] * x1[1] + E[2][2] * x1[2]
    ];

    // E^T x2
    const Etx2 = [
      E[0][0] * x2[0] + E[1][0] * x2[1] + E[2][0] * x2[2],
      E[0][1] * x2[0] + E[1][1] * x2[1] + E[2][1] * x2[2],
      E[0][2] * x2[0] + E[1][2] * x2[1] + E[2][2] * x2[2]
    ];

    // x2^T * E * x1
    const x2tEx1 = x2[0] * Ex1[0] + x2[1] * Ex1[1] + x2[2] * Ex1[2];

    // Sampson error denominator
    const denom = Ex1[0] * Ex1[0] + Ex1[1] * Ex1[1] + Etx2[0] * Etx2[0] + Etx2[1] * Etx2[1];

    if (denom > 1e-10) {
      const sampsonError = (x2tEx1 * x2tEx1) / denom;
      totalError += sampsonError;
    }
  }

  return totalError;
}

/**
 * RANSAC-based Essential Matrix estimation using the 7-point algorithm.
 * Samples random 7-point subsets, estimates Essential Matrix candidates,
 * and selects the best non-degenerate solution based on inlier count.
 *
 * @param correspondences - All point correspondences
 * @param maxIterations - Maximum RANSAC iterations (default 100)
 * @param inlierThreshold - Sampson error threshold for inliers (default 0.01)
 * @returns Best Essential Matrix and its decomposition, or null if all solutions are degenerate
 */
export function ransacEssentialMatrix(
  correspondences: Correspondence[],
  maxIterations: number = 100,
  inlierThreshold: number = 0.01
): RansacResult | null {
  const n = correspondences.length;
  if (n < 7) {
    return null;
  }

  let bestResult: RansacResult | null = null;
  let bestScore = -1;

  // Helper to get random sample of indices
  const getRandomSample = (size: number, max: number): number[] => {
    const indices: number[] = [];
    while (indices.length < size) {
      const idx = Math.floor(random() * max);
      if (!indices.includes(idx)) {
        indices.push(idx);
      }
    }
    return indices;
  };

  let degenerateCount = 0;
  let totalCandidates = 0;

  // For small point counts, try all combinations exhaustively
  const useExhaustive = n <= 18;

  // Generate all combinations of 7 from n
  const allCombinations: number[][] = [];
  if (useExhaustive) {
    const generateCombinations = (start: number, combo: number[]) => {
      if (combo.length === 7) {
        allCombinations.push([...combo]);
        return;
      }
      for (let i = start; i < n; i++) {
        combo.push(i);
        generateCombinations(i + 1, combo);
        combo.pop();
      }
    };
    generateCombinations(0, []);
  }

  for (let iter = 0; iter < maxIterations; iter++) {
    // Sample 7 correspondences (exhaustively for small n, randomly for large n)
    let sampleIndices: number[];
    if (useExhaustive) {
      if (iter >= allCombinations.length) break; // Tried all combinations
      sampleIndices = allCombinations[iter];
    } else {
      sampleIndices = getRandomSample(7, n);
    }
    const sample = sampleIndices.map(i => correspondences[i]);

    // Estimate Essential Matrix candidates using 7-point algorithm
    let candidates: number[][][];
    try {
      candidates = estimateEssentialMatrix7Point(sample);
    } catch {
      continue;
    }

    totalCandidates += candidates.length;

    // Test each candidate
    for (const E of candidates) {
      // Decompose and test all 4 possible R, t combinations
      const decompositions = decomposeEssentialMatrix(E);

      for (const decomp of decompositions) {
        // Check for degenerate translation
        if (isTranslationDegenerate(decomp.t)) {
          degenerateCount++;
          continue;
        }

        // Count cheirality (points in front of both cameras)
        const cheiralityScore = checkCheirality(correspondences, decomp.R, decomp.t, false);

        // Skip if less than 50% pass cheirality
        if (cheiralityScore < n * 0.5) {
          continue;
        }

        // Count inliers using Sampson error
        const inlierCount = countInliersWithSampsonError(E, correspondences, inlierThreshold);

        // Compute total Sampson error for tie-breaking
        const totalError = computeTotalSampsonError(E, correspondences);

        // Combined score: prioritize cheirality, then inliers
        // Higher is better for cheirality and inliers
        const score = cheiralityScore * 1000 + inlierCount;

        // Update best if: better score, OR same score with lower error (tie-breaker)
        const currentBestResult = bestResult;
        const shouldUpdate = score > bestScore ||
          (score === bestScore && currentBestResult !== null && totalError < currentBestResult.totalError);

        if (shouldUpdate) {
          bestScore = score;
          bestResult = {
            E,
            R: decomp.R,
            t: decomp.t,
            inlierCount,
            cheiralityScore,
            totalError
          };
        }
      }
    }

    // Early termination only if we found a PERFECT solution (all points pass cheirality and are inliers)
    // With less than perfect, we want to keep searching for potentially better solutions
    const currentBest = bestResult;
    if (currentBest !== null && currentBest.cheiralityScore === n && currentBest.inlierCount === n) {
      // Only terminate early after testing a minimum number of candidates
      if (totalCandidates >= Math.min(n, 10)) {
        break;
      }
    }
  }

  return bestResult;
}
