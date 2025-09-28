"""Tests for synthetic scene generation."""

import numpy as np
import pytest
from pictorigo.core.models.constraints import ImagePointConstraint
from pictorigo.core.models.entities import Camera, Image, WorldPoint
from pictorigo.core.synthetic.scene_gen import (
    SceneGenerator,
    make_box_room,
    make_grid_plane,
    make_two_view,
)


class TestSceneGenerator:
    """Test SceneGenerator class."""

    def test_scene_generator_creation(self):
        """Test basic scene generator creation."""
        generator = SceneGenerator(seed=42)
        assert generator is not None

    def test_generate_world_points_grid(self):
        """Test grid world point generation."""
        generator = SceneGenerator(seed=42)
        bounds = (-1, 1, -1, 1, 0, 2)
        spacing = 1.0

        points = generator.generate_world_points_grid(bounds, spacing)

        # Should generate 3x3x3 = 27 points
        expected_count = 3 * 3 * 3
        assert len(points) == expected_count

        # Check that all points are WorldPoint objects
        assert all(isinstance(p, WorldPoint) for p in points)

        # Check that all points have coordinates
        assert all(p.is_initialized() for p in points)

        # Check coordinate bounds
        for point in points:
            x, y, z = point.xyz
            assert -1 <= x <= 1
            assert -1 <= y <= 1
            assert 0 <= z <= 2

    def test_generate_world_points_grid_with_noise(self):
        """Test grid generation with noise."""
        generator = SceneGenerator(seed=42)
        bounds = (0, 1, 0, 1, 0, 1)
        spacing = 1.0
        noise_std = 0.1

        points = generator.generate_world_points_grid(bounds, spacing, noise_std)

        # Should generate 2x2x2 = 8 points
        assert len(points) == 8

        # With noise, points should not be exactly on grid
        coords = np.array([p.xyz for p in points])
        grid_coords = np.array(
            [[i, j, k] for i in [0, 1] for j in [0, 1] for k in [0, 1]]
        )

        # Check that at least some points are not exactly on grid
        differences = np.linalg.norm(coords - grid_coords, axis=1)
        assert np.any(differences > 1e-10)

    def test_generate_cameras_circle(self):
        """Test circular camera generation."""
        generator = SceneGenerator(seed=42)
        center = np.array([0, 0, 2])
        radius = 3.0
        n_cameras = 4
        look_at = np.array([0, 0, 0])

        cameras_and_images = generator.generate_cameras_circle(
            center, radius, n_cameras, look_at
        )

        assert len(cameras_and_images) == n_cameras

        for camera, image in cameras_and_images:
            assert isinstance(camera, Camera)
            assert isinstance(image, Image)
            assert camera.image_id == image.id

            # Check intrinsics format
            K = camera.get_intrinsics()
            assert len(K) == 4  # fx, fy, cx, cy

            # Check that cameras are roughly at expected distance from center
            # (This is approximate due to world-to-camera coordinate transformation)
            assert camera.id.startswith("cam_")
            assert image.id.startswith("img_")

    def test_generate_image_point_constraints(self):
        """Test image point constraint generation."""
        generator = SceneGenerator(seed=42)

        # Create a simple scene
        world_points = [
            WorldPoint(id="wp1", xyz=[0, 0, 5]),
            WorldPoint(id="wp2", xyz=[1, 0, 5]),
            WorldPoint(id="wp3", xyz=[0, 1, 5]),
        ]

        # Create a simple camera looking down +Z axis
        image = Image(id="img1", path="test.jpg", width=640, height=480)
        camera = Camera(
            id="cam1",
            image_id="img1",
            K=[500.0, 500.0, 320.0, 240.0],
            R=[0.0, 0.0, 0.0],  # Identity rotation
            t=[0.0, 0.0, 0.0],  # At origin
        )

        cameras_and_images = [(camera, image)]

        constraints = generator.generate_image_point_constraints(
            world_points, cameras_and_images, noise_std=0.0
        )

        # Should generate constraints for all visible points
        assert len(constraints) > 0
        assert all(isinstance(c, ImagePointConstraint) for c in constraints)

        # Check constraint properties
        for constraint in constraints:
            assert constraint.image_id == "img1"
            assert constraint.wp_id in ["wp1", "wp2", "wp3"]
            assert 0 <= constraint.u < 640
            assert 0 <= constraint.v < 480

    def test_create_project_from_scene(self):
        """Test complete project creation."""
        generator = SceneGenerator(seed=42)

        world_points = [WorldPoint(id="wp1", xyz=[0, 0, 5])]

        image = Image(id="img1", path="test.jpg", width=640, height=480)
        camera = Camera(
            id="cam1",
            image_id="img1",
            K=[500.0, 500.0, 320.0, 240.0],
            R=[0.0, 0.0, 0.0],
            t=[0.0, 0.0, 0.0],
        )

        cameras_and_images = [(camera, image)]

        project = generator.create_project_from_scene(world_points, cameras_and_images)

        # Check project contents
        assert len(project.world_points) == 1
        assert len(project.images) == 1
        assert len(project.cameras) == 1
        assert "wp1" in project.world_points
        assert "img1" in project.images
        assert "cam1" in project.cameras

        # Should have image point constraints
        ip_constraints = project.get_constraints_by_type("image_point")
        assert len(ip_constraints) > 0


