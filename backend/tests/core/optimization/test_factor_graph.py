"""Tests for factor graph functionality."""

import numpy as np
import pytest
from pictorigo.core.optimization.factor_graph import FactorGraph, Variable, VariableType


class MockFactor:
    """Mock factor for testing."""

    def __init__(self, factor_id: str, variable_ids: list, residual_dim: int = 2):
        self.factor_id = factor_id
        self.variable_ids = variable_ids
        self.residual_dim = residual_dim
        self.robust_loss_type = "none"
        self.robust_loss_params = {}

    def compute_residual(self, variables):
        # Simple mock residual
        return np.zeros(self.residual_dim)

    def compute_jacobian(self, variables):
        # Simple mock Jacobian
        jacobians = {}
        for var_id in self.variable_ids:
            jacobians[var_id] = np.ones((self.residual_dim, 3))  # Assume 3D variables
        return jacobians

    def residual_dimension(self):
        return self.residual_dim

    def set_robust_loss(self, loss_type, **params):
        self.robust_loss_type = loss_type
        self.robust_loss_params = params

    def apply_robust_loss(self, residual):
        return residual, np.ones_like(residual)


class TestVariable:
    """Test Variable class."""

    def test_variable_creation(self):
        """Test basic variable creation."""
        var = Variable(
            id="test_var",
            type=VariableType.WORLD_POINT,
            size=3,
            value=np.array([1, 2, 3]),
        )

        assert var.id == "test_var"
        assert var.type == VariableType.WORLD_POINT
        assert var.size == 3
        assert var.is_initialized()
        np.testing.assert_array_equal(var.get_value(), [1, 2, 3])

    def test_variable_without_value(self):
        """Test variable without initial value."""
        var = Variable(id="test_var", type=VariableType.WORLD_POINT, size=3)

        assert not var.is_initialized()
        assert var.value is None

        with pytest.raises(ValueError):
            var.get_value()

    def test_variable_set_value(self):
        """Test setting variable value."""
        var = Variable(id="test_var", type=VariableType.WORLD_POINT, size=3)

        new_value = np.array([4, 5, 6])
        var.set_value(new_value)

        assert var.is_initialized()
        np.testing.assert_array_equal(var.get_value(), [4, 5, 6])

    def test_variable_bounds(self):
        """Test variable with bounds."""
        var = Variable(
            id="test_var",
            type=VariableType.WORLD_POINT,
            size=3,
            value=np.array([1, 2, 3]),
            lower_bounds=np.array([0, 0, 0]),
            upper_bounds=np.array([10, 10, 10]),
        )

        # Test clamping
        var.set_value(np.array([-1, 15, 5]))
        var.clamp_to_bounds()

        expected = np.array([0, 10, 5])
        np.testing.assert_array_equal(var.get_value(), expected)

    def test_variable_constant(self):
        """Test constant variable."""
        var = Variable(
            id="test_var",
            type=VariableType.WORLD_POINT,
            size=3,
            value=np.array([1, 2, 3]),
            is_constant=True,
        )

        assert var.is_constant

    def test_variable_invalid_size(self):
        """Test error handling for invalid sizes."""
        with pytest.raises(ValueError):
            Variable(
                id="test_var",
                type=VariableType.WORLD_POINT,
                size=3,
                value=np.array([1, 2]),  # Wrong size
            )

        with pytest.raises(ValueError):
            Variable(
                id="test_var",
                type=VariableType.WORLD_POINT,
                size=3,
                lower_bounds=np.array([0, 0]),  # Wrong size
            )


