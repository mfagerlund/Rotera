/**
 * Helper functions for initialization phases in optimization.
 * Extracts common patterns for scale, translation, and degenerate case handling.
 */

import { Viewpoint } from '../entities/viewpoint';
import { WorldPoint } from '../entities/world-point';
import { ImagePoint } from '../entities/imagePoint';
import { Line } from '../entities/line';
import { log } from './optimization-logger';

/**
 * Apply scale from axis-constrained lines with target lengths.
 * Only uses lines with triangulated endpoints (not inferred).
 *
 * @param lines Lines to check for scale computation
 * @param pointArray World points to scale
 * @param viewpointArray Viewpoints to scale
 * @returns The scale factor applied, or 1.0 if none
 */
export function applyScaleFromAxisLines(
  lines: Line[],
  pointArray: WorldPoint[],
  viewpointArray: Viewpoint[]
): number {
  const axisConstrainedLines = lines.filter(l => l.direction && ['x', 'y', 'z'].includes(l.direction));
  const linesWithTargetLength = axisConstrainedLines.filter(l => l.targetLength !== undefined);

  if (linesWithTargetLength.length === 0) {
    return 1.0;
  }

  let sumScale = 0;
  let count = 0;

  for (const line of linesWithTargetLength) {
    const posA = line.pointA.optimizedXyz;
    const posB = line.pointB.optimizedXyz;

    // Check if each point's position came from inference (matches effective coords on constrained axes)
    // rather than triangulation. If so, skip this line for scale computation.
    const isFromInference = (wp: WorldPoint): boolean => {
      if (!wp.optimizedXyz) return false;
      const eff = wp.getEffectiveXyz();
      // Check each constrained axis - if they all match, position is from inference
      let hasConstraint = false;
      for (let i = 0; i < 3; i++) {
        if (eff[i] !== null) {
          hasConstraint = true;
          // Allow small tolerance for floating point
          if (Math.abs(wp.optimizedXyz[i] - eff[i]!) > 0.01) {
            return false; // Position differs from constraint, so it was triangulated
          }
        }
      }
      return hasConstraint; // Has constraints and position matches them
    };

    const aFromInference = isFromInference(line.pointA);
    const bFromInference = isFromInference(line.pointB);
    if (aFromInference && bFromInference) {
      log(`[Scale] Line ${line.pointA.name}-${line.pointB.name}: skipped (both endpoints from inference)`);
      continue;
    }

    if (posA && posB && line.targetLength) {
      const currentLength = Math.sqrt(
        (posB[0] - posA[0]) ** 2 + (posB[1] - posA[1]) ** 2 + (posB[2] - posA[2]) ** 2
      );
      if (currentLength > 0.01) {
        sumScale += line.targetLength / currentLength;
        count++;
        log(`[Scale] Line ${line.pointA.name}-${line.pointB.name}: current=${currentLength.toFixed(3)}, target=${line.targetLength}, scale=${(line.targetLength / currentLength).toFixed(3)}`);
      }
    }
  }

  if (count === 0) {
    return 1.0;
  }

  const scale = sumScale / count;
  log(`[Scale] Axis lines: scale=${scale.toFixed(3)} from ${count} lines`);

  for (const wp of pointArray) {
    if (wp.optimizedXyz) {
      wp.optimizedXyz = [wp.optimizedXyz[0] * scale, wp.optimizedXyz[1] * scale, wp.optimizedXyz[2] * scale];
    }
  }
  for (const vp of viewpointArray) {
    vp.position = [vp.position[0] * scale, vp.position[1] * scale, vp.position[2] * scale];
  }

  return scale;
}

/**
 * Translate scene to align anchor point with its target position.
 *
 * @param lockedPoints Fully constrained points to use as anchors
 * @param pointArray All world points to translate
 * @param viewpointArray All viewpoints to translate
 */
