import { describe, it, expect } from '@jest/globals';
import { EntityProject } from '../../entities/project';
import { Viewpoint } from '../../entities/viewpoint';
import { WorldPoint } from '../../entities/world-point';
import { VanishingLine } from '../../entities/vanishing-line';
import { ImagePoint } from '../../entities/imagePoint';
import { initializeCameraWithVanishingPoints } from '../vanishing-points';

describe('Vanishing Point Roll Correction', () => {
  it('should initialize camera with Y VP horizontally centered between X and Z VPs', () => {
    const project = new EntityProject();

    const viewpoint = new Viewpoint(
      'test-view',
      'test.jpg',
      '',
      1920,
      1080
    );
    viewpoint.principalPointX = 960;
    viewpoint.principalPointY = 540;
    viewpoint.focalLength = 243.6;
    project.addViewpoint(viewpoint);

    const origin = new WorldPoint('origin');
    origin.lockedXyz = [0, 0, 0];
    project.addWorldPoint(origin);

    const zPoint = new WorldPoint('z-point');
    zPoint.lockedXyz = [0, 0, 10];
    project.addWorldPoint(zPoint);

    const originImage = new ImagePoint(origin, viewpoint);
    originImage.u = 540.61;
    originImage.v = 713.43;
    project.addImagePoint(originImage);

    const zImage = new ImagePoint(zPoint, viewpoint);
    zImage.u = 647.87;
    zImage.v = 644.01;
    project.addImagePoint(zImage);

    const xLine1 = new VanishingLine(viewpoint, 'x');
    xLine1.p1 = { u: 110.5, v: 326.5 };
    xLine1.p2 = { u: 357.5, v: 144.5 };
    project.addVanishingLine(xLine1);

    const xLine2 = new VanishingLine(viewpoint, 'x');
    xLine2.p1 = { u: 101.5, v: 411.5 };
    xLine2.p2 = { u: 368.5, v: 593.5 };
    project.addVanishingLine(xLine2);

    const zLine1 = new VanishingLine(viewpoint, 'z');
    zLine1.p1 = { u: 771.5, v: 178.5 };
    zLine1.p2 = { u: 974.5, v: 317.5 };
    project.addVanishingLine(zLine1);

    const zLine2 = new VanishingLine(viewpoint, 'z');
    zLine2.p1 = { u: 753.5, v: 574.5 };
    zLine2.p2 = { u: 997.5, v: 411.5 };
    project.addVanishingLine(zLine2);

    const success = initializeCameraWithVanishingPoints(viewpoint, project.worldPoints);
    expect(success).toBe(true);

    const cameraVps = (viewpoint as any).__initialCameraVps;
    expect(cameraVps).toBeDefined();
    expect(cameraVps.x).toBeDefined();
    expect(cameraVps.y).toBeDefined();
    expect(cameraVps.z).toBeDefined();

    const xVpU = cameraVps.x.u;
    const zVpU = cameraVps.z.u;
    const yVpU = cameraVps.y.u;

    const expectedMidpointU = (xVpU + zVpU) / 2;

    console.log('\n=== Vanishing Point Roll Correction Test ===');
    console.log(`Image size: ${viewpoint.imageWidth}x${viewpoint.imageHeight}`);
    console.log(`Principal point: (${viewpoint.principalPointX}, ${viewpoint.principalPointY})`);
    console.log(`\nCamera's predicted vanishing points after initialization:`);
    console.log(`  X-axis VP: u=${xVpU.toFixed(2)}, v=${cameraVps.x.v.toFixed(2)}`);
    console.log(`  Y-axis VP: u=${yVpU.toFixed(2)}, v=${cameraVps.y.v.toFixed(2)}`);
    console.log(`  Z-axis VP: u=${zVpU.toFixed(2)}, v=${cameraVps.z.v.toFixed(2)}`);
    console.log(`\nExpected Y VP horizontal position (midpoint): ${expectedMidpointU.toFixed(2)}`);
    console.log(`Actual Y VP horizontal position: ${yVpU.toFixed(2)}`);
    console.log(`Horizontal error: ${Math.abs(yVpU - expectedMidpointU).toFixed(2)} pixels\n`);

    expect(Math.abs(yVpU - expectedMidpointU)).toBeLessThan(10);
  });
});
