// Create a synthetic fixture with consistent VP data
import fs from 'fs';

// Camera parameters
const f = 1000;
const cx = 500;
const cy = 400;
const imageWidth = 1000;
const imageHeight = 800;

// Camera position: looking at origin from a position in -X, +Y, -Z quadrant
// (so all world points have positive Z in camera space)
const cameraPos = [-30, 20, -40];

// Camera rotation: looking toward origin
// Convention: camera +Z is forward (CV convention), +Y is up, +X is right
function lookAt(eye, target, up) {
  const forward = normalize([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
  const right = normalize(cross(forward, up));
  // IMPORTANT: Use forward × right to get UP (right-handed system)
  // cross(right, forward) gives DOWN, which produces a reflection matrix
  const newUp = cross(forward, right);

  // Rotation matrix R maps world to camera
  // Rows are: right, up, forward (CV convention where +Z is forward)
  return [
    [right[0], right[1], right[2]],
    [newUp[0], newUp[1], newUp[2]],
    [forward[0], forward[1], forward[2]]  // +Z forward
  ];
}

function normalize(v) {
  const len = Math.sqrt(v.reduce((s, x) => s + x*x, 0));
  return v.map(x => x / len);
}

function cross(a, b) {
  return [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
}

const R = lookAt(cameraPos, [0, 0, 0], [0, 1, 0]);

console.log('Camera rotation matrix:');
R.forEach(row => console.log('  [' + row.map(x => x.toFixed(4)).join(', ') + ']'));

// Convert to quaternion
function matrixToQuat(R) {
  const trace = R[0][0] + R[1][1] + R[2][2];
  let w, x, y, z;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    w = 0.25 / s;
    x = (R[2][1] - R[1][2]) * s;
    y = (R[0][2] - R[2][0]) * s;
    z = (R[1][0] - R[0][1]) * s;
  } else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
    const s = 2 * Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]);
    w = (R[2][1] - R[1][2]) / s;
    x = 0.25 * s;
    y = (R[0][1] + R[1][0]) / s;
    z = (R[0][2] + R[2][0]) / s;
  } else if (R[1][1] > R[2][2]) {
    const s = 2 * Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]);
    w = (R[0][2] - R[2][0]) / s;
    x = (R[0][1] + R[1][0]) / s;
    y = 0.25 * s;
    z = (R[1][2] + R[2][1]) / s;
  } else {
    const s = 2 * Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]);
    w = (R[1][0] - R[0][1]) / s;
    x = (R[0][2] + R[2][0]) / s;
    y = (R[1][2] + R[2][1]) / s;
    z = 0.25 * s;
  }
  const mag = Math.sqrt(w*w + x*x + y*y + z*z);
  return [w/mag, x/mag, y/mag, z/mag];
}

const quat = matrixToQuat(R);
console.log('Quaternion: [' + quat.map(x => x.toFixed(6)).join(', ') + ']');

// World points
const worldPoints = {
  O: [0, 0, 0],
  X: [10, 0, 0],
  Y: [0, 10, 0],
  Z: [0, 0, 10]
};

// Project world point to image
function project(wp) {
  const rel = [wp[0] - cameraPos[0], wp[1] - cameraPos[1], wp[2] - cameraPos[2]];
  const cam = [
    R[0][0]*rel[0] + R[0][1]*rel[1] + R[0][2]*rel[2],
    R[1][0]*rel[0] + R[1][1]*rel[1] + R[1][2]*rel[2],
    R[2][0]*rel[0] + R[2][1]*rel[1] + R[2][2]*rel[2]
  ];
  return {
    u: cx + f * cam[0] / cam[2],
    v: cy - f * cam[1] / cam[2],
    camZ: cam[2]
  };
}

console.log('\nProjected image points:');
const imagePoints = {};
for (const [name, wp] of Object.entries(worldPoints)) {
  const ip = project(wp);
  imagePoints[name] = ip;
  console.log('  ' + name + ': (' + ip.u.toFixed(2) + ', ' + ip.v.toFixed(2) + ') depth=' + ip.camZ.toFixed(2));
}

