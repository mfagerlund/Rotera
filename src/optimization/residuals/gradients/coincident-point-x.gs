// Coincident point X residual: cross(AP, AB).x should be zero
// AP = P - A, AB = B - A
function coincident_point_x(pA∇: {x, y, z}, pB∇: {x, y, z}, pP∇: {x, y, z}, scale) {
  // AP vector
  apy = pP.y - pA.y
  apz = pP.z - pA.z

  // AB (direction) vector
  aby = pB.y - pA.y
  abz = pB.z - pA.z

  // Cross product X component: APy * ABz - APz * ABy
  crossX = apy * abz - apz * aby
  return scale * crossX
}
