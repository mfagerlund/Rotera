// Brown-Conrady radial distortion: U component
// x_distorted = x * (1 + k1*r² + k2*r⁴ + k3*r⁶) + tangential
// r² = x² + y²
// Tangential: 2*p1*x*y + p2*(r² + 2*x²)

function distortion_u(normalized∇: {x, y}, k1, k2, k3, p1, p2) {
  x = normalized.x
  y = normalized.y

  r2 = x * x + y * y
  r4 = r2 * r2
  r6 = r4 * r2

  // Radial distortion factor
  radial = 1 + k1 * r2 + k2 * r4 + k3 * r6

  // Tangential distortion X component
  tangential = 2 * p1 * x * y + p2 * (r2 + 2 * x * x)

  return x * radial + tangential
}
