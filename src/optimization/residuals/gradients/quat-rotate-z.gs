// Quaternion rotation: Z component
function quat_rotate_z(q∇: {w, x, y, z}, v∇: {x, y, z}) {
  cx = q.y * v.z - q.z * v.y
  cy = q.z * v.x - q.x * v.z
  cz = q.x * v.y - q.y * v.x

  dcx = q.y * cz - q.z * cy
  dcy = q.z * cx - q.x * cz
  dcz = q.x * cy - q.y * cx

  return v.z + 2 * q.w * cz + 2 * dcz
}
