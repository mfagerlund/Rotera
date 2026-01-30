// Line direction YZ-plane: X component residual (only 1 residual)
function line_direction_yz(pA∇: {x, y, z}, pB∇: {x, y, z}, scale) {
  dx = pB.x - pA.x
  return scale * dx
}
