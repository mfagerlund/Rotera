/**
 * Tests for analytical providers - verifies gradients match numerical gradients.
 */

import { createQuatNormProvider } from '../quat-norm-provider';
import { createDistanceProvider } from '../distance-provider';
import { createLineLengthProvider } from '../line-length-provider';
import { createCollinearProviders } from '../collinear-provider';
import { createAngleProvider } from '../angle-provider';
import { createCoplanarProvider, createCoplanarProviders } from '../coplanar-provider';
import { createCoincidentPointProviders } from '../coincident-point-provider';
import { createReprojectionUProvider, createReprojectionVProvider, createReprojectionProviders } from '../reprojection-provider';
import { AnalyticalResidualProvider } from '../../types';

/**
 * Helper to verify analytical gradient matches numerical gradient.
 */
function verifyGradient(
  provider: AnalyticalResidualProvider,
  variables: Float64Array,
  h = 1e-7,
  tolerance = 1e-5
): void {
  const analytical = provider.computeGradient(variables);
  const indices = provider.variableIndices;

  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    if (idx < 0) continue;

    // Compute numerical gradient using central differences
    const varsPlus = new Float64Array(variables);
    const varsMinus = new Float64Array(variables);
    varsPlus[idx] += h;
    varsMinus[idx] -= h;

    const rPlus = provider.computeResidual(varsPlus);
    const rMinus = provider.computeResidual(varsMinus);
    const numerical = (rPlus - rMinus) / (2 * h);

    expect(analytical[i]).toBeCloseTo(numerical, tolerance);
  }
}

describe('Quaternion Norm Provider', () => {
  it('computes correct residual', () => {
    const provider = createQuatNormProvider(
      [0, 1, 2, 3],
      (vars) => ({ w: vars[0], x: vars[1], y: vars[2], z: vars[3] })
    );

    // Unit quaternion: ||q||² - 1 = 0
    const unitQuat = new Float64Array([1, 0, 0, 0]);
    expect(provider.computeResidual(unitQuat)).toBeCloseTo(0);

    // Non-unit quaternion: ||q||² - 1 = 4 - 1 = 3
    const nonUnit = new Float64Array([1, 1, 1, 1]);
    expect(provider.computeResidual(nonUnit)).toBeCloseTo(3);
  });

  it('gradient matches numerical gradient', () => {
    const provider = createQuatNormProvider(
      [0, 1, 2, 3],
      (vars) => ({ w: vars[0], x: vars[1], y: vars[2], z: vars[3] })
    );

    const variables = new Float64Array([0.5, 0.5, 0.5, 0.5]);
    verifyGradient(provider, variables);
  });
});

describe('Distance Provider', () => {
  it('computes correct residual', () => {
    const provider = createDistanceProvider(
      [0, 1, 2],
      [3, 4, 5],
      5, // target distance
      (vars) => ({ x: vars[0], y: vars[1], z: vars[2] }),
      (vars) => ({ x: vars[3], y: vars[4], z: vars[5] })
    );

    // Points at (0,0,0) and (5,0,0) -> distance = 5, residual = 0
    const vars1 = new Float64Array([0, 0, 0, 5, 0, 0]);
    expect(provider.computeResidual(vars1)).toBeCloseTo(0);

    // Points at (0,0,0) and (10,0,0) -> distance = 10, residual = (10-5)/5 = 1
    const vars2 = new Float64Array([0, 0, 0, 10, 0, 0]);
    expect(provider.computeResidual(vars2)).toBeCloseTo(1);
  });

  it('gradient matches numerical gradient', () => {
    const provider = createDistanceProvider(
      [0, 1, 2],
      [3, 4, 5],
      5,
      (vars) => ({ x: vars[0], y: vars[1], z: vars[2] }),
      (vars) => ({ x: vars[3], y: vars[4], z: vars[5] })
    );

    const variables = new Float64Array([1, 2, 3, 4, 5, 6]);
    verifyGradient(provider, variables);
  });
});

describe('Line Length Provider', () => {
  it('gradient matches numerical gradient', () => {
    const provider = createLineLengthProvider(
      [0, 1, 2],
      [3, 4, 5],
      5, // target length
      0.2, // scale = 1/targetLength
      (vars) => ({ x: vars[0], y: vars[1], z: vars[2] }),
      (vars) => ({ x: vars[3], y: vars[4], z: vars[5] })
    );

    const variables = new Float64Array([1, 2, 3, 4, 5, 6]);
    verifyGradient(provider, variables);
  });
});

