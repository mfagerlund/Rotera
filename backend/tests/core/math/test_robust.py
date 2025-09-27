"""Tests for robust loss functions."""

import numpy as np
import pytest

from pictorigo.core.math.robust import (
    huber_loss,
    cauchy_loss,
    no_loss,
    apply_robust_loss,
    robust_scale_estimate,
)


class TestRobustLoss:
    """Test robust loss functions."""

    def test_no_loss(self):
        """Test identity loss function."""
        residual = np.array([-2, -1, 0, 1, 2])
        rho, weights = no_loss(residual)

        expected_rho = 0.5 * residual**2
        expected_weights = np.ones_like(residual)

        np.testing.assert_allclose(rho, expected_rho, atol=1e-10)
        np.testing.assert_allclose(weights, expected_weights, atol=1e-10)

    def test_huber_loss_inliers(self):
        """Test Huber loss for inlier residuals."""
        residual = np.array([-0.5, 0, 0.5])  # All within delta=1.0
        delta = 1.0
        rho, weights = huber_loss(residual, delta)

        # Should behave like quadratic loss
        expected_rho = 0.5 * residual**2
        expected_weights = np.ones_like(residual)

        np.testing.assert_allclose(rho, expected_rho, atol=1e-10)
        np.testing.assert_allclose(weights, expected_weights, atol=1e-10)

    def test_huber_loss_outliers(self):
        """Test Huber loss for outlier residuals."""
        residual = np.array([-3, 3])  # Outliers with delta=1.0
        delta = 1.0
        rho, weights = huber_loss(residual, delta)

        # Should behave like linear loss
        expected_rho = delta * (np.abs(residual) - 0.5 * delta)
        expected_weights = delta / np.abs(residual)

        np.testing.assert_allclose(rho, expected_rho, atol=1e-10)
        np.testing.assert_allclose(weights, expected_weights, atol=1e-10)

    def test_huber_loss_mixed(self):
        """Test Huber loss for mixed inliers and outliers."""
        residual = np.array([-2, -0.5, 0, 0.5, 2])
        delta = 1.0
        rho, weights = huber_loss(residual, delta)

        # Check individual values
        assert rho[0] == delta * (2 - 0.5 * delta)  # Outlier
        assert rho[1] == 0.5 * (-0.5)**2  # Inlier
        assert rho[2] == 0.0  # Zero residual
        assert rho[3] == 0.5 * 0.5**2  # Inlier
        assert rho[4] == delta * (2 - 0.5 * delta)  # Outlier

    def test_huber_loss_zero_residual(self):
        """Test Huber loss with zero residuals."""
        residual = np.array([0.0, 0.0])
        rho, weights = huber_loss(residual)

        np.testing.assert_allclose(rho, np.zeros_like(residual), atol=1e-10)
        np.testing.assert_allclose(weights, np.ones_like(residual), atol=1e-10)

    def test_cauchy_loss(self):
        """Test Cauchy loss function."""
        residual = np.array([-2, -1, 0, 1, 2])
        sigma = 1.0
        rho, weights = cauchy_loss(residual, sigma)

        # Check properties
        assert all(rho >= 0)  # Loss should be non-negative
        assert all(weights > 0)  # Weights should be positive
        assert all(weights <= 1)  # Weights should be at most 1

        # Zero residual should give zero loss and unit weight
        assert rho[2] == 0.0
        assert weights[2] == 1.0

        # Symmetric residuals should give same loss
        assert rho[0] == rho[4]  # residual = ±2
        assert rho[1] == rho[3]  # residual = ±1

    def test_cauchy_loss_properties(self):
        """Test Cauchy loss mathematical properties."""
        residual = np.array([1.0])
        sigma = 2.0
        rho, weights = cauchy_loss(residual, sigma)

        # Manual calculation
        r2_over_sigma2 = (residual[0]**2) / (sigma**2)
        expected_rho = 0.5 * sigma**2 * np.log(1 + r2_over_sigma2)
        expected_weight = 1.0 / (1 + r2_over_sigma2)

        np.testing.assert_allclose(rho, [expected_rho], atol=1e-10)
        np.testing.assert_allclose(weights, [expected_weight], atol=1e-10)

    def test_apply_robust_loss(self):
        """Test apply_robust_loss function."""
        residual = np.array([-2, -1, 0, 1, 2])

        # Test no loss
        rho1, weights1 = apply_robust_loss(residual, "none")
        rho2, weights2 = no_loss(residual)
        np.testing.assert_allclose(rho1, rho2, atol=1e-10)
        np.testing.assert_allclose(weights1, weights2, atol=1e-10)

        # Test Huber loss
        rho1, weights1 = apply_robust_loss(residual, "huber", delta=1.5)
        rho2, weights2 = huber_loss(residual, 1.5)
        np.testing.assert_allclose(rho1, rho2, atol=1e-10)
        np.testing.assert_allclose(weights1, weights2, atol=1e-10)

        # Test Cauchy loss
        rho1, weights1 = apply_robust_loss(residual, "cauchy", sigma=2.0)
        rho2, weights2 = cauchy_loss(residual, 2.0)
        np.testing.assert_allclose(rho1, rho2, atol=1e-10)
        np.testing.assert_allclose(weights1, weights2, atol=1e-10)

        # Test unknown loss type
        with pytest.raises(ValueError):
            apply_robust_loss(residual, "unknown")

    def test_robust_scale_estimate_mad(self):
        """Test robust scale estimation using MAD."""
        # Known data with outliers
        residuals = np.array([1, 2, 3, 4, 5, 100])  # Last value is outlier

        scale = robust_scale_estimate(residuals, "mad")

        # MAD should be robust to outliers
        median = np.median(residuals)
        mad = np.median(np.abs(residuals - median))
        expected_scale = 1.4826 * mad

        assert abs(scale - expected_scale) < 1e-10

    def test_robust_scale_estimate_std(self):
        """Test scale estimation using standard deviation."""
        residuals = np.array([1, 2, 3, 4, 5])

        scale = robust_scale_estimate(residuals, "std")
        expected_scale = np.std(residuals)

        assert abs(scale - expected_scale) < 1e-10

    def test_robust_scale_estimate_invalid(self):
        """Test error handling for invalid scale estimation method."""
        residuals = np.array([1, 2, 3])

        with pytest.raises(ValueError):
            robust_scale_estimate(residuals, "unknown")

    def test_loss_continuity(self):
        """Test continuity of loss functions at transition points."""
        # Test Huber loss continuity at delta
        delta = 1.0
        residual_left = np.array([delta - 1e-10])
        residual_right = np.array([delta + 1e-10])

        rho_left, _ = huber_loss(residual_left, delta)
        rho_right, _ = huber_loss(residual_right, delta)

        # Should be approximately equal
        assert abs(rho_left[0] - rho_right[0]) < 1e-8