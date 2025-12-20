import { Value, V } from 'scalar-autograd';

export function rotateDirectionByQuaternion(
  rotation: { w: Value; x: Value; y: Value; z: Value },
  direction: [number, number, number]
): { x: Value; y: Value; z: Value } {
  const vx = V.C(direction[0]);
  const vy = V.C(direction[1]);
  const vz = V.C(direction[2]);

  const qx = rotation.x;
  const qy = rotation.y;
  const qz = rotation.z;
  const qw = rotation.w;

  const cross1 = {
    x: V.sub(V.mul(qy, vz), V.mul(qz, vy)),
    y: V.sub(V.mul(qz, vx), V.mul(qx, vz)),
    z: V.sub(V.mul(qx, vy), V.mul(qy, vx)),
  };

  const t = {
    x: V.mul(V.C(2), V.add(cross1.x, V.mul(qw, vx))),
    y: V.mul(V.C(2), V.add(cross1.y, V.mul(qw, vy))),
    z: V.mul(V.C(2), V.add(cross1.z, V.mul(qw, vz))),
  };

  const cross2 = {
    x: V.sub(V.mul(qy, t.z), V.mul(qz, t.y)),
    y: V.sub(V.mul(qz, t.x), V.mul(qx, t.z)),
    z: V.sub(V.mul(qx, t.y), V.mul(qy, t.x)),
  };

  return {
    x: V.add(vx, cross2.x),
    y: V.add(vy, cross2.y),
    z: V.add(vz, cross2.z),
  };
}
