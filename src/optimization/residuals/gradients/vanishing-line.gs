// Vanishing Line Residual
// Constrains camera quaternion so predicted axis direction aligns with observed VP
//
// Residual: weight * (1 - cos(angle)) = weight * (1 - dot)
// where dot = (pred · obs) / (|pred| * |obs|)
//
// pred = rotated world axis (by quaternion)
// obs = observed vanishing point direction in camera frame

// Returns the angular residual for a vanishing line constraint
// axis is the world axis (x, y, or z) - one of (1,0,0), (0,1,0), (0,0,1)
// obsU, obsV are normalized camera coordinates of the vanishing point
function vanishing_line_residual(
  q∇: {w, x, y, z},
  axis: {x, y, z},
  obsU,
  obsV,
  weight
) {
  // Rotate world axis by quaternion using optimized formula:
  // pred = axis + 2*qw*c + 2*d
  // where c = q.xyz × axis, d = q.xyz × c

  // Cross product: c = q.xyz × axis
  cx = q.y * axis.z - q.z * axis.y
  cy = q.z * axis.x - q.x * axis.z
  cz = q.x * axis.y - q.y * axis.x

  // Double cross: d = q.xyz × c
  dx = q.y * cz - q.z * cy
  dy = q.z * cx - q.x * cz
  dz = q.x * cy - q.y * cx

  // Rotated vector: pred = axis + 2*qw*c + 2*d
  predX = axis.x + 2 * q.w * cx + 2 * dx
  predY = axis.y + 2 * q.w * cy + 2 * dy
  predZ = axis.z + 2 * q.w * cz + 2 * dz

  // Observed direction (obsZ = 1 for camera looking along +Z)
  obsX = obsU
  obsY = obsV
  obsZ = 1

  // Compute lengths
  predLenSq = predX * predX + predY * predY + predZ * predZ
  obsLenSq = obsX * obsX + obsY * obsY + obsZ * obsZ
  predLen = sqrt(predLenSq)
  obsLen = sqrt(obsLenSq)

  // Dot product of normalized directions
  dotNum = predX * obsX + predY * obsY + predZ * obsZ
  scale = predLen * obsLen
  dot = dotNum / scale

  // Angular residual: weight * (1 - cos(angle))
  return weight * (1 - dot)
}