describe('Collinear Providers', () => {
  it('computes zero residual for collinear points', () => {
    const providers = createCollinearProviders(
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      (vars) => ({ x: vars[0], y: vars[1], z: vars[2] }),
      (vars) => ({ x: vars[3], y: vars[4], z: vars[5] }),
      (vars) => ({ x: vars[6], y: vars[7], z: vars[8] })
    );

    // Points on a line: (0,0,0), (1,1,1), (2,2,2)
    const collinear = new Float64Array([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    for (const provider of providers) {
      expect(provider.computeResidual(collinear)).toBeCloseTo(0);
    }
  });

  it('gradient matches numerical gradient', () => {
    const providers = createCollinearProviders(
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      (vars) => ({ x: vars[0], y: vars[1], z: vars[2] }),
      (vars) => ({ x: vars[3], y: vars[4], z: vars[5] }),
      (vars) => ({ x: vars[6], y: vars[7], z: vars[8] })
    );

    // Non-collinear points for better gradient testing
    const variables = new Float64Array([0, 0, 0, 1, 0, 0, 0.5, 0.5, 0]);

    for (const provider of providers) {
      verifyGradient(provider, variables);
    }
  });
});

describe('Angle Provider', () => {
  it('computes correct residual for right angle', () => {
    const provider = createAngleProvider(
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      Math.PI / 2, // target: 90 degrees
      (vars) => ({ x: vars[0], y: vars[1], z: vars[2] }),
      (vars) => ({ x: vars[3], y: vars[4], z: vars[5] }),
      (vars) => ({ x: vars[6], y: vars[7], z: vars[8] })
    );

    // Right angle: A=(1,0,0), vertex=(0,0,0), C=(0,1,0)
    const rightAngle = new Float64Array([1, 0, 0, 0, 0, 0, 0, 1, 0]);
    expect(provider.computeResidual(rightAngle)).toBeCloseTo(0);
  });

  it('gradient matches numerical gradient', () => {
    const provider = createAngleProvider(
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      Math.PI / 4, // 45 degrees
      (vars) => ({ x: vars[0], y: vars[1], z: vars[2] }),
      (vars) => ({ x: vars[3], y: vars[4], z: vars[5] }),
      (vars) => ({ x: vars[6], y: vars[7], z: vars[8] })
    );

    const variables = new Float64Array([2, 1, 0, 0, 0, 0, 1, 2, 0]);
    verifyGradient(provider, variables);
  });
});

describe('Coplanar Provider', () => {
  it('computes zero residual for coplanar points', () => {
    const provider = createCoplanarProvider(
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [9, 10, 11],
      (vars) => ({ x: vars[0], y: vars[1], z: vars[2] }),
      (vars) => ({ x: vars[3], y: vars[4], z: vars[5] }),
      (vars) => ({ x: vars[6], y: vars[7], z: vars[8] }),
      (vars) => ({ x: vars[9], y: vars[10], z: vars[11] })
    );

    // Points on XY plane: (0,0,0), (1,0,0), (0,1,0), (1,1,0)
    const coplanar = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]);
    expect(provider.computeResidual(coplanar)).toBeCloseTo(0);
  });

  it('gradient matches numerical gradient', () => {
    const provider = createCoplanarProvider(
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [9, 10, 11],
      (vars) => ({ x: vars[0], y: vars[1], z: vars[2] }),
      (vars) => ({ x: vars[3], y: vars[4], z: vars[5] }),
      (vars) => ({ x: vars[6], y: vars[7], z: vars[8] }),
      (vars) => ({ x: vars[9], y: vars[10], z: vars[11] })
    );

    // Non-coplanar for better gradient
    const variables = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0.5, 0.5, 0.5]);
    verifyGradient(provider, variables);
  });
});

