// Line direction X residual: line should be aligned with X axis
// Penalizes Y and Z components of direction vector
// Returns 2 residuals

function line_direction_x_y(pA∇: {x, y, z}, pB∇: {x, y, z}, scale) {
  dy = pB.y - pA.y
  return scale * dy
}

// Separate file for line_direction_x_z
