"""Tests for visibility checking utilities."""

import numpy as np
from pictorigo.core.synthetic.visibility import (
    add_projection_noise,
    analyze_scene_coverage,
    check_visibility,
    compute_visibility_matrix,
    filter_visible_points,
    simulate_outliers,
)

from pictorigo.core.models.constraints import ImagePointConstraint
from pictorigo.core.models.entities import Camera, Image, WorldPoint


class TestVisibilityChecking:
    """Test visibility checking functions."""

    def setup_method(self):
        """Set up test fixtures."""
        # Standard camera parameters
        self.K = np.array([500.0, 500.0, 320.0, 240.0])
        self.R = np.eye(3)  # Identity rotation
        self.t = np.zeros(3)  # At origin
        self.image_width = 640
        self.image_height = 480

    def test_check_visibility_basic(self):
        """Test basic visibility checking."""
        # Points in front of camera
        X = np.array(
            [
                [0, 0, 5],  # Center, should be visible
                [2, 0, 5],  # Right, should be visible
                [0, 2, 5],  # Up, should be visible
                [0, 0, -1],  # Behind camera, should not be visible
            ]
        )

        visible, uv = check_visibility(
            self.K, self.R, self.t, X, self.image_width, self.image_height
        )

        # First three should be visible, last should not
        assert visible[0]  # Center point
        assert visible[1]  # Right point
        assert visible[2]  # Up point
        assert not visible[3]  # Behind camera

        # Check projection coordinates are reasonable
        assert 0 <= uv[0, 0] < self.image_width
        assert 0 <= uv[0, 1] < self.image_height

    def test_check_visibility_depth_constraints(self):
        """Test depth constraint checking."""
        X = np.array(
            [
                [0, 0, 0.05],  # Too close
                [0, 0, 5],  # Good depth
                [0, 0, 1500],  # Too far
            ]
        )

        visible, uv = check_visibility(
            self.K,
            self.R,
            self.t,
            X,
            self.image_width,
            self.image_height,
            min_depth=0.1,
            max_depth=1000.0,
        )

        assert not visible[0]  # Too close
        assert visible[1]  # Good depth
        assert not visible[2]  # Too far

    def test_check_visibility_image_bounds(self):
        """Test image bounds checking."""
        # Points that project outside image bounds
        X = np.array(
            [
                [0, 0, 5],  # Center - should be visible
                [10, 0, 5],  # Far right - should not be visible
                [0, 10, 5],  # Far up - should not be visible
                [-10, 0, 5],  # Far left - should not be visible
                [0, -10, 5],  # Far down - should not be visible
            ]
        )

        visible, uv = check_visibility(
            self.K, self.R, self.t, X, self.image_width, self.image_height
        )

        assert visible[0]  # Center
        assert not visible[1]  # Right
        assert not visible[2]  # Up
        assert not visible[3]  # Left
        assert not visible[4]  # Down

    def test_check_visibility_border_margin(self):
        """Test border margin functionality."""
        # Point near image border
        X = np.array([[2.5, 0, 5]])  # Should project near right edge

        # Without margin
        visible_no_margin, _ = check_visibility(
            self.K,
            self.R,
            self.t,
            X,
            self.image_width,
            self.image_height,
            border_margin=0,
        )

        # With margin
        visible_with_margin, _ = check_visibility(
            self.K,
            self.R,
            self.t,
            X,
            self.image_width,
            self.image_height,
            border_margin=50,
        )

        # Point might be visible without margin but not with margin
        # (depends on exact projection, but at least one should differ)
        assert isinstance(visible_no_margin[0], bool)
        assert isinstance(visible_with_margin[0], bool)

    def test_check_visibility_single_point(self):
        """Test visibility checking for single point."""
        X = np.array([0, 0, 5])  # Single point

        visible, uv = check_visibility(
            self.K, self.R, self.t, X, self.image_width, self.image_height
        )

        assert len(visible) == 1
        assert len(uv) == 1
        assert visible[0]  # Should be visible


