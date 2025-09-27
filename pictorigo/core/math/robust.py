"""Robust loss functions for nonlinear optimization."""

import numpy as np
from typing import Tuple


def huber_loss(residual: np.ndarray, delta: float = 1.0) -> Tuple[np.ndarray, np.ndarray]:
    """Huber robust loss function.

    Args:
        residual: Residual values
        delta: Threshold parameter

    Returns:
        Tuple of (rho, weights) where rho is robustified residual, weights for Jacobian scaling
    """
    abs_residual = np.abs(residual)
    is_inlier = abs_residual <= delta

    rho = np.where(
        is_inlier,
        0.5 * residual**2,
        delta * (abs_residual - 0.5 * delta)
    )

    # Weight for Jacobian scaling: d(rho)/d(residual) / residual
    weights = np.where(
        is_inlier,
        np.ones_like(residual),
        delta / abs_residual
    )

    # Handle zero residuals
    weights = np.where(abs_residual < 1e-12, 1.0, weights)

    return rho, weights


def cauchy_loss(residual: np.ndarray, sigma: float = 1.0) -> Tuple[np.ndarray, np.ndarray]:
    """Cauchy robust loss function.

    Args:
        residual: Residual values
        sigma: Scale parameter

    Returns:
        Tuple of (rho, weights) where rho is robustified residual, weights for Jacobian scaling
    """
    sigma2 = sigma**2
    r2_over_sigma2 = residual**2 / sigma2

    rho = 0.5 * sigma2 * np.log(1 + r2_over_sigma2)

    # Weight for Jacobian scaling
    weights = 1.0 / (1 + r2_over_sigma2)

    return rho, weights


def no_loss(residual: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Identity loss function (no robustification).

    Args:
        residual: Residual values

    Returns:
        Tuple of (rho, weights) where rho = 0.5 * residual^2, weights = 1
    """
    rho = 0.5 * residual**2
    weights = np.ones_like(residual)
    return rho, weights


def apply_robust_loss(residual: np.ndarray, loss_type: str = "huber", **kwargs) -> Tuple[np.ndarray, np.ndarray]:
    """Apply robust loss function.

    Args:
        residual: Residual values
        loss_type: Type of loss ("none", "huber", "cauchy")
        **kwargs: Additional parameters for loss function

    Returns:
        Tuple of (rho, weights)
    """
    if loss_type == "none":
        return no_loss(residual)
    elif loss_type == "huber":
        delta = kwargs.get("delta", 1.0)
        return huber_loss(residual, delta)
    elif loss_type == "cauchy":
        sigma = kwargs.get("sigma", 1.0)
        return cauchy_loss(residual, sigma)
    else:
        raise ValueError(f"Unknown loss type: {loss_type}")


def robust_scale_estimate(residuals: np.ndarray, method: str = "mad") -> float:
    """Estimate scale parameter for robust losses.

    Args:
        residuals: Array of residual values
        method: Scale estimation method ("mad", "std")

    Returns:
        Estimated scale parameter
    """
    if method == "mad":
        # Median Absolute Deviation
        median_residual = np.median(residuals)
        mad = np.median(np.abs(residuals - median_residual))
        return 1.4826 * mad  # Scale to approximate standard deviation
    elif method == "std":
        return np.std(residuals)
    else:
        raise ValueError(f"Unknown scale estimation method: {method}")