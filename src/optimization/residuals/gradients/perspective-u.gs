// Perspective projection: U coordinate
// u = fx * (X/Z) + cx
function perspective_u(camPoint∇: {x, y, z}, fx, cx) {
  return fx * (camPoint.x / camPoint.z) + cx
}
