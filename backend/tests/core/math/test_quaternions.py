"""Tests for quaternion operations."""

import numpy as np
import pytest
from pictorigo.core.math.quaternions import (
    quat_conjugate,
    quat_from_axis_angle,
    quat_multiply,
    quat_normalize,
    quat_to_matrix,
)


class TestQuaternions:
    """Test quaternion operations."""

    def test_quat_normalize(self):
        """Test quaternion normalization."""
        q = np.array([2.0, 3.0, 4.0, 5.0])
        q_norm = quat_normalize(q)

        assert abs(np.linalg.norm(q_norm) - 1.0) < 1e-10

    def test_quat_normalize_zero(self):
        """Test quaternion normalization with zero quaternion."""
        q = np.zeros(4)
        with pytest.raises(ValueError):
            quat_normalize(q)

    def test_quat_from_axis_angle_identity(self):
        """Test quaternion from axis-angle for zero rotation."""
        axis = np.array([1, 0, 0])
        angle = 0.0
        q = quat_from_axis_angle(axis, angle)

        expected = np.array([1.0, 0.0, 0.0, 0.0])
        np.testing.assert_allclose(q, expected, atol=1e-10)

    def test_quat_from_axis_angle_90deg(self):
        """Test quaternion from axis-angle for 90 degree rotation."""
        axis = np.array([1, 0, 0])
        angle = np.pi / 2
        q = quat_from_axis_angle(axis, angle)

        expected = np.array([np.sqrt(2) / 2, np.sqrt(2) / 2, 0.0, 0.0])
        np.testing.assert_allclose(q, expected, atol=1e-10)

    def test_quat_from_axis_angle_zero_axis(self):
        """Test quaternion from zero axis."""
        axis = np.zeros(3)
        angle = 1.0
        q = quat_from_axis_angle(axis, angle)

        expected = np.array([1.0, 0.0, 0.0, 0.0])
        np.testing.assert_allclose(q, expected, atol=1e-10)

    def test_quat_to_matrix_identity(self):
        """Test quaternion to matrix for identity rotation."""
        q = np.array([1.0, 0.0, 0.0, 0.0])
        R = quat_to_matrix(q)

        np.testing.assert_allclose(R, np.eye(3), atol=1e-10)

    def test_quat_to_matrix_90deg_x(self):
        """Test quaternion to matrix for 90 degree rotation around X."""
        q = np.array([np.sqrt(2) / 2, np.sqrt(2) / 2, 0.0, 0.0])
        R = quat_to_matrix(q)

        expected = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]])
        np.testing.assert_allclose(R, expected, atol=1e-10)

    def test_quat_to_matrix_properties(self):
        """Test quaternion to matrix produces valid rotation matrix."""
        # Random quaternion
        q = quat_normalize(np.array([1, 2, 3, 4]))
        R = quat_to_matrix(q)

        # Check determinant is 1
        assert abs(np.linalg.det(R) - 1.0) < 1e-10

        # Check orthogonality
        np.testing.assert_allclose(R @ R.T, np.eye(3), atol=1e-10)

    def test_axis_angle_to_matrix_round_trip(self):
        """Test axis-angle to quaternion to matrix conversion."""
        axis = quat_normalize(np.array([1, 2, 3]))
        angle = 1.5

        q = quat_from_axis_angle(axis, angle)
        R = quat_to_matrix(q)

        # Check properties
        assert abs(np.linalg.det(R) - 1.0) < 1e-10
        np.testing.assert_allclose(R @ R.T, np.eye(3), atol=1e-10)

        # Check rotation angle
        trace = np.trace(R)
        angle_recovered = np.arccos(np.clip((trace - 1) / 2, -1, 1))
        assert abs(angle_recovered - angle) < 1e-10

    def test_quat_multiply_identity(self):
        """Test quaternion multiplication with identity."""
        q = np.array([0.5, 0.5, 0.5, 0.5])
        q_id = np.array([1.0, 0.0, 0.0, 0.0])

        result = quat_multiply(q, q_id)
        np.testing.assert_allclose(result, q, atol=1e-10)

        result = quat_multiply(q_id, q)
        np.testing.assert_allclose(result, q, atol=1e-10)

    def test_quat_multiply_inverse(self):
        """Test quaternion multiplication with conjugate."""
        q = quat_normalize(np.array([1, 2, 3, 4]))
        q_conj = quat_conjugate(q)

        result = quat_multiply(q, q_conj)
        expected = np.array([1.0, 0.0, 0.0, 0.0])
        np.testing.assert_allclose(result, expected, atol=1e-10)

    def test_quat_conjugate(self):
        """Test quaternion conjugate."""
        q = np.array([1, 2, 3, 4])
        q_conj = quat_conjugate(q)

        expected = np.array([1, -2, -3, -4])
        np.testing.assert_allclose(q_conj, expected)

    def test_invalid_input_shapes(self):
        """Test error handling for invalid input shapes."""
        with pytest.raises(ValueError):
            quat_normalize(np.array([1, 2, 3]))  # Wrong size

        with pytest.raises(ValueError):
            quat_from_axis_angle(np.array([1, 2]), 1.0)  # Wrong axis size

        with pytest.raises(ValueError):
            quat_to_matrix(np.array([1, 2, 3]))  # Wrong quaternion size