export function translateToAnchorPoint(
  lockedPoints: WorldPoint[],
  pointArray: WorldPoint[],
  viewpointArray: Viewpoint[]
): void {
  const anchorPoint = lockedPoints.find(wp => wp.optimizedXyz !== undefined);
  if (!anchorPoint || !anchorPoint.optimizedXyz) {
    return;
  }

  const target = anchorPoint.getEffectiveXyz();
  const current = anchorPoint.optimizedXyz;
  const translation = [
    target[0]! - current[0],
    target[1]! - current[1],
    target[2]! - current[2],
  ];

  // Only apply if translation is significant
  const translationMag = Math.sqrt(translation[0]**2 + translation[1]**2 + translation[2]**2);
  if (translationMag <= 0.001) {
    return;
  }

  log(`[Translate] Aligning ${anchorPoint.name} by [${translation.map(t => t.toFixed(2)).join(', ')}]`);

  // Translate all world points
  for (const wp of pointArray) {
    if (wp.optimizedXyz) {
      wp.optimizedXyz = [
        wp.optimizedXyz[0] + translation[0],
        wp.optimizedXyz[1] + translation[1],
        wp.optimizedXyz[2] + translation[2],
      ];
    }
  }

  // Translate all cameras
  for (const vp of viewpointArray) {
    vp.position = [
      vp.position[0] + translation[0],
      vp.position[1] + translation[1],
      vp.position[2] + translation[2],
    ];
  }
}

/**
 * Fix cameras that are at the same position as locked points they observe.
 * This causes numerical singularity (can't project a point at camera center).
 *
 * @param viewpointArray Viewpoints to check and fix
 * @param lockedPoints Locked world points to check against
 * @param scaleFactor Scale factor to use for backward distance
 */
export function fixCamerasAtLockedPoints(
  viewpointArray: Viewpoint[],
  lockedPoints: WorldPoint[],
  scaleFactor: number = 1.0
): void {
  for (const vp of viewpointArray) {
    for (const wp of lockedPoints) {
      // Check if this camera observes this world point
      const observes = Array.from(vp.imagePoints).some(ip => (ip as ImagePoint).worldPoint === wp);
      if (!observes) continue;

      const target = wp.getEffectiveXyz();
      const dx = vp.position[0] - target[0]!;
      const dy = vp.position[1] - target[1]!;
      const dz = vp.position[2] - target[2]!;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

      if (dist < 0.5) {
        // Camera is AT the locked world point - move it back
        // Camera viewing direction in world space (rotate [0,0,1] by camera rotation)
        const q = vp.rotation;
        const viewDir = [
          2 * (q[1] * q[3] + q[0] * q[2]),
          2 * (q[2] * q[3] - q[0] * q[1]),
          q[0]*q[0] - q[1]*q[1] - q[2]*q[2] + q[3]*q[3],
        ];
        // Move camera backward (opposite view direction) by 10 units (scaled for large scenes)
        const backwardDistance = 10 * scaleFactor;
        vp.position = [
          vp.position[0] - viewDir[0] * backwardDistance,
          vp.position[1] - viewDir[1] * backwardDistance,
          vp.position[2] - viewDir[2] * backwardDistance,
        ];
        log(`[Fix] Camera ${vp.name} at locked point ${wp.name} - moved back by ${backwardDistance.toFixed(2)}`);
      }
    }
  }
}

/**
 * Offset all cameras when any camera is at origin and conflicts with a locked point.
 * Used in Essential Matrix initialization when locked point is at origin.
 *
 * @param viewpointArray Viewpoints to offset
 * @param lockedPoints Locked points to check for origin conflict
 * @param axisConstrainedLines Lines with axis constraints - used to choose offset perpendicular to them
 * @returns True if offset was applied
 */
