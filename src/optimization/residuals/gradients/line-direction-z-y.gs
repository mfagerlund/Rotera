// Line direction Z-aligned: Y component residual
function line_direction_z_y(pA∇: {x, y, z}, pB∇: {x, y, z}, scale) {
  dy = pB.y - pA.y
  return scale * dy
}
