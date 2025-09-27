"""SciPy-based nonlinear least squares solver."""

import numpy as np
import time
from typing import Optional, Dict, List, Any, Callable
from scipy.optimize import least_squares
from scipy.sparse import csr_matrix
from dataclasses import dataclass

from ..optimization.factor_graph import FactorGraph
from ..models.project import SolveResult
from .diagnostics import SolveDiagnostics


@dataclass
class SolverOptions:
    """Options for the SciPy solver."""

    method: str = "lm"  # "lm", "trf", "dogbox"
    max_iterations: int = 100
    tolerance: float = 1e-6
    gradient_tolerance: float = 1e-6
    parameter_tolerance: float = 1e-6
    loss: str = "linear"  # Will be overridden by factor-specific losses
    verbose: int = 0
    use_bounds: bool = True
    jacobian_sparsity: bool = True


class SciPySolver:
    """SciPy-based nonlinear least squares solver for bundle adjustment."""

    def __init__(self, options: Optional[SolverOptions] = None):
        """Initialize solver.

        Args:
            options: Solver options
        """
        self.options = options or SolverOptions()
        self.diagnostics = SolveDiagnostics()

        # Solver state
        self.factor_graph: Optional[FactorGraph] = None
        self.iteration_count = 0
        self.cost_history: List[float] = []
        self.parameter_history: List[np.ndarray] = []

    def solve(self, factor_graph: FactorGraph) -> SolveResult:
        """Solve the optimization problem.

        Args:
            factor_graph: Factor graph to optimize

        Returns:
            Solve result with diagnostics
        """
        self.factor_graph = factor_graph
        self.iteration_count = 0
        self.cost_history = []
        self.parameter_history = []

        start_time = time.time()

        try:
            # Pack initial parameters
            x0 = factor_graph.pack_variables()

            if len(x0) == 0:
                # No free variables to optimize
                return SolveResult(
                    success=True,
                    iterations=0,
                    final_cost=0.0,
                    convergence_reason="No free variables",
                    computation_time=time.time() - start_time
                )

            # Get bounds if using them
            bounds = (-np.inf, np.inf)
            if self.options.use_bounds:
                lower_bounds, upper_bounds = factor_graph.get_variable_bounds()
                if len(lower_bounds) > 0:
                    bounds = (lower_bounds, upper_bounds)

            # Set up Jacobian sparsity structure
            jac_sparsity = None
            if self.options.jacobian_sparsity:
                jac_sparsity = self._build_jacobian_sparsity(factor_graph)

            # Solve
            result = least_squares(
                fun=self._residual_function,
                x0=x0,
                jac=self._jacobian_function,
                bounds=bounds,
                method=self.options.method,
                ftol=self.options.tolerance,
                xtol=self.options.parameter_tolerance,
                gtol=self.options.gradient_tolerance,
                max_nfev=self.options.max_iterations * (len(x0) + 1),
                verbose=self.options.verbose,
                jac_sparsity=jac_sparsity
            )

            # Unpack final solution
            factor_graph.unpack_variables(result.x)

            # Compute final diagnostics
            final_diagnostics = self.diagnostics.compute_diagnostics(
                factor_graph, result.fun, self._get_jacobian_matrix(result.x)
            )

            # Create solve result
            solve_result = SolveResult(
                success=result.success,
                iterations=result.nfev // (len(x0) + 1),  # Approximate iteration count
                final_cost=0.5 * np.sum(result.fun**2),
                convergence_reason=self._parse_termination_reason(result),
                residuals=final_diagnostics["residuals"],
                uncertainties=final_diagnostics["uncertainties"],
                unconstrained_dofs=final_diagnostics["unconstrained_dofs"],
                largest_residuals=final_diagnostics["largest_residuals"],
                computation_time=time.time() - start_time
            )

            return solve_result

        except Exception as e:
            # Handle solver failure
            return SolveResult(
                success=False,
                iterations=self.iteration_count,
                final_cost=np.inf,
                convergence_reason=f"Solver error: {str(e)}",
                computation_time=time.time() - start_time
            )

    def _residual_function(self, x: np.ndarray) -> np.ndarray:
        """Residual function for scipy.optimize.least_squares.

        Args:
            x: Parameter vector

        Returns:
            Residual vector
        """
        # Unpack parameters into factor graph
        self.factor_graph.unpack_variables(x)

        # Compute all residuals
        residuals = self.factor_graph.compute_all_residuals()

        # Store cost history
        cost = 0.5 * np.sum(residuals**2)
        self.cost_history.append(cost)
        self.parameter_history.append(x.copy())

        self.iteration_count += 1

        return residuals

    def _jacobian_function(self, x: np.ndarray) -> np.ndarray:
        """Jacobian function for scipy.optimize.least_squares.

        Args:
            x: Parameter vector

        Returns:
            Jacobian matrix or sparse matrix
        """
        return self._get_jacobian_matrix(x)

    def _get_jacobian_matrix(self, x: np.ndarray) -> np.ndarray:
        """Compute full Jacobian matrix.

        Args:
            x: Parameter vector

        Returns:
            Jacobian matrix
        """
        # Unpack parameters
        self.factor_graph.unpack_variables(x)

        # Get variable ordering for columns
        variable_ids = self.factor_graph.get_variable_ids()
        free_variable_ids = [
            var_id for var_id in variable_ids
            if not self.factor_graph.variables[var_id].is_constant
        ]

        # Build parameter offset map
        param_offset_map = {}
        offset = 0
        for var_id in free_variable_ids:
            variable = self.factor_graph.variables[var_id]
            param_offset_map[var_id] = offset
            offset += variable.size

        n_params = offset

        # Process factors to build Jacobian
        jacobian_blocks = []
        residual_offset = 0

        for factor_id in self.factor_graph.get_factor_ids():
            factor = self.factor_graph.factors[factor_id]

            # Get variable values for this factor
            var_values = {}
            for var_id in factor.variable_ids:
                variable = self.factor_graph.variables[var_id]
                var_values[var_id] = variable.get_value()

            # Compute factor Jacobian
            factor_jacobians = factor.compute_jacobian(var_values)
            residual_dim = factor.residual_dimension()

            # Create Jacobian block for this factor
            factor_jacobian_block = np.zeros((residual_dim, n_params))

            for var_id, var_jacobian in factor_jacobians.items():
                if var_id in param_offset_map:  # Variable is not constant
                    var_offset = param_offset_map[var_id]
                    var_size = self.factor_graph.variables[var_id].size
                    factor_jacobian_block[:, var_offset:var_offset+var_size] = var_jacobian

            jacobian_blocks.append(factor_jacobian_block)
            residual_offset += residual_dim

        if jacobian_blocks:
            jacobian = np.vstack(jacobian_blocks)
        else:
            jacobian = np.zeros((0, n_params))

        return jacobian

    def _build_jacobian_sparsity(self, factor_graph: FactorGraph) -> Optional[csr_matrix]:
        """Build Jacobian sparsity pattern.

        Args:
            factor_graph: Factor graph

        Returns:
            Sparse matrix indicating Jacobian structure
        """
        try:
            row_indices, col_indices = factor_graph.compute_jacobian_structure()

            if not row_indices:
                return None

            # Determine matrix dimensions
            n_residuals = max(row_indices) + 1 if row_indices else 0
            n_params = max(col_indices) + 1 if col_indices else 0

            # Create sparse matrix with ones where Jacobian is non-zero
            data = np.ones(len(row_indices))
            sparsity_matrix = csr_matrix(
                (data, (row_indices, col_indices)),
                shape=(n_residuals, n_params)
            )

            return sparsity_matrix

        except Exception:
            # If sparsity computation fails, return None (dense Jacobian)
            return None

    def _parse_termination_reason(self, result) -> str:
        """Parse SciPy termination reason into human-readable string.

        Args:
            result: SciPy least_squares result

        Returns:
            Human-readable termination reason
        """
        if result.success:
            if result.optimality < self.options.gradient_tolerance:
                return "Converged: gradient tolerance satisfied"
            elif hasattr(result, 'fun') and np.abs(result.fun).max() < self.options.tolerance:
                return "Converged: function tolerance satisfied"
            else:
                return "Converged"
        else:
            if hasattr(result, 'message'):
                return f"Failed: {result.message}"
            else:
                return "Failed: unknown reason"

    def get_cost_history(self) -> List[float]:
        """Get optimization cost history.

        Returns:
            List of cost values at each iteration
        """
        return self.cost_history.copy()

    def get_parameter_history(self) -> List[np.ndarray]:
        """Get parameter history.

        Returns:
            List of parameter vectors at each iteration
        """
        return [p.copy() for p in self.parameter_history]

    def set_callback(self, callback: Callable[[int, float, np.ndarray], bool]) -> None:
        """Set iteration callback function.

        Args:
            callback: Function called at each iteration with (iteration, cost, parameters)
                      Should return True to continue optimization, False to stop
        """
        # Note: SciPy least_squares doesn't support iteration callbacks directly
        # This is a placeholder for potential future implementation
        pass

    def analyze_convergence(self) -> Dict[str, Any]:
        """Analyze convergence properties of the last solve.

        Returns:
            Dictionary with convergence analysis
        """
        if not self.cost_history:
            return {"error": "No solve history available"}

        costs = np.array(self.cost_history)

        analysis = {
            "initial_cost": costs[0],
            "final_cost": costs[-1],
            "cost_reduction": costs[0] - costs[-1],
            "relative_cost_reduction": (costs[0] - costs[-1]) / (costs[0] + 1e-12),
            "iterations": len(costs),
            "cost_history": costs.tolist(),
        }

        # Analyze convergence rate
        if len(costs) > 2:
            # Compute cost reduction per iteration
            cost_reductions = np.diff(costs)
            analysis["mean_cost_reduction_per_iter"] = np.mean(-cost_reductions)
            analysis["cost_reduction_std"] = np.std(cost_reductions)

            # Check for convergence stagnation
            last_few_iters = min(10, len(costs) // 2)
            if last_few_iters > 1:
                recent_reduction = costs[-last_few_iters] - costs[-1]
                analysis["recent_cost_reduction"] = recent_reduction
                analysis["convergence_stagnant"] = recent_reduction < 1e-8

        return analysis