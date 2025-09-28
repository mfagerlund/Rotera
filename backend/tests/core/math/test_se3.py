"""Tests for SE(3) operations."""

import numpy as np
import pytest
from pictorigo.core.math.se3 import compose, invert, se3_exp, se3_log, skew_symmetric


class TestSE3:
    """Test SE(3) operations."""

    def test_se3_exp_identity(self):
        """Test SE(3) exponential map at identity."""
        xi = np.zeros(6)
        R, t = se3_exp(xi)

        np.testing.assert_allclose(R, np.eye(3), atol=1e-10)
        np.testing.assert_allclose(t, np.zeros(3), atol=1e-10)

    def test_se3_exp_small_rotation(self):
        """Test SE(3) exponential map for small rotations."""
        xi = np.array([0.1, 0.2, 0.3, 0.01, 0.02, 0.03])
        R, t = se3_exp(xi)

        # Check that determinant is 1
        assert abs(np.linalg.det(R) - 1.0) < 1e-10

        # Check that R is orthogonal
        np.testing.assert_allclose(R @ R.T, np.eye(3), atol=1e-10)

    def test_se3_exp_large_rotation(self):
        """Test SE(3) exponential map for large rotations."""
        xi = np.array([1.0, 2.0, 3.0, 1.5, 2.5, 3.5])
        R, t = se3_exp(xi)

        # Check that determinant is 1
        assert abs(np.linalg.det(R) - 1.0) < 1e-10

        # Check that R is orthogonal
        np.testing.assert_allclose(R @ R.T, np.eye(3), atol=1e-10)

    def test_se3_round_trip(self):
        """Test SE(3) exp/log round trip."""
        xi_original = np.array([0.5, 1.0, 1.5, 0.8, 1.2, 0.4])
        R, t = se3_exp(xi_original)
        xi_recovered = se3_log(R, t)

        np.testing.assert_allclose(xi_original, xi_recovered, atol=1e-10)

    def test_se3_log_identity(self):
        """Test SE(3) logarithm at identity."""
        R = np.eye(3)
        t = np.zeros(3)
        xi = se3_log(R, t)

        np.testing.assert_allclose(xi, np.zeros(6), atol=1e-10)

    def test_skew_symmetric(self):
        """Test skew-symmetric matrix construction."""
        v = np.array([1, 2, 3])
        S = skew_symmetric(v)

        expected = np.array([[0, -3, 2], [3, 0, -1], [-2, 1, 0]])

        np.testing.assert_allclose(S, expected)

        # Check anti-symmetry
        np.testing.assert_allclose(S, -S.T)

    def test_compose(self):
        """Test SE(3) composition."""
        # Create two random transformations
        xi1 = np.array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6])
        xi2 = np.array([0.2, 0.3, 0.4, 0.1, 0.2, 0.3])

        R1, t1 = se3_exp(xi1)
        R2, t2 = se3_exp(xi2)

        # Compose
        R_comp, t_comp = compose(R1, t1, R2, t2)

        # Check properties
        assert abs(np.linalg.det(R_comp) - 1.0) < 1e-10
        np.testing.assert_allclose(R_comp @ R_comp.T, np.eye(3), atol=1e-10)

        # Test associativity with identity
        R_id = np.eye(3)
        t_id = np.zeros(3)
        R_test, t_test = compose(R1, t1, R_id, t_id)

        np.testing.assert_allclose(R_test, R1, atol=1e-10)
        np.testing.assert_allclose(t_test, t1, atol=1e-10)

    def test_invert(self):
        """Test SE(3) inversion."""
        xi = np.array([1.0, 2.0, 3.0, 0.5, 1.0, 1.5])
        R, t = se3_exp(xi)

        R_inv, t_inv = invert(R, t)

        # Check that T * T^(-1) = I
        R_comp, t_comp = compose(R, t, R_inv, t_inv)

        np.testing.assert_allclose(R_comp, np.eye(3), atol=1e-10)
        np.testing.assert_allclose(t_comp, np.zeros(3), atol=1e-10)

    def test_invalid_input_shapes(self):
        """Test error handling for invalid input shapes."""
        with pytest.raises(ValueError):
            se3_exp(np.array([1, 2, 3]))  # Wrong size

        with pytest.raises(ValueError):
            se3_log(np.array([[1, 2], [3, 4]]), np.array([1, 2, 3]))  # Wrong R shape

        with pytest.raises(ValueError):
            se3_log(np.eye(3), np.array([1, 2]))  # Wrong t shape
