/**
 * Numerical Provider Factory
 *
 * Creates explicit Jacobian providers using numerical differentiation instead
 * of hand-coded gradients. This is used to validate the sparse solver
 * infrastructure independently of analytical gradient correctness.
 *
 * Key differences from ProviderFactory:
 * - Uses finite differences for all Jacobian computations
 * - Residual functions are the same, only gradient computation differs
 */

import type { WorldPoint } from '../../../entities/world-point/WorldPoint';
import type { Line } from '../../../entities/line/Line';
import type { IOptimizableCamera } from '../../IOptimizable';
import type { ImagePoint } from '../../../entities/imagePoint/ImagePoint';
import type { ResidualWithJacobian } from '../types';
import { VariableLayout, type CameraIndices } from './variable-layout';
import { createNumericalProvider } from '../providers/numerical-provider';

/** Constant slots for locked axis values */
type ConstantSlots = Map<string, number>;

/** Counter for generating unique provider IDs */
let numProviderIdCounter = 0;

function generateNumProviderId(prefix: string): string {
  return `num_${prefix}_${numProviderIdCounter++}`;
}

/**
 * Factory for creating numerical Jacobian providers from entity constraints.
 */
export class NumericalProviderFactory {
  private layout: VariableLayout;
  private constantSlots: ConstantSlots = new Map();

  constructor(layout: VariableLayout) {
    this.layout = layout;
    numProviderIdCounter = 0;
  }

  /**
   * Get full [x, y, z] indices for a world point, adding constant slots as needed.
   */
  private getPointIndices(point: WorldPoint): [number, number, number] {
    return this.layout.getFullPoint3DIndices(point, this.constantSlots);
  }

  /**
   * Create quaternion normalization provider.
   */
  createQuatNormProvider(camera: IOptimizableCamera): ResidualWithJacobian | null {
    const indices = this.layout.getCameraIndices(camera);
    if (!indices || indices.quaternion.w < 0) {
      return null;
    }

    const quatIndices = [
      indices.quaternion.w,
      indices.quaternion.x,
      indices.quaternion.y,
      indices.quaternion.z,
    ];

    return createNumericalProvider(
      generateNumProviderId('quat-norm'),
      'QuatNorm',
      quatIndices,
      (variables: number[]) => {
        const w = variables[quatIndices[0]];
        const x = variables[quatIndices[1]];
        const y = variables[quatIndices[2]];
        const z = variables[quatIndices[3]];
        return [w * w + x * x + y * y + z * z - 1];
      },
      1
    );
  }

