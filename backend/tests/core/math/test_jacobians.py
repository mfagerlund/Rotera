"""Tests for Jacobian computation utilities."""

import numpy as np
import pytest

from pictorigo.core.math.jacobians import (
    finite_difference_jacobian,
    check_jacobian,
    perturbation_jacobian,
    JacobianTester,
)


class TestJacobians:
    """Test Jacobian computation utilities."""

    def test_finite_difference_linear(self):
        """Test finite difference for linear function."""
        # f(x) = A @ x where A is 3x2 matrix
        A = np.array([[1, 2], [3, 4], [5, 6]])

        def func(x):
            return A @ x

        x = np.array([1.0, 2.0])
        J = finite_difference_jacobian(func, x)

        # Jacobian should equal A
        np.testing.assert_allclose(J, A, atol=1e-6)

    def test_finite_difference_quadratic(self):
        """Test finite difference for quadratic function."""
        # f(x) = [x1^2, x1*x2, x2^2]
        def func(x):
            return np.array([x[0]**2, x[0]*x[1], x[1]**2])

        def analytic_jacobian(x):
            return np.array([
                [2*x[0], 0],
                [x[1], x[0]],
                [0, 2*x[1]]
            ])

        x = np.array([3.0, 4.0])
        J_numeric = finite_difference_jacobian(func, x)
        J_analytic = analytic_jacobian(x)

        np.testing.assert_allclose(J_numeric, J_analytic, atol=1e-6)

    def test_finite_difference_methods(self):
        """Test different finite difference methods."""
        def func(x):
            return np.array([x[0]**2 + x[1]])

        x = np.array([2.0, 3.0])

        J_forward = finite_difference_jacobian(func, x, method="forward")
        J_backward = finite_difference_jacobian(func, x, method="backward")
        J_central = finite_difference_jacobian(func, x, method="central")

        # Central differences should be most accurate
        J_exact = np.array([[4.0, 1.0]])  # d/dx[x^2 + y] = [2x, 1]

        error_forward = np.max(np.abs(J_forward - J_exact))
        error_backward = np.max(np.abs(J_backward - J_exact))
        error_central = np.max(np.abs(J_central - J_exact))

        # Central should be most accurate
        assert error_central < error_forward
        assert error_central < error_backward

    def test_finite_difference_scalar_function(self):
        """Test finite difference for scalar function."""
        def func(x):
            return x[0]**3

        x = np.array([2.0])
        J = finite_difference_jacobian(func, x)

        expected = np.array([[12.0]])  # d/dx[x^3] = 3x^2 = 3*4 = 12
        np.testing.assert_allclose(J, expected, atol=1e-6)

    def test_check_jacobian_correct(self):
        """Test Jacobian checker with correct implementation."""
        def func(x):
            return np.array([x[0]**2, x[0]*x[1]])

        def jacobian(x):
            return np.array([
                [2*x[0], 0],
                [x[1], x[0]]
            ])

        x = np.array([1.5, 2.5])
        is_correct, max_error, _ = check_jacobian(func, jacobian, x)

        assert is_correct
        assert max_error < 1e-6

    def test_check_jacobian_incorrect(self):
        """Test Jacobian checker with incorrect implementation."""
        def func(x):
            return np.array([x[0]**2])

        def wrong_jacobian(x):
            return np.array([[x[0]]])  # Should be 2*x[0]

        x = np.array([2.0])
        is_correct, max_error, _ = check_jacobian(func, wrong_jacobian, x)

        assert not is_correct
        assert max_error > 1e-3

    def test_perturbation_jacobian(self):
        """Test perturbation-based Jacobian computation."""
        def func(x):
            return np.array([x[0]**2 + x[1]**2])

        x = np.array([3.0, 4.0])
        J = perturbation_jacobian(func, x)

        expected = np.array([[6.0, 8.0]])  # [2*x[0], 2*x[1]]
        np.testing.assert_allclose(J, expected, atol=1e-6)

    def test_perturbation_jacobian_custom_h(self):
        """Test perturbation Jacobian with custom step sizes."""
        def func(x):
            return np.array([x[0]**3, x[1]**2])

        x = np.array([2.0, 3.0])
        perturbations = np.array([1e-6, 1e-7])
        J = perturbation_jacobian(func, x, perturbations)

        expected = np.array([
            [12.0, 0.0],  # [3*x[0]^2, 0]
            [0.0, 6.0]    # [0, 2*x[1]]
        ])
        np.testing.assert_allclose(J, expected, atol=1e-5)

    def test_jacobian_tester_class(self):
        """Test JacobianTester helper class."""
        def func(x):
            return np.array([x[0]**2, x[0]*x[1], x[1]**3])

        def jacobian(x):
            return np.array([
                [2*x[0], 0],
                [x[1], x[0]],
                [0, 3*x[1]**2]
            ])

        tester = JacobianTester(atol=1e-6, rtol=1e-6)

        test_points = [
            np.array([1.0, 2.0]),
            np.array([3.0, 4.0]),
            np.array([-1.0, 0.5])
        ]

        result = tester.test_jacobian(func, jacobian, test_points)
        assert result

    def test_jacobian_tester_generate_random_points(self):
        """Test random test point generation."""
        tester = JacobianTester()
        points = tester.generate_random_test_points(
            n_dims=3, n_points=5, scale=2.0, seed=42
        )

        assert len(points) == 5
        for point in points:
            assert point.shape == (3,)
            # Points should be roughly in range [-6, 6] with scale=2.0
            assert np.all(np.abs(point) < 10)

    def test_invalid_finite_difference_method(self):
        """Test error handling for invalid finite difference method."""
        def func(x):
            return x**2

        x = np.array([1.0])

        with pytest.raises(ValueError):
            finite_difference_jacobian(func, x, method="invalid")

    def test_jacobian_edge_cases(self):
        """Test Jacobian computation edge cases."""
        # Zero function
        def zero_func(x):
            return np.zeros(2)

        x = np.array([1.0, 2.0])
        J = finite_difference_jacobian(zero_func, x)

        assert J.shape == (2, 2)
        np.testing.assert_allclose(J, np.zeros((2, 2)), atol=1e-10)

        # Single input, single output
        def simple_func(x):
            return np.array([x[0]])

        x = np.array([5.0])
        J = finite_difference_jacobian(simple_func, x)

        assert J.shape == (1, 1)
        np.testing.assert_allclose(J, np.array([[1.0]]), atol=1e-6)