import type { WorldPoint } from '../entities/world-point';
import type { Line } from '../entities/line';
import type { Constraint } from '../entities/constraints';
import type { Viewpoint } from '../entities/viewpoint';
import type { ImagePoint } from '../entities/imagePoint';
import { CoplanarPointsConstraint } from '../entities/constraints/coplanar-points-constraint';
import { log } from './optimization-logger';
import * as vec3 from '../utils/vec3';
import { quaternionRotateVector } from './coordinate-alignment/quaternion-utils';

interface SingleCameraInitOptions {
  verbose?: boolean;
}

/**
 * Initialize world points that are visible in only one camera.
 *
 * WHY THIS EXISTS (distinct from unified-initialization):
 * - unified-initialization/phase-4-line-propagation.ts: Uses pure geometric propagation
 *   without camera information. Fast but can't disambiguate sign choices.
 * - THIS FILE: Uses camera rays to determine correct positions. More accurate for
 *   single-camera points because it uses reprojection to pick the right sign.
 *
 * WHEN IT'S CALLED:
 * - After unified initialization completes
 * - In runStage1Optimization() after multi-camera points are optimized
 * - For points that couldn't be triangulated (only visible in 1 camera)
 *
 * STRATEGIES (in order):
 * 1. Coplanarity: If point is in a coplanar constraint with 3+ solved points,
 *    use ray-plane intersection to find its position
 * 2. Line graph: If connected to a solved point via constrained line,
 *    use ray-line intersection or axis-constrained propagation
 * 3. Ray-plane: Second pass for points that now have enough solved neighbors
 */
export function initializeSingleCameraPoints(
  allPoints: WorldPoint[],
  lines: Line[],
  constraints: Constraint[],
  initializedViewpoints: Set<Viewpoint>,
  options: SingleCameraInitOptions = {}
): { initialized: number; failed: number } {
  const { verbose = false } = options;

  // Find points that are already initialized (triangulated or locked)
  const initializedPoints = new Set<WorldPoint>(
    allPoints.filter(p => p.optimizedXyz !== undefined)
  );

  // Find single-camera points (visible in exactly one initialized camera, not yet initialized)
  const singleCameraPoints: WorldPoint[] = [];
  for (const point of allPoints) {
    if (initializedPoints.has(point)) continue;

    const visibleInCameras = Array.from(point.imagePoints)
      .filter(ip => initializedViewpoints.has((ip as ImagePoint).viewpoint as Viewpoint))
      .length;

    if (visibleInCameras === 1) {
      singleCameraPoints.push(point);
    }
  }

  if (verbose) {
    log(`[SingleCameraInit] Found ${singleCameraPoints.length} single-camera points to initialize`);
  }

  let initialized = 0;
  let failed = 0;

  // Strategy 1: Use coplanarity constraints with 3+ solved points
  initialized += initializeViaCoplanarity(
    singleCameraPoints, constraints, initializedPoints, initializedViewpoints, verbose
  );

  // Strategy 2: Propagate through line graph from solved neighbors
  initialized += initializeViaLineGraph(
    singleCameraPoints, lines, initializedPoints, initializedViewpoints, verbose
  );

  // Strategy 3: Use ray-plane intersection for remaining coplanar points
  initialized += initializeViaRayPlane(
    singleCameraPoints, constraints, initializedPoints, initializedViewpoints, verbose
  );

  // Count failures (points still not initialized)
  for (const point of singleCameraPoints) {
    if (!initializedPoints.has(point)) {
      failed++;
      if (verbose) {
        log(`  [SingleCameraInit] Could not initialize ${point.name} - no constraints connect it to solved points`);
      }
    }
  }

  return { initialized, failed };
}

function initializeViaCoplanarity(
  singleCameraPoints: WorldPoint[],
  constraints: Constraint[],
  initializedPoints: Set<WorldPoint>,
  initializedViewpoints: Set<Viewpoint>,
  verbose: boolean
): number {
  let count = 0;

  for (const constraint of constraints) {
    if (!(constraint instanceof CoplanarPointsConstraint)) continue;

    const coplanarPoints = constraint.points;
    const solvedInPlane = coplanarPoints.filter(p => initializedPoints.has(p));

    // Need at least 3 solved points to define the plane
    if (solvedInPlane.length < 3) continue;

    // Compute plane from solved points
    const plane = computePlaneFromPoints(solvedInPlane);
    if (!plane) continue;

    // For each unsolved point in this constraint, use ray-plane intersection
    for (const point of coplanarPoints) {
      if (initializedPoints.has(point)) continue;
      if (!singleCameraPoints.includes(point)) continue;

      const result = initializePointViaRayPlaneIntersection(point, plane, initializedViewpoints);
      if (result) {
        initializedPoints.add(point);
        count++;
        if (verbose) {
          log(`  [Coplanarity] Initialized ${point.name} via ray-plane intersection: [${point.optimizedXyz!.map(v => v.toFixed(2)).join(', ')}]`);
        }
      }
    }
  }

  return count;
}

