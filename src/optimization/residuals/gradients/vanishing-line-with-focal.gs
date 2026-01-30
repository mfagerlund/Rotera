// Vanishing Line Residual with Focal Length
// Constrains camera quaternion so predicted axis direction aligns with observed VP
// Includes focal length as a gradient parameter for intrinsic optimization

function vanishing_line_with_focal_residual(
  q∇: {w, x, y, z},
  axis: {x, y, z},
  vpU,
  vpV,
  cx,
  cy,
  f∇,
  weight
) {
  // Observed VP direction (normalized camera coordinates)
  // Y is inverted because image Y points down, camera Y points up
  obsU = (vpU - cx) / f
  obsV = (cy - vpV) / f
  obsZ = 1

  // Rotate world axis by quaternion using optimized formula:
  // pred = axis + 2*qw*c + 2*d

  // Cross product: c = q.xyz × axis
  cX = q.y * axis.z - q.z * axis.y
  cY = q.z * axis.x - q.x * axis.z
  cZ = q.x * axis.y - q.y * axis.x

  // Double cross: d = q.xyz × c
  dX = q.y * cZ - q.z * cY
  dY = q.z * cX - q.x * cZ
  dZ = q.x * cY - q.y * cX

  // Rotated vector: pred = axis + 2*qw*c + 2*d
  predX = axis.x + 2 * q.w * cX + 2 * dX
  predY = axis.y + 2 * q.w * cY + 2 * dY
  predZ = axis.z + 2 * q.w * cZ + 2 * dZ

  // Compute lengths
  predLenSq = predX * predX + predY * predY + predZ * predZ
  obsLenSq = obsU * obsU + obsV * obsV + obsZ * obsZ
  predLen = sqrt(predLenSq)
  obsLen = sqrt(obsLenSq)

  // Dot product of normalized directions
  dotNum = predX * obsU + predY * obsV + predZ * obsZ
  scale = predLen * obsLen
  dot = dotNum / scale

  // Angular residual: weight * (1 - cos(angle))
  return weight * (1 - dot)
}
