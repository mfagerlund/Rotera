"""Solver diagnostics and analysis tools."""

import numpy as np
from typing import Dict, List, Tuple, Any, Optional
from scipy.linalg import svd

from ..optimization.factor_graph import FactorGraph


class SolveDiagnostics:
    """Diagnostics and analysis for optimization results."""

    def __init__(self):
        """Initialize diagnostics."""
        pass

    def compute_diagnostics(
        self,
        factor_graph: FactorGraph,
        residuals: np.ndarray,
        jacobian: Optional[np.ndarray] = None
    ) -> Dict[str, Any]:
        """Compute comprehensive diagnostics.

        Args:
            factor_graph: Factor graph
            residuals: Final residual vector
            jacobian: Jacobian matrix (optional)

        Returns:
            Dictionary with diagnostic information
        """
        diagnostics = {}

        # Per-constraint residuals
        diagnostics["residuals"] = self._compute_per_constraint_residuals(
            factor_graph, residuals
        )

        # Uncertainty estimates
        if jacobian is not None:
            diagnostics["uncertainties"] = self._compute_uncertainties(
                factor_graph, jacobian
            )
        else:
            diagnostics["uncertainties"] = {}

        # Under-constrained analysis
        if jacobian is not None:
            diagnostics["unconstrained_dofs"] = self._analyze_unconstrained_dofs(
                factor_graph, jacobian
            )
        else:
            diagnostics["unconstrained_dofs"] = []

        # Largest residuals
        diagnostics["largest_residuals"] = self._find_largest_residuals(
            factor_graph, residuals
        )

        # Overall statistics
        diagnostics["statistics"] = self._compute_statistics(residuals)

        return diagnostics

    def _compute_per_constraint_residuals(
        self,
        factor_graph: FactorGraph,
        residuals: np.ndarray
    ) -> Dict[str, float]:
        """Compute RMS residual for each constraint.

        Args:
            factor_graph: Factor graph
            residuals: Residual vector

        Returns:
            Dictionary mapping constraint IDs to RMS residuals
        """
        per_constraint_residuals = {}
        residual_offset = 0

        for factor_id in factor_graph.get_factor_ids():
            factor = factor_graph.factors[factor_id]
            residual_dim = factor.residual_dimension()

            if residual_offset + residual_dim <= len(residuals):
                factor_residuals = residuals[residual_offset:residual_offset + residual_dim]
                rms_residual = np.sqrt(np.mean(factor_residuals**2))
                per_constraint_residuals[factor_id] = float(rms_residual)

            residual_offset += residual_dim

        return per_constraint_residuals

    def _compute_uncertainties(
        self,
        factor_graph: FactorGraph,
        jacobian: np.ndarray
    ) -> Dict[str, List[float]]:
        """Compute uncertainty estimates for world points.

        Args:
            factor_graph: Factor graph
            jacobian: Jacobian matrix

        Returns:
            Dictionary mapping world point IDs to uncertainty estimates [σx, σy, σz]
        """
        uncertainties = {}

        try:
            # Compute covariance approximation: (J^T J)^(-1)
            JtJ = jacobian.T @ jacobian

            # Add small regularization to avoid singularity
            regularization = 1e-6 * np.eye(JtJ.shape[0])
            JtJ_reg = JtJ + regularization

            # Compute pseudo-inverse
            try:
                covariance = np.linalg.inv(JtJ_reg)
            except np.linalg.LinAlgError:
                # Fall back to pseudo-inverse
                covariance = np.linalg.pinv(JtJ_reg)

            # Extract uncertainties for world points
            variable_ids = factor_graph.get_variable_ids()
            free_variable_ids = [
                var_id for var_id in variable_ids
                if not factor_graph.variables[var_id].is_constant
            ]

            param_offset = 0
            for var_id in free_variable_ids:
                variable = factor_graph.variables[var_id]

                if variable.type.value == "world_point":
                    # Extract 3x3 covariance block for this world point
                    if param_offset + 3 <= covariance.shape[0]:
                        wp_covariance = covariance[param_offset:param_offset+3, param_offset:param_offset+3]

                        # Standard deviations are square roots of diagonal elements
                        uncertainties_xyz = np.sqrt(np.maximum(np.diag(wp_covariance), 0))
                        uncertainties[var_id] = uncertainties_xyz.tolist()

                param_offset += variable.size

        except Exception as e:
            # If uncertainty computation fails, return empty dict
            pass

        return uncertainties

    def _analyze_unconstrained_dofs(
        self,
        factor_graph: FactorGraph,
        jacobian: np.ndarray
    ) -> List[str]:
        """Analyze under-constrained degrees of freedom.

        Args:
            factor_graph: Factor graph
            jacobian: Jacobian matrix

        Returns:
            List of under-constrained variable descriptions
        """
        unconstrained_dofs = []

        try:
            # Perform SVD to analyze rank
            U, s, Vt = svd(jacobian, full_matrices=False)

            # Determine numerical rank
            tolerance = 1e-6
            rank = np.sum(s > tolerance * s[0]) if len(s) > 0 else 0
            nullspace_dim = jacobian.shape[1] - rank

            if nullspace_dim > 0:
                # Identify which variables are in the nullspace
                null_vectors = Vt[rank:].T  # Nullspace vectors

                variable_ids = factor_graph.get_variable_ids()
                free_variable_ids = [
                    var_id for var_id in variable_ids
                    if not factor_graph.variables[var_id].is_constant
                ]

                param_offset = 0
                for var_id in free_variable_ids:
                    variable = factor_graph.variables[var_id]

                    # Check if this variable has significant nullspace components
                    if param_offset + variable.size <= null_vectors.shape[0]:
                        var_null_components = null_vectors[param_offset:param_offset+variable.size, :]
                        var_null_magnitude = np.linalg.norm(var_null_components)

                        if var_null_magnitude > 0.1:  # Threshold for significant involvement
                            unconstrained_dofs.append(f"{var_id} (magnitude: {var_null_magnitude:.3f})")

                    param_offset += variable.size

                if not unconstrained_dofs:
                    unconstrained_dofs.append(f"System has {nullspace_dim} unconstrained DOFs")

        except Exception as e:
            unconstrained_dofs.append(f"DOF analysis failed: {str(e)}")

        return unconstrained_dofs

    def _find_largest_residuals(
        self,
        factor_graph: FactorGraph,
        residuals: np.ndarray,
        top_k: int = 10
    ) -> List[Tuple[str, float]]:
        """Find constraints with largest residuals.

        Args:
            factor_graph: Factor graph
            residuals: Residual vector
            top_k: Number of top residuals to return

        Returns:
            List of (constraint_id, rms_residual) tuples
        """
        constraint_residuals = []
        residual_offset = 0

        for factor_id in factor_graph.get_factor_ids():
            factor = factor_graph.factors[factor_id]
            residual_dim = factor.residual_dimension()

            if residual_offset + residual_dim <= len(residuals):
                factor_residuals = residuals[residual_offset:residual_offset + residual_dim]
                rms_residual = np.sqrt(np.mean(factor_residuals**2))
                constraint_residuals.append((factor_id, float(rms_residual)))

            residual_offset += residual_dim

        # Sort by residual magnitude and return top k
        constraint_residuals.sort(key=lambda x: x[1], reverse=True)
        return constraint_residuals[:top_k]

    def _compute_statistics(self, residuals: np.ndarray) -> Dict[str, float]:
        """Compute overall residual statistics.

        Args:
            residuals: Residual vector

        Returns:
            Dictionary with statistics
        """
        if len(residuals) == 0:
            return {
                "total_residuals": 0,
                "rms_residual": 0.0,
                "max_residual": 0.0,
                "mean_residual": 0.0,
                "std_residual": 0.0
            }

        return {
            "total_residuals": len(residuals),
            "rms_residual": float(np.sqrt(np.mean(residuals**2))),
            "max_residual": float(np.max(np.abs(residuals))),
            "mean_residual": float(np.mean(residuals)),
            "std_residual": float(np.std(residuals))
        }


