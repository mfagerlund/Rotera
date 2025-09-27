"""Tests for camera projection operations."""

import numpy as np
import pytest

from pictorigo.core.math.camera import project, unproject, camera_center, point_depth


class TestCamera:
    """Test camera projection operations."""

    def setup_method(self):
        """Set up test fixtures."""
        # Simple camera intrinsics
        self.K = np.array([500.0, 500.0, 320.0, 240.0])  # fx, fy, cx, cy

        # Identity pose
        self.R_id = np.eye(3)
        self.t_id = np.zeros(3)

        # Test 3D points
        self.X = np.array([
            [0, 0, 1],    # Point in front of camera at unit depth
            [1, 0, 2],    # Point to the right
            [0, 1, 3],    # Point above
            [-1, -1, 4]   # Point to bottom-left
        ])

    def test_project_identity_pose(self):
        """Test projection with identity camera pose."""
        uv = project(self.K, self.R_id, self.t_id, self.X)

        # Check shape
        assert uv.shape == (4, 2)

        # Check principal point projection
        expected_u = self.K[0] * self.X[:, 0] / self.X[:, 2] + self.K[2]
        expected_v = self.K[1] * self.X[:, 1] / self.X[:, 2] + self.K[3]

        np.testing.assert_allclose(uv[:, 0], expected_u, atol=1e-10)
        np.testing.assert_allclose(uv[:, 1], expected_v, atol=1e-10)

    def test_project_single_point(self):
        """Test projection of single point."""
        X_single = np.array([1, 2, 5])
        uv = project(self.K, self.R_id, self.t_id, X_single)

        assert uv.shape == (1, 2)

        expected_u = 500.0 * 1.0 / 5.0 + 320.0  # 420.0
        expected_v = 500.0 * 2.0 / 5.0 + 240.0  # 440.0

        np.testing.assert_allclose(uv[0], [expected_u, expected_v], atol=1e-10)

    def test_project_with_distortion(self):
        """Test projection with radial distortion."""
        K_dist = np.array([500.0, 500.0, 320.0, 240.0, 0.1, 0.01])  # Include k1, k2
        X_test = np.array([[1, 1, 2]])

        uv = project(K_dist, self.R_id, self.t_id, X_test)

        # Point should be distorted outward from center
        uv_undistorted = project(self.K, self.R_id, self.t_id, X_test)

        # With positive radial distortion, points should move away from center
        center = np.array([320.0, 240.0])
        dist_original = np.linalg.norm(uv_undistorted[0] - center)
        dist_distorted = np.linalg.norm(uv[0] - center)

        assert dist_distorted > dist_original

    def test_project_behind_camera(self):
        """Test projection of points behind camera."""
        X_behind = np.array([[0, 0, -1]])  # Point behind camera
        uv = project(self.K, self.R_id, self.t_id, X_behind)

        # Should return NaN
        assert np.isnan(uv[0, 0])
        assert np.isnan(uv[0, 1])

    def test_unproject_round_trip(self):
        """Test unproject followed by project round trip."""
        # Project points
        uv = project(self.K, self.R_id, self.t_id, self.X)

        # Unproject at known depths
        depths = self.X[:, 2]
        X_recovered = np.zeros_like(self.X)

        for i, depth in enumerate(depths):
            X_rec = unproject(self.K, self.R_id, self.t_id, uv[i:i+1], depth)
            X_recovered[i] = X_rec[0]

        np.testing.assert_allclose(X_recovered, self.X, atol=1e-10)

    def test_unproject_unit_depth(self):
        """Test unprojection at unit depth."""
        uv = np.array([[320.0, 240.0]])  # Principal point
        X_ray = unproject(self.K, self.R_id, self.t_id, uv, depth=1.0)

        expected = np.array([[0, 0, 1]])
        np.testing.assert_allclose(X_ray, expected, atol=1e-10)

    def test_camera_center(self):
        """Test camera center computation."""
        # Identity pose
        center = camera_center(self.R_id, self.t_id)
        np.testing.assert_allclose(center, np.zeros(3), atol=1e-10)

        # Translated camera
        t = np.array([1, 2, 3])
        center = camera_center(self.R_id, t)
        np.testing.assert_allclose(center, -t, atol=1e-10)

    def test_point_depth(self):
        """Test point depth computation."""
        depths = point_depth(self.R_id, self.t_id, self.X)

        expected_depths = self.X[:, 2]
        np.testing.assert_allclose(depths, expected_depths, atol=1e-10)

    def test_transformed_camera(self):
        """Test projection with transformed camera."""
        # 90 degree rotation around Y axis
        R = np.array([
            [0, 0, 1],
            [0, 1, 0],
            [-1, 0, 0]
        ])
        t = np.array([1, 0, 0])

        X_test = np.array([[0, 0, 0]])  # World origin
        uv = project(self.K, R, t, X_test)

        # Point should project to principal point
        expected = np.array([self.K[2], self.K[3]])
        np.testing.assert_allclose(uv[0], expected, atol=1e-10)

    def test_invalid_input_shapes(self):
        """Test error handling for invalid input shapes."""
        with pytest.raises(ValueError):
            project(np.array([1, 2, 3]), self.R_id, self.t_id, self.X)  # Not enough K params

        with pytest.raises(ValueError):
            project(self.K, np.array([[1, 2], [3, 4]]), self.t_id, self.X)  # Wrong R shape

        with pytest.raises(ValueError):
            project(self.K, self.R_id, np.array([1, 2]), self.X)  # Wrong t shape

        with pytest.raises(ValueError):
            project(self.K, self.R_id, self.t_id, np.array([[1, 2]]))  # Wrong X shape