  /**
   * Create providers for a line's direction and length constraints.
   */
  createLineProviders(line: Line): ResidualWithJacobian[] {
    const providers: ResidualWithJacobian[] = [];

    const pointAIndices = this.getPointIndices(line.pointA);
    const pointBIndices = this.getPointIndices(line.pointB);
    const allIndices = [...pointAIndices, ...pointBIndices];

    // Direction constraint
    if (line.direction !== 'free') {
      let residualFn: (variables: number[]) => number[];
      let residualCount = 1;

      switch (line.direction) {
        case 'x':
          // Perpendicular to X: dy and dz should be zero relative to total length
          residualFn = (variables: number[]) => {
            const dx = variables[pointBIndices[0]] - variables[pointAIndices[0]];
            const dy = variables[pointBIndices[1]] - variables[pointAIndices[1]];
            const dz = variables[pointBIndices[2]] - variables[pointAIndices[2]];
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-10;
            return [dy / len, dz / len];
          };
          residualCount = 2;
          break;
        case 'y':
          residualFn = (variables: number[]) => {
            const dx = variables[pointBIndices[0]] - variables[pointAIndices[0]];
            const dy = variables[pointBIndices[1]] - variables[pointAIndices[1]];
            const dz = variables[pointBIndices[2]] - variables[pointAIndices[2]];
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-10;
            return [dx / len, dz / len];
          };
          residualCount = 2;
          break;
        case 'z':
          residualFn = (variables: number[]) => {
            const dx = variables[pointBIndices[0]] - variables[pointAIndices[0]];
            const dy = variables[pointBIndices[1]] - variables[pointAIndices[1]];
            const dz = variables[pointBIndices[2]] - variables[pointAIndices[2]];
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-10;
            return [dx / len, dy / len];
          };
          residualCount = 2;
          break;
        case 'xy':
          residualFn = (variables: number[]) => {
            const dx = variables[pointBIndices[0]] - variables[pointAIndices[0]];
            const dy = variables[pointBIndices[1]] - variables[pointAIndices[1]];
            const dz = variables[pointBIndices[2]] - variables[pointAIndices[2]];
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-10;
            return [dz / len];
          };
          residualCount = 1;
          break;
        case 'xz':
          residualFn = (variables: number[]) => {
            const dx = variables[pointBIndices[0]] - variables[pointAIndices[0]];
            const dy = variables[pointBIndices[1]] - variables[pointAIndices[1]];
            const dz = variables[pointBIndices[2]] - variables[pointAIndices[2]];
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-10;
            return [dy / len];
          };
          residualCount = 1;
          break;
        case 'yz':
          residualFn = (variables: number[]) => {
            const dx = variables[pointBIndices[0]] - variables[pointAIndices[0]];
            const dy = variables[pointBIndices[1]] - variables[pointAIndices[1]];
            const dz = variables[pointBIndices[2]] - variables[pointAIndices[2]];
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-10;
            return [dx / len];
          };
          residualCount = 1;
          break;
        default:
          residualFn = () => [];
          residualCount = 0;
      }

      if (residualCount > 0) {
        providers.push(
          createNumericalProvider(
            generateNumProviderId('line-dir'),
            'LineDirection',
            allIndices,
            residualFn,
            residualCount
          )
        );
      }
    }

    // Length constraint
    if (line.hasFixedLength() && line.targetLength !== undefined) {
      const target = line.targetLength;
      const scale = 100; // Same scale as analytical

      providers.push(
        createNumericalProvider(
          generateNumProviderId('line-len'),
          'LineLength',
          allIndices,
          (variables: number[]) => {
            const dx = variables[pointBIndices[0]] - variables[pointAIndices[0]];
            const dy = variables[pointBIndices[1]] - variables[pointAIndices[1]];
            const dz = variables[pointBIndices[2]] - variables[pointAIndices[2]];
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            return [scale * (len - target)];
          },
          1
        )
      );
    }

    // Coincident points
    for (const coincidentPoint of line.coincidentPoints) {
      const pointPIndices = this.getPointIndices(coincidentPoint);
      const coinIndices = [...pointAIndices, ...pointBIndices, ...pointPIndices];
      const scale = 100;

      providers.push(
        createNumericalProvider(
          generateNumProviderId('coincident'),
          'CoincidentPoint',
          coinIndices,
          (variables: number[]) => {
            const ax = variables[pointAIndices[0]];
            const ay = variables[pointAIndices[1]];
            const az = variables[pointAIndices[2]];
            const bx = variables[pointBIndices[0]];
            const by = variables[pointBIndices[1]];
            const bz = variables[pointBIndices[2]];
            const px = variables[pointPIndices[0]];
            const py = variables[pointPIndices[1]];
            const pz = variables[pointPIndices[2]];

            // Vector AP
            const apx = px - ax;
            const apy = py - ay;
            const apz = pz - az;

            // Vector AB
            const abx = bx - ax;
            const aby = by - ay;
            const abz = bz - az;

            // Cross product AP × AB (should be zero if P is on line)
            const crossX = apy * abz - apz * aby;
            const crossY = apz * abx - apx * abz;
            const crossZ = apx * aby - apy * abx;

            return [scale * crossX, scale * crossY, scale * crossZ];
          },
          3
        )
      );
    }

    return providers;
  }

