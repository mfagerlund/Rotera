// Line direction Z-aligned: X component residual
function line_direction_z_x(pA∇: {x, y, z}, pB∇: {x, y, z}, scale) {
  dx = pB.x - pA.x
  return scale * dx
}
