/**
 * Provider Factory
 *
 * Creates explicit Jacobian providers from entity constraints.
 */

import type { WorldPoint } from '../../../entities/world-point/WorldPoint';
import type { Line } from '../../../entities/line/Line';
import type { DistanceConstraint } from '../../../entities/constraints/distance-constraint';
import type { AngleConstraint } from '../../../entities/constraints/angle-constraint';
import type { CollinearPointsConstraint } from '../../../entities/constraints/collinear-points-constraint';
import type { CoplanarPointsConstraint } from '../../../entities/constraints/coplanar-points-constraint';
import type { FixedPointConstraint } from '../../../entities/constraints/fixed-point-constraint';
import type { ParallelLinesConstraint } from '../../../entities/constraints/parallel-lines-constraint';
import type { PerpendicularLinesConstraint } from '../../../entities/constraints/perpendicular-lines-constraint';
import type { EqualDistancesConstraint } from '../../../entities/constraints/equal-distances-constraint';
import type { EqualAnglesConstraint } from '../../../entities/constraints/equal-angles-constraint';
import type { IOptimizableCamera } from '../../IOptimizable';
import type { ImagePoint } from '../../../entities/imagePoint/ImagePoint';
import type { ResidualWithJacobian } from '../types';
import { VariableLayout, type CameraIndices } from './variable-layout';
import {
  createDistanceProvider,
  createQuatNormProvider,
  createFixedPointProvider,
  createLineLengthProvider,
  createLineDirectionProvider,
  createCoincidentPointProvider,
  createAngleProvider,
  createCollinearProvider,
  createCoplanarProvider,
  createReprojectionProvider,
  createReprojectionWithIntrinsicsProvider,
  createParallelLinesProvider,
  createPerpendicularLinesProvider,
  createEqualDistancesProvider,
  createEqualAnglesProvider,
  createVanishingLineProvider,
  type VanishingLineAxis,
} from '../providers';
import { computeVanishingPoint } from '../../vanishing-points';

/** Constant slots for locked axis values */
type ConstantSlots = Map<string, number>;

/** Counter for generating unique provider IDs */
let providerIdCounter = 0;

function generateProviderId(prefix: string): string {
  return `${prefix}_${providerIdCounter++}`;
}

/**
 * Factory for creating explicit Jacobian providers from entity constraints.
 */
export class ProviderFactory {
  private layout: VariableLayout;
  private constantSlots: ConstantSlots = new Map();

  constructor(layout: VariableLayout) {
    this.layout = layout;
    // Reset counter for each factory instance
    providerIdCounter = 0;
  }

  /**
   * Get full [x, y, z] indices for a world point, adding constant slots as needed.
   */
  private getPointIndices(point: WorldPoint): [number, number, number] {
    return this.layout.getFullPoint3DIndices(point, this.constantSlots);
  }

  /**
   * Create providers for a line's direction and length constraints.
   */
  createLineProviders(line: Line): ResidualWithJacobian[] {
    const providers: ResidualWithJacobian[] = [];

    const pointAIndices = this.getPointIndices(line.pointA);
    const pointBIndices = this.getPointIndices(line.pointB);

    // Direction constraint
    if (line.direction !== 'free') {
      const dirProvider = createLineDirectionProvider(
        generateProviderId('line-dir'),
        pointAIndices,
        pointBIndices,
        line.direction
      );
      if (dirProvider) {
        providers.push(dirProvider);
      }
    }

    // Length constraint
    if (line.hasFixedLength() && line.targetLength !== undefined) {
      providers.push(
        createLineLengthProvider(
          generateProviderId('line-len'),
          pointAIndices,
          pointBIndices,
          line.targetLength
        )
      );
    }

    // Coincident points
    for (const coincidentPoint of line.coincidentPoints) {
      const pointPIndices = this.getPointIndices(coincidentPoint);
      providers.push(
        createCoincidentPointProvider(
          generateProviderId('coincident'),
          pointAIndices,
          pointBIndices,
          pointPIndices
        )
      );
    }

    return providers;
  }

  /**
   * Create provider for a distance constraint.
   */
  createDistanceProvider(constraint: DistanceConstraint): ResidualWithJacobian {
    const p1Indices = this.getPointIndices(constraint.pointA);
    const p2Indices = this.getPointIndices(constraint.pointB);

    return createDistanceProvider(
      generateProviderId('dist'),
      p1Indices,
      p2Indices,
      constraint.targetDistance
    );
  }

