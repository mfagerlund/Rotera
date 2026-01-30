// World-to-camera transformation: X component
// 1. Translate: p' = worldPoint - cameraPosition
// 2. Rotate by quaternion: result = q * p' * q*

function world_to_camera_x(
  worldPoint∇: {x, y, z},
  cameraPos∇: {x, y, z},
  q∇: {w, x, y, z}
) {
  // Translation
  tx = worldPoint.x - cameraPos.x
  ty = worldPoint.y - cameraPos.y
  tz = worldPoint.z - cameraPos.z

  // Quaternion rotation (optimized formula)
  cx = q.y * tz - q.z * ty
  cy = q.z * tx - q.x * tz
  cz = q.x * ty - q.y * tx

  dcx = q.y * cz - q.z * cy
  dcy = q.z * cx - q.x * cz
  dcz = q.x * cy - q.y * cx

  return tx + 2 * q.w * cx + 2 * dcx
}
