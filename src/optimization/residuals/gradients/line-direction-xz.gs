// Line direction XZ-plane: Y component residual (only 1 residual)
function line_direction_xz(pA∇: {x, y, z}, pB∇: {x, y, z}, scale) {
  dy = pB.y - pA.y
  return scale * dy
}
