// Fixed point constraint residuals
// Residual: [p.x - t.x, p.y - t.y, p.z - t.z]
// Returns 3 separate residual functions for each axis

function fixed_point_x(p∇: {x, y, z}, tx) {
  return p.x - tx
}

function fixed_point_y(p∇: {x, y, z}, ty) {
  return p.y - ty
}

function fixed_point_z(p∇: {x, y, z}, tz) {
  return p.z - tz
}
