// Line direction X-aligned: Z component residual
function line_direction_x_z(pA∇: {x, y, z}, pB∇: {x, y, z}, scale) {
  dz = pB.z - pA.z
  return scale * dz
}
