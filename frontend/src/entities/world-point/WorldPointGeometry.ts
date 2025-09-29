// WorldPoint geometric calculations

export class WorldPointGeometry {
  // Calculate distance between two points
  static distanceBetween(
    pointA: [number, number, number],
    pointB: [number, number, number]
  ): number {
    const [x1, y1, z1] = pointA
    const [x2, y2, z2] = pointB

    return Math.sqrt(
      Math.pow(x2 - x1, 2) +
      Math.pow(y2 - y1, 2) +
      Math.pow(z2 - z1, 2)
    )
  }

  // Calculate centroid of multiple points
  static calculateCentroid(points: Array<[number, number, number]>): [number, number, number] | null {
    if (points.length === 0) return null

    let sumX = 0, sumY = 0, sumZ = 0
    for (const [x, y, z] of points) {
      sumX += x
      sumY += y
      sumZ += z
    }

    return [
      sumX / points.length,
      sumY / points.length,
      sumZ / points.length
    ]
  }

  // Check if three points are collinear (within tolerance)
  static areCollinear(
    pointA: [number, number, number],
    pointB: [number, number, number],
    pointC: [number, number, number],
    tolerance: number = 1e-6
  ): boolean {
    const [x1, y1, z1] = pointA
    const [x2, y2, z2] = pointB
    const [x3, y3, z3] = pointC

    // Calculate cross product vectors
    const v1 = [x2 - x1, y2 - y1, z2 - z1]
    const v2 = [x3 - x1, y3 - y1, z3 - z1]

    // Cross product
    const cross = [
      v1[1] * v2[2] - v1[2] * v2[1],
      v1[2] * v2[0] - v1[0] * v2[2],
      v1[0] * v2[1] - v1[1] * v2[0]
    ]

    const magnitude = Math.sqrt(cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2)
    return magnitude < tolerance
  }

  // Calculate angle between three points (vertex is the middle point)
  static calculateAngle(
    pointA: [number, number, number],
    vertex: [number, number, number],
    pointC: [number, number, number]
  ): number {
    const [x1, y1, z1] = pointA
    const [x2, y2, z2] = vertex
    const [x3, y3, z3] = pointC

    // Calculate vectors from vertex to other points
    const vec1 = [x1 - x2, y1 - y2, z1 - z2]
    const vec2 = [x3 - x2, y3 - y2, z3 - z2]

    // Calculate magnitudes
    const mag1 = Math.sqrt(vec1[0] ** 2 + vec1[1] ** 2 + vec1[2] ** 2)
    const mag2 = Math.sqrt(vec2[0] ** 2 + vec2[1] ** 2 + vec2[2] ** 2)

    if (mag1 === 0 || mag2 === 0) return 0

    // Calculate dot product
    const dotProduct = vec1[0] * vec2[0] + vec1[1] * vec2[1] + vec1[2] * vec2[2]

    // Calculate angle in radians then convert to degrees
    const angleRad = Math.acos(Math.max(-1, Math.min(1, dotProduct / (mag1 * mag2))))
    return angleRad * (180 / Math.PI)
  }

  // Project point onto plane defined by normal vector and point on plane
  static projectOntoPlane(
    point: [number, number, number],
    planePoint: [number, number, number],
    planeNormal: [number, number, number]
  ): [number, number, number] {
    const [px, py, pz] = point
    const [planePx, planePy, planePz] = planePoint
    const [nx, ny, nz] = planeNormal

    // Vector from plane point to the point
    const vec = [px - planePx, py - planePy, pz - planePz]

    // Dot product of vector with normal
    const dot = vec[0] * nx + vec[1] * ny + vec[2] * nz

    // Normal magnitude squared
    const normalMagSquared = nx * nx + ny * ny + nz * nz

    if (normalMagSquared === 0) {
      // Degenerate normal, return original point
      return point
    }

    // Project point onto plane
    const projectionFactor = dot / normalMagSquared
    return [
      px - projectionFactor * nx,
      py - projectionFactor * ny,
      pz - projectionFactor * nz
    ]
  }

  // Calculate distance from point to plane
  static distanceToPlane(
    point: [number, number, number],
    planePoint: [number, number, number],
    planeNormal: [number, number, number]
  ): number {
    const [px, py, pz] = point
    const [planePx, planePy, planePz] = planePoint
    const [nx, ny, nz] = planeNormal

    // Vector from plane point to the point
    const vec = [px - planePx, py - planePy, pz - planePz]

    // Dot product of vector with normal
    const dot = vec[0] * nx + vec[1] * ny + vec[2] * nz

    // Normal magnitude
    const normalMag = Math.sqrt(nx * nx + ny * ny + nz * nz)

    if (normalMag === 0) {
      return 0 // Degenerate normal
    }

    return Math.abs(dot) / normalMag
  }

  // Check if points are coplanar (within tolerance)
  static areCoplanar(
    points: Array<[number, number, number]>,
    tolerance: number = 1e-6
  ): boolean {
    if (points.length < 4) {
      return true // Less than 4 points are always coplanar
    }

    // Use first 3 points to define the plane
    const [p1, p2, p3] = points

    // Calculate normal vector using cross product
    const v1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]]
    const v2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]]

    const normal: [number, number, number] = [
      v1[1] * v2[2] - v1[2] * v2[1],
      v1[2] * v2[0] - v1[0] * v2[2],
      v1[0] * v2[1] - v1[1] * v2[0]
    ]

    // Check if all other points lie on the same plane
    for (let i = 3; i < points.length; i++) {
      const distance = this.distanceToPlane(points[i], p1, normal)
      if (distance > tolerance) {
        return false
      }
    }

    return true
  }

  // Find bounding box of points
  static getBoundingBox(points: Array<[number, number, number]>): {
    min: [number, number, number]
    max: [number, number, number]
    center: [number, number, number]
    size: [number, number, number]
  } | null {
    if (points.length === 0) return null

    let minX = points[0][0], maxX = points[0][0]
    let minY = points[0][1], maxY = points[0][1]
    let minZ = points[0][2], maxZ = points[0][2]

    for (const [x, y, z] of points) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }

    return {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
      center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
      size: [maxX - minX, maxY - minY, maxZ - minZ]
    }
  }
}