def analyze_jacobian_rank(jacobian: np.ndarray, tolerance: float = 1e-6) -> Dict[str, Any]:
    """Analyze Jacobian matrix rank and condition.

    Args:
        jacobian: Jacobian matrix
        tolerance: Numerical tolerance for rank determination

    Returns:
        Dictionary with rank analysis
    """
    if jacobian.size == 0:
        return {
            "rank": 0,
            "full_rank": True,
            "condition_number": 1.0,
            "singular_values": [],
            "nullspace_dimension": 0
        }

    try:
        # Compute SVD
        U, s, Vt = svd(jacobian, full_matrices=False)

        # Determine numerical rank
        rank = np.sum(s > tolerance * s[0]) if len(s) > 0 else 0
        full_rank = rank == min(jacobian.shape)
        nullspace_dim = jacobian.shape[1] - rank

        # Condition number
        condition_number = s[0] / s[-1] if len(s) > 0 and s[-1] > 0 else np.inf

        return {
            "rank": int(rank),
            "full_rank": bool(full_rank),
            "condition_number": float(condition_number),
            "singular_values": s.tolist(),
            "nullspace_dimension": int(nullspace_dim),
            "matrix_shape": jacobian.shape,
            "largest_singular_value": float(s[0]) if len(s) > 0 else 0.0,
            "smallest_singular_value": float(s[-1]) if len(s) > 0 else 0.0
        }

    except Exception as e:
        return {
            "error": f"Jacobian analysis failed: {str(e)}",
            "rank": -1,
            "full_rank": False,
            "condition_number": np.inf,
            "singular_values": [],
            "nullspace_dimension": -1
        }


