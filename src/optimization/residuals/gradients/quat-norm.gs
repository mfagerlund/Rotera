// Quaternion normalization residual
// Residual: w² + x² + y² + z² - 1
// Enforces unit quaternion for rotation representation

function quat_norm_residual(q∇: {w, x, y, z}) {
  return q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z - 1
}

// Soft quaternion normalization with weight
function quat_norm_weighted(q∇: {w, x, y, z}, weight) {
  sqrMag = q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z
  return weight * (sqrMag - 1)
}
