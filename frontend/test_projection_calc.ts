import { V, Vec3 } from 'scalar-autograd';
import { projectWorldPointToPixel } from './src/optimization/camera-projection';

// Camera at origin, zero rotation
const cameraPos = new Vec3(V.C(0), V.C(0), V.C(0));
const cameraRot = new Vec3(V.C(0), V.C(0), V.C(0));

// Points
const p1 = new Vec3(V.C(0), V.C(0), V.C(10));
const p2 = new Vec3(V.C(2), V.C(0), V.C(10));
const p3 = new Vec3(V.C(0), V.C(2), V.C(10));

// Camera params
const focalLength = V.C(1000);
const aspectRatio = V.C(1.0);
const ppx = V.C(960);
const ppy = V.C(540);
const skew = V.C(0);
const k1 = V.C(0), k2 = V.C(0), k3 = V.C(0);
const p1d = V.C(0), p2d = V.C(0);

const proj1 = projectWorldPointToPixel(p1, cameraPos, cameraRot, focalLength, aspectRatio, ppx, ppy, skew, k1, k2, k3, p1d, p2d);
const proj2 = projectWorldPointToPixel(p2, cameraPos, cameraRot, focalLength, aspectRatio, ppx, ppy, skew, k1, k2, k3, p1d, p2d);
const proj3 = projectWorldPointToPixel(p3, cameraPos, cameraRot, focalLength, aspectRatio, ppx, ppy, skew, k1, k2, k3, p1d, p2d);

console.log('p1 [0,0,10] projects to:', proj1 ? [proj1[0].data, proj1[1].data] : 'null');
console.log('p2 [2,0,10] projects to:', proj2 ? [proj2[0].data, proj2[1].data] : 'null');
console.log('p3 [0,2,10] projects to:', proj3 ? [proj3[0].data, proj3[1].data] : 'null');
