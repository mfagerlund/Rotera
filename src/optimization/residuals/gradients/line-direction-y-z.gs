// Line direction Y-aligned: Z component residual
function line_direction_y_z(pA∇: {x, y, z}, pB∇: {x, y, z}, scale) {
  dz = pB.z - pA.z
  return scale * dz
}
