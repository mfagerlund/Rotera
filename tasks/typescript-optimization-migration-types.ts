// Core Type Definitions: TypeScript Optimization Migration
// Do not reference by ID. Create DTOs for serialization in serializations.ts

import type { Value, Vec3, Vec2 } from 'scalar-autograd';

// ============================================================================
// CORE ENTITIES
// ============================================================================

/**
 * Represents a 3D point in world space.
 *
 * DESIGN: Entities directly hold Vec3/Vec2 of Values (not primitive numbers).
 * This eliminates the need for ValueMap - entities ARE the optimization variables!
 */
export interface WorldPoint {
  name: string;
  /**
   * 3D position as Vec3 of Values.
   * - Free axis: V.W(coord)
   * - Locked axis: V.C(coord)
   * Example: new Vec3(V.C(x), V.W(y), V.W(z)) = x locked, y and z free
   */
  position: Vec3;
  /** If true, all axes pinned (optimization won't move point at all) */
  pinned: boolean;
  /** If true, x-axis is locked (position.x uses V.C()) */
  xLocked: boolean;
  /** If true, y-axis is locked (position.y uses V.C()) */
  yLocked: boolean;
  /** If true, z-axis is locked (position.z uses V.C()) */
  zLocked: boolean;
  /** If true, UI prevents user from moving this point */
  isLocked: boolean;
  /** If true, this is the coordinate system origin */
  isOrigin: boolean;
  /** Display color (hex string like '#ffffff') */
  color: string;
  /** Visibility in UI */
  isVisible: boolean;
  /** Which images this point appears in */
  observations: ImagePoint[];
  /** Optional grouping */
  group?: string;
}

/**
 * Observation of a WorldPoint in a specific image.
 * Links 3D world points to 2D image coordinates for reprojection constraints.
 */
export interface ImagePoint {
  /** Observed 2D pixel coordinates (constant - from user annotation) */
  uv: Vec2; // Always V.C(u), V.C(v) - these are measurements
  /** Reference to the image this observation belongs to */
  image: Image;
  /** Reference to the 3D world point being observed */
  worldPoint: WorldPoint;
}

/**
 * Calibrated camera image with intrinsics, extrinsics, and observations.
 */
export interface Image {
  name: string;
  /** Camera parameters */
  camera: Camera;
  /** Image dimensions */
  width: number;
  height: number;
  /** Image data (URL or base64) */
  imageData?: string;
  /** All point observations in this image */
  imagePoints: ImagePoint[];
}

/**
 * Quaternion representation for camera rotation.
 * w + xi + yj + zk
 */
export interface Quaternion {
  /** Real part */
  w: Value;
  /** i component */
  x: Value;
  /** y component */
  y: Value;
  /** z component */
  z: Value;
}

/**
 * Camera intrinsics and extrinsics.
 */
export interface Camera {
  /** Focal length in x (pixels) - constant */
  fx: number;
  /** Focal length in y (pixels) - constant */
  fy: number;
  /** Principal point x (pixels) - constant */
  cx: number;
  /** Principal point y (pixels) - constant */
  cy: number;
  /** Distortion coefficients [k1, k2, p1, p2, k3] - constant */
  distortion: number[];
  /**
   * Camera position in world space.
   * - Free camera: new Vec3(V.W(x), V.W(y), V.W(z))
   * - Fixed camera: new Vec3(V.C(x), V.C(y), V.C(z))
   */
  position: Vec3;
  /**
   * Camera rotation as quaternion.
   * - Free rotation: {w: V.W(), x: V.W(), y: V.W(), z: V.W()}
   * - Fixed rotation: {w: V.C(), x: V.C(), y: V.C(), z: V.C()}
   */
  rotation: Quaternion;
  /** If true, camera pose is fixed (not optimized) */
  fixed: boolean;
}

// ============================================================================
// GEOMETRIC ENTITIES (with intrinsic constraints)
// ============================================================================

/**
 * Line connecting two world points.
 * Can have intrinsic constraints (direction, fixed length).
 */
export interface Line {
  name: string;
  /** Start point (direct reference, not ID) */
  start: WorldPoint;
  /** End point (direct reference, not ID) */
  end: WorldPoint;
  /** Display color (hex string like '#ffffff') */
  color: string;
  /** Visibility in UI */
  isVisible: boolean;
  /** If true, this line is for construction (not part of final model) */
  isConstruction: boolean;
  /** Line drawing style */
  lineStyle: 'solid' | 'dashed' | 'dotted';
  /** Line thickness (pixels) */
  thickness: number;
  /** Intrinsic constraints */
  constraints: LineConstraints;
  /** Optional grouping */
  group?: string;
}

