// Line direction XY-plane: Z component residual (only 1 residual)
function line_direction_xy(pA∇: {x, y, z}, pB∇: {x, y, z}, scale) {
  dz = pB.z - pA.z
  return scale * dz
}