  /**
   * Create reprojection providers for a world point's image points.
   */
  createReprojectionProviders(
    worldPoint: WorldPoint,
    imagePoints: ImagePoint[],
    cameras: Map<IOptimizableCamera, { camera: IOptimizableCamera; indices: CameraIndices }>
  ): ResidualWithJacobian[] {
    const providers: ResidualWithJacobian[] = [];
    const worldPointIndices = this.getPointIndices(worldPoint);

    for (const imagePoint of imagePoints) {
      const cameraData = cameras.get(imagePoint.viewpoint as IOptimizableCamera);
      if (!cameraData) continue;

      const { camera, indices: camIndices } = cameraData;

      if (camIndices.position.x < 0 || camIndices.quaternion.w < 0) {
        continue;
      }

      const camPosIndices: [number, number, number] = [
        camIndices.position.x,
        camIndices.position.y,
        camIndices.position.z,
      ];
      const quatIndices: [number, number, number, number] = [
        camIndices.quaternion.w,
        camIndices.quaternion.x,
        camIndices.quaternion.y,
        camIndices.quaternion.z,
      ];

      // All variable indices for this residual
      const allIndices = [...worldPointIndices, ...camPosIndices, ...quatIndices];

      // Camera intrinsics (constants for this provider)
      const fx = camera.focalLength;
      const fy = camera.focalLength * camera.aspectRatio;
      const cx = camera.principalPointX;
      const cy = camera.principalPointY;
      const k1 = camera.radialDistortion[0];
      const k2 = camera.radialDistortion[1];
      const k3 = camera.radialDistortion[2];
      const p1 = camera.tangentialDistortion[0];
      const p2 = camera.tangentialDistortion[1];
      const observedU = imagePoint.u;
      const observedV = imagePoint.v;
      const isZReflected = camera.isZReflected;

      providers.push(
        createNumericalProvider(
          generateNumProviderId('reproj'),
          'Reprojection',
          allIndices,
          (variables: number[]) => {
            // World point
            const wpx = variables[worldPointIndices[0]];
            const wpy = variables[worldPointIndices[1]];
            const wpz = variables[worldPointIndices[2]];

            // Camera position
            const cpx = variables[camPosIndices[0]];
            const cpy = variables[camPosIndices[1]];
            const cpz = variables[camPosIndices[2]];

            // Quaternion
            const qw = variables[quatIndices[0]];
            const qx = variables[quatIndices[1]];
            const qy = variables[quatIndices[2]];
            const qz = variables[quatIndices[3]];

            // Transform to camera space
            const tx = wpx - cpx;
            const ty = wpy - cpy;
            const tz = wpz - cpz;

            // Quaternion rotation (same formula as reprojection-provider.ts)
            const qcx = qy * tz - qz * ty;
            const qcy = qz * tx - qx * tz;
            const qcz = qx * ty - qy * tx;
            const dcx = qy * qcz - qz * qcy;
            const dcy = qz * qcx - qx * qcz;
            const dcz = qx * qcy - qy * qcx;

            let camX = tx + 2 * qw * qcx + 2 * dcx;
            let camY = ty + 2 * qw * qcy + 2 * dcy;
            let camZ = tz + 2 * qw * qcz + 2 * dcz;

            // Handle Z-reflection
            if (isZReflected) {
              camX = -camX;
              camY = -camY;
              camZ = -camZ;
            }

            // Behind camera penalty
            if (camZ <= 0) {
              return [1000, 1000];
            }

            // Perspective projection
            const normX = camX / camZ;
            const normY = camY / camZ;

            // Radial distortion
            const r2 = normX * normX + normY * normY;
            const r4 = r2 * r2;
            const r6 = r4 * r2;
            const radial = 1 + k1 * r2 + k2 * r4 + k3 * r6;

            // Tangential distortion
            const tangX = 2 * p1 * normX * normY + p2 * (r2 + 2 * normX * normX);
            const tangY = p1 * (r2 + 2 * normY * normY) + 2 * p2 * normX * normY;

            const distortedX = normX * radial + tangX;
            const distortedY = normY * radial + tangY;

            // Pixel coordinates
            const u = fx * distortedX + cx;
            const v = fy * distortedY + cy;

            return [u - observedU, v - observedV];
          },
          2
        )
      );
    }

    return providers;
  }
}
