// World-to-camera transformation: Z component
function world_to_camera_z(
  worldPoint∇: {x, y, z},
  cameraPos∇: {x, y, z},
  q∇: {w, x, y, z}
) {
  tx = worldPoint.x - cameraPos.x
  ty = worldPoint.y - cameraPos.y
  tz = worldPoint.z - cameraPos.z

  cx = q.y * tz - q.z * ty
  cy = q.z * tx - q.x * tz
  cz = q.x * ty - q.y * tx

  dcx = q.y * cz - q.z * cy
  dcy = q.z * cx - q.x * cz
  dcz = q.x * cy - q.y * cx

  return tz + 2 * q.w * cz + 2 * dcz
}