function initializeViaLineGraph(
  singleCameraPoints: WorldPoint[],
  lines: Line[],
  initializedPoints: Set<WorldPoint>,
  initializedViewpoints: Set<Viewpoint>,
  verbose: boolean
): number {
  let count = 0;
  let madeProgress = true;
  const maxIterations = 10;

  for (let iter = 0; iter < maxIterations && madeProgress; iter++) {
    madeProgress = false;

    for (const point of singleCameraPoints) {
      if (initializedPoints.has(point)) continue;

      // Find a line connecting this point to a solved point with a known direction
      for (const line of lines) {
        let solvedNeighbor: WorldPoint | null = null;
        let isPointA = false;

        if (line.pointA === point && initializedPoints.has(line.pointB)) {
          solvedNeighbor = line.pointB;
          isPointA = true;
        } else if (line.pointB === point && initializedPoints.has(line.pointA)) {
          solvedNeighbor = line.pointA;
          isPointA = false;
        }

        if (!solvedNeighbor || !solvedNeighbor.optimizedXyz) continue;

        // If we have a target length and a constrained direction, we can compute position deterministically
        if (line.targetLength !== undefined && line.direction && line.direction !== 'free') {
          const position = computePositionFromDirectionConstraint(
            solvedNeighbor.optimizedXyz,
            line.targetLength,
            line.direction,
            point,
            initializedViewpoints
          );

          if (position) {
            point.optimizedXyz = position;
            initializedPoints.add(point);
            count++;
            madeProgress = true;
            if (verbose) {
              log(`  [LineGraph] Initialized ${point.name} from ${solvedNeighbor.name} via ${line.direction} line: [${position.map(v => v.toFixed(2)).join(', ')}]`);
            }
            break;
          }
        }

        // If direction is constrained (but no length), use ray-line intersection
        if (line.direction && line.direction !== 'free') {
          const position = initializeViaRayLineIntersection(
            point,
            solvedNeighbor.optimizedXyz,
            line.direction,
            initializedViewpoints
          );

          if (position) {
            point.optimizedXyz = position;
            initializedPoints.add(point);
            count++;
            madeProgress = true;
            if (verbose) {
              log(`  [RayLine] Initialized ${point.name} via ray-${line.direction} intersection: [${position.map(v => v.toFixed(2)).join(', ')}]`);
            }
            break;
          }
        }
      }
    }
  }

  return count;
}

function initializeViaRayPlane(
  singleCameraPoints: WorldPoint[],
  constraints: Constraint[],
  initializedPoints: Set<WorldPoint>,
  initializedViewpoints: Set<Viewpoint>,
  verbose: boolean
): number {
  // This is a second pass for points that might now have enough solved neighbors
  return initializeViaCoplanarity(singleCameraPoints, constraints, initializedPoints, initializedViewpoints, verbose);
}

interface Plane {
  normal: [number, number, number];
  d: number; // ax + by + cz + d = 0
}

function computePlaneFromPoints(points: WorldPoint[]): Plane | null {
  if (points.length < 3) return null;

  // Use first 3 points to define plane
  const p1 = points[0].optimizedXyz;
  const p2 = points[1].optimizedXyz;
  const p3 = points[2].optimizedXyz;

  if (!p1 || !p2 || !p3) return null;

  const v1: [number, number, number] = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
  const v2: [number, number, number] = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];

  // Cross product for normal
  const normal: [number, number, number] = [
    v1[1] * v2[2] - v1[2] * v2[1],
    v1[2] * v2[0] - v1[0] * v2[2],
    v1[0] * v2[1] - v1[1] * v2[0]
  ];

  const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
  if (len < 1e-10) return null;

  normal[0] /= len;
  normal[1] /= len;
  normal[2] /= len;

  // d = -(ax + by + cz) for a point on the plane
  const d = -(normal[0] * p1[0] + normal[1] * p1[1] + normal[2] * p1[2]);

  return { normal, d };
}

