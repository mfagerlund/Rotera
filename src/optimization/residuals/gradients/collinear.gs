// Collinear points constraint residuals
// Residual: cross(v1, v2) where v1 = p1 - p0, v2 = p2 - p0
// Returns 3 residuals (x, y, z components of cross product)
// All should be zero when points are collinear

function collinear_x(p0∇: {x, y, z}, p1∇: {x, y, z}, p2∇: {x, y, z}) {
  v1x = p1.x - p0.x
  v1y = p1.y - p0.y
  v1z = p1.z - p0.z

  v2x = p2.x - p0.x
  v2y = p2.y - p0.y
  v2z = p2.z - p0.z

  // Cross product X component: v1.y * v2.z - v1.z * v2.y
  return v1y * v2z - v1z * v2y
}

function collinear_y(p0∇: {x, y, z}, p1∇: {x, y, z}, p2∇: {x, y, z}) {
  v1x = p1.x - p0.x
  v1y = p1.y - p0.y
  v1z = p1.z - p0.z

  v2x = p2.x - p0.x
  v2y = p2.y - p0.y
  v2z = p2.z - p0.z

  // Cross product Y component: v1.z * v2.x - v1.x * v2.z
  return v1z * v2x - v1x * v2z
}

function collinear_z(p0∇: {x, y, z}, p1∇: {x, y, z}, p2∇: {x, y, z}) {
  v1x = p1.x - p0.x
  v1y = p1.y - p0.y
  v1z = p1.z - p0.z

  v2x = p2.x - p0.x
  v2y = p2.y - p0.y
  v2z = p2.z - p0.z

  // Cross product Z component: v1.x * v2.y - v1.y * v2.x
  return v1x * v2y - v1y * v2x
}