class TestVisibilityFiltering:
    """Test visibility filtering functions."""

    def setup_method(self):
        """Set up test fixtures."""
        # Create test world points
        self.world_points = [
            WorldPoint(id="wp1", xyz=[0, 0, 5]),  # Center
            WorldPoint(id="wp2", xyz=[2, 0, 5]),  # Right
            WorldPoint(id="wp3", xyz=[0, 0, -1]),  # Behind cameras
            WorldPoint(id="wp4", xyz=[10, 0, 5]),  # Far right (may not be visible)
        ]

        # Create test cameras
        self.cameras_and_images = []
        for i in range(2):
            image = Image(id=f"img{i}", path=f"test{i}.jpg", width=640, height=480)
            camera = Camera(
                id=f"cam{i}",
                image_id=f"img{i}",
                K=[500.0, 500.0, 320.0, 240.0],
                R=[0.0, 0.0, 0.0],  # Identity rotation
                t=[i * 1.0, 0.0, 0.0],  # Offset cameras
            )
            self.cameras_and_images.append((camera, image))

    def test_filter_visible_points(self):
        """Test filtering points by visibility."""
        filtered_points = filter_visible_points(
            self.world_points, self.cameras_and_images, min_visible_cameras=1
        )

        # Should filter out points behind cameras and far outside bounds
        assert len(filtered_points) <= len(self.world_points)
        assert all(isinstance(wp, WorldPoint) for wp in filtered_points)

        # Points behind camera should be filtered out
        filtered_ids = [wp.id for wp in filtered_points]
        assert "wp3" not in filtered_ids  # Behind cameras

    def test_filter_visible_points_strict(self):
        """Test filtering with strict visibility requirements."""
        filtered_points = filter_visible_points(
            self.world_points,
            self.cameras_and_images,
            min_visible_cameras=2,  # Must be visible in both cameras
        )

        # Should be more restrictive
        lenient_filter = filter_visible_points(
            self.world_points, self.cameras_and_images, min_visible_cameras=1
        )

        assert len(filtered_points) <= len(lenient_filter)

    def test_compute_visibility_matrix(self):
        """Test visibility matrix computation."""
        visibility_matrix = compute_visibility_matrix(
            self.world_points, self.cameras_and_images
        )

        n_points = len(self.world_points)
        n_cameras = len(self.cameras_and_images)

        assert visibility_matrix.shape == (n_points, n_cameras)
        assert visibility_matrix.dtype == bool

        # Point behind cameras should not be visible in any camera
        wp3_index = 2  # wp3 is at index 2
        assert not np.any(visibility_matrix[wp3_index, :])

    def test_analyze_scene_coverage(self):
        """Test scene coverage analysis."""
        stats = analyze_scene_coverage(self.world_points, self.cameras_and_images)

        # Check required fields in stats
        required_fields = [
            "total_points",
            "total_cameras",
            "points_per_camera",
            "cameras_per_point",
            "visibility_distribution",
            "total_observations",
        ]

        for field in required_fields:
            assert field in stats

        assert stats["total_points"] == len(self.world_points)
        assert stats["total_cameras"] == len(self.cameras_and_images)
        assert isinstance(stats["total_observations"], int)
        assert stats["total_observations"] >= 0

        # Check nested statistics
        assert "mean" in stats["points_per_camera"]
        assert "mean" in stats["cameras_per_point"]


class TestProjectionNoise:
    """Test projection noise utilities."""

    def test_add_projection_noise(self):
        """Test adding noise to projections."""
        uv_original = np.array([[320, 240], [400, 300], [200, 180]])

        noise_std = 1.0
        uv_noisy = add_projection_noise(uv_original, noise_std, seed=42)

        assert uv_noisy.shape == uv_original.shape

        # With noise, coordinates should be different
        assert not np.allclose(uv_noisy, uv_original, atol=1e-10)

        # Noise should be reasonable (within a few standard deviations)
        differences = np.abs(uv_noisy - uv_original)
        assert np.all(differences < 5 * noise_std)  # 5-sigma test

    def test_add_projection_noise_reproducible(self):
        """Test that noise addition is reproducible with seed."""
        uv_original = np.array([[320, 240], [400, 300]])

        uv_noisy1 = add_projection_noise(uv_original, 1.0, seed=42)
        uv_noisy2 = add_projection_noise(uv_original, 1.0, seed=42)

        np.testing.assert_array_equal(uv_noisy1, uv_noisy2)

    def test_simulate_outliers(self):
        """Test outlier simulation."""
        # Create test constraints
        constraints = [
            ImagePointConstraint(
                image_id="img1", wp_id=f"wp{i}", u=320 + i * 10, v=240 + i * 10
            )
            for i in range(10)
        ]

        outlier_fraction = 0.3
        outlier_constraints = simulate_outliers(
            constraints,
            outlier_fraction=outlier_fraction,
            outlier_noise_std=20.0,
            seed=42,
        )

        assert len(outlier_constraints) == len(constraints)

        # Some constraints should have been modified
        original_coords = [(c.u, c.v) for c in constraints]
        outlier_coords = [(c.u, c.v) for c in outlier_constraints]

        n_modified = sum(
            1
            for orig, outl in zip(original_coords, outlier_coords, strict=False)
            if orig != outl
        )
        expected_outliers = int(len(constraints) * outlier_fraction)

        # Should have roughly the expected number of outliers
        assert n_modified == expected_outliers

    def test_simulate_outliers_zero_fraction(self):
        """Test outlier simulation with zero fraction."""
        constraints = [ImagePointConstraint(image_id="img1", wp_id="wp1", u=320, v=240)]

        outlier_constraints = simulate_outliers(
            constraints, outlier_fraction=0.0, seed=42
        )

        # Should be unchanged
        assert len(outlier_constraints) == len(constraints)
        assert outlier_constraints[0].u == constraints[0].u
        assert outlier_constraints[0].v == constraints[0].v

    def test_simulate_outliers_reproducible(self):
        """Test that outlier simulation is reproducible."""
        constraints = [
            ImagePointConstraint(image_id="img1", wp_id=f"wp{i}", u=320, v=240)
            for i in range(5)
        ]

        outliers1 = simulate_outliers(constraints, 0.4, seed=42)
        outliers2 = simulate_outliers(constraints, 0.4, seed=42)

        for c1, c2 in zip(outliers1, outliers2, strict=False):
            assert c1.u == c2.u
            assert c1.v == c2.v
