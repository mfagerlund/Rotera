/**
 * Explicit Jacobian Module
 *
 * Provides hand-coded Jacobian optimization as an alternative to
 * scalar-autograd's automatic differentiation.
 */

// Types
export type {
  Point3D,
  Quaternion,
  GradientResult,
  ResidualWithJacobian,
  ExplicitJacobianSystem,
  LMOptions,
  LMResult,
} from './types';

export { DEFAULT_LM_OPTIONS } from './types';

// Math primitives
export { Vec3 } from './Vec3';
export { Quat } from './Quaternion';

// System implementation
export { ExplicitJacobianSystemImpl } from './ExplicitJacobianSystem';

// Solvers
export { solveDenseLM } from './dense-lm';
export { solveSparseLM } from '../sparse/sparse-lm';

// Residual Providers
export {
  createDistanceProvider,
  createQuatNormProvider,
  createFixedPointProvider,
  createLineDirectionProvider,
  createLineLengthProvider,
  createCoincidentPointProvider,
  createAngleProvider,
  createCollinearProvider,
  createCoplanarProvider,
  createReprojectionProvider,
  type ReprojectionConfig,
} from './providers';

// Entity Adapter
export {
  solveWithExplicitJacobian,
  VariableLayout,
  ProviderFactory,
  type ExplicitOptimizationOptions,
  type ExplicitOptimizationResult,
  type Point3DIndices,
  type CameraIndices,
} from './adapter';
