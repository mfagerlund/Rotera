// Collinear Y residual - Y component of cross product
function collinear_y(p0∇: {x, y, z}, p1∇: {x, y, z}, p2∇: {x, y, z}) {
  v1x = p1.x - p0.x
  v1z = p1.z - p0.z
  v2x = p2.x - p0.x
  v2z = p2.z - p0.z
  return v1z * v2x - v1x * v2z
}
