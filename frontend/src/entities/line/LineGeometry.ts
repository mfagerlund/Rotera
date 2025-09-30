// Line geometric calculations

import type { WorldPoint } from '../world-point'

export class LineGeometry {
  // Calculate line length
  static calculateLength(pointA: WorldPoint, pointB: WorldPoint): number | null {
    const aCoords = pointA.getDefinedCoordinates()
    const bCoords = pointB.getDefinedCoordinates()

    if (!aCoords || !bCoords) {
      return null
    }

    const [x1, y1, z1] = aCoords
    const [x2, y2, z2] = bCoords

    return Math.sqrt(
      Math.pow(x2 - x1, 2) +
      Math.pow(y2 - y1, 2) +
      Math.pow(z2 - z1, 2)
    )
  }

  // Get line direction vector (normalized)
  static getDirection(pointA: WorldPoint, pointB: WorldPoint): [number, number, number] | null {
    const aCoords = pointA.getDefinedCoordinates()
    const bCoords = pointB.getDefinedCoordinates()

    if (!aCoords || !bCoords) {
      return null
    }

    const [x1, y1, z1] = aCoords
    const [x2, y2, z2] = bCoords

    // Calculate direction vector
    const dx = x2 - x1
    const dy = y2 - y1
    const dz = z2 - z1

    // Normalize the vector
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (length === 0) return null

    return [dx / length, dy / length, dz / length]
  }

  // Get the midpoint of the line
  static getMidpoint(pointA: WorldPoint, pointB: WorldPoint): [number, number, number] | null {
    const aCoords = pointA.getDefinedCoordinates()
    const bCoords = pointB.getDefinedCoordinates()

    if (!aCoords || !bCoords) {
      return null
    }

    const [x1, y1, z1] = aCoords
    const [x2, y2, z2] = bCoords

    return [
      (x1 + x2) / 2,
      (y1 + y2) / 2,
      (z1 + z2) / 2
    ]
  }

  // Check if a point lies on this line (within tolerance)
  static containsPoint(
    pointA: WorldPoint,
    pointB: WorldPoint,
    testPoint: [number, number, number],
    tolerance: number = 1e-6
  ): boolean {
    const aCoords = pointA.getDefinedCoordinates()
    const bCoords = pointB.getDefinedCoordinates()

    if (!aCoords || !bCoords) {
      return false
    }

    const [x, y, z] = testPoint
    const [x1, y1, z1] = aCoords
    const [x2, y2, z2] = bCoords

    // Calculate cross product to check if point is collinear
    const crossProduct = [
      (y - y1) * (z2 - z1) - (z - z1) * (y2 - y1),
      (z - z1) * (x2 - x1) - (x - x1) * (z2 - z1),
      (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1)
    ]

    const crossMagnitude = Math.sqrt(
      crossProduct[0] * crossProduct[0] +
      crossProduct[1] * crossProduct[1] +
      crossProduct[2] * crossProduct[2]
    )

    return crossMagnitude < tolerance
  }

  // Calculate distance from point to line
  static distanceToPoint(
    pointA: WorldPoint,
    pointB: WorldPoint,
    testPoint: [number, number, number]
  ): number | null {
    const aCoords = pointA.getDefinedCoordinates()
    const bCoords = pointB.getDefinedCoordinates()

    if (!aCoords || !bCoords) {
      return null
    }

    const [px, py, pz] = testPoint
    const [x1, y1, z1] = aCoords
    const [x2, y2, z2] = bCoords

    // Vector from point A to point B
    const lineVector = [x2 - x1, y2 - y1, z2 - z1]

    // Vector from point A to test point
    const pointVector = [px - x1, py - y1, pz - z1]

    // Project point vector onto line vector
    const lineLengthSquared = lineVector[0] ** 2 + lineVector[1] ** 2 + lineVector[2] ** 2

    if (lineLengthSquared === 0) {
      // Line is a point, return distance to that point
      return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2 + (pz - z1) ** 2)
    }

    const projection = (
      pointVector[0] * lineVector[0] +
      pointVector[1] * lineVector[1] +
      pointVector[2] * lineVector[2]
    ) / lineLengthSquared

    // Find closest point on line
    const closestPoint = [
      x1 + projection * lineVector[0],
      y1 + projection * lineVector[1],
      z1 + projection * lineVector[2]
    ]

    // Calculate distance from test point to closest point on line
    return Math.sqrt(
      (px - closestPoint[0]) ** 2 +
      (py - closestPoint[1]) ** 2 +
      (pz - closestPoint[2]) ** 2
    )
  }

  // Calculate angle between two lines (in degrees)
  static angleBetweenLines(
    line1PointA: WorldPoint,
    line1PointB: WorldPoint,
    line2PointA: WorldPoint,
    line2PointB: WorldPoint
  ): number | null {
    const dir1 = this.getDirection(line1PointA, line1PointB)
    const dir2 = this.getDirection(line2PointA, line2PointB)

    if (!dir1 || !dir2) {
      return null
    }

    // Calculate dot product
    const dotProduct = dir1[0] * dir2[0] + dir1[1] * dir2[1] + dir1[2] * dir2[2]

    // Clamp to avoid floating point errors
    const clampedDotProduct = Math.max(-1, Math.min(1, dotProduct))

    // Calculate angle in radians then convert to degrees
    const angleRad = Math.acos(Math.abs(clampedDotProduct))
    return angleRad * (180 / Math.PI)
  }

  // Check if two lines are parallel (within tolerance)
  static areParallel(
    line1PointA: WorldPoint,
    line1PointB: WorldPoint,
    line2PointA: WorldPoint,
    line2PointB: WorldPoint,
    tolerance: number = 1e-6
  ): boolean {
    const angle = this.angleBetweenLines(line1PointA, line1PointB, line2PointA, line2PointB)
    return angle !== null && angle < tolerance
  }

  // Check if two lines are perpendicular (within tolerance)
  static arePerpendicular(
    line1PointA: WorldPoint,
    line1PointB: WorldPoint,
    line2PointA: WorldPoint,
    line2PointB: WorldPoint,
    tolerance: number = 1e-6
  ): boolean {
    const angle = this.angleBetweenLines(line1PointA, line1PointB, line2PointA, line2PointB)
    return angle !== null && Math.abs(angle - 90) < tolerance
  }
}