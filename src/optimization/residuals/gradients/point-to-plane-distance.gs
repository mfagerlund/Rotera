// Point to plane distance residual
// Given 3 points (a, b, c) defining a plane and a test point (p),
// compute the signed distance from p to the plane.
//
// The plane normal is (b-a) × (c-a), and distance = ((p-a) · normal) / |normal|
//
// This is used for coplanar constraints with N points:
// - First 3 points define the plane
// - Each additional point gets one residual (its distance from the plane)

function point_to_plane_distance(
  a∇: {x, y, z},
  b∇: {x, y, z},
  c∇: {x, y, z},
  p∇: {x, y, z}
) {
  // Edge vectors from a
  e1x = b.x - a.x
  e1y = b.y - a.y
  e1z = b.z - a.z

  e2x = c.x - a.x
  e2y = c.y - a.y
  e2z = c.z - a.z

  // Normal = e1 × e2
  nx = e1y * e2z - e1z * e2y
  ny = e1z * e2x - e1x * e2z
  nz = e1x * e2y - e1y * e2x

  // Vector from a to p
  vx = p.x - a.x
  vy = p.y - a.y
  vz = p.z - a.z

  // Dot product v · normal
  dot = vx * nx + vy * ny + vz * nz

  // |normal|
  normalLen = sqrt(nx * nx + ny * ny + nz * nz + 0.0000001)

  // Signed distance = (v · normal) / |normal|
  return dot / normalLen
}