function initializePointViaRayPlaneIntersection(
  point: WorldPoint,
  plane: Plane,
  initializedViewpoints: Set<Viewpoint>
): boolean {
  // Find the camera that sees this point
  const imagePoints = Array.from(point.imagePoints) as ImagePoint[];
  const visibleIn = imagePoints.find(ip => initializedViewpoints.has(ip.viewpoint as Viewpoint));

  if (!visibleIn) return false;

  const vp = visibleIn.viewpoint as Viewpoint;

  // Compute ray from camera through image point
  const ray = computeRayFromImagePoint(visibleIn, vp);
  if (!ray) return false;

  // Ray-plane intersection
  const denom = plane.normal[0] * ray.direction[0] +
                plane.normal[1] * ray.direction[1] +
                plane.normal[2] * ray.direction[2];

  if (Math.abs(denom) < 1e-10) return false; // Ray parallel to plane

  const t = -(plane.normal[0] * ray.origin[0] +
              plane.normal[1] * ray.origin[1] +
              plane.normal[2] * ray.origin[2] + plane.d) / denom;

  if (t < 0) return false; // Behind camera

  point.optimizedXyz = [
    ray.origin[0] + t * ray.direction[0],
    ray.origin[1] + t * ray.direction[1],
    ray.origin[2] + t * ray.direction[2]
  ];

  return true;
}

interface Ray {
  origin: [number, number, number];
  direction: [number, number, number];
}

function computeRayFromImagePoint(ip: ImagePoint, vp: Viewpoint): Ray | null {
  // Camera position in world coordinates
  const origin: [number, number, number] = [vp.position[0], vp.position[1], vp.position[2]];

  // Ray direction in camera coordinates
  const ray_cam_x = (ip.u - vp.principalPointX) / vp.focalLength;
  const ray_cam_y = (vp.principalPointY - ip.v) / vp.focalLength;
  const ray_cam_z = 1.0;

  const norm = Math.sqrt(ray_cam_x ** 2 + ray_cam_y ** 2 + ray_cam_z ** 2);
  const ray_cam: [number, number, number] = [
    ray_cam_x / norm,
    ray_cam_y / norm,
    ray_cam_z / norm
  ];

  // Transform to world coordinates using quaternion
  const q_inv = [vp.rotation[0], -vp.rotation[1], -vp.rotation[2], -vp.rotation[3]];
  const direction = quaternionRotateVector(q_inv, ray_cam) as [number, number, number];

  return { origin, direction };
}