describe('Coplanar Providers (rotating base triangles)', () => {
  it('creates correct number of providers for N points', () => {
    // 5 points -> 2 residuals (5-3=2)
    const indices: [number, number, number][] = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [9, 10, 11],
      [12, 13, 14],
    ];
    const providers = createCoplanarProviders(indices, (vars) => [
      { x: vars[0], y: vars[1], z: vars[2] },
      { x: vars[3], y: vars[4], z: vars[5] },
      { x: vars[6], y: vars[7], z: vars[8] },
      { x: vars[9], y: vars[10], z: vars[11] },
      { x: vars[12], y: vars[13], z: vars[14] },
    ]);

    expect(providers.length).toBe(2);
  });

  it('computes zero residual for all coplanar points', () => {
    const indices: [number, number, number][] = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [9, 10, 11],
      [12, 13, 14],
    ];
    const providers = createCoplanarProviders(indices, (vars) => [
      { x: vars[0], y: vars[1], z: vars[2] },
      { x: vars[3], y: vars[4], z: vars[5] },
      { x: vars[6], y: vars[7], z: vars[8] },
      { x: vars[9], y: vars[10], z: vars[11] },
      { x: vars[12], y: vars[13], z: vars[14] },
    ]);

    // 5 points on XY plane
    const coplanar = new Float64Array([
      0, 0, 0, // p0
      1, 0, 0, // p1
      0, 1, 0, // p2
      1, 1, 0, // p3
      2, 0.5, 0, // p4
    ]);

    for (const provider of providers) {
      expect(provider.computeResidual(coplanar)).toBeCloseTo(0);
    }
  });

  it('gradient matches numerical gradient for all providers', () => {
    const indices: [number, number, number][] = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [9, 10, 11],
      [12, 13, 14],
    ];
    const providers = createCoplanarProviders(indices, (vars) => [
      { x: vars[0], y: vars[1], z: vars[2] },
      { x: vars[3], y: vars[4], z: vars[5] },
      { x: vars[6], y: vars[7], z: vars[8] },
      { x: vars[9], y: vars[10], z: vars[11] },
      { x: vars[12], y: vars[13], z: vars[14] },
    ]);

    // Non-coplanar for meaningful gradients
    const variables = new Float64Array([
      0, 0, 0,
      1, 0, 0.1,
      0, 1, -0.1,
      1, 1, 0.2,
      0.5, 0.5, 0.3,
    ]);

    for (const provider of providers) {
      verifyGradient(provider, variables);
    }
  });

  it('returns empty array for less than 4 points', () => {
    const indices: [number, number, number][] = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
    ];
    const providers = createCoplanarProviders(indices, () => []);

    expect(providers.length).toBe(0);
  });
});

describe('Coincident Point Providers', () => {
  it('computes zero residual for point on line', () => {
    const providers = createCoincidentPointProviders(
      [0, 1, 2], // A
      [3, 4, 5], // B
      [6, 7, 8], // P
      1, // scale
      (vars) => ({ x: vars[0], y: vars[1], z: vars[2] }),
      (vars) => ({ x: vars[3], y: vars[4], z: vars[5] }),
      (vars) => ({ x: vars[6], y: vars[7], z: vars[8] })
    );

    // P on line AB: A=(0,0,0), B=(2,2,2), P=(1,1,1)
    const onLine = new Float64Array([0, 0, 0, 2, 2, 2, 1, 1, 1]);
    for (const provider of providers) {
      expect(provider.computeResidual(onLine)).toBeCloseTo(0);
    }
  });

  it('gradient matches numerical gradient', () => {
    const providers = createCoincidentPointProviders(
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      1,
      (vars) => ({ x: vars[0], y: vars[1], z: vars[2] }),
      (vars) => ({ x: vars[3], y: vars[4], z: vars[5] }),
      (vars) => ({ x: vars[6], y: vars[7], z: vars[8] })
    );

    // P not on line
    const variables = new Float64Array([0, 0, 0, 2, 0, 0, 1, 1, 0]);
    for (const provider of providers) {
      verifyGradient(provider, variables);
    }
  });
});

