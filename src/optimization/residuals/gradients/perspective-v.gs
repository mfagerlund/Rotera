// Perspective projection: V coordinate
// v = fy * (Y/Z) + cy (note: may be negated depending on coordinate system)
function perspective_v(camPoint∇: {x, y, z}, fy, cy) {
  return fy * (camPoint.y / camPoint.z) + cy
}
