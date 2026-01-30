// Brown-Conrady radial distortion: V component
// y_distorted = y * (1 + k1*r² + k2*r⁴ + k3*r⁶) + tangential
// Tangential: p1*(r² + 2*y²) + 2*p2*x*y

function distortion_v(normalized∇: {x, y}, k1, k2, k3, p1, p2) {
  x = normalized.x
  y = normalized.y

  r2 = x * x + y * y
  r4 = r2 * r2
  r6 = r4 * r2

  // Radial distortion factor
  radial = 1 + k1 * r2 + k2 * r4 + k3 * r6

  // Tangential distortion Y component
  tangential = p1 * (r2 + 2 * y * y) + 2 * p2 * x * y

  return y * radial + tangential
}
