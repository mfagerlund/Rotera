"""Jacobian computation utilities."""

import numpy as np
from typing import Callable, Optional


def finite_difference_jacobian(
    func: Callable[[np.ndarray], np.ndarray],
    x: np.ndarray,
    h: float = 1e-8,
    method: str = "central"
) -> np.ndarray:
    """Compute Jacobian using finite differences.

    Args:
        func: Function that takes x and returns residual vector
        x: Input parameters
        h: Step size for finite differences
        method: Finite difference method ("forward", "backward", "central")

    Returns:
        Jacobian matrix J where J[i,j] = df_i/dx_j
    """
    x = np.atleast_1d(x)
    f0 = func(x)
    f0 = np.atleast_1d(f0)

    m, n = len(f0), len(x)
    J = np.zeros((m, n))

    if method == "forward":
        for j in range(n):
            x_plus = x.copy()
            x_plus[j] += h
            f_plus = func(x_plus)
            J[:, j] = (f_plus - f0) / h

    elif method == "backward":
        for j in range(n):
            x_minus = x.copy()
            x_minus[j] -= h
            f_minus = func(x_minus)
            J[:, j] = (f0 - f_minus) / h

    elif method == "central":
        for j in range(n):
            x_plus = x.copy()
            x_minus = x.copy()
            x_plus[j] += h
            x_minus[j] -= h
            f_plus = func(x_plus)
            f_minus = func(x_minus)
            J[:, j] = (f_plus - f_minus) / (2 * h)

    else:
        raise ValueError(f"Unknown finite difference method: {method}")

    return J


def check_jacobian(
    func: Callable[[np.ndarray], np.ndarray],
    jacobian_func: Callable[[np.ndarray], np.ndarray],
    x: np.ndarray,
    h: float = 1e-8,
    atol: float = 1e-6,
    rtol: float = 1e-6
) -> tuple[bool, float, np.ndarray]:
    """Check analytic Jacobian against finite differences.

    Args:
        func: Function that computes residuals
        jacobian_func: Function that computes analytic Jacobian
        x: Input parameters
        h: Step size for finite differences
        atol: Absolute tolerance
        rtol: Relative tolerance

    Returns:
        Tuple of (is_correct, max_error, error_matrix)
    """
    J_analytic = jacobian_func(x)
    J_numeric = finite_difference_jacobian(func, x, h)

    error = np.abs(J_analytic - J_numeric)
    relative_error = error / (np.abs(J_analytic) + 1e-12)

    max_error = np.max(error)
    max_rel_error = np.max(relative_error)

    is_correct = np.allclose(J_analytic, J_numeric, atol=atol, rtol=rtol)

    return is_correct, max(max_error, max_rel_error), error


def perturbation_jacobian(
    func: Callable[[np.ndarray], np.ndarray],
    x: np.ndarray,
    perturbations: Optional[np.ndarray] = None
) -> np.ndarray:
    """Compute Jacobian using adaptive perturbations.

    Args:
        func: Function that takes x and returns residual vector
        x: Input parameters
        perturbations: Custom perturbation sizes for each parameter

    Returns:
        Jacobian matrix
    """
    x = np.atleast_1d(x)
    f0 = func(x)
    f0 = np.atleast_1d(f0)

    m, n = len(f0), len(x)

    if perturbations is None:
        # Adaptive perturbation based on parameter magnitude
        perturbations = np.maximum(1e-8, 1e-8 * np.abs(x))

    J = np.zeros((m, n))

    for j in range(n):
        h = perturbations[j]
        x_plus = x.copy()
        x_minus = x.copy()
        x_plus[j] += h
        x_minus[j] -= h

        f_plus = func(x_plus)
        f_minus = func(x_minus)

        J[:, j] = (f_plus - f_minus) / (2 * h)

    return J


class JacobianTester:
    """Helper class for testing Jacobian implementations."""

    def __init__(self, atol: float = 1e-6, rtol: float = 1e-6):
        """Initialize tester with tolerances."""
        self.atol = atol
        self.rtol = rtol

    def test_jacobian(
        self,
        func: Callable[[np.ndarray], np.ndarray],
        jacobian_func: Callable[[np.ndarray], np.ndarray],
        test_points: list[np.ndarray],
        verbose: bool = False
    ) -> bool:
        """Test Jacobian at multiple points.

        Args:
            func: Function that computes residuals
            jacobian_func: Function that computes analytic Jacobian
            test_points: List of test input points
            verbose: Print detailed results

        Returns:
            True if all tests pass
        """
        all_passed = True

        for i, x in enumerate(test_points):
            is_correct, max_error, _ = check_jacobian(
                func, jacobian_func, x, atol=self.atol, rtol=self.rtol
            )

            if verbose:
                status = "PASS" if is_correct else "FAIL"
                print(f"Test point {i}: {status}, max error: {max_error:.2e}")

            all_passed = all_passed and is_correct

        return all_passed

    def generate_random_test_points(
        self,
        n_dims: int,
        n_points: int = 10,
        scale: float = 1.0,
        seed: Optional[int] = None
    ) -> list[np.ndarray]:
        """Generate random test points.

        Args:
            n_dims: Number of dimensions
            n_points: Number of test points
            scale: Scale of random values
            seed: Random seed for reproducibility

        Returns:
            List of random test points
        """
        if seed is not None:
            np.random.seed(seed)

        test_points = []
        for _ in range(n_points):
            x = scale * np.random.randn(n_dims)
            test_points.append(x)

        return test_points