class TestFactorGraph:
    """Test FactorGraph class."""

    def test_factor_graph_creation(self):
        """Test basic factor graph creation."""
        graph = FactorGraph()

        assert len(graph.variables) == 0
        assert len(graph.factors) == 0
        assert len(graph.get_variable_ids()) == 0
        assert len(graph.get_factor_ids()) == 0

    def test_add_variable(self):
        """Test adding variables to graph."""
        graph = FactorGraph()

        var1 = Variable(id="var1", type=VariableType.WORLD_POINT, size=3)
        var2 = Variable(id="var2", type=VariableType.CAMERA_ROTATION, size=3)

        graph.add_variable(var1)
        graph.add_variable(var2)

        assert len(graph.variables) == 2
        assert "var1" in graph.variables
        assert "var2" in graph.variables
        assert graph.get_variable_ids() == ["var1", "var2"]

    def test_add_duplicate_variable(self):
        """Test error when adding duplicate variable."""
        graph = FactorGraph()

        var1 = Variable(id="var1", type=VariableType.WORLD_POINT, size=3)
        var2 = Variable(id="var1", type=VariableType.WORLD_POINT, size=3)  # Same ID

        graph.add_variable(var1)

        with pytest.raises(ValueError):
            graph.add_variable(var2)

    def test_add_factor(self):
        """Test adding factors to graph."""
        graph = FactorGraph()

        # Add variables first
        var1 = Variable(id="var1", type=VariableType.WORLD_POINT, size=3)
        var2 = Variable(id="var2", type=VariableType.WORLD_POINT, size=3)
        graph.add_variable(var1)
        graph.add_variable(var2)

        # Add factor
        factor = MockFactor("factor1", ["var1", "var2"])
        graph.add_factor(factor)

        assert len(graph.factors) == 1
        assert "factor1" in graph.factors
        assert graph.get_factor_ids() == ["factor1"]

    def test_add_factor_missing_variable(self):
        """Test error when adding factor with missing variable."""
        graph = FactorGraph()

        factor = MockFactor("factor1", ["nonexistent_var"])

        with pytest.raises(ValueError):
            graph.add_factor(factor)

    def test_pack_unpack_variables(self):
        """Test packing and unpacking variables."""
        graph = FactorGraph()

        var1 = Variable(
            id="var1", type=VariableType.WORLD_POINT, size=3, value=np.array([1, 2, 3])
        )
        var2 = Variable(
            id="var2", type=VariableType.WORLD_POINT, size=2, value=np.array([4, 5])
        )
        var3 = Variable(
            id="var3",
            type=VariableType.WORLD_POINT,
            size=3,
            value=np.array([6, 7, 8]),
            is_constant=True,
        )

        graph.add_variable(var1)
        graph.add_variable(var2)
        graph.add_variable(var3)

        # Pack variables (should exclude constant var3)
        packed = graph.pack_variables()
        expected_packed = np.array([1, 2, 3, 4, 5])
        np.testing.assert_array_equal(packed, expected_packed)

        # Modify packed values
        new_packed = np.array([10, 20, 30, 40, 50])

        # Unpack
        graph.unpack_variables(new_packed)

        # Check that values were updated (except constant variable)
        np.testing.assert_array_equal(graph.variables["var1"].get_value(), [10, 20, 30])
        np.testing.assert_array_equal(graph.variables["var2"].get_value(), [40, 50])
        np.testing.assert_array_equal(
            graph.variables["var3"].get_value(), [6, 7, 8]
        )  # Unchanged

    def test_get_variable_bounds(self):
        """Test getting variable bounds."""
        graph = FactorGraph()

        var1 = Variable(
            id="var1",
            type=VariableType.WORLD_POINT,
            size=2,
            value=np.array([1, 2]),
            lower_bounds=np.array([0, 0]),
            upper_bounds=np.array([10, 10]),
        )
        var2 = Variable(
            id="var2", type=VariableType.WORLD_POINT, size=2, value=np.array([3, 4])
        )

        graph.add_variable(var1)
        graph.add_variable(var2)

        lower_bounds, upper_bounds = graph.get_variable_bounds()

        expected_lower = np.array([0, 0, -np.inf, -np.inf])
        expected_upper = np.array([10, 10, np.inf, np.inf])

        np.testing.assert_array_equal(lower_bounds, expected_lower)
        np.testing.assert_array_equal(upper_bounds, expected_upper)

    def test_compute_all_residuals(self):
        """Test computing all residuals."""
        graph = FactorGraph()

        # Add variables
        var1 = Variable(
            id="var1", type=VariableType.WORLD_POINT, size=3, value=np.array([1, 2, 3])
        )
        var2 = Variable(
            id="var2", type=VariableType.WORLD_POINT, size=3, value=np.array([4, 5, 6])
        )
        graph.add_variable(var1)
        graph.add_variable(var2)

        # Add factors
        factor1 = MockFactor("factor1", ["var1"], residual_dim=2)
        factor2 = MockFactor("factor2", ["var1", "var2"], residual_dim=3)
        graph.add_factor(factor1)
        graph.add_factor(factor2)

        # Compute residuals
        residuals = graph.compute_all_residuals()

        # Should concatenate residuals from both factors
        assert len(residuals) == 5  # 2 + 3

    def test_jacobian_structure(self):
        """Test Jacobian sparsity structure computation."""
        graph = FactorGraph()

        # Add variables
        var1 = Variable(
            id="var1", type=VariableType.WORLD_POINT, size=3, value=np.array([1, 2, 3])
        )
        var2 = Variable(
            id="var2", type=VariableType.WORLD_POINT, size=2, value=np.array([4, 5])
        )
        graph.add_variable(var1)
        graph.add_variable(var2)

        # Add factor connecting both variables
        factor = MockFactor("factor1", ["var1", "var2"], residual_dim=2)
        graph.add_factor(factor)

        # Compute sparsity structure
        row_indices, col_indices = graph.compute_jacobian_structure()

        # Should have entries for both variables
        assert len(row_indices) == len(col_indices)
        assert len(row_indices) > 0

        # Check that indices are reasonable
        assert all(0 <= r < 2 for r in row_indices)  # 2 residuals
        assert all(0 <= c < 5 for c in col_indices)  # 5 parameters total

    def test_graph_summary(self):
        """Test factor graph summary."""
        graph = FactorGraph()

        # Add variables of different types
        var1 = Variable(
            id="wp1", type=VariableType.WORLD_POINT, size=3, value=np.array([1, 2, 3])
        )
        var2 = Variable(
            id="wp2", type=VariableType.WORLD_POINT, size=3, value=np.array([4, 5, 6])
        )
        var3 = Variable(
            id="cam1_rot",
            type=VariableType.CAMERA_ROTATION,
            size=3,
            value=np.array([0, 0, 0]),
            is_constant=True,
        )

        graph.add_variable(var1)
        graph.add_variable(var2)
        graph.add_variable(var3)

        # Add factors
        factor1 = MockFactor("factor1", ["wp1"], residual_dim=2)
        factor2 = MockFactor("factor2", ["wp1", "wp2"], residual_dim=3)
        graph.add_factor(factor1)
        graph.add_factor(factor2)

        summary = graph.summary()

        assert summary["variables"]["total"] == 3
        assert summary["variables"]["constant"] == 1
        assert summary["variables"]["free"] == 2
        assert summary["factors"]["total"] == 2
        assert summary["factors"]["total_residuals"] == 5

    def test_empty_graph(self):
        """Test operations on empty graph."""
        graph = FactorGraph()

        # Empty pack/unpack
        packed = graph.pack_variables()
        assert len(packed) == 0

        graph.unpack_variables(np.array([]))

        # Empty bounds
        lower, upper = graph.get_variable_bounds()
        assert len(lower) == 0
        assert len(upper) == 0

        # Empty residuals
        residuals = graph.compute_all_residuals()
        assert len(residuals) == 0

        # Empty summary
        summary = graph.summary()
        assert summary["variables"]["total"] == 0
        assert summary["factors"]["total"] == 0
