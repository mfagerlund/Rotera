/**
 * Tests for ConstraintSystem.buildAnalyticalProviders()
 *
 * Validates Phase 6 of scalar-autograd removal:
 * - ConstraintSystem correctly builds analytical providers from entities
 * - Provider counts match expected residual counts
 * - Variable layout matches entity structure
 */

import { ConstraintSystem } from '../ConstraintSystem';
import { WorldPoint } from '../../../entities/world-point/WorldPoint';
import { Line } from '../../../entities/line/Line';
import { Viewpoint } from '../../../entities/viewpoint/Viewpoint';
import { ImagePoint } from '../../../entities/imagePoint/ImagePoint';
import { DistanceConstraint } from '../../../entities/constraints/distance-constraint';
import { AngleConstraint } from '../../../entities/constraints/angle-constraint';
import { CoplanarPointsConstraint } from '../../../entities/constraints/coplanar-points-constraint';

describe('ConstraintSystem.buildAnalyticalProviders', () => {
  it('builds providers for world points and lines', () => {
    // Create a simple system: 2 points connected by a line
    const pointA = WorldPoint.create('A', { lockedXyz: [null, null, null], optimizedXyz: [0, 0, 0] });
    const pointB = WorldPoint.create('B', { lockedXyz: [null, null, null], optimizedXyz: [1, 0, 0] });
    const line = Line.create('AB', pointA, pointB, { direction: 'x', targetLength: 1.0 });

    const system = new ConstraintSystem();
    system.addPoint(pointA);
    system.addPoint(pointB);
    system.addLine(line);

    const { providers, layout } = system.buildAnalyticalProviders();

    // 6 variables (2 points × 3 coords)
    expect(layout.numVariables).toBe(6);

    // Direction 'x' creates 2 providers (y and z components)
    // Length creates 1 provider
    expect(providers.length).toBe(3);

    // Verify providers compute valid residuals
    const vars = layout.initialValues;
    for (const provider of providers) {
      const residual = provider.computeResidual(vars);
      expect(isFinite(residual)).toBe(true);

      const gradient = provider.computeGradient(vars);
      expect(gradient.length).toBe(provider.variableIndices.length);
    }
  });

  it('builds providers for locked points', () => {
    // Point A is locked, point B is free
    const pointA = WorldPoint.create('A', { lockedXyz: [0, 0, 0] });
    const pointB = WorldPoint.create('B', { lockedXyz: [null, null, null], optimizedXyz: [1, 0, 0] });
    const line = Line.create('AB', pointA, pointB, { direction: 'x' });

    const system = new ConstraintSystem();
    system.addPoint(pointA);
    system.addPoint(pointB);
    system.addLine(line);

    const { providers, layout } = system.buildAnalyticalProviders();

    // Only 3 variables (point B's 3 coords, point A is locked)
    expect(layout.numVariables).toBe(3);

    // Direction 'x' creates 2 providers
    expect(providers.length).toBe(2);

    // Verify locked point indices are -1
    const aIndices = layout.getWorldPointIndices(pointA);
    expect(aIndices).toEqual([-1, -1, -1]);

    // Verify locked values are available
    expect(layout.getLockedWorldPointValue(pointA, 'x')).toBe(0);
    expect(layout.getLockedWorldPointValue(pointA, 'y')).toBe(0);
    expect(layout.getLockedWorldPointValue(pointA, 'z')).toBe(0);
  });

  it('builds providers for distance constraints', () => {
    const pointA = WorldPoint.create('A', { lockedXyz: [null, null, null], optimizedXyz: [0, 0, 0] });
    const pointB = WorldPoint.create('B', { lockedXyz: [null, null, null], optimizedXyz: [2, 0, 0] });

    const constraint = DistanceConstraint.create('dist', pointA, pointB, 2.0);

    const system = new ConstraintSystem();
    system.addPoint(pointA);
    system.addPoint(pointB);
    system.addConstraint(constraint);

    const { providers, layout } = system.buildAnalyticalProviders();

    // 1 distance provider
    expect(providers.length).toBe(1);

    // Residual should be ~0 since actual distance = target
    const vars = layout.initialValues;
    const residual = providers[0].computeResidual(vars);
    expect(Math.abs(residual)).toBeLessThan(0.001);
  });

  it('builds providers for angle constraints', () => {
    const pointA = WorldPoint.create('A', { lockedXyz: [null, null, null], optimizedXyz: [1, 0, 0] });
    const vertex = WorldPoint.create('V', { lockedXyz: [null, null, null], optimizedXyz: [0, 0, 0] });
    const pointC = WorldPoint.create('C', { lockedXyz: [null, null, null], optimizedXyz: [0, 1, 0] });

    // 90 degree angle
    const constraint = AngleConstraint.create('angle', pointA, vertex, pointC, 90);

    const system = new ConstraintSystem();
    system.addPoint(pointA);
    system.addPoint(vertex);
    system.addPoint(pointC);
    system.addConstraint(constraint);

    const { providers, layout } = system.buildAnalyticalProviders();

    // 1 angle provider
    expect(providers.length).toBe(1);

    // Residual should be ~0 since actual angle = target
    const vars = layout.initialValues;
    const residual = providers[0].computeResidual(vars);
    expect(Math.abs(residual)).toBeLessThan(0.001);
  });

  it('builds providers for coplanar constraints', () => {
    const p0 = WorldPoint.create('P0', { lockedXyz: [null, null, null], optimizedXyz: [0, 0, 0] });
    const p1 = WorldPoint.create('P1', { lockedXyz: [null, null, null], optimizedXyz: [1, 0, 0] });
    const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null], optimizedXyz: [0, 1, 0] });
    const p3 = WorldPoint.create('P3', { lockedXyz: [null, null, null], optimizedXyz: [1, 1, 0] });
    const p4 = WorldPoint.create('P4', { lockedXyz: [null, null, null], optimizedXyz: [0.5, 0.5, 0] });

    const constraint = CoplanarPointsConstraint.create('coplanar', [p0, p1, p2, p3, p4]);

    const system = new ConstraintSystem();
    system.addPoint(p0);
    system.addPoint(p1);
    system.addPoint(p2);
    system.addPoint(p3);
    system.addPoint(p4);
    system.addConstraint(constraint);

    const { providers, layout } = system.buildAnalyticalProviders();

    // 5 points = 2 coplanar providers (5-3 = 2)
    expect(providers.length).toBe(2);

    // Residuals should be ~0 since all points are in XY plane
    const vars = layout.initialValues;
    for (const provider of providers) {
      const residual = provider.computeResidual(vars);
      expect(Math.abs(residual)).toBeLessThan(0.001);
    }
  });

  it('builds providers for camera quaternion normalization', () => {
    const point = WorldPoint.create('P', { lockedXyz: [null, null, null], optimizedXyz: [0, 0, 5] });

    // Create a camera (Viewpoint) - quaternion should be normalized
    const camera = Viewpoint.create('Camera', 'camera.jpg', '/images/camera.jpg', 640, 480, {
      focalLength: 500,
      position: [0, 0, 0],
      rotation: [1, 0, 0, 0], // Identity quaternion
    });

    const system = new ConstraintSystem();
    system.addPoint(point);
    system.addCamera(camera);

    const { providers, layout } = system.buildAnalyticalProviders();

    // 3 (point) + 7 (camera pose) = 10 variables
    expect(layout.numVariables).toBe(10);

    // 1 quaternion norm provider
    expect(providers.length).toBe(1);

    // Residual should be 0 for normalized quaternion
    const vars = layout.initialValues;
    const residual = providers[0].computeResidual(vars);
    expect(Math.abs(residual)).toBeLessThan(0.001);
  });

  it('builds providers for reprojection constraints', () => {
    const point = WorldPoint.create('P', { lockedXyz: [null, null, null], optimizedXyz: [0, 0, 5] });

    const camera = Viewpoint.create('Camera', 'camera.jpg', '/images/camera.jpg', 640, 480, {
      focalLength: 500,
      position: [0, 0, 0],
      rotation: [1, 0, 0, 0],
    });

    // Point projects to center
    const imagePoint = ImagePoint.create(point, camera, 320, 240);

    const system = new ConstraintSystem();
    system.addPoint(point);
    system.addCamera(camera);
    system.addImagePoint(imagePoint);

    const { providers, layout } = system.buildAnalyticalProviders();

    // 3 providers: quat norm + 2 reprojection (U, V)
    expect(providers.length).toBe(3);
  });

  it('builds providers for coincident points on lines', () => {
    const pointA = WorldPoint.create('A', { lockedXyz: [null, null, null], optimizedXyz: [0, 0, 0] });
    const pointB = WorldPoint.create('B', { lockedXyz: [null, null, null], optimizedXyz: [2, 0, 0] });
    const pointP = WorldPoint.create('P', { lockedXyz: [null, null, null], optimizedXyz: [1, 0, 0] }); // On line

    const line = Line.create('AB', pointA, pointB);
    line.addCoincidentPoint(pointP);

    const system = new ConstraintSystem();
    system.addPoint(pointA);
    system.addPoint(pointB);
    system.addPoint(pointP);
    system.addLine(line);

    const { providers, layout } = system.buildAnalyticalProviders();

    // 3 collinear providers (x, y, z components of cross product)
    expect(providers.length).toBe(3);

    // Residuals should be ~0 since P is on line AB
    const vars = layout.initialValues;
    for (const provider of providers) {
      const residual = provider.computeResidual(vars);
      expect(Math.abs(residual)).toBeLessThan(0.001);
    }
  });

  it('handles locked camera pose', () => {
    const point = WorldPoint.create('P', { lockedXyz: [null, null, null], optimizedXyz: [0, 0, 5] });

    const camera = Viewpoint.create('Camera', 'camera.jpg', '/images/camera.jpg', 640, 480, {
      focalLength: 500,
      position: [0, 0, 0],
      rotation: [1, 0, 0, 0],
      isPoseLocked: true,
    });

    // Verify the camera is actually pose-locked
    expect(camera.isPoseLocked).toBe(true);

    const system = new ConstraintSystem();
    system.addPoint(point);
    system.addCamera(camera);

    const { providers, layout } = system.buildAnalyticalProviders();

    // Verify camera indices
    const camPosIndices = layout.getCameraPosIndices('Camera');
    const camQuatIndices = layout.getCameraQuatIndices('Camera');

    // Camera should be locked, so indices should be -1
    expect(camPosIndices).toEqual([-1, -1, -1]);
    expect(camQuatIndices).toEqual([-1, -1, -1, -1]);

    // Only 3 variables (point coords, camera is locked)
    expect(layout.numVariables).toBe(3);

    // No quat norm provider for locked camera
    expect(providers.length).toBe(0);
  });
});
