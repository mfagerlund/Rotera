/**
 * Helper functions for generating test fixtures
 */

/**
 * Convert Euler angles to quaternion
 */
export function quaternionFromEuler(rx: number, ry: number, rz: number): [number, number, number, number] {
  const cx = Math.cos(rx / 2);
  const sx = Math.sin(rx / 2);
  const cy = Math.cos(ry / 2);
  const sy = Math.sin(ry / 2);
  const cz = Math.cos(rz / 2);
  const sz = Math.sin(rz / 2);

  const w = cx * cy * cz + sx * sy * sz;
  const x = sx * cy * cz - cx * sy * sz;
  const y = cx * sy * cz + sx * cy * sz;
  const z = cx * cy * sz - sx * sy * cz;

  return [w, x, y, z];
}

/**
 * Rotate a 3D vector by a quaternion
 */
export function rotateVectorByQuaternion(
  point: [number, number, number],
  quat: [number, number, number, number]
): [number, number, number] {
  const [w, x, y, z] = quat;
  const [px, py, pz] = point;

  const ix = w * px + y * pz - z * py;
  const iy = w * py + z * px - x * pz;
  const iz = w * pz + x * py - y * px;
  const iw = -x * px - y * py - z * pz;

  const rx = ix * w + iw * -x + iy * -z - iz * -y;
  const ry = iy * w + iw * -y + iz * -x - ix * -z;
  const rz = iz * w + iw * -z + ix * -y - iy * -x;

  return [rx, ry, rz];
}

/**
 * Project a 3D world point to 2D pixel coordinates
 */
export function projectWorldPointToPixel(
  worldPoint: [number, number, number],
  cameraPosition: [number, number, number],
  cameraRotationQuat: [number, number, number, number],
  focalLength: number,
  aspectRatio: number,
  principalPointX: number,
  principalPointY: number,
  skew: number = 0
): [number, number] | null {
  const translated: [number, number, number] = [
    worldPoint[0] - cameraPosition[0],
    worldPoint[1] - cameraPosition[1],
    worldPoint[2] - cameraPosition[2]
  ];

  const cameraPoint = rotateVectorByQuaternion(translated, cameraRotationQuat);

  if (cameraPoint[2] < 0.1) {
    return null;
  }

  const xNorm = cameraPoint[0] / cameraPoint[2];
  const yNorm = cameraPoint[1] / cameraPoint[2];

  const fx = focalLength;
  const fy = focalLength * aspectRatio;

  // NOTE: v uses subtraction because image Y increases downward
  // This matches the optimizer's camera-projection.ts formula
  const u = fx * xNorm + skew * yNorm + principalPointX;
  const v = principalPointY - fy * yNorm;

  return [u, v];
}

/**
 * Standard camera parameters for test fixtures
 */
export const StandardCameraParams = {
  imageWidth: 1920,
  imageHeight: 1080,
  focalLength: 1500,
  aspectRatio: 1.0,
  get principalPointX() {
    return this.imageWidth / 2;
  },
  get principalPointY() {
    return this.imageHeight / 2;
  },
  skewCoefficient: 0
} as const;

/**
 * Common configuration for camera parameters
 */
export interface CameraConfig {
  imageWidth: number;
  imageHeight: number;
  focalLength: number;
  aspectRatio: number;
  principalPointX: number;
  principalPointY: number;
  skewCoefficient: number;
}

export function getStandardCameraConfig(): CameraConfig {
  return {
    imageWidth: StandardCameraParams.imageWidth,
    imageHeight: StandardCameraParams.imageHeight,
    focalLength: StandardCameraParams.focalLength,
    aspectRatio: StandardCameraParams.aspectRatio,
    principalPointX: StandardCameraParams.principalPointX,
    principalPointY: StandardCameraParams.principalPointY,
    skewCoefficient: StandardCameraParams.skewCoefficient
  };
}

/**
 * Create a viewpoint with standard camera parameters
 */
