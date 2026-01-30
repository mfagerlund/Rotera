// Coincident point Y residual: cross(AP, AB).y should be zero
function coincident_point_y(pA∇: {x, y, z}, pB∇: {x, y, z}, pP∇: {x, y, z}, scale) {
  // AP vector
  apx = pP.x - pA.x
  apz = pP.z - pA.z

  // AB (direction) vector
  abx = pB.x - pA.x
  abz = pB.z - pA.z

  // Cross product Y component: APz * ABx - APx * ABz
  crossY = apz * abx - apx * abz
  return scale * crossY
}