class TestSceneFactories:
    """Test scene factory functions."""

    def test_make_box_room(self):
        """Test box room scene creation."""
        project = make_box_room(room_size=(4.0, 3.0, 2.5), n_cameras=4, seed=42)

        # Check project structure
        assert len(project.world_points) > 8  # At least room corners + interior points
        assert len(project.cameras) == 4
        assert len(project.images) == 4

        # Check that room corners exist
        corner_ids = [
            f"corner_{i}{j}{k}" for i in [0, 1] for j in [0, 1] for k in [0, 1]
        ]
        for corner_id in corner_ids:
            assert corner_id in project.world_points

        # Check distance constraints exist
        distance_constraints = project.get_constraints_by_type("distance")
        assert len(distance_constraints) > 0

        # Check gauge fixing constraint exists
        gauge_constraints = project.get_constraints_by_type("gauge_fix")
        assert len(gauge_constraints) == 1

        # Validate project
        issues = project.validate_project()
        assert len(issues) == 0

    def test_make_grid_plane(self):
        """Test grid plane scene creation."""
        project = make_grid_plane(grid_size=(3, 3), spacing=1.0, n_cameras=3, seed=42)

        # Check project structure
        assert len(project.world_points) == 9  # 3x3 grid
        assert len(project.cameras) == 3
        assert len(project.images) == 3

        # Check grid point naming
        for i in range(3):
            for j in range(3):
                grid_id = f"grid_{i:02d}_{j:02d}"
                assert grid_id in project.world_points

        # Check distance constraints for grid structure
        distance_constraints = project.get_constraints_by_type("distance")
        assert len(distance_constraints) > 0

        # Validate project
        issues = project.validate_project()
        assert len(issues) == 0

    def test_make_two_view(self):
        """Test two-view scene creation."""
        project = make_two_view(n_points=10, baseline=1.5, seed=42)

        # Check project structure
        assert len(project.world_points) == 12  # 10 scene points + 2 camera centers
        assert len(project.cameras) == 2
        assert len(project.images) == 2

        # Check camera naming
        assert "cam_0" in project.cameras
        assert "cam_1" in project.cameras

        # Check that camera centers exist
        assert "cam_center_0" in project.world_points
        assert "cam_center_1" in project.world_points

        # Check baseline constraint
        distance_constraints = project.get_constraints_by_type("distance")
        baseline_constraints = [
            c
            for c in distance_constraints
            if (c.wp_i == "cam_center_0" and c.wp_j == "cam_center_1")
            or (c.wp_i == "cam_center_1" and c.wp_j == "cam_center_0")
        ]
        assert len(baseline_constraints) == 1
        assert baseline_constraints[0].distance == 1.5

        # Validate project
        issues = project.validate_project()
        assert len(issues) == 0

    def test_scene_reproducibility(self):
        """Test that scenes are reproducible with same seed."""
        project1 = make_two_view(n_points=5, seed=42)
        project2 = make_two_view(n_points=5, seed=42)

        # Should have same number of elements
        assert len(project1.world_points) == len(project2.world_points)
        assert len(project1.constraints) == len(project2.constraints)

        # Point coordinates should be identical
        for wp_id in project1.world_points:
            if wp_id in project2.world_points:
                xyz1 = project1.world_points[wp_id].xyz
                xyz2 = project2.world_points[wp_id].xyz
                if xyz1 is not None and xyz2 is not None:
                    np.testing.assert_array_almost_equal(xyz1, xyz2, decimal=10)

    def test_scene_different_seeds(self):
        """Test that different seeds produce different scenes."""
        project1 = make_two_view(n_points=5, seed=42)
        project2 = make_two_view(n_points=5, seed=123)

        # Should have same structure but different coordinates
        assert len(project1.world_points) == len(project2.world_points)

        # At least some coordinates should be different
        coords_different = False
        for wp_id in project1.world_points:
            if wp_id.startswith("pt_") and wp_id in project2.world_points:
                xyz1 = project1.world_points[wp_id].xyz
                xyz2 = project2.world_points[wp_id].xyz
                if xyz1 is not None and xyz2 is not None:
                    if not np.allclose(xyz1, xyz2, atol=1e-10):
                        coords_different = True
                        break

        assert coords_different

    def test_invalid_scene_parameters(self):
        """Test error handling for invalid scene parameters."""
        # Invalid room size
        with pytest.raises((ValueError, AssertionError)):
            make_box_room(room_size=(0, 1, 1))  # Zero dimension

        # Invalid grid size
        with pytest.raises((ValueError, AssertionError)):
            make_grid_plane(grid_size=(0, 1))  # Zero dimension

        # Invalid number of points
        with pytest.raises((ValueError, AssertionError)):
            make_two_view(n_points=0)  # No points