describe('Reprojection Providers', () => {
  // Standard camera intrinsics (no distortion for simpler testing)
  const intrinsics = {
    fx: 1000,
    fy: 1000,
    cx: 320,
    cy: 240,
    k1: 0,
    k2: 0,
    k3: 0,
    p1: 0,
    p2: 0,
  };

  // Variable layout:
  // 0,1,2 = world point (x,y,z)
  // 3,4,5 = camera position (x,y,z)
  // 6,7,8,9 = quaternion (w,x,y,z)

  const getWorldPoint = (vars: Float64Array) => ({ x: vars[0], y: vars[1], z: vars[2] });
  const getCameraPos = (vars: Float64Array) => ({ x: vars[3], y: vars[4], z: vars[5] });
  const getQuat = (vars: Float64Array) => ({ w: vars[6], x: vars[7], y: vars[8], z: vars[9] });

  it('createReprojectionUProvider gradient matches numerical', () => {
    const provider = createReprojectionUProvider(
      [0, 1, 2], // world point
      [3, 4, 5], // camera pos
      [6, 7, 8, 9], // quaternion
      intrinsics,
      320, // observed U (center of image)
      getWorldPoint,
      getCameraPos,
      getQuat
    );

    // Point at (0, 0, 5), camera at origin, identity quaternion (w=1, x=y=z=0)
    // This projects the point straight ahead onto the image center
    const variables = new Float64Array([0, 0, 5, 0, 0, 0, 1, 0, 0, 0]);

    verifyGradient(provider, variables);
  });

  it('createReprojectionVProvider gradient matches numerical', () => {
    const provider = createReprojectionVProvider(
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8, 9],
      intrinsics,
      240, // observed V (center of image)
      getWorldPoint,
      getCameraPos,
      getQuat
    );

    const variables = new Float64Array([0, 0, 5, 0, 0, 0, 1, 0, 0, 0]);

    verifyGradient(provider, variables);
  });

  it('createReprojectionProviders creates U and V providers', () => {
    const [uProvider, vProvider] = createReprojectionProviders(
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8, 9],
      intrinsics,
      { observedU: 320, observedV: 240 },
      getWorldPoint,
      getCameraPos,
      getQuat
    );

    const variables = new Float64Array([0, 0, 5, 0, 0, 0, 1, 0, 0, 0]);

    verifyGradient(uProvider, variables);
    verifyGradient(vProvider, variables);
  });

  it('computes near-zero residual for correct projection', () => {
    const provider = createReprojectionUProvider(
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8, 9],
      intrinsics,
      320, // observed U = cx (center)
      getWorldPoint,
      getCameraPos,
      getQuat
    );

    // Point at (0, 0, 5), camera at origin, identity quaternion
    // Project: camX=0, camY=0, camZ=5 -> normX=0, normY=0 -> u=cx=320
    const variables = new Float64Array([0, 0, 5, 0, 0, 0, 1, 0, 0, 0]);
    const residual = provider.computeResidual(variables);

    expect(residual).toBeCloseTo(0);
  });

  it('gradient matches numerical with non-identity quaternion', () => {
    const provider = createReprojectionUProvider(
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8, 9],
      intrinsics,
      400,
      getWorldPoint,
      getCameraPos,
      getQuat
    );

    // Non-trivial setup: rotated camera
    // Quaternion for 45-degree rotation around Y axis: w=cos(22.5°), y=sin(22.5°)
    const angle = Math.PI / 8; // 22.5 degrees (half of 45)
    const variables = new Float64Array([
      1, 2, 5, // world point
      0, 0, 0, // camera pos
      Math.cos(angle), 0, Math.sin(angle), 0, // quaternion
    ]);

    verifyGradient(provider, variables);
  });

  it('gradient matches numerical with distortion', () => {
    const intrinsicsWithDistortion = {
      fx: 1000,
      fy: 1000,
      cx: 320,
      cy: 240,
      k1: 0.1,
      k2: 0.01,
      k3: 0.001,
      p1: 0.001,
      p2: 0.001,
    };

    const provider = createReprojectionUProvider(
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8, 9],
      intrinsicsWithDistortion,
      400,
      getWorldPoint,
      getCameraPos,
      getQuat
    );

    const variables = new Float64Array([
      1, 0.5, 5,
      0, 0, 0,
      1, 0, 0, 0,
    ]);

    verifyGradient(provider, variables);
  });

  it('handles locked world point coordinates', () => {
    // Lock X coordinate of world point (index = -1)
    // Variable layout when X is locked:
    // 0 = world point Y
    // 1 = world point Z
    // 2,3,4 = camera position
    // 5,6,7,8 = quaternion
    const provider = createReprojectionUProvider(
      [-1, 0, 1], // X locked, Y at index 0, Z at index 1
      [2, 3, 4],
      [5, 6, 7, 8],
      intrinsics,
      320,
      (vars) => ({ x: 0, y: vars[0], z: vars[1] }), // X is fixed to 0
      (vars) => ({ x: vars[2], y: vars[3], z: vars[4] }),
      (vars) => ({ w: vars[5], x: vars[6], y: vars[7], z: vars[8] })
    );

    // Should have 9 active indices (not 10)
    expect(provider.variableIndices.length).toBe(9);

    // Variables: wpY=0, wpZ=5, cpX=0, cpY=0, cpZ=0, qW=1, qX=0, qY=0, qZ=0
    const variables = new Float64Array([0, 5, 0, 0, 0, 1, 0, 0, 0]);
    verifyGradient(provider, variables);
  });

  it('handles locked camera position', () => {
    // Lock entire camera position
    const provider = createReprojectionUProvider(
      [0, 1, 2],
      [-1, -1, -1], // All locked
      [3, 4, 5, 6],
      intrinsics,
      320,
      getWorldPoint,
      () => ({ x: 0, y: 0, z: 0 }), // Fixed camera pos
      (vars) => ({ w: vars[3], x: vars[4], y: vars[5], z: vars[6] })
    );

    // Should have 7 active indices (world point 3 + quat 4)
    expect(provider.variableIndices.length).toBe(7);

    const variables = new Float64Array([0, 0, 5, 1, 0, 0, 0]);
    verifyGradient(provider, variables);
  });
});
