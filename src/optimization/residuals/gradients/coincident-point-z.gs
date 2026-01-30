// Coincident point Z residual: cross(AP, AB).z should be zero
function coincident_point_z(pA∇: {x, y, z}, pB∇: {x, y, z}, pP∇: {x, y, z}, scale) {
  // AP vector
  apx = pP.x - pA.x
  apy = pP.y - pA.y

  // AB (direction) vector
  abx = pB.x - pA.x
  aby = pB.y - pA.y

  // Cross product Z component: APx * ABy - APy * ABx
  crossZ = apx * aby - apy * abx
  return scale * crossZ
}