function computePositionFromDirectionConstraint(
  neighborPos: [number, number, number],
  length: number,
  direction: string,
  point: WorldPoint,
  initializedViewpoints: Set<Viewpoint>
): [number, number, number] | null {
  // For axis-aligned directions, we know exactly where the point must be
  // But we have 2 possibilities (+/- direction), so use the ray to disambiguate

  const imagePoints = Array.from(point.imagePoints) as ImagePoint[];
  const visibleIn = imagePoints.find(ip => initializedViewpoints.has(ip.viewpoint as Viewpoint));
  if (!visibleIn) return null;

  const vp = visibleIn.viewpoint as Viewpoint;
  const ray = computeRayFromImagePoint(visibleIn, vp);
  if (!ray) return null;

  let candidates: [number, number, number][] = [];

  switch (direction) {
    case 'x':
      candidates = [
        [neighborPos[0] + length, neighborPos[1], neighborPos[2]],
        [neighborPos[0] - length, neighborPos[1], neighborPos[2]]
      ];
      break;
    case 'y':
      candidates = [
        [neighborPos[0], neighborPos[1] + length, neighborPos[2]],
        [neighborPos[0], neighborPos[1] - length, neighborPos[2]]
      ];
      break;
    case 'z':
      candidates = [
        [neighborPos[0], neighborPos[1], neighborPos[2] + length],
        [neighborPos[0], neighborPos[1], neighborPos[2] - length]
      ];
      break;
    default:
      // For plane-constrained directions (xy, xz, yz), we need ray-plane intersection
      return null;
  }

  // Choose candidate closest to the ray
  let bestCandidate: [number, number, number] | null = null;
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const dist = distancePointToRay(candidate, ray);
    if (dist < bestDist) {
      bestDist = dist;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

function initializeViaRayLineIntersection(
  point: WorldPoint,
  neighborPos: [number, number, number],
  direction: string,
  initializedViewpoints: Set<Viewpoint>
): [number, number, number] | null {
  const imagePoints = Array.from(point.imagePoints) as ImagePoint[];
  const visibleIn = imagePoints.find(ip => initializedViewpoints.has(ip.viewpoint as Viewpoint));
  if (!visibleIn) return null;

  const vp = visibleIn.viewpoint as Viewpoint;
  const ray = computeRayFromImagePoint(visibleIn, vp);
  if (!ray) return null;

  // Determine the constraint line direction
  let lineDir: [number, number, number];
  switch (direction) {
    case 'x':
      lineDir = [1, 0, 0];
      break;
    case 'y':
      lineDir = [0, 1, 0];
      break;
    case 'z':
      lineDir = [0, 0, 1];
      break;
    case 'xy':
    case 'xz':
    case 'yz':
      // For plane-constrained, use ray-plane intersection instead
      return initializeViaRayPlaneConstraint(point, neighborPos, direction, ray);
    default:
      return null;
  }

  // Find closest point between ray and constraint line
  // Ray: P = ray.origin + t * ray.direction
  // Line: Q = neighborPos + s * lineDir
  const closest = closestPointsBetweenLines(
    ray.origin, ray.direction,
    neighborPos, lineDir
  );

  if (!closest || closest.t < 0) return null; // Behind camera

  // Use the point on the constraint line
  return closest.pointOnLine2;
}

function initializeViaRayPlaneConstraint(
  point: WorldPoint,
  neighborPos: [number, number, number],
  direction: string,
  ray: Ray
): [number, number, number] | null {
  // For xy/xz/yz constraints, the point lies on a plane through neighborPos
  let normal: [number, number, number];
  switch (direction) {
    case 'xy':
      normal = [0, 0, 1]; // z = const
      break;
    case 'xz':
      normal = [0, 1, 0]; // y = const
      break;
    case 'yz':
      normal = [1, 0, 0]; // x = const
      break;
    default:
      return null;
  }

  const d = -(normal[0] * neighborPos[0] + normal[1] * neighborPos[1] + normal[2] * neighborPos[2]);
  const plane: Plane = { normal, d };

  // Ray-plane intersection
  const denom = plane.normal[0] * ray.direction[0] +
                plane.normal[1] * ray.direction[1] +
                plane.normal[2] * ray.direction[2];

  if (Math.abs(denom) < 1e-10) return null;

  const t = -(plane.normal[0] * ray.origin[0] +
              plane.normal[1] * ray.origin[1] +
              plane.normal[2] * ray.origin[2] + plane.d) / denom;

  if (t < 0) return null;

  return [
    ray.origin[0] + t * ray.direction[0],
    ray.origin[1] + t * ray.direction[1],
    ray.origin[2] + t * ray.direction[2]
  ];
}

function distancePointToRay(point: [number, number, number], ray: Ray): number {
  const v: [number, number, number] = [
    point[0] - ray.origin[0],
    point[1] - ray.origin[1],
    point[2] - ray.origin[2]
  ];

  const t = v[0] * ray.direction[0] + v[1] * ray.direction[1] + v[2] * ray.direction[2];

  const closest: [number, number, number] = [
    ray.origin[0] + t * ray.direction[0],
    ray.origin[1] + t * ray.direction[1],
    ray.origin[2] + t * ray.direction[2]
  ];

  return Math.sqrt(
    (point[0] - closest[0]) ** 2 +
    (point[1] - closest[1]) ** 2 +
    (point[2] - closest[2]) ** 2
  );
}

function closestPointsBetweenLines(
  o1: [number, number, number], d1: [number, number, number],
  o2: [number, number, number], d2: [number, number, number]
): { t: number; s: number; pointOnLine1: [number, number, number]; pointOnLine2: [number, number, number] } | null {
  const w: [number, number, number] = [o1[0] - o2[0], o1[1] - o2[1], o1[2] - o2[2]];

  const a = d1[0] * d1[0] + d1[1] * d1[1] + d1[2] * d1[2];
  const b = d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2];
  const c = d2[0] * d2[0] + d2[1] * d2[1] + d2[2] * d2[2];
  const d = d1[0] * w[0] + d1[1] * w[1] + d1[2] * w[2];
  const e = d2[0] * w[0] + d2[1] * w[1] + d2[2] * w[2];

  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-10) return null; // Lines are parallel

  const t = (b * e - c * d) / denom;
  const s = (a * e - b * d) / denom;

  const pointOnLine1: [number, number, number] = [
    o1[0] + t * d1[0],
    o1[1] + t * d1[1],
    o1[2] + t * d1[2]
  ];

  const pointOnLine2: [number, number, number] = [
    o2[0] + s * d2[0],
    o2[1] + s * d2[1],
    o2[2] + s * d2[2]
  ];

  return { t, s, pointOnLine1, pointOnLine2 };
}