export interface LineConstraints {
  /** Orientation constraint (required) */
  direction: 'free' | 'horizontal' | 'vertical' | 'x-aligned' | 'z-aligned';
  /** If defined, line length is fixed to this value (meters) */
  targetLength?: number;
  /** Tolerance for constraint satisfaction (meters) */
  tolerance?: number;
}

/**
 * Plane defined by three or more points.
 * Can have intrinsic constraints (orientation, offset from origin).
 */
export interface Plane {
  name: string;
  /** Points defining the plane (minimum 3) */
  points: WorldPoint[];
  /** Display color (hex string like '#ffffff') */
  color: string;
  /** Visibility in UI */
  isVisible: boolean;
  /** Intrinsic constraints */
  constraints?: PlaneConstraints;
  /** Optional grouping */
  group?: string;
}

export interface PlaneConstraints {
  /** Plane normal alignment */
  orientation?: 'free' | 'horizontal' | 'vertical';
  /** Distance from origin (meters) */
  offset?: number;
  /** Tolerance for constraint satisfaction (meters) */
  tolerance?: number;
}

// ============================================================================
// INTER-ENTITY CONSTRAINTS
// ============================================================================

/**
 * Base interface for all constraints.
 */
export interface BaseConstraint {
  name: string;
  /** If false, constraint is not included in optimization */
  enabled: boolean;
  /** Constraint priority (1-10, higher = more important) */
  priority?: number;
  /** Tolerance for constraint satisfaction */
  tolerance?: number;
}

/**
 * Distance between two world points must equal target.
 */
export interface DistanceConstraint extends BaseConstraint {
  type: 'distance';
  pointA: WorldPoint;
  pointB: WorldPoint;
  targetDistance: number; // meters
}

/**
 * Angle between three points (A-vertex-C) must equal target.
 */
export interface AngleConstraint extends BaseConstraint {
  type: 'angle';
  pointA: WorldPoint;
  vertex: WorldPoint;
  pointC: WorldPoint;
  targetAngle: number; // degrees
}

/**
 * Two lines must be parallel.
 */
export interface ParallelLinesConstraint extends BaseConstraint {
  type: 'parallel-lines';
  line1: Line;
  line2: Line;
}

/**
 * Two lines must be perpendicular (90 degrees).
 */
export interface PerpendicularLinesConstraint extends BaseConstraint {
  type: 'perpendicular-lines';
  line1: Line;
  line2: Line;
}

/**
 * Multiple points must be collinear (lie on same line).
 */
export interface CollinearPointsConstraint extends BaseConstraint {
  type: 'collinear-points';
  points: WorldPoint[];
}

/**
 * Multiple points must be coplanar (lie on same plane).
 */
export interface CoplanarPointsConstraint extends BaseConstraint {
  type: 'coplanar-points';
  points: WorldPoint[];
  /** Optional: define the plane explicitly */
  plane?: Plane;
}

/**
 * Point must have fixed coordinates.
 * (Alternative: just pin the point directly)
 */
export interface FixedPointConstraint extends BaseConstraint {
  type: 'fixed-point';
  point: WorldPoint;
  targetPosition: [number, number, number]; // [x, y, z]
}

/**
 * Multiple distances must be equal.
 */
export interface EqualDistancesConstraint extends BaseConstraint {
  type: 'equal-distances';
  pointPairs: [WorldPoint, WorldPoint][];
}

/**
 * Multiple angles must be equal.
 */
export interface EqualAnglesConstraint extends BaseConstraint {
  type: 'equal-angles';
  angleTriplets: [WorldPoint, WorldPoint, WorldPoint][]; // [A, vertex, C]
}

/**
 * Union type for all constraint types.
 */
export type Constraint =
  | DistanceConstraint
  | AngleConstraint
  | ParallelLinesConstraint
  | PerpendicularLinesConstraint
  | CollinearPointsConstraint
  | CoplanarPointsConstraint
  | FixedPointConstraint
  | EqualDistancesConstraint
  | EqualAnglesConstraint;

// ============================================================================
// OPTIMIZATION / SOLVER TYPES
// ============================================================================

/**
 * Residual function interface.
 * Each constraint/entity type implements this to compute residuals.
 *
 * NO ValueMap NEEDED! Residuals access entity.position directly.
 */
export interface ResidualFunction {
  /** Unique identifier for this residual */
  id: string;
  /** Human-readable name */
  name: string;
  /** Entity type (for traceability) */
  entityType: 'world-point' | 'image-point' | 'line' | 'plane' | 'constraint';
  /** Reference to source entity (for error reporting) */
  sourceEntity: WorldPoint | ImagePoint | Line | Plane | Constraint;
  /** Compute residual values - accesses entity.position directly! */
  compute(): Value[];
  /** Number of residuals this function produces */
  numResiduals(): number;
}

