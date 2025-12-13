/**
 * 2D geometry utilities for UI interactions and selections
 */

/**
 * Calculate the distance from a point to a line segment in 2D.
 *
 * @param px - Point x coordinate
 * @param py - Point y coordinate
 * @param x1 - Line segment start x
 * @param y1 - Line segment start y
 * @param x2 - Line segment end x
 * @param y2 - Line segment end y
 * @returns Distance from point to line segment
 */
export function distanceToLineSegment2D(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;

  // If line segment is a point
  if (lenSq === 0) {
    return Math.sqrt(A * A + B * B);
  }

  // Clamp parameter to [0, 1] to stay on segment
  const param = Math.max(0, Math.min(1, dot / lenSq));

  const closestX = x1 + param * C;
  const closestY = y1 + param * D;

  return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
}

/**
 * Calculate the Euclidean distance between two 2D points.
 *
 * @param x1 - First point x coordinate
 * @param y1 - First point y coordinate
 * @param x2 - Second point x coordinate
 * @param y2 - Second point y coordinate
 * @returns Distance between the two points
 */
export function distance2D(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}