export function createStandardViewpoint(
  name: string,
  imagePath: string,
  config: CameraConfig = getStandardCameraConfig()
) {
  const { Viewpoint } = require('../../entities/viewpoint');
  const viewpoint = Viewpoint.create(
    name,
    imagePath,
    '',
    config.imageWidth,
    config.imageHeight,
    {
      focalLength: config.focalLength,
      principalPointX: config.principalPointX,
      principalPointY: config.principalPointY,
      aspectRatio: config.aspectRatio,
      skewCoefficient: config.skewCoefficient
    }
  );
  viewpoint.position = [0, 0, 0];
  viewpoint.rotation = [1, 0, 0, 0];
  return viewpoint;
}

/**
 * Create world points and project them to image points for a viewpoint
 */
export function createAndProjectWorldPoints(
  project: any,
  worldPointData: Array<{ name: string; position: [number, number, number]; lockedXyz?: [number | null, number | null, number | null] }>,
  viewpoint: any,
  cameraPosition: [number, number, number],
  cameraRotationQuat: [number, number, number, number],
  config: CameraConfig = getStandardCameraConfig()
) {
  const { WorldPoint } = require('../../entities/world-point');
  const { ImagePoint } = require('../../entities/imagePoint');

  const worldPoints: any[] = [];

  for (const wpData of worldPointData) {
    const wp = WorldPoint.create(wpData.name);
    if (wpData.lockedXyz) {
      wp.lockedXyz = wpData.lockedXyz;
    }
    project.addWorldPoint(wp);
    worldPoints.push(wp);

    const projected = projectWorldPointToPixel(
      wpData.position,
      cameraPosition,
      cameraRotationQuat,
      config.focalLength,
      config.aspectRatio,
      config.principalPointX,
      config.principalPointY,
      config.skewCoefficient
    );

    if (projected === null) {
      throw new Error(`Point ${wp.name} projects behind camera`);
    }

    const [u, v] = projected;
    const ip = ImagePoint.create(wp, viewpoint, u, v);
    project.addImagePoint(ip);
  }

  return worldPoints;
}

/**
 * Create vanishing lines for a viewpoint
 */
export function createVanishingLines(
  viewpoint: any,
  worldLines: Array<{ direction: 'x' | 'y' | 'z'; endpoints: [[number, number, number], [number, number, number]] }>,
  cameraPosition: [number, number, number],
  cameraRotationQuat: [number, number, number, number],
  config: CameraConfig = getStandardCameraConfig()
) {
  const { VanishingLine } = require('../../entities/vanishing-line');

  let lineCounter = 0;
  for (const { direction, endpoints } of worldLines) {
    const [p1_3d, p2_3d] = endpoints;

    const p1_2d = projectWorldPointToPixel(
      p1_3d,
      cameraPosition,
      cameraRotationQuat,
      config.focalLength,
      config.aspectRatio,
      config.principalPointX,
      config.principalPointY,
      config.skewCoefficient
    );

    const p2_2d = projectWorldPointToPixel(
      p2_3d,
      cameraPosition,
      cameraRotationQuat,
      config.focalLength,
      config.aspectRatio,
      config.principalPointX,
      config.principalPointY,
      config.skewCoefficient
    );

    if (p1_2d && p2_2d) {
      VanishingLine.fromDto(
        `VL_${direction.toUpperCase()}_${lineCounter++}`,
        viewpoint,
        direction,
        { u: p1_2d[0], v: p1_2d[1] },
        { u: p2_2d[0], v: p2_2d[1] }
      );
    }
  }
}

/**
 * Save a project fixture to disk
 */
export function saveFixture(project: any, filename: string) {
  const { saveProjectToJson } = require('../../store/project-serialization');
  const fs = require('fs');
  const path = require('path');

  const json = saveProjectToJson(project);
  const fixturesDir = path.join(__dirname, 'fixtures');
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  const fixturePath = path.join(fixturesDir, filename);
  fs.writeFileSync(fixturePath, json, 'utf-8');

  console.log(`Generated fixture: ${fixturePath}`);
  console.log(`File size: ${(json.length / 1024).toFixed(2)} KB`);
}
