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
  const points = constraint.points;

  if (points.length < 4) {
    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
      console.warn('Coplanar constraint requires at least 4 points');
    }
    return [];
  }

  const p0 = valueMap.points.get(points[0]);
  const p1 = valueMap.points.get(points[1]);
  const p2 = valueMap.points.get(points[2]);
  const p3 = valueMap.points.get(points[3]);

  if (!p0 || !p1 || !p2 || !p3) {
    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
      console.warn('Coplanar constraint: not enough points found in valueMap');
    }
    return [];
  }

  // Calculate vectors from p0 using Vec3 API
  const v1 = p1.sub(p0);
  const v2 = p2.sub(p0);
  const v3 = p3.sub(p0);

  // Calculate cross product v2 × v3
  const cross = Vec3.cross(v2, v3);

  // Calculate scalar triple product: v1 · (v2 × v3)
  const scalarTripleProduct = Vec3.dot(v1, cross);

  // Normalize by the volume of the parallelepiped formed by unit vectors
  // This makes the residual scale-invariant (measures the "planarity error" not "volume error")
  // The normalization factor is |v1| * |v2| * |v3|
  const len1 = v1.magnitude;
  const len2 = v2.magnitude;
  const len3 = v3.magnitude;

  // Avoid division by zero - if any vector is zero length, the constraint is ill-defined
  const normFactor = V.mul(V.mul(len1, len2), len3);
  const epsilon = V.C(1e-6);

  // Normalized scalar triple product (unitless, measures planarity deviation)
  const normalizedTripleProduct = V.div(scalarTripleProduct, V.add(normFactor, epsilon));

  // Should be 0 for coplanar points
  return [normalizedTripleProduct];
}
