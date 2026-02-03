/**
 * Analytical Gradient Module
 *
 * Provides infrastructure for computing optimization gradients
 * using analytical (generated) gradient functions instead of autodiff.
 */

export type { AnalyticalResidualProvider, VariableLayout } from './types';
export { accumulateNormalEquations, type NormalEquations } from './accumulate-normal-equations';
export * from './providers';
export { wrapWithNumericalGradient, wrapAllWithNumericalGradients } from './numerical-gradient-wrapper';
