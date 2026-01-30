/**
 * Explicit Jacobian Residual Providers
 *
 * These providers implement ResidualWithJacobian interface using
 * hand-coded gradient functions from gradient-script.
 */

export { createDistanceProvider } from './distance-provider';
export { createQuatNormProvider } from './quat-norm-provider';
export { createFixedPointProvider } from './fixed-point-provider';
export { createLineDirectionProvider } from './line-direction-provider';
export { createLineLengthProvider } from './line-length-provider';
export { createCoincidentPointProvider } from './coincident-point-provider';
export { createAngleProvider } from './angle-provider';
export { createCollinearProvider } from './collinear-provider';
export { createCoplanarProvider } from './coplanar-provider';
export { createReprojectionProvider, type ReprojectionConfig } from './reprojection-provider';
export { createParallelLinesProvider } from './parallel-lines-provider';
export { createPerpendicularLinesProvider } from './perpendicular-lines-provider';
export { createEqualDistancesProvider } from './equal-distances-provider';
export { createEqualAnglesProvider } from './equal-angles-provider';
export {
  createReprojectionWithIntrinsicsProvider,
  type ReprojectionWithIntrinsicsConfig,
} from './reprojection-with-intrinsics-provider';
export {
  createVanishingLineProvider,
  type VanishingLineConfig,
  type VanishingLineAxis,
} from './vanishing-line-provider';