export function offsetCamerasFromOrigin(
  viewpointArray: Viewpoint[],
  lockedPoints: WorldPoint[],
  axisConstrainedLines: Line[] = []
): boolean {
  const hasLockedPointAtOrigin = lockedPoints.some(wp => {
    const eff = wp.getEffectiveXyz();
    const distFromOrigin = Math.sqrt((eff[0] ?? 0)**2 + (eff[1] ?? 0)**2 + (eff[2] ?? 0)**2);
    return distFromOrigin < 0.1;
  });

  // Check if ANY camera is at origin (Essential Matrix can place either camera at origin)
  const anyCameraAtOrigin = viewpointArray.some(vp =>
    Math.sqrt(vp.position[0]**2 + vp.position[1]**2 + vp.position[2]**2) < 0.1
  );

  if (!hasLockedPointAtOrigin || !anyCameraAtOrigin) {
    return false;
  }

  // Offset all cameras so none are at origin
  // This preserves relative poses while avoiding the origin conflict
  // IMPORTANT: Choose offset direction perpendicular to any axis-aligned lines
  // to avoid geometric degeneracy (e.g., Z-offset with Z-aligned line)
  let offset: [number, number, number] = [0, 0, -10]; // Default: Z offset

  if (axisConstrainedLines.length > 0) {
    const usedAxes = new Set(axisConstrainedLines.map(l => l.direction));
    // Choose an offset axis that's not used by any line
    if (!usedAxes.has('x')) {
      offset = [-10, 0, 0];
    } else if (!usedAxes.has('y')) {
      offset = [0, -10, 0];
    } else if (!usedAxes.has('z')) {
      offset = [0, 0, -10];
    }
    // If all three axes are used, fall back to default Z offset
  }

  log(`[Init] Camera at origin conflicts with locked point - offsetting cameras by [${offset.join(',')}]`);

  for (const vp of viewpointArray) {
    vp.position = [
      vp.position[0] + offset[0],
      vp.position[1] + offset[1],
      vp.position[2] + offset[2],
    ];
  }

  return true;
}

/**
 * Apply scale from pairs of triangulated locked points (PnP path).
 *
 * @param lockedPoints Fully constrained points
 * @param pointArray All world points to scale
 * @param viewpointArray All viewpoints to scale
 * @returns The scale factor applied, or 1.0 if none
 */
export function applyScaleFromLockedPointPairs(
  lockedPoints: WorldPoint[],
  pointArray: WorldPoint[],
  viewpointArray: Viewpoint[]
): number {
  const triangulatedLockedPoints = lockedPoints.filter(wp => wp.optimizedXyz !== undefined);

  if (triangulatedLockedPoints.length < 2) {
    return 1.0;
  }

  let sumScale = 0;
  let count = 0;

  for (let i = 0; i < triangulatedLockedPoints.length; i++) {
    for (let j = i + 1; j < triangulatedLockedPoints.length; j++) {
      const wp1 = triangulatedLockedPoints[i];
      const wp2 = triangulatedLockedPoints[j];
      const tri1 = wp1.optimizedXyz!;
      const tri2 = wp2.optimizedXyz!;
      const lock1 = wp1.getEffectiveXyz();
      const lock2 = wp2.getEffectiveXyz();

      const triDist = Math.sqrt((tri2[0] - tri1[0]) ** 2 + (tri2[1] - tri1[1]) ** 2 + (tri2[2] - tri1[2]) ** 2);
      const lockDist = Math.sqrt((lock2[0]! - lock1[0]!) ** 2 + (lock2[1]! - lock1[1]!) ** 2 + (lock2[2]! - lock1[2]!) ** 2);

      if (triDist > 0.01) {
        sumScale += lockDist / triDist;
        count++;
      }
    }
  }

  if (count === 0) {
    return 1.0;
  }

  const scale = sumScale / count;
  log(`[Scale] Applied scale=${scale.toFixed(3)} from ${count} point pairs`);

  for (const wp of pointArray) {
    if (wp.optimizedXyz) {
      wp.optimizedXyz = [wp.optimizedXyz[0] * scale, wp.optimizedXyz[1] * scale, wp.optimizedXyz[2] * scale];
    }
  }
  for (const vp of viewpointArray) {
    vp.position = [vp.position[0] * scale, vp.position[1] * scale, vp.position[2] * scale];
  }

  return scale;
}