def detect_degeneracies(
    factor_graph: FactorGraph,
    jacobian: Optional[np.ndarray] = None
) -> Dict[str, Any]:
    """Detect common degeneracies in bundle adjustment problems.

    Args:
        factor_graph: Factor graph
        jacobian: Jacobian matrix (optional)

    Returns:
        Dictionary with degeneracy analysis
    """
    degeneracies = {
        "detected_issues": [],
        "warnings": [],
        "recommendations": []
    }

    # Check for insufficient constraints
    n_cameras = sum(1 for var in factor_graph.variables.values()
                   if var.type.value == "camera_rotation")
    n_world_points = sum(1 for var in factor_graph.variables.values()
                        if var.type.value == "world_point")

    if n_cameras < 2:
        degeneracies["detected_issues"].append("Fewer than 2 cameras - cannot determine scale")

    if n_world_points < 3:
        degeneracies["detected_issues"].append("Fewer than 3 world points - insufficient constraints")

    # Check for gauge fixing
    gauge_constraints = [f for f in factor_graph.factors.values()
                        if "gauge" in f.factor_id.lower()]

    if not gauge_constraints:
        degeneracies["warnings"].append("No gauge fixing constraints detected")
        degeneracies["recommendations"].append("Add gauge fixing constraint to remove scale/pose ambiguity")

    # Jacobian-based analysis
    if jacobian is not None:
        rank_analysis = analyze_jacobian_rank(jacobian)

        if not rank_analysis["full_rank"]:
            degeneracies["detected_issues"].append(
                f"Jacobian is rank deficient: rank {rank_analysis['rank']} < "
                f"min dimension {min(jacobian.shape)}"
            )

        if rank_analysis["condition_number"] > 1e12:
            degeneracies["warnings"].append(
                f"Jacobian is poorly conditioned: condition number = {rank_analysis['condition_number']:.2e}"
            )

        if rank_analysis["nullspace_dimension"] > 0:
            degeneracies["detected_issues"].append(
                f"System has {rank_analysis['nullspace_dimension']} unconstrained degrees of freedom"
            )

    return degeneracies


def compute_reprojection_errors(
    factor_graph: FactorGraph,
    residuals: np.ndarray
) -> Dict[str, Any]:
    """Compute reprojection error statistics.

    Args:
        factor_graph: Factor graph
        residuals: Residual vector

    Returns:
        Dictionary with reprojection error analysis
    """
    reprojection_errors = []
    residual_offset = 0

    # Extract reprojection residuals
    for factor_id in factor_graph.get_factor_ids():
        factor = factor_graph.factors[factor_id]

        if factor.factor_id.startswith("reprojection_"):
            residual_dim = factor.residual_dimension()

            if residual_offset + residual_dim <= len(residuals):
                factor_residuals = residuals[residual_offset:residual_offset + residual_dim]

                # For reprojection, residuals are [u_error, v_error]
                if len(factor_residuals) == 2:
                    pixel_error = np.linalg.norm(factor_residuals)
                    reprojection_errors.append(pixel_error)

        residual_offset += factor.residual_dimension()

    if not reprojection_errors:
        return {"error": "No reprojection residuals found"}

    errors = np.array(reprojection_errors)

    return {
        "n_observations": len(errors),
        "mean_error": float(np.mean(errors)),
        "median_error": float(np.median(errors)),
        "std_error": float(np.std(errors)),
        "max_error": float(np.max(errors)),
        "min_error": float(np.min(errors)),
        "rms_error": float(np.sqrt(np.mean(errors**2))),
        "percentile_95": float(np.percentile(errors, 95)),
        "percentile_99": float(np.percentile(errors, 99)),
        "errors": errors.tolist()
    }