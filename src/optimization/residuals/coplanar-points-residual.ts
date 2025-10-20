/**
 * Coplanar points constraint residual function.
 *
 * Residual: For 4+ points to be coplanar, the scalar triple product
 * (v1 · (v2 × v3)) should be zero.
 * Returns 1 residual (the scalar triple product).
 */

import { V, Value, Vec3 } from 'scalar-autograd';
import type { CoplanarPointsConstraint } from '../../entities/constraints/coplanar-points-constraint';
import type { ValueMap } from '../IOptimizable';

export function computeCoplanarPointsResiduals(
  constraint: CoplanarPointsConstraint,
  valueMap: ValueMap
): Value[] {
  const pointIds = constraint.getPointIds();

  if (pointIds.length < 4) {
    console.warn('Coplanar constraint requires at least 4 points');
    return [];
  }

  // Find first 4 points in valueMap
  const points: Vec3[] = [];
  for (const [point, vec] of valueMap.points) {
    if (pointIds.includes(point.getId())) {
      points.push(vec);
      if (points.length === 4) break;
    }
  }

  if (points.length < 4) {
    console.warn('Coplanar constraint: not enough points found in valueMap');
    return [];
  }

  const p0 = points[0];
  const p1 = points[1];
  const p2 = points[2];
  const p3 = points[3];

  // Calculate vectors from p0 using Vec3 API
  const v1 = p1.sub(p0);
  const v2 = p2.sub(p0);
  const v3 = p3.sub(p0);

  // Calculate cross product v2 × v3
  const cross = Vec3.cross(v2, v3);

  // Calculate scalar triple product: v1 · (v2 × v3)
  const scalarTripleProduct = Vec3.dot(v1, cross);

  // Should be 0 for coplanar points
  return [scalarTripleProduct];
}
