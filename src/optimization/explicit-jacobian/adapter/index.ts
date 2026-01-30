/**
 * Explicit Jacobian Adapter Module
 *
 * Bridges the entity-based constraint system to the explicit Jacobian
 * optimization system.
 */

export { VariableLayout, type Point3DIndices, type CameraIndices } from './variable-layout';
export { ProviderFactory } from './provider-factory';
export {
  solveWithExplicitJacobian,
  type ExplicitOptimizationOptions,
  type ExplicitOptimizationResult,
} from './explicit-adapter';
