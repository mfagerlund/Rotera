"""Factor graph representation for optimization problems."""

import numpy as np
from typing import List, Dict, Optional, Any, Tuple
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum


class VariableType(Enum):
    """Types of optimization variables."""
    WORLD_POINT = "world_point"
    CAMERA_ROTATION = "camera_rotation"
    CAMERA_TRANSLATION = "camera_translation"
    CAMERA_INTRINSICS = "camera_intrinsics"


@dataclass
class Variable:
    """Optimization variable in the factor graph."""

    id: str
    type: VariableType
    size: int
    value: Optional[np.ndarray] = None
    is_constant: bool = False
    lower_bounds: Optional[np.ndarray] = None
    upper_bounds: Optional[np.ndarray] = None

    def __post_init__(self):
        """Initialize variable with proper array shapes."""
        if self.value is not None:
            self.value = np.atleast_1d(self.value)
            if len(self.value) != self.size:
                raise ValueError(f"Variable {self.id}: value size {len(self.value)} != expected size {self.size}")

        if self.lower_bounds is not None:
            self.lower_bounds = np.atleast_1d(self.lower_bounds)
            if len(self.lower_bounds) != self.size:
                raise ValueError(f"Variable {self.id}: lower_bounds size != variable size")

        if self.upper_bounds is not None:
            self.upper_bounds = np.atleast_1d(self.upper_bounds)
            if len(self.upper_bounds) != self.size:
                raise ValueError(f"Variable {self.id}: upper_bounds size != variable size")

    def is_initialized(self) -> bool:
        """Check if variable has a value."""
        return self.value is not None

    def get_value(self) -> np.ndarray:
        """Get variable value, ensuring it exists."""
        if self.value is None:
            raise ValueError(f"Variable {self.id} has no value")
        return self.value.copy()

    def set_value(self, value: np.ndarray) -> None:
        """Set variable value with validation."""
        value = np.atleast_1d(value)
        if len(value) != self.size:
            raise ValueError(f"Variable {self.id}: new value size {len(value)} != expected size {self.size}")
        self.value = value.copy()

    def clamp_to_bounds(self) -> None:
        """Clamp variable value to bounds if they exist."""
        if self.value is None:
            return

        if self.lower_bounds is not None:
            self.value = np.maximum(self.value, self.lower_bounds)

        if self.upper_bounds is not None:
            self.value = np.minimum(self.value, self.upper_bounds)


