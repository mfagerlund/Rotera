import { describe, it, expect } from '@jest/globals';
import { initializeCameraWithPnP } from '../pnp';
import { Viewpoint } from '../../entities/viewpoint';
import { WorldPoint } from '../../entities/world-point';
import { ImagePoint } from '../../entities/imagePoint';

describe('PnP Camera Initialization', () => {
  it('should initialize camera using geometric heuristic', () => {
    const vp = Viewpoint.create(
      'TestCamera',
      'test.jpg',
      'http://test.jpg',
      1000,
      1000,
      {
        focalLength: 1000,
        principalPointX: 500,
        principalPointY: 500
      }
    );

    const wp1 = WorldPoint.create('WP1');
    wp1.optimizedXyz = [0, 0, 0];
    const wp2 = WorldPoint.create('WP2');
    wp2.optimizedXyz = [10, 0, 0];
    const wp3 = WorldPoint.create('WP3');
    wp3.optimizedXyz = [0, 10, 0];
    const wp4 = WorldPoint.create('WP4');
    wp4.optimizedXyz = [10, 10, 0];

    const ip1 = ImagePoint.create(wp1, vp, 400, 400);
    const ip2 = ImagePoint.create(wp2, vp, 600, 400);
    const ip3 = ImagePoint.create(wp3, vp, 400, 600);
    const ip4 = ImagePoint.create(wp4, vp, 600, 600);

    vp.addImagePoint(ip1);
    vp.addImagePoint(ip2);
    vp.addImagePoint(ip3);
    vp.addImagePoint(ip4);

    const worldPoints = new Set([wp1, wp2, wp3, wp4]);

    const result = initializeCameraWithPnP(vp, worldPoints);

    expect(result.success).toBe(true);
    expect(vp.position).toBeDefined();
    expect(vp.position[0]).toBeCloseTo(5, 0);
    expect(vp.position[1]).toBeCloseTo(5, 0);
    expect(vp.position[2]).toBeLessThan(0);
  });

  it('should fail with insufficient points', () => {
    const vp = Viewpoint.create(
      'TestCamera',
      'test.jpg',
      'http://test.jpg',
      1000,
      1000,
      {
        focalLength: 1000
      }
    );

    const wp1 = WorldPoint.create('WP1');
    wp1.optimizedXyz = [0, 0, 0];
    const wp2 = WorldPoint.create('WP2');
    wp2.optimizedXyz = [10, 0, 0];

    const ip1 = ImagePoint.create(wp1, vp, 400, 400);
    const ip2 = ImagePoint.create(wp2, vp, 600, 400);

    vp.addImagePoint(ip1);
    vp.addImagePoint(ip2);

    const worldPoints = new Set([wp1, wp2]);

    const result = initializeCameraWithPnP(vp, worldPoints);

    expect(result.success).toBe(false);
  });

  it('should handle points without optimizedXyz', () => {
    const vp = Viewpoint.create(
      'TestCamera',
      'test.jpg',
      'http://test.jpg',
      1000,
      1000
    );

    const wp1 = WorldPoint.create('WP1');
    const wp2 = WorldPoint.create('WP2');
    const wp3 = WorldPoint.create('WP3');

    const ip1 = ImagePoint.create(wp1, vp, 400, 400);
    const ip2 = ImagePoint.create(wp2, vp, 600, 400);
    const ip3 = ImagePoint.create(wp3, vp, 400, 600);

    vp.addImagePoint(ip1);
    vp.addImagePoint(ip2);
    vp.addImagePoint(ip3);

    const worldPoints = new Set([wp1, wp2, wp3]);

    const result = initializeCameraWithPnP(vp, worldPoints);

    expect(result.success).toBe(false);
  });
});