  /**
   * Create provider for an angle constraint.
   */
  createAngleProvider(constraint: AngleConstraint): ResidualWithJacobian {
    const pointAIndices = this.getPointIndices(constraint.pointA);
    const vertexIndices = this.getPointIndices(constraint.vertex);
    const pointCIndices = this.getPointIndices(constraint.pointC);

    // Convert degrees to radians
    const targetRadians = (constraint.targetAngle * Math.PI) / 180;

    return createAngleProvider(
      generateProviderId('angle'),
      pointAIndices,
      vertexIndices,
      pointCIndices,
      targetRadians
    );
  }

  /**
   * Create provider for a collinear points constraint.
   */
  createCollinearProvider(constraint: CollinearPointsConstraint): ResidualWithJacobian[] {
    const providers: ResidualWithJacobian[] = [];
    const points = constraint.points;

    // For n collinear points, create n-2 constraints
    // Each uses p0 as reference and constrains subsequent pairs
    if (points.length >= 3) {
      const p0Indices = this.getPointIndices(points[0]);

      for (let i = 1; i < points.length - 1; i++) {
        const p1Indices = this.getPointIndices(points[i]);
        const p2Indices = this.getPointIndices(points[i + 1]);

        providers.push(
          createCollinearProvider(generateProviderId('collinear'), p0Indices, p1Indices, p2Indices)
        );
      }
    }

    return providers;
  }

  /**
   * Create provider for a coplanar points constraint.
   */
  createCoplanarProvider(constraint: CoplanarPointsConstraint): ResidualWithJacobian[] {
    const providers: ResidualWithJacobian[] = [];
    const points = constraint.points;

    // For n coplanar points, create n-3 constraints
    // Each uses first 3 points to define the plane
    if (points.length >= 4) {
      const p0Indices = this.getPointIndices(points[0]);
      const p1Indices = this.getPointIndices(points[1]);
      const p2Indices = this.getPointIndices(points[2]);

      for (let i = 3; i < points.length; i++) {
        const p3Indices = this.getPointIndices(points[i]);

        providers.push(
          createCoplanarProvider(generateProviderId('coplanar'), p0Indices, p1Indices, p2Indices, p3Indices)
        );
      }
    }

    return providers;
  }

  /**
   * Create provider for a fixed point constraint.
   */
  createFixedPointConstraintProvider(constraint: FixedPointConstraint): ResidualWithJacobian {
    const pointIndices = this.getPointIndices(constraint.point);
    return createFixedPointProvider(
      generateProviderId('fixed-point'),
      pointIndices,
      constraint.targetXyz
    );
  }

  /**
   * Create provider for a parallel lines constraint.
   */
  createParallelLinesProvider(constraint: ParallelLinesConstraint): ResidualWithJacobian {
    const line1AIndices = this.getPointIndices(constraint.lineA.pointA);
    const line1BIndices = this.getPointIndices(constraint.lineA.pointB);
    const line2AIndices = this.getPointIndices(constraint.lineB.pointA);
    const line2BIndices = this.getPointIndices(constraint.lineB.pointB);

    return createParallelLinesProvider(
      generateProviderId('parallel'),
      line1AIndices,
      line1BIndices,
      line2AIndices,
      line2BIndices
    );
  }

  /**
   * Create provider for a perpendicular lines constraint.
   */
  createPerpendicularLinesProvider(constraint: PerpendicularLinesConstraint): ResidualWithJacobian {
    const line1AIndices = this.getPointIndices(constraint.lineA.pointA);
    const line1BIndices = this.getPointIndices(constraint.lineA.pointB);
    const line2AIndices = this.getPointIndices(constraint.lineB.pointA);
    const line2BIndices = this.getPointIndices(constraint.lineB.pointB);

    return createPerpendicularLinesProvider(
      generateProviderId('perpendicular'),
      line1AIndices,
      line1BIndices,
      line2AIndices,
      line2BIndices
    );
  }

