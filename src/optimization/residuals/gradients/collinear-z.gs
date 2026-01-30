// Collinear Z residual - Z component of cross product
function collinear_z(p0∇: {x, y, z}, p1∇: {x, y, z}, p2∇: {x, y, z}) {
  v1x = p1.x - p0.x
  v1y = p1.y - p0.y
  v2x = p2.x - p0.x
  v2y = p2.y - p0.y
  return v1x * v2y - v1y * v2x
}
