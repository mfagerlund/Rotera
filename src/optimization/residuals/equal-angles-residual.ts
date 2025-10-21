/**
 * Equal angles constraint residual function.
 *
 * Residual: All angles should be equal.
 * Returns (n-1) residuals where n is the number of angle triplets,
 * each residual = angle_i - angle_0 in radians.
 */

import { V, Value, Vec3 } from 'scalar-autograd';
import type { EqualAnglesConstraint } from '../../entities/constraints/equal-angles-constraint';
import type { ValueMap } from '../IOptimizable';

export function computeEqualAnglesResiduals(
  constraint: EqualAnglesConstraint,
  valueMap: ValueMap
): Value[] {
  const points = constraint.points;
  const pointMap = new Map<string, typeof points[0]>();
  points.forEach(p => pointMap.set(p.getName(), p));

  const angleTriplets = (constraint as any).data.parameters.angleTriplets as [string, string, string][];

  if (angleTriplets.length < 2) {
    console.warn('Equal angles constraint requires at least 2 triplets');
    return [];
  }

  // Calculate angle for a triplet [pointA, vertex, pointC] using Vec3 API
  const calculateAngle = (triplet: [string, string, string]): Value | undefined => {
    const pointA = pointMap.get(triplet[0]);
    const vertex = pointMap.get(triplet[1]);
    const pointC = pointMap.get(triplet[2]);

    if (!pointA || !vertex || !pointC) return undefined;

    const pointAVec = valueMap.points.get(pointA);
    const vertexVec = valueMap.points.get(vertex);
    const pointCVec = valueMap.points.get(pointC);

    if (!pointAVec || !vertexVec || !pointCVec) return undefined;

    // Calculate vectors from vertex using Vec3 API
    const v1 = pointAVec.sub(vertexVec);
    const v2 = pointCVec.sub(vertexVec);

    // Calculate angle using Vec3.angleBetween
    return Vec3.angleBetween(v1, v2);
  };

  // Calculate all angles
  const angles: Value[] = [];
  for (const triplet of angleTriplets) {
    const angle = calculateAngle(triplet);
    if (angle) {
      angles.push(angle);
    }
  }

  if (angles.length < 2) {
    console.warn('Equal angles constraint: not enough valid triplets found');
    return [];
  }

  // Create residuals: angle_i - angle_0 should all be 0
  const residuals: Value[] = [];
  const referenceAngle = angles[0];

  for (let i = 1; i < angles.length; i++) {
    residuals.push(V.sub(angles[i], referenceAngle));
  }

  return residuals;
}