// Compute vanishing points
function computeVP(axisIdx) {
  const worldAxis = [[1,0,0], [0,1,0], [0,0,1]][axisIdx];
  const camDir = [
    R[0][0]*worldAxis[0] + R[0][1]*worldAxis[1] + R[0][2]*worldAxis[2],
    R[1][0]*worldAxis[0] + R[1][1]*worldAxis[1] + R[1][2]*worldAxis[2],
    R[2][0]*worldAxis[0] + R[2][1]*worldAxis[1] + R[2][2]*worldAxis[2]
  ];
  if (Math.abs(camDir[2]) < 0.01) return null;
  return {
    u: cx + f * camDir[0] / camDir[2],
    v: cy - f * camDir[1] / camDir[2]
  };
}

console.log('\nVanishing points:');
const vpX = computeVP(0);
const vpY = computeVP(1);
const vpZ = computeVP(2);
console.log('  X VP: (' + (vpX ? vpX.u.toFixed(2) : 'inf') + ', ' + (vpX ? vpX.v.toFixed(2) : 'inf') + ')');
console.log('  Y VP: (' + (vpY ? vpY.u.toFixed(2) : 'inf') + ', ' + (vpY ? vpY.v.toFixed(2) : 'inf') + ')');
console.log('  Z VP: (' + (vpZ ? vpZ.u.toFixed(2) : 'inf') + ', ' + (vpZ ? vpZ.v.toFixed(2) : 'inf') + ')');

// Create vanishing lines
// IMPORTANT: Use starting positions that are NOT on the world axis lines.
// If starting from image points, the VLs become parallel to the virtual VLs
// from direction-constrained lines, making the VP computation fail.
function createVLFromTwoPoints(p1_u, p1_v, vp, length) {
  const dx = vp.u - p1_u;
  const dy = vp.v - p1_v;
  const norm = Math.sqrt(dx*dx + dy*dy);
  const ux = dx / norm;
  const uy = dy / norm;
  return {
    p1: { u: p1_u, v: p1_v },
    p2: { u: p1_u + ux * length, v: p1_v + uy * length }
  };
}

// Create X-axis VLs from positions NOT on the O-X image line
// These should intersect at vpX
const vl_x1 = createVLFromTwoPoints(200, 200, vpX, 300);
const vl_x2 = createVLFromTwoPoints(700, 600, vpX, 300);

// Create Z-axis VLs from positions NOT on the O-Z image line
const vl_z1 = createVLFromTwoPoints(200, 600, vpZ, 300);
const vl_z2 = createVLFromTwoPoints(800, 200, vpZ, 300);

console.log('\nVanishing lines:');
console.log('X-axis VL1: p1=(' + vl_x1.p1.u.toFixed(2) + ',' + vl_x1.p1.v.toFixed(2) + ') p2=(' + vl_x1.p2.u.toFixed(2) + ',' + vl_x1.p2.v.toFixed(2) + ')');
console.log('X-axis VL2: p1=(' + vl_x2.p1.u.toFixed(2) + ',' + vl_x2.p1.v.toFixed(2) + ') p2=(' + vl_x2.p2.u.toFixed(2) + ',' + vl_x2.p2.v.toFixed(2) + ')');
console.log('Z-axis VL1: p1=(' + vl_z1.p1.u.toFixed(2) + ',' + vl_z1.p1.v.toFixed(2) + ') p2=(' + vl_z1.p2.u.toFixed(2) + ',' + vl_z1.p2.v.toFixed(2) + ')');
console.log('Z-axis VL2: p1=(' + vl_z2.p1.u.toFixed(2) + ',' + vl_z2.p1.v.toFixed(2) + ') p2=(' + vl_z2.p2.u.toFixed(2) + ',' + vl_z2.p2.v.toFixed(2) + ')');

