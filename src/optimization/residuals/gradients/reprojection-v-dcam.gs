// Reprojection V residual: gradient w.r.t. camera-space coordinates only
// This is the "narrow waist" - all parameter gradients flow through camX, camY, camZ
// See: C:\Dev\gradient-script\docs\LLM-OPTIMIZATION-GUIDE.md
//
// Usage:
//   const result = reprojection_v_dcam_grad(camX, camY, camZ, fy, cy, k1, k2, k3, p1, p2, observedV);
//   // Chain rule: dworldPoint = R(q)^T * [result.dcamX, result.dcamY, result.dcamZ]
//   //             dcameraPos = -dworldPoint
//   //             dq = Jacobian_rotation * [result.dcamX, result.dcamY, result.dcamZ]

function reprojection_v_dcam(camX∇, camY∇, camZ∇, fy, cy, k1, k2, k3, p1, p2, observedV) {
  // Perspective division
  normX = camX / camZ
  normY = camY / camZ

  // Radial distortion
  r2 = normX * normX + normY * normY
  r4 = r2 * r2
  r6 = r4 * r2
  radial = 1 + k1 * r2 + k2 * r4 + k3 * r6

  // Tangential distortion (Y component)
  tangY = p1 * (r2 + 2 * normY * normY) + 2 * p2 * normX * normY

  // Distorted coordinate
  distortedY = normY * radial + tangY

  // Pixel coordinate (V uses subtraction: image Y increases downward)
  v = cy - fy * distortedY

  // Residual
  return v - observedV
}