/**
 * Composite residual for Line entity.
 * Can produce 0-2 residuals depending on intrinsic constraints.
 *
 * Example implementation:
 * ```
 * compute(): Value[] {
 *   const residuals: Value[] = [];
 *   const startPos = this.line.start.position; // Already Vec3!
 *   const endPos = this.line.end.position;
 *
 *   if (this.line.constraints.targetLength) {
 *     const actualLength = endPos.sub(startPos).magnitude;
 *     residuals.push(V.sub(actualLength, V.C(this.line.constraints.targetLength)));
 *   }
 *
 *   if (this.line.constraints.direction === 'horizontal') {
 *     const dir = endPos.sub(startPos).normalize();
 *     residuals.push(dir.z); // z component should be 0
 *   }
 *
 *   return residuals;
 * }
 * ```
 */
export interface LineResidual extends ResidualFunction {
  entityType: 'line';
  sourceEntity: Line;
  /** The line being constrained */
  line: Line;
}

/**
 * Residual for image-based reprojection constraint.
 * Produces 2 residuals: [u_error, v_error]
 *
 * Example implementation:
 * ```
 * compute(): Value[] {
 *   const worldPos = this.imagePoint.worldPoint.position; // Vec3
 *   const camera = this.imagePoint.image.camera;
 *   const projected = projectPoint(worldPos, camera); // Returns Vec2
 *   const observed = this.imagePoint.uv; // Vec2
 *
 *   return [
 *     V.sub(projected.x, observed.x), // u error
 *     V.sub(projected.y, observed.y)  // v error
 *   ];
 * }
 * ```
 */
export interface ReprojectionResidual extends ResidualFunction {
  entityType: 'image-point';
  sourceEntity: ImagePoint;
  /** The image point observation */
  imagePoint: ImagePoint;
}

/**
 * Residual for inter-entity geometric constraint.
 * Number of residuals depends on constraint type.
 */
export interface ConstraintResidual extends ResidualFunction {
  entityType: 'constraint';
  sourceEntity: Constraint;
  /** The constraint being enforced */
  constraint: Constraint;
}

/**
 * Result of solving the optimization problem.
 */
export interface SolveResult {
  /** Did the solver converge? */
  success: boolean;
  /** Number of iterations performed */
  iterations: number;
  /** Final cost (sum of squared residuals) */
  finalCost: number;
  /** Why did the solver stop? */
  convergenceReason: string;
  /** Per-entity error breakdown (for UI feedback) */
  entityDiagnostics: Map<WorldPoint | Line | Plane | Constraint, EntityDiagnostic>;
  /** Computation time (milliseconds) */
  computationTime: number;
}

/**
 * Diagnostic information for a single entity.
 * Provides detailed error breakdown for UI display.
 *
 * Example: "Line 'Floor_Edge' is 2.3m too long (target: 5m, actual: 7.3m)"
 */
export interface EntityDiagnostic {
  /** Entity type */
  entityType: 'world-point' | 'line' | 'plane' | 'constraint';
  /** Entity name */
  entityName: string;
  /** Total error magnitude */
  totalError: number;
  /** Component-level breakdown */
  components: ComponentError[];
  /** Is the constraint satisfied (error < tolerance)? */
  satisfied: boolean;
}

export interface ComponentError {
  /** Component type (e.g., 'length', 'direction', 'reprojection-u') */
  type: string;
  /** Target value (if applicable) */
  target?: number;
  /** Actual value */
  actual?: number;
  /** Error magnitude */
  error: number;
  /** Is this component satisfied? */
  satisfied: boolean;
}

/**
 * Options for the solver.
 */
export interface SolverOptions {
  /** Maximum iterations (default: 100) */
  maxIterations?: number;
  /** Convergence tolerance (default: 1e-6) */
  tolerance?: number;
  /** Initial damping parameter for LM (default: 1e-3) */
  initialDamping?: number;
  /** Use adaptive damping? (default: true) */
  adaptiveDamping?: boolean;
  /** Verbose logging? (default: false) */
  verbose?: boolean;
  /** Robust loss function (default: none) */
  robustLoss?: 'none' | 'huber' | 'cauchy' | 'tukey';
  /** Robust loss scale parameter */
  robustLossScale?: number;
}

// ============================================================================
// PROJECT / TOP-LEVEL
// ============================================================================

/**
 * Top-level project containing all entities and constraints.
 */
export interface Project {
  /** Project metadata */
  name: string;
  description?: string;
  /** All world points in the project */
  worldPoints: WorldPoint[];
  /** All images/cameras in the project */
  images: Image[];
  /** Higher-level geometric entities */
  lines: Line[];
  planes: Plane[];
  /** Inter-entity constraints */
  constraints: Constraint[];
  /** Solver configuration */
  solverOptions?: SolverOptions;
}