class Factor(ABC):
    """Abstract base class for factors in the factor graph."""

    def __init__(self, factor_id: str, variable_ids: List[str]):
        """Initialize factor.

        Args:
            factor_id: Unique identifier for this factor
            variable_ids: List of variable IDs this factor depends on
        """
        self.factor_id = factor_id
        self.variable_ids = variable_ids
        self.robust_loss_type = "none"
        self.robust_loss_params = {}

    @abstractmethod
    def compute_residual(self, variables: Dict[str, np.ndarray]) -> np.ndarray:
        """Compute residual given variable values.

        Args:
            variables: Dictionary mapping variable IDs to their values

        Returns:
            Residual vector
        """
        pass

    @abstractmethod
    def compute_jacobian(self, variables: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        """Compute Jacobian of residual with respect to variables.

        Args:
            variables: Dictionary mapping variable IDs to their values

        Returns:
            Dictionary mapping variable IDs to their Jacobian matrices
        """
        pass

    @abstractmethod
    def residual_dimension(self) -> int:
        """Get dimension of residual vector."""
        pass

    def set_robust_loss(self, loss_type: str, **params) -> None:
        """Set robust loss function for this factor.

        Args:
            loss_type: Type of robust loss ("none", "huber", "cauchy")
            **params: Parameters for the loss function
        """
        self.robust_loss_type = loss_type
        self.robust_loss_params = params

    def apply_robust_loss(self, residual: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """Apply robust loss function to residual.

        Args:
            residual: Raw residual vector

        Returns:
            Tuple of (robustified_residual, weights_for_jacobian)
        """
        from ..math.robust import apply_robust_loss
        return apply_robust_loss(residual, self.robust_loss_type, **self.robust_loss_params)


class FactorGraph:
    """Factor graph for bundle adjustment optimization."""

    def __init__(self):
        """Initialize empty factor graph."""
        self.variables: Dict[str, Variable] = {}
        self.factors: Dict[str, Factor] = {}
        self._variable_ordering: List[str] = []
        self._factor_ordering: List[str] = []

    def add_variable(self, variable: Variable) -> None:
        """Add a variable to the graph.

        Args:
            variable: Variable to add
        """
        if variable.id in self.variables:
            raise ValueError(f"Variable {variable.id} already exists")

        self.variables[variable.id] = variable
        self._variable_ordering.append(variable.id)

    def add_factor(self, factor: Factor) -> None:
        """Add a factor to the graph.

        Args:
            factor: Factor to add
        """
        if factor.factor_id in self.factors:
            raise ValueError(f"Factor {factor.factor_id} already exists")

        # Check that all referenced variables exist
        for var_id in factor.variable_ids:
            if var_id not in self.variables:
                raise ValueError(f"Factor {factor.factor_id} references unknown variable {var_id}")

        self.factors[factor.factor_id] = factor
        self._factor_ordering.append(factor.factor_id)

    def get_variable(self, variable_id: str) -> Variable:
        """Get variable by ID."""
        if variable_id not in self.variables:
            raise ValueError(f"Variable {variable_id} not found")
        return self.variables[variable_id]

    def get_factor(self, factor_id: str) -> Factor:
        """Get factor by ID."""
        if factor_id not in self.factors:
            raise ValueError(f"Factor {factor_id} not found")
        return self.factors[factor_id]

    def get_variable_ids(self) -> List[str]:
        """Get list of all variable IDs in order."""
        return self._variable_ordering.copy()

    def get_factor_ids(self) -> List[str]:
        """Get list of all factor IDs in order."""
        return self._factor_ordering.copy()

    def pack_variables(self, variable_ids: Optional[List[str]] = None) -> np.ndarray:
        """Pack variable values into a single vector.

        Args:
            variable_ids: List of variable IDs to pack (None for all)

        Returns:
            Packed parameter vector
        """
        if variable_ids is None:
            variable_ids = self._variable_ordering

        packed_values = []
        for var_id in variable_ids:
            variable = self.variables[var_id]
            if not variable.is_constant and variable.is_initialized():
                packed_values.append(variable.get_value())

        if not packed_values:
            return np.array([])

        return np.concatenate(packed_values)

    def unpack_variables(self, params: np.ndarray, variable_ids: Optional[List[str]] = None) -> None:
        """Unpack parameter vector into variable values.

        Args:
            params: Packed parameter vector
            variable_ids: List of variable IDs to unpack (None for all)
        """
        if variable_ids is None:
            variable_ids = self._variable_ordering

        offset = 0
        for var_id in variable_ids:
            variable = self.variables[var_id]
            if not variable.is_constant:
                end_offset = offset + variable.size
                if end_offset > len(params):
                    raise ValueError(f"Not enough parameters for variable {var_id}")

                variable.set_value(params[offset:end_offset])
                variable.clamp_to_bounds()
                offset = end_offset

        if offset != len(params):
            raise ValueError(f"Parameter vector size mismatch: {offset} vs {len(params)}")

    def get_variable_bounds(self, variable_ids: Optional[List[str]] = None) -> Tuple[np.ndarray, np.ndarray]:
        """Get lower and upper bounds for variables.

        Args:
            variable_ids: List of variable IDs (None for all)

        Returns:
            Tuple of (lower_bounds, upper_bounds) arrays
        """
        if variable_ids is None:
            variable_ids = self._variable_ordering

        lower_bounds = []
        upper_bounds = []

        for var_id in variable_ids:
            variable = self.variables[var_id]
            if not variable.is_constant:
                if variable.lower_bounds is not None:
                    lower_bounds.append(variable.lower_bounds)
                else:
                    lower_bounds.append(np.full(variable.size, -np.inf))

                if variable.upper_bounds is not None:
                    upper_bounds.append(variable.upper_bounds)
                else:
                    upper_bounds.append(np.full(variable.size, np.inf))

        if not lower_bounds:
            return np.array([]), np.array([])

        return np.concatenate(lower_bounds), np.concatenate(upper_bounds)

    def compute_all_residuals(self) -> np.ndarray:
        """Compute residuals for all factors.

        Returns:
            Concatenated residual vector
        """
        residuals = []

        for factor_id in self._factor_ordering:
            factor = self.factors[factor_id]

            # Get variable values for this factor
            var_values = {}
            for var_id in factor.variable_ids:
                variable = self.variables[var_id]
                if variable.is_initialized():
                    var_values[var_id] = variable.get_value()
                else:
                    raise ValueError(f"Variable {var_id} required by factor {factor_id} is not initialized")

            # Compute residual
            residual = factor.compute_residual(var_values)

            # Apply robust loss if specified
            if factor.robust_loss_type != "none":
                residual, _ = factor.apply_robust_loss(residual)

            residuals.append(residual)

        if not residuals:
            return np.array([])

        return np.concatenate(residuals)

    def compute_jacobian_structure(self) -> Tuple[List[int], List[int]]:
        """Compute sparsity structure of Jacobian matrix.

        Returns:
            Tuple of (row_indices, col_indices) for sparse Jacobian
        """
        row_indices = []
        col_indices = []

        residual_offset = 0
        var_offset_map = {}

        # Build variable offset map
        param_offset = 0
        for var_id in self._variable_ordering:
            variable = self.variables[var_id]
            if not variable.is_constant:
                var_offset_map[var_id] = param_offset
                param_offset += variable.size

        # Process each factor
        for factor_id in self._factor_ordering:
            factor = self.factors[factor_id]
            residual_dim = factor.residual_dimension()

            for var_id in factor.variable_ids:
                if var_id in var_offset_map:  # Not constant
                    variable = self.variables[var_id]
                    var_offset = var_offset_map[var_id]

                    # Add entries for this factor-variable block
                    for r in range(residual_dim):
                        for c in range(variable.size):
                            row_indices.append(residual_offset + r)
                            col_indices.append(var_offset + c)

            residual_offset += residual_dim

        return row_indices, col_indices

    def summary(self) -> Dict[str, Any]:
        """Get summary information about the factor graph.

        Returns:
            Dictionary with graph statistics
        """
        n_variables = len(self.variables)
        n_factors = len(self.factors)

        # Count variable types
        var_type_counts = {}
        total_var_size = 0
        constant_vars = 0

        for variable in self.variables.values():
            var_type = variable.type.value
            var_type_counts[var_type] = var_type_counts.get(var_type, 0) + 1
            total_var_size += variable.size
            if variable.is_constant:
                constant_vars += 1

        # Count factor types
        factor_type_counts = {}
        total_residual_size = 0

        for factor in self.factors.values():
            factor_type = type(factor).__name__
            factor_type_counts[factor_type] = factor_type_counts.get(factor_type, 0) + 1
            total_residual_size += factor.residual_dimension()

        return {
            "variables": {
                "total": n_variables,
                "constant": constant_vars,
                "free": n_variables - constant_vars,
                "total_parameters": total_var_size,
                "by_type": var_type_counts
            },
            "factors": {
                "total": n_factors,
                "total_residuals": total_residual_size,
                "by_type": factor_type_counts
            }
        }