// Output JSON for the fixture
const fixture = {
  formatVersion: 1,
  name: "VP Synthetic Test",
  worldPoints: [
    { id: "WorldPoint_0", name: "Y", lockedXyz: [null, 10, null], inferredXyz: [0, 10, 0], optimizedXyz: [0, 10, 0], color: "#FF6B6B", isVisible: true },
    { id: "WorldPoint_1", name: "O", lockedXyz: [0, 0, 0], inferredXyz: [0, 0, 0], optimizedXyz: [0, 0, 0], color: "#4ECDC4", isVisible: true },
    { id: "WorldPoint_2", name: "X", lockedXyz: [10, 0, 0], inferredXyz: [10, 0, 0], optimizedXyz: [10, 0, 0], color: "#45B7D1", isVisible: true },
    { id: "WorldPoint_3", name: "Z", lockedXyz: [0, 0, 10], inferredXyz: [0, 0, 10], optimizedXyz: [0, 0, 10], color: "#FFA07A", isVisible: true }
  ],
  viewpoints: [{
    id: "Viewpoint_4", name: "C1", filename: "C1.png", url: "",
    imageWidth, imageHeight, focalLength: f,
    principalPointX: cx, principalPointY: cy,
    skewCoefficient: 0, aspectRatio: 1, useSimpleIntrinsics: true,
    radialDistortion: [0, 0, 0], tangentialDistortion: [0, 0],
    position: cameraPos, rotation: quat,
    calibrationAccuracy: 0, isProcessed: false, isVisible: true, opacity: 1,
    color: "#ffff00", isPoseLocked: false,
    vanishingLineIds: ["VanishingLine_5", "VanishingLine_6", "VanishingLine_7", "VanishingLine_8"]
  }],
  lines: [
    { id: "Line_9", name: "Line", pointAId: "WorldPoint_1", pointBId: "WorldPoint_0", color: "#0696d7", isConstruction: false, lineStyle: "solid", thickness: 1, direction: "y", tolerance: 0.001 },
    { id: "Line_10", name: "Line", pointAId: "WorldPoint_3", pointBId: "WorldPoint_1", color: "#0696d7", isConstruction: false, lineStyle: "solid", thickness: 1, direction: "z", tolerance: 0.001 },
    { id: "Line_11", name: "Line", pointAId: "WorldPoint_1", pointBId: "WorldPoint_2", color: "#0696d7", isConstruction: false, lineStyle: "solid", thickness: 1, direction: "x", tolerance: 0.001 }
  ],
  imagePoints: [
    { id: "ImagePoint_12", worldPointId: "WorldPoint_0", viewpointId: "Viewpoint_4", u: imagePoints.Y.u, v: imagePoints.Y.v, isVisible: true, confidence: 1 },
    { id: "ImagePoint_13", worldPointId: "WorldPoint_1", viewpointId: "Viewpoint_4", u: imagePoints.O.u, v: imagePoints.O.v, isVisible: true, confidence: 1 },
    { id: "ImagePoint_14", worldPointId: "WorldPoint_2", viewpointId: "Viewpoint_4", u: imagePoints.X.u, v: imagePoints.X.v, isVisible: true, confidence: 1 },
    { id: "ImagePoint_15", worldPointId: "WorldPoint_3", viewpointId: "Viewpoint_4", u: imagePoints.Z.u, v: imagePoints.Z.v, isVisible: true, confidence: 1 }
  ],
  constraints: [],
  vanishingLines: [
    { id: "VanishingLine_5", viewpointId: "Viewpoint_4", axis: "x", p1: vl_x1.p1, p2: vl_x1.p2 },
    { id: "VanishingLine_6", viewpointId: "Viewpoint_4", axis: "x", p1: vl_x2.p1, p2: vl_x2.p2 },
    { id: "VanishingLine_7", viewpointId: "Viewpoint_4", axis: "z", p1: vl_z1.p1, p2: vl_z1.p2 },
    { id: "VanishingLine_8", viewpointId: "Viewpoint_4", axis: "z", p1: vl_z2.p1, p2: vl_z2.p2 }
  ],
  showPointNames: true, autoSave: true, theme: "dark", measurementUnits: "meters",
  precisionDigits: 3, showConstraintGlyphs: true, showMeasurements: true, autoOptimize: false,
  gridVisible: true, snapToGrid: false, defaultWorkspace: "world", showConstructionGeometry: true,
  enableSmartSnapping: true, constraintPreview: true, visualFeedbackLevel: "standard",
  viewSettings: {
    visibility: { worldPoints: true, lines: true, planes: true, vanishingLines: true, vanishingPoints: true, perspectiveGrid: false, reprojectionErrors: false, cameraVanishingGeometry: false },
    locking: { worldPoints: false, lines: false, planes: false, vanishingLines: false },
    isExpanded: false
  }
};

const fixturePath = './src/optimization/__tests__/fixtures/vp-positive-coords.json';
fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));
console.log('\nFixture written to: ' + fixturePath);
