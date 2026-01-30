// Collinear X residual - X component of cross product
function collinear_x(p0∇: {x, y, z}, p1∇: {x, y, z}, p2∇: {x, y, z}) {
  v1y = p1.y - p0.y
  v1z = p1.z - p0.z
  v2y = p2.y - p0.y
  v2z = p2.z - p0.z
  return v1y * v2z - v1z * v2y
}
