/**
 * Analytical Residual Providers
 *
 * Each provider computes one residual and its gradient.
 */

export {
  createFixedPointXProvider,
  createFixedPointYProvider,
  createFixedPointZProvider,
  createFixedPointProviders,
} from './fixed-point-provider';

export { createQuatNormProvider } from './quat-norm-provider';

export { createDistanceProvider } from './distance-provider';

export { createLineLengthProvider } from './line-length-provider';

export { createCollinearProviders, createCollinearComponentProvider } from './collinear-provider';

export { createAngleProvider } from './angle-provider';

export { createCoplanarProvider, createCoplanarProviders } from './coplanar-provider';

export { createCoincidentPointProviders } from './coincident-point-provider';

export {
  createLineDirectionProviders,
  createLineDirectionComponentProvider,
  type LineDirection,
} from './line-direction-provider';

export { createVanishingLineProvider } from './vanishing-line-provider';

export {
  createReprojectionUProvider,
  createReprojectionVProvider,
  createReprojectionProviders,
  type CameraIntrinsics,
  type CameraIntrinsicsIndices,
  type ReprojectionObservation,
  type ReprojectionFlags,
} from './reprojection-provider';

export {
  createRegularizationProvider,
  createRegularizationProviders,
} from './regularization-provider';

export {
  createSignPreservationProvider,
  createYSignPreservationProviders,
} from './sign-preservation-provider';
