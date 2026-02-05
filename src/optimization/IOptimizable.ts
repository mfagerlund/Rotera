/**
 * Interfaces for camera entities that participate in constraint-based optimization.
 *
 * The analytical solver uses these interfaces to access camera parameters
 * for computing residuals and Jacobians.
 */

/**
 * Interface for camera entities that can participate in optimization.
 * Defines the camera parameters needed by the analytical solver.
 */
export interface IOptimizableCamera {
  /**
   * Whether the camera pose (position and rotation) is locked.
   * When true, pose will not be optimized.
   */
  isPoseLocked: boolean;

  /**
   * Camera name for debugging and display.
   */
  name: string;

  /**
   * Set of vanishing lines associated with this camera.
   */
  vanishingLines: Set<any>;

  // ============================================================================
  // Camera parameters for analytical Jacobian optimization
  // ============================================================================

  /** Camera position in world coordinates [x, y, z] */
  position: [number, number, number];

  /** Camera rotation as quaternion [w, x, y, z] */
  rotation: [number, number, number, number];

  /** Focal length in pixels */
  focalLength: number;

  /** Aspect ratio (fy/fx) - typically 1 for square pixels */
  aspectRatio: number;

  /** Principal point X coordinate */
  principalPointX: number;

  /** Principal point Y coordinate */
  principalPointY: number;

  /** Radial distortion coefficients [k1, k2, k3] */
  radialDistortion: [number, number, number];

  /** Tangential distortion coefficients [p1, p2] */
  tangentialDistortion: [number, number];

  /**
   * Whether the camera's Z-axis is reflected.
   * When true, points with negative camera-space Z are in front of camera.
   */
  isZReflected: boolean;

  /** Image width in pixels */
  imageWidth: number;

  /** Image height in pixels */
  imageHeight: number;

  /**
   * Whether to use simplified intrinsics model.
   * When true: only f, cx, cy are optimized (aspectRatio and skew stay fixed)
   * When false: full intrinsics including aspectRatio and skew are optimized
   */
  useSimpleIntrinsics: boolean;

  /**
   * Whether the image might be cropped from a larger image.
   * When false: principal point is forced to image center (imageWidth/2, imageHeight/2)
   * When true: principal point can be anywhere and is optimized if optimizeIntrinsics=true
   */
  isPossiblyCropped: boolean;
}
