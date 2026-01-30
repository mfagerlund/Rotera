// Line length residual: ‖pB - pA‖ - targetLength
function line_length(pA∇: {x, y, z}, pB∇: {x, y, z}, targetLength, scale) {
  dx = pB.x - pA.x
  dy = pB.y - pA.y
  dz = pB.z - pA.z
  dist = sqrt(dx * dx + dy * dy + dz * dz)
  return scale * (dist - targetLength)
}
