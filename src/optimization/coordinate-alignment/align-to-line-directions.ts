import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';
import type { Line } from '../../entities/line';
import { quaternionMultiply, quaternionRotateVector, quaternionInverse, computeRotationBetweenVectors } from './quaternion-utils';
import { log } from '../optimization-logger';
import type { AlignmentQualityCallback, AlignmentResult } from './types';

/**
 * Align the scene to match line direction constraints.
 *
 * After Essential Matrix initialization, the scene is in an arbitrary coordinate frame.
 * If there are lines with direction constraints (x, y, z axis-aligned), we should rotate
 * the entire scene so those lines actually align with the specified axes.
 *
 * Algorithm:
 * 1. If one axis: align that axis line to its target
 * 2. If two axes: align the first, then rotate around it to best align the second
 * 3. If three axes: fully constrained (handle like two axes, third is automatic)
 *
 * The sign ambiguity (e.g., +Y vs -Y) is resolved by trying both and picking
 * the one with lower reprojection error.
 *
 * @param forceFirstAxisSign - If provided, forces the first axis alignment to use
 *   this sign ('positive' or 'negative') instead of auto-detecting. Used for retry
 *   when the initial alignment was ambiguous.
 */
export function alignSceneToLineDirections(
  cameras: Viewpoint[],
  allPoints: WorldPoint[],
  lines: Line[],
  usedEssentialMatrix: boolean = false,
  qualityCallback?: AlignmentQualityCallback,
  forceFirstAxisSign?: 'positive' | 'negative'
): AlignmentResult {
  // Helper to apply a rotation to the entire scene
  const applyRotation = (rotation: number[]) => {
    for (const cam of cameras) {
      const newPos = quaternionRotateVector(rotation, cam.position);
      const rotInverse = quaternionInverse(rotation);
      const newRot = quaternionMultiply(cam.rotation, rotInverse);
      cam.position = [newPos[0], newPos[1], newPos[2]];
      cam.rotation = [newRot[0], newRot[1], newRot[2], newRot[3]];
    }
    for (const wp of allPoints) {
      if (wp.optimizedXyz) {
        const newXyz = quaternionRotateVector(rotation, wp.optimizedXyz);
        wp.optimizedXyz = [newXyz[0], newXyz[1], newXyz[2]];
      }
    }
  };

  // Helper to compute current direction of an axis line (after rotations applied)
  const computeLineDirection = (line: Line): [number, number, number] | null => {
    const posA = line.pointA.optimizedXyz;
    const posB = line.pointB.optimizedXyz;
    if (!posA || !posB) return null;

    const direction: [number, number, number] = [
      posB[0] - posA[0],
      posB[1] - posA[1],
      posB[2] - posA[2]
    ];
    const length = Math.sqrt(direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2);
    if (length < 1e-6) return null;

    direction[0] /= length;
    direction[1] /= length;
    direction[2] /= length;
    return direction;
  };

  // Group axis lines by their target direction
  const axisLinesByDirection = new Map<string, { line: Line; targetAxis: [number, number, number] }[]>();

  for (const line of lines) {
    if (!line.direction || line.direction === 'free') continue;

    let targetAxis: [number, number, number] | null = null;
    switch (line.direction) {
      case 'x': targetAxis = [1, 0, 0]; break;
      case 'y': targetAxis = [0, 1, 0]; break;
      case 'z': targetAxis = [0, 0, 1]; break;
      default: continue; // Skip plane constraints for now
    }

    const posA = line.pointA.optimizedXyz;
    const posB = line.pointB.optimizedXyz;
    if (!posA || !posB) continue;

    const direction = computeLineDirection(line);
    if (!direction) continue;

    const existing = axisLinesByDirection.get(line.direction) || [];
    existing.push({ line, targetAxis });
    axisLinesByDirection.set(line.direction, existing);
  }

  if (axisLinesByDirection.size === 0) {
    return { success: false, ambiguous: false };
  }

  // Track if we couldn't determine the correct orientation
  let isAmbiguous = false;

  // Get unique axes in the order they first appear in lines (preserves iteration order
  // for backwards compatibility - old tests depend on this order)
  const presentAxes: string[] = [];
  for (const line of lines) {
    if (line.direction && ['x', 'y', 'z'].includes(line.direction) && !presentAxes.includes(line.direction)) {
      presentAxes.push(line.direction);
    }
  }

  // STEP 1: Align the first axis - try both sign options and pick the one with lower error
  const firstAxisKey = presentAxes[0];
  const firstAxisLines = axisLinesByDirection.get(firstAxisKey)!;
  const firstLine = firstAxisLines[0];
  const firstDirection = computeLineDirection(firstLine.line);

  if (!firstDirection) {
    return { success: false, ambiguous: false };
  }

  // Define positive and negative directions for alignment options
  const positiveDir: [number, number, number] = firstDirection;
  const negativeDir: [number, number, number] = [-firstDirection[0], -firstDirection[1], -firstDirection[2]];

  // Determine sign using dot-product as default
  const dotWithTarget =
    firstDirection[0] * firstLine.targetAxis[0] + firstDirection[1] * firstLine.targetAxis[1] + firstDirection[2] * firstLine.targetAxis[2];
  const dotPreferPositive = dotWithTarget >= 0;

  // For Essential Matrix cases, try both signs and pick based on locked point alignment
  let usePositive: boolean = dotPreferPositive;

  // If forced sign is specified, skip all auto-detection and use the forced value
  if (forceFirstAxisSign) {
    usePositive = forceFirstAxisSign === 'positive';
    log(`[Align] ${firstAxisKey}-axis: FORCED to ${forceFirstAxisSign}`);
  } else if (usedEssentialMatrix && presentAxes.length >= 2) {
    // For Essential Matrix with 2+ axis constraints, use the second axis to disambiguate the first.
    // After aligning the first axis, the second axis line should point in a consistent direction.
    // Try both signs and pick the one that gives better second-axis alignment.

    const secondAxisKey = presentAxes[1];
    const secondAxisLines = axisLinesByDirection.get(secondAxisKey)!;
    const secondLine = secondAxisLines[0];

    // Helper to compute how well the second axis aligns after first axis alignment
    const computeSecondAxisAlignment = (positive: boolean): number => {
      const savedCameras = cameras.map(c => ({ pos: [...c.position], rot: [...c.rotation] }));
      const savedPoints = allPoints.map(p => ({ xyz: p.optimizedXyz ? [...p.optimizedXyz] : undefined }));

      // Apply first axis alignment
      const dir = positive ? positiveDir : negativeDir;
      const rotation = computeRotationBetweenVectors(dir, firstLine.targetAxis);
      applyRotation(rotation);

      // Compute second axis direction after first alignment
      const secondDir = computeLineDirection(secondLine.line);
      let dotWithSecondTarget = 0;
      if (secondDir) {
        dotWithSecondTarget = secondDir[0] * secondLine.targetAxis[0] +
                              secondDir[1] * secondLine.targetAxis[1] +
                              secondDir[2] * secondLine.targetAxis[2];
      }

      // Restore
      cameras.forEach((c, i) => {
        c.position = savedCameras[i].pos as [number, number, number];
        c.rotation = savedCameras[i].rot as [number, number, number, number];
      });
      allPoints.forEach((p, i) => {
        p.optimizedXyz = savedPoints[i].xyz as [number, number, number] | undefined;
      });

      return dotWithSecondTarget;
    };

    const dotPosAlign = computeSecondAxisAlignment(true);
    const dotNegAlign = computeSecondAxisAlignment(false);

    // Check if the second-axis test is reliable:
    // If both dot products are near zero, the second axis line is nearly perpendicular
    // to its target axis, meaning triangulation is degenerate and we can't trust this heuristic.
    const bothDotsNearZero = Math.abs(dotPosAlign) < 0.5 && Math.abs(dotNegAlign) < 0.5;

    if (bothDotsNearZero && qualityCallback) {
      // Second axis is degenerate - triangulated direction is nearly perpendicular to target.
      // Try both orientations with actual solves and pick the better one.
      log(`[Align] ${firstAxisKey}-axis: EM second-axis degenerate (+dot=${dotPosAlign.toFixed(2)}, -dot=${dotNegAlign.toFixed(2)}), trying both with solves`);

      // Helper to save/restore state
      const saveState = () => ({
        cameras: cameras.map(c => ({ pos: [...c.position], rot: [...c.rotation] })),
        points: allPoints.map(p => ({ xyz: p.optimizedXyz ? [...p.optimizedXyz] : undefined }))
      });
      const restoreState = (state: ReturnType<typeof saveState>) => {
        cameras.forEach((c, i) => {
          c.position = state.cameras[i].pos as [number, number, number];
          c.rotation = state.cameras[i].rot as [number, number, number, number];
        });
        allPoints.forEach((p, i) => {
          p.optimizedXyz = state.points[i].xyz as [number, number, number] | undefined;
        });
      };

      // Helper to test an alignment
      const testAlignment = (positive: boolean, iterations: number): number => {
        const state = saveState();
        const dir = positive ? positiveDir : negativeDir;
        const rotation = computeRotationBetweenVectors(dir, firstLine.targetAxis);
        applyRotation(rotation);
        const error = qualityCallback(iterations);
        restoreState(state);
        return error;
      };

      // First pass: quick solve (30 iterations)
      let errorPositive = testAlignment(true, 30);
      let errorNegative = testAlignment(false, 30);
      log(`[Align] ${firstAxisKey}-axis: quick test: +err=${errorPositive.toFixed(2)}, -err=${errorNegative.toFixed(2)}`);

      // If errors are very similar (within 10%), run longer solves to differentiate
      const errorRatio = Math.min(errorPositive, errorNegative) / Math.max(errorPositive, errorNegative);
      if (errorRatio > 0.9) {
        log(`[Align] ${firstAxisKey}-axis: errors similar, running longer solves`);
        errorPositive = testAlignment(true, 300);
        errorNegative = testAlignment(false, 300);
        log(`[Align] ${firstAxisKey}-axis: long test: +err=${errorPositive.toFixed(2)}, -err=${errorNegative.toFixed(2)}`);

        // If still equal, try even longer (essentially full solves)
        const newRatio = Math.min(errorPositive, errorNegative) / Math.max(errorPositive, errorNegative);
        if (newRatio > 0.99) {
          log(`[Align] ${firstAxisKey}-axis: still equal, running full solves`);
          errorPositive = testAlignment(true, 500);
          errorNegative = testAlignment(false, 500);
          log(`[Align] ${firstAxisKey}-axis: full test: +err=${errorPositive.toFixed(2)}, -err=${errorNegative.toFixed(2)}`);
        }
      }

      // When errors are equal (or very close), the solver converges to the same state
      // for both orientations due to line direction constraints.
      const finalRatio = Math.min(errorPositive, errorNegative) / Math.max(errorPositive, errorNegative);
      if (finalRatio > 0.99) {
        // Errors are essentially equal - we can't determine the correct orientation.
        // Mark as ambiguous so the caller can try both full optimizations.
        isAmbiguous = true;
        // For now, just pick positive (will be overridden by caller if needed)
        usePositive = dotPreferPositive;
        log(`[Align] ${firstAxisKey}-axis: errors equal, AMBIGUOUS - caller should try both`);
      } else {
        usePositive = errorPositive < errorNegative;
        log(`[Align] ${firstAxisKey}-axis: chose ${usePositive ? '+' : '-'}${firstAxisKey.toUpperCase()} based on error (${errorPositive.toFixed(2)} vs ${errorNegative.toFixed(2)})`);
      }
    } else if (Math.abs(dotPosAlign - dotNegAlign) > 0.1 && !bothDotsNearZero) {
      // Pick the alignment where second axis has positive dot (doesn't need flip)
      usePositive = dotPosAlign > dotNegAlign;
      log(`[Align] ${firstAxisKey}-axis: EM second-axis test (${secondAxisKey}): +dot=${dotPosAlign.toFixed(2)}, -dot=${dotNegAlign.toFixed(2)} -> ${usePositive ? '+' : '-'}`);
    } else {
      // Second axis doesn't help - fall back to dot-product
      usePositive = dotPreferPositive;
      log(`[Align] ${firstAxisKey}-axis: EM second-axis inconclusive, dot=${dotWithTarget.toFixed(2)} -> ${usePositive ? '+' : '-'}`);
    }
  } else if (usedEssentialMatrix && qualityCallback) {
    // Single axis EM case with quality callback - test both orientations
    // This is needed because when an endpoint is set from inference (not triangulation),
    // the dot product will be 1.0 (already aligned) even though other points may be
    // in a completely different coordinate frame. Testing both signs with actual solves
    // lets us pick the better orientation.
    log(`[Align] ${firstAxisKey}-axis: EM single-axis (dot=${dotWithTarget.toFixed(2)}), testing both orientations`);

    const saveState = () => ({
      cameras: cameras.map(c => ({ pos: [...c.position], rot: [...c.rotation] })),
      points: allPoints.map(p => ({ xyz: p.optimizedXyz ? [...p.optimizedXyz] : undefined }))
    });
    const restoreState = (state: ReturnType<typeof saveState>) => {
      cameras.forEach((c, i) => {
        c.position = state.cameras[i].pos as [number, number, number];
        c.rotation = state.cameras[i].rot as [number, number, number, number];
      });
      allPoints.forEach((p, i) => {
        p.optimizedXyz = state.points[i].xyz as [number, number, number] | undefined;
      });
    };

    const testAlignment = (positive: boolean, iterations: number): number => {
      const state = saveState();
      const dir = positive ? positiveDir : negativeDir;
      const rotation = computeRotationBetweenVectors(dir, firstLine.targetAxis);
      applyRotation(rotation);
      const error = qualityCallback(iterations);
      restoreState(state);
      return error;
    };

    // Quick test first
    let errorPositive = testAlignment(true, 50);
    let errorNegative = testAlignment(false, 50);
    log(`[Align] ${firstAxisKey}-axis: quick test: +err=${errorPositive.toFixed(2)}, -err=${errorNegative.toFixed(2)}`);

    // If errors are similar, run longer tests
    const errorRatio = Math.min(errorPositive, errorNegative) / Math.max(errorPositive, errorNegative);
    if (errorRatio > 0.8) {
      errorPositive = testAlignment(true, 300);
      errorNegative = testAlignment(false, 300);
      log(`[Align] ${firstAxisKey}-axis: long test: +err=${errorPositive.toFixed(2)}, -err=${errorNegative.toFixed(2)}`);
    }

    const finalRatio = Math.min(errorPositive, errorNegative) / Math.max(errorPositive, errorNegative);
    if (finalRatio > 0.95) {
      isAmbiguous = true;
      usePositive = dotPreferPositive;
      log(`[Align] ${firstAxisKey}-axis: errors similar, AMBIGUOUS`);
    } else {
      usePositive = errorPositive < errorNegative;
      log(`[Align] ${firstAxisKey}-axis: chose ${usePositive ? '+' : '-'}${firstAxisKey.toUpperCase()} (${errorPositive.toFixed(2)} vs ${errorNegative.toFixed(2)})`);
    }
  } else if (usedEssentialMatrix) {
    // Single axis case without quality callback - use dot-product
    log(`[Align] ${firstAxisKey}-axis: EM single-axis, dot=${dotWithTarget.toFixed(2)} -> ${usePositive ? '+' : '-'}`);
  } else {
    // Non-EM case: use dot-product (standard case, works for VP initialization)
    log(`[Align] ${firstAxisKey}-axis: dot=${dotWithTarget.toFixed(2)} -> ${usePositive ? '+' : '-'}`);
  }

  // Apply the chosen alignment
  if (usePositive) {
    const rotationPositive = computeRotationBetweenVectors(positiveDir, firstLine.targetAxis);
    applyRotation(rotationPositive);
    log(`[Align] ${firstAxisKey}-axis: chose +${firstAxisKey.toUpperCase()}`);
  } else {
    const rotationNegative = computeRotationBetweenVectors(negativeDir, firstLine.targetAxis);
    applyRotation(rotationNegative);
    log(`[Align] ${firstAxisKey}-axis: chose -${firstAxisKey.toUpperCase()}`);
  }

  // Only first axis is aligned; the camera baseline heuristic below handles the remaining DoF.
  // Second axis alignment was tried but produced worse results — see git history.

  // Use camera baseline heuristic to resolve the remaining rotational DoF
  if (cameras.length >= 2) {
    const cam0Pos = cameras[0].position;
    const cam1Pos = cameras[1].position;
    const baseline = [cam1Pos[0] - cam0Pos[0], cam1Pos[1] - cam0Pos[1], cam1Pos[2] - cam0Pos[2]];
    const baselineLen = Math.sqrt(baseline[0] ** 2 + baseline[1] ** 2 + baseline[2] ** 2);

    if (baselineLen > 1e-6) {
      // Compute the component of baseline along the target axis
      const targetAxis = firstLine.targetAxis;
      const axialComponent = baseline[0] * targetAxis[0] + baseline[1] * targetAxis[1] + baseline[2] * targetAxis[2];

      // Compute the perpendicular component (in the plane perpendicular to the axis)
      const perpendicular = [
        baseline[0] - axialComponent * targetAxis[0],
        baseline[1] - axialComponent * targetAxis[1],
        baseline[2] - axialComponent * targetAxis[2]
      ];
      const perpLen = Math.sqrt(perpendicular[0] ** 2 + perpendicular[1] ** 2 + perpendicular[2] ** 2);

      // If there's significant perpendicular component, rotate around the axis to align it
      // with a "canonical" direction in that plane
      if (perpLen > baselineLen * 0.1) {
        // Choose canonical direction based on axis:
        // Y-axis: align perpendicular to X direction
        // Z-axis: align perpendicular to X direction
        // X-axis: align perpendicular to Y direction
        let canonicalDir: [number, number, number];
        if (targetAxis[1] > 0.9) {
          // Y-axis: canonical perpendicular is X
          canonicalDir = [1, 0, 0];
        } else if (targetAxis[2] > 0.9) {
          // Z-axis: canonical perpendicular is X
          canonicalDir = [1, 0, 0];
        } else {
          // X-axis: canonical perpendicular is Y
          canonicalDir = [0, 1, 0];
        }

        // Compute rotation around the target axis to align perpendicular with canonical
        const perpNorm = [perpendicular[0] / perpLen, perpendicular[1] / perpLen, perpendicular[2] / perpLen];

        // Project canonical onto the plane perpendicular to target axis
        const canonicalAxial = canonicalDir[0] * targetAxis[0] + canonicalDir[1] * targetAxis[1] + canonicalDir[2] * targetAxis[2];
        const canonicalPerp = [
          canonicalDir[0] - canonicalAxial * targetAxis[0],
          canonicalDir[1] - canonicalAxial * targetAxis[1],
          canonicalDir[2] - canonicalAxial * targetAxis[2]
        ];
        const canonicalPerpLen = Math.sqrt(canonicalPerp[0] ** 2 + canonicalPerp[1] ** 2 + canonicalPerp[2] ** 2);

        if (canonicalPerpLen > 0.1) {
          const canonicalPerpNorm = [canonicalPerp[0] / canonicalPerpLen, canonicalPerp[1] / canonicalPerpLen, canonicalPerp[2] / canonicalPerpLen];

          // Compute angle between perpNorm and canonicalPerpNorm
          const dot = perpNorm[0] * canonicalPerpNorm[0] + perpNorm[1] * canonicalPerpNorm[1] + perpNorm[2] * canonicalPerpNorm[2];
          const cross = [
            perpNorm[1] * canonicalPerpNorm[2] - perpNorm[2] * canonicalPerpNorm[1],
            perpNorm[2] * canonicalPerpNorm[0] - perpNorm[0] * canonicalPerpNorm[2],
            perpNorm[0] * canonicalPerpNorm[1] - perpNorm[1] * canonicalPerpNorm[0]
          ];

          // Check if cross product is aligned with target axis (determines rotation direction)
          const crossDotAxis = cross[0] * targetAxis[0] + cross[1] * targetAxis[1] + cross[2] * targetAxis[2];

          // Compute rotation angle
          let angle = Math.acos(Math.max(-1, Math.min(1, dot)));
          if (crossDotAxis < 0) {
            angle = -angle;
          }

          // Create rotation quaternion around target axis
          const halfAngle = angle / 2;
          const axisRotation: number[] = [
            Math.cos(halfAngle),
            Math.sin(halfAngle) * targetAxis[0],
            Math.sin(halfAngle) * targetAxis[1],
            Math.sin(halfAngle) * targetAxis[2]
          ];

          // Apply this additional rotation
          applyRotation(axisRotation);
        }
      }
    }
  }

  return { success: true, ambiguous: isAmbiguous };
}
