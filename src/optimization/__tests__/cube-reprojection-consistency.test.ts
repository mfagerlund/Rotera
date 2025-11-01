import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import { projectWorldPointToPixelQuaternion } from '../camera-projection';
import { initializeCameraWithVanishingPoints } from '../vanishing-points';
import { V, Vec3, Vec4 } from 'scalar-autograd';
import type { Viewpoint } from '../../entities/viewpoint';

describe('Cube Fixture Reprojection', () => {
  it('should reproject all cube points after optimization', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'cube-2vps-4wps.json');
    const json = fs.readFileSync(fixturePath, 'utf8');
    const project = loadProjectFromJson(json);

    const viewpoint = Array.from(project.viewpoints)[0] as Viewpoint;
    expect(viewpoint).toBeDefined();

    const worldPoints = new Set(project.worldPoints);
    initializeCameraWithVanishingPoints(viewpoint, worldPoints);

    const result = optimizeProject(project, {
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false,
      verbose: false,
      maxIterations: 200,
      tolerance: 1e-9
    });

    const cameraPosition = new Vec3(
      V.C(viewpoint.position[0]),
      V.C(viewpoint.position[1]),
      V.C(viewpoint.position[2])
    );

    const cameraRotation = new Vec4(
      V.C(viewpoint.rotation[0]),
      V.C(viewpoint.rotation[1]),
      V.C(viewpoint.rotation[2]),
      V.C(viewpoint.rotation[3])
    );

    const focalLength = V.C(viewpoint.focalLength);
    const aspectRatio = V.C(viewpoint.aspectRatio);
    const principalPointX = V.C(viewpoint.principalPointX);
    const principalPointY = V.C(viewpoint.principalPointY);
    const skew = V.C(viewpoint.skewCoefficient);
    const k1 = V.C(viewpoint.radialDistortion[0]);
    const k2 = V.C(viewpoint.radialDistortion[1]);
    const k3 = V.C(viewpoint.radialDistortion[2]);
    const p1 = V.C(viewpoint.tangentialDistortion[0]);
    const p2 = V.C(viewpoint.tangentialDistortion[1]);

    let maxError = 0;

    for (const imagePoint of viewpoint.imagePoints) {
      const worldPoint = imagePoint.worldPoint;
      const raw = worldPoint.optimizedXyz ?? worldPoint.getEffectiveXyz();

      expect(raw).toBeDefined();
      const [x, y, z] = raw;
      expect(x).not.toBeNull();
      expect(y).not.toBeNull();
      expect(z).not.toBeNull();

      const worldVec = new Vec3(
        V.C(x as number),
        V.C(y as number),
        V.C(z as number)
      );

      const projection = projectWorldPointToPixelQuaternion(
        worldVec,
        cameraPosition,
        cameraRotation,
        focalLength,
        aspectRatio,
        principalPointX,
        principalPointY,
        skew,
        k1,
        k2,
        k3,
        p1,
        p2
      );

      expect(projection).not.toBeNull();

      if (projection) {
        const reprojU = projection[0].data;
        const reprojV = projection[1].data;
        const du = reprojU - imagePoint.u;
        const dv = reprojV - imagePoint.v;
        const error = Math.hypot(du, dv);
        maxError = Math.max(maxError, error);
      }
    }

    expect(maxError).toBeLessThan(1);
  });
});
