// Distance constraint residual
// Residual: (‖p2 - p1‖ - target) / target
// Uses relative error so constraints of different scales are weighted equally

function distance_residual(p1∇: {x, y, z}, p2∇: {x, y, z}, target) {
  dx = p2.x - p1.x
  dy = p2.y - p1.y
  dz = p2.z - p1.z
  dist = sqrt(dx * dx + dy * dy + dz * dz)
  return (dist - target) / target
}
