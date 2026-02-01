// Reprojection U residual: gradient w.r.t. camera-space coordinates only
// This is the "narrow waist" - all parameter gradients flow through camX, camY, camZ
// See: C:\Dev\gradient-script\docs\LLM-OPTIMIZATION-GUIDE.md
//
// Usage:
//   const result = reprojection_u_dcam_grad(camX, camY, camZ, fx, cx, k1, k2, k3, p1, p2, observedU);
//   // Chain rule: dworldPoint = R(q)^T * [result.dcamX, result.dcamY, result.dcamZ]
//   //             dcameraPos = -dworldPoint
//   //             dq = Jacobian_rotation * [result.dcamX, result.dcamY, result.dcamZ]

function reprojection_u_dcam(camX∇, camY∇, camZ∇, fx, cx, k1, k2, k3, p1, p2, observedU) {
  // Perspective division
  normX = camX / camZ
  normY = camY / camZ

  // Radial distortion
  r2 = normX * normX + normY * normY
  r4 = r2 * r2
  r6 = r4 * r2
  radial = 1 + k1 * r2 + k2 * r4 + k3 * r6

  // Tangential distortion (X component)
  tangX = 2 * p1 * normX * normY + p2 * (r2 + 2 * normX * normX)

  // Distorted coordinate
  distortedX = normX * radial + tangX

  // Pixel coordinate
  u = fx * distortedX + cx

  // Residual
  return u - observedU
}