  /**
   * Create provider for an equal distances constraint.
   */
  createEqualDistancesProvider(constraint: EqualDistancesConstraint): ResidualWithJacobian | null {
    const pairs: Array<[[number, number, number], [number, number, number]]> = [];

    for (const [pointA, pointB] of constraint.distancePairs) {
      const pAIndices = this.getPointIndices(pointA);
      const pBIndices = this.getPointIndices(pointB);
      pairs.push([pAIndices, pBIndices]);
    }

    return createEqualDistancesProvider(generateProviderId('equal-dist'), pairs);
  }

  /**
   * Create provider for an equal angles constraint.
   */
  createEqualAnglesProvider(constraint: EqualAnglesConstraint): ResidualWithJacobian | null {
    const triplets: Array<[[number, number, number], [number, number, number], [number, number, number]]> = [];

    for (const [pointA, vertex, pointC] of constraint.angleTriplets) {
      const pAIndices = this.getPointIndices(pointA);
      const vertexIndices = this.getPointIndices(vertex);
      const pCIndices = this.getPointIndices(pointC);
      triplets.push([pAIndices, vertexIndices, pCIndices]);
    }

    return createEqualAnglesProvider(generateProviderId('equal-angle'), triplets);
  }

  /**
   * Create quaternion normalization provider for a camera.
   */
  createQuatNormProvider(camera: IOptimizableCamera): ResidualWithJacobian | null {
    const indices = this.layout.getCameraIndices(camera);
    if (!indices || indices.quaternion.w < 0) {
      return null; // Camera pose not being optimized
    }

    return createQuatNormProvider(generateProviderId('quat-norm'), [
      indices.quaternion.w,
      indices.quaternion.x,
      indices.quaternion.y,
      indices.quaternion.z,
    ]);
  }

  /**
   * Create reprojection providers for a world point's image points.
   * Supports both pose-only and pose+intrinsics optimization.
   *
   * @param worldPoint The world point to project
   * @param imagePoints Image points observing this world point
   * @param cameras Camera data with variable indices
   * @param optimizeIntrinsics If true, include focal length as an optimization variable
   */
  createReprojectionProviders(
    worldPoint: WorldPoint,
    imagePoints: ImagePoint[],
    cameras: Map<IOptimizableCamera, { camera: IOptimizableCamera; indices: CameraIndices }>,
    optimizeIntrinsics: boolean = false
  ): ResidualWithJacobian[] {
    const providers: ResidualWithJacobian[] = [];
    const worldPointIndices = this.getPointIndices(worldPoint);

    for (const imagePoint of imagePoints) {
      // Use viewpoint object reference directly for Map lookup
      const cameraData = cameras.get(imagePoint.viewpoint as IOptimizableCamera);
      if (!cameraData) continue;

      const { camera, indices: camIndices } = cameraData;

      // Skip if camera pose is not being optimized (need position + quaternion)
      if (camIndices.position.x < 0 || camIndices.quaternion.w < 0) {
        continue;
      }

      // Use intrinsics provider if focal length is being optimized
      if (optimizeIntrinsics && camIndices.focalLength >= 0) {
        providers.push(
          createReprojectionWithIntrinsicsProvider(
            generateProviderId('reproj-intr'),
            worldPointIndices,
            [camIndices.position.x, camIndices.position.y, camIndices.position.z],
            [camIndices.quaternion.w, camIndices.quaternion.x, camIndices.quaternion.y, camIndices.quaternion.z],
            camIndices.focalLength,
            {
              aspectRatio: camera.aspectRatio,
              cx: camera.principalPointX,
              cy: camera.principalPointY,
              k1: camera.radialDistortion[0],
              k2: camera.radialDistortion[1],
              k3: camera.radialDistortion[2],
              p1: camera.tangentialDistortion[0],
              p2: camera.tangentialDistortion[1],
              observedU: imagePoint.u,
              observedV: imagePoint.v,
              isZReflected: camera.isZReflected,
            }
          )
        );
      } else {
        // Use the standard provider without intrinsics optimization
        providers.push(
          createReprojectionProvider(
            generateProviderId('reproj'),
            worldPointIndices,
            [camIndices.position.x, camIndices.position.y, camIndices.position.z],
            [camIndices.quaternion.w, camIndices.quaternion.x, camIndices.quaternion.y, camIndices.quaternion.z],
            {
              fx: camera.focalLength,
              fy: camera.focalLength * camera.aspectRatio,
              cx: camera.principalPointX,
              cy: camera.principalPointY,
              k1: camera.radialDistortion[0],
              k2: camera.radialDistortion[1],
              k3: camera.radialDistortion[2],
              p1: camera.tangentialDistortion[0],
              p2: camera.tangentialDistortion[1],
              observedU: imagePoint.u,
              observedV: imagePoint.v,
              isZReflected: camera.isZReflected,
            }
          )
        );
      }
    }

    return providers;
  }

