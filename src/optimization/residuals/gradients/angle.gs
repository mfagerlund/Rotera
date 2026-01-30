// Angle constraint residual
// Residual: angleBetween(v1, v2) - target
// Where v1 = pointA - vertex, v2 = pointC - vertex
// Uses atan2(cross_magnitude, dot) for robust angle computation

function angle_residual(pointA∇: {x, y, z}, vertex∇: {x, y, z}, pointC∇: {x, y, z}, targetRadians) {
  // Vector from vertex to pointA
  v1x = pointA.x - vertex.x
  v1y = pointA.y - vertex.y
  v1z = pointA.z - vertex.z

  // Vector from vertex to pointC
  v2x = pointC.x - vertex.x
  v2y = pointC.y - vertex.y
  v2z = pointC.z - vertex.z

  // Dot product
  dot = v1x * v2x + v1y * v2y + v1z * v2z

  // Cross product magnitude for robust angle
  crossx = v1y * v2z - v1z * v2y
  crossy = v1z * v2x - v1x * v2z
  crossz = v1x * v2y - v1y * v2x
  crossMag = sqrt(crossx * crossx + crossy * crossy + crossz * crossz)

  // Angle between vectors (robust via atan2)
  angle = atan2(crossMag, dot)

  return angle - targetRadians
}
