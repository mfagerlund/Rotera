// Quaternion rotation: v' = q * v * q*
// Using Hamilton product formulation for efficiency
// q = (w, x, y, z), v = (0, vx, vy, vz) as pure quaternion
// Result is the rotated vector (x, y, z) components

// Returns rotated X component
function quat_rotate_x(q∇: {w, x, y, z}, v∇: {x, y, z}) {
  // Using optimized quaternion rotation formula:
  // v' = v + 2*w*(q_vec × v) + 2*(q_vec × (q_vec × v))
  // where q_vec = (x, y, z) of quaternion

  // Cross product: q_vec × v
  cx = q.y * v.z - q.z * v.y
  cy = q.z * v.x - q.x * v.z
  cz = q.x * v.y - q.y * v.x

  // Double cross: q_vec × (q_vec × v)
  dcx = q.y * cz - q.z * cy
  dcy = q.z * cx - q.x * cz
  dcz = q.x * cy - q.y * cx

  // Result: v + 2*w*c + 2*dc
  return v.x + 2 * q.w * cx + 2 * dcx
}