  /**
   * Create a fixed point provider for regularization.
   */
  createFixedPointProvider(
    point: WorldPoint,
    targetPosition: [number, number, number],
    weight: number
  ): ResidualWithJacobian | null {
    const indices = this.layout.getPointIndices(point);
    if (!indices) return null;

    // Only constrain free axes
    const freeIndices: number[] = [];
    const freeTargets: number[] = [];

    if (indices.x >= 0) {
      freeIndices.push(indices.x);
      freeTargets.push(targetPosition[0]);
    }
    if (indices.y >= 0) {
      freeIndices.push(indices.y);
      freeTargets.push(targetPosition[1]);
    }
    if (indices.z >= 0) {
      freeIndices.push(indices.z);
      freeTargets.push(targetPosition[2]);
    }

    if (freeIndices.length === 0) return null;

    const id = generateProviderId('regularize');

    // Create a simple regularization provider
    return {
      id,
      name: 'Regularization',
      residualCount: freeIndices.length,
      variableIndices: freeIndices,

      computeResiduals(variables: number[]): number[] {
        return freeIndices.map((idx, i) => (variables[idx] - freeTargets[i]) * weight);
      },

      computeJacobian(_variables: number[]): number[][] {
        // Jacobian is diagonal with weight on each axis
        return freeIndices.map((_, i) => {
          const row = new Array(freeIndices.length).fill(0);
          row[i] = weight;
          return row;
        });
      },
    };
  }

  /**
   * Create vanishing line providers for a camera.
   * Groups vanishing lines by axis and creates one provider per axis
   * if there are 2+ lines for that axis.
   *
   * @param camera The camera with vanishing lines
   * @param camIndices Camera variable indices
   * @param optimizeIntrinsics Whether focal length is being optimized
   */
  createVanishingLineProviders(
    camera: IOptimizableCamera,
    camIndices: CameraIndices,
    optimizeIntrinsics: boolean = false
  ): ResidualWithJacobian[] {
    const providers: ResidualWithJacobian[] = [];

    // Skip if no vanishing lines or camera pose is not being optimized
    if (!camera.vanishingLines || camera.vanishingLines.size === 0) {
      return providers;
    }
    if (camIndices.quaternion.w < 0) {
      return providers;
    }

    // Group vanishing lines by axis
    const linesByAxis: Record<VanishingLineAxis, Array<{ p1: { u: number; v: number }; p2: { u: number; v: number } }>> = {
      x: [],
      y: [],
      z: [],
    };

    for (const line of camera.vanishingLines) {
      const axis = (line as { axis: VanishingLineAxis }).axis;
      const p1 = (line as { p1: { u: number; v: number } }).p1;
      const p2 = (line as { p2: { u: number; v: number } }).p2;
      if (axis && p1 && p2) {
        linesByAxis[axis].push({ p1, p2 });
      }
    }

    // Create provider for each axis with 2+ lines
    for (const axis of ['x', 'y', 'z'] as VanishingLineAxis[]) {
      const lines = linesByAxis[axis];
      if (lines.length < 2) continue;

      // Compute observed vanishing point
      const vp = computeVanishingPoint(lines);
      if (!vp) continue;

      providers.push(
        createVanishingLineProvider(
          generateProviderId(`vp-${axis}`),
          [camIndices.quaternion.w, camIndices.quaternion.x, camIndices.quaternion.y, camIndices.quaternion.z],
          optimizeIntrinsics && camIndices.focalLength >= 0 ? camIndices.focalLength : -1,
          camera.focalLength,
          {
            axis,
            vpU: vp.u,
            vpV: vp.v,
            cx: camera.principalPointX,
            cy: camera.principalPointY,
            weight: 0.02, // Gentle constraint weight
          }
        )
      );
    }

    return providers;
  }
}
