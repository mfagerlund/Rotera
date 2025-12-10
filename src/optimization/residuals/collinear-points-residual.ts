/**
 * Collinear points constraint residual function.
 *
 * Residual: For 3+ points to be collinear, the cross product of vectors
 * from point 0 to point 1 and point 0 to point 2 should be zero.
 * Returns 3 residuals (x, y, z components of cross product).
 */

import { V, Value, Vec3 } from 'scalar-autograd';
import type { CollinearPointsConstraint } from '../../entities/constraints/collinear-points-constraint';
import type { ValueMap } from '../IOptimizable';

export function computeCollinearPointsResiduals(
  constraint: CollinearPointsConstraint,
  valueMap: ValueMap
): Value[] {
  const points = constraint.points;

  if (points.length < 3) {
    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
      console.warn('Collinear constraint requires at least 3 points');
    }
    return [];
  }

  const p0 = valueMap.points.get(points[0]);
  const p1 = valueMap.points.get(points[1]);
  const p2 = valueMap.points.get(points[2]);

  if (!p0 || !p1 || !p2) {
    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
      console.warn('Collinear constraint: not enough points found in valueMap');
    }
    return [];
  }

  // Calculate vectors from p0 using Vec3 API
  const v1 = p1.sub(p0);
  const v2 = p2.sub(p0);

  // Cross product should be (0, 0, 0) for collinear points
  const cross = Vec3.cross(v1, v2);

  return [cross.x, cross.y, cross.z];
}
