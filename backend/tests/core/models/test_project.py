"""Tests for project model."""

import pytest
from pictorigo.core.models.constraints import DistanceConstraint, ImagePointConstraint
from pictorigo.core.models.entities import Camera, Image, WorldPoint
from pictorigo.core.models.project import (
    Project,
    ProjectSettings,
    SolveResult,
    SolverSettings,
)


class TestSolverSettings:
    """Test SolverSettings model."""

    def test_solver_settings_defaults(self):
        """Test default solver settings."""
        settings = SolverSettings()
        assert settings.max_iterations == 100
        assert settings.tolerance == 1e-6
        assert settings.robust_loss == "huber"
        assert settings.huber_delta == 1.0
        assert settings.cauchy_sigma == 1.0

    def test_solver_settings_custom(self):
        """Test custom solver settings."""
        settings = SolverSettings(
            max_iterations=200, tolerance=1e-8, robust_loss="cauchy", cauchy_sigma=2.0
        )
        assert settings.max_iterations == 200
        assert settings.tolerance == 1e-8
        assert settings.robust_loss == "cauchy"
        assert settings.cauchy_sigma == 2.0


class TestProjectSettings:
    """Test ProjectSettings model."""

    def test_project_settings_defaults(self):
        """Test default project settings."""
        settings = ProjectSettings()
        assert settings.units == "meters"
        assert settings.coordinate_system == "right_handed"
        assert isinstance(settings.solver, SolverSettings)


class TestSolveResult:
    """Test SolveResult model."""

    def test_solve_result_creation(self):
        """Test solve result creation."""
        result = SolveResult(
            success=True,
            iterations=50,
            final_cost=1.23,
            convergence_reason="Converged",
            residuals={"constraint_1": 0.1, "constraint_2": 0.05},
            uncertainties={"wp1": [0.01, 0.01, 0.02]},
            unconstrained_dofs=["wp2_z"],
            computation_time=2.5,
        )
        assert result.success
        assert result.iterations == 50
        assert result.final_cost == 1.23
        assert result.convergence_reason == "Converged"
        assert result.computation_time == 2.5


class TestProject:
    """Test Project model."""

    def test_project_creation(self):
        """Test basic project creation."""
        project = Project()
        assert project.version == "0.1.0"
        assert len(project.world_points) == 0
        assert len(project.images) == 0
        assert len(project.cameras) == 0
        assert len(project.constraints) == 0
        assert isinstance(project.settings, ProjectSettings)
        assert project.diagnostics is None

    def test_add_world_point(self):
        """Test adding world points."""
        project = Project()
        wp = WorldPoint(id="wp1", xyz=[1.0, 2.0, 3.0])
        project.add_world_point(wp)

        assert "wp1" in project.world_points
        assert project.world_points["wp1"] == wp

    def test_add_duplicate_world_point(self):
        """Test error when adding duplicate world point."""
        project = Project()
        wp1 = WorldPoint(id="wp1")
        wp2 = WorldPoint(id="wp1")  # Same ID

        project.add_world_point(wp1)
        with pytest.raises(ValueError):
            project.add_world_point(wp2)

    def test_add_image(self):
        """Test adding images."""
        project = Project()
        image = Image(id="img1", path="/path/to/image.jpg", width=1920, height=1080)
        project.add_image(image)

        assert "img1" in project.images
        assert project.images["img1"] == image

    def test_add_duplicate_image(self):
        """Test error when adding duplicate image."""
        project = Project()
        img1 = Image(id="img1", path="/path/to/image1.jpg", width=1920, height=1080)
        img2 = Image(id="img1", path="/path/to/image2.jpg", width=1920, height=1080)

        project.add_image(img1)
        with pytest.raises(ValueError):
            project.add_image(img2)

    def test_add_camera(self):
        """Test adding cameras."""
        project = Project()
        image = Image(id="img1", path="/path/to/image.jpg", width=1920, height=1080)
        camera = Camera(
            id="cam1",
            image_id="img1",
            K=[500.0, 500.0, 320.0, 240.0],
            R=[0.0, 0.0, 0.0],
            t=[0.0, 0.0, 0.0],
        )

        project.add_image(image)
        project.add_camera(camera)

        assert "cam1" in project.cameras
        assert project.cameras["cam1"] == camera

    def test_add_camera_missing_image(self):
        """Test error when adding camera with non-existent image."""
        project = Project()
        camera = Camera(
            id="cam1",
            image_id="nonexistent",
            K=[500.0, 500.0, 320.0, 240.0],
            R=[0.0, 0.0, 0.0],
            t=[0.0, 0.0, 0.0],
        )

        with pytest.raises(ValueError):
            project.add_camera(camera)

    def test_add_constraint(self):
        """Test adding constraints."""
        project = Project()
        wp1 = WorldPoint(id="wp1")
        wp2 = WorldPoint(id="wp2")
        image = Image(id="img1", path="/path/to/image.jpg", width=1920, height=1080)

        project.add_world_point(wp1)
        project.add_world_point(wp2)
        project.add_image(image)

        # Image point constraint
        ip_constraint = ImagePointConstraint(
            image_id="img1", wp_id="wp1", u=100.0, v=200.0
        )
        project.add_constraint(ip_constraint)

        # Distance constraint
        dist_constraint = DistanceConstraint(wp_i="wp1", wp_j="wp2", distance=5.0)
        project.add_constraint(dist_constraint)

        assert len(project.constraints) == 2

    def test_add_constraint_invalid_references(self):
        """Test error when adding constraint with invalid references."""
        project = Project()

        # Constraint referencing non-existent world point
        constraint = ImagePointConstraint(
            image_id="nonexistent", wp_id="nonexistent", u=100.0, v=200.0
        )

        with pytest.raises(ValueError):
            project.add_constraint(constraint)

    def test_remove_world_point(self):
        """Test removing world points and cascading constraint removal."""
        project = Project()
        wp1 = WorldPoint(id="wp1")
        wp2 = WorldPoint(id="wp2")
        wp3 = WorldPoint(id="wp3")

        project.add_world_point(wp1)
        project.add_world_point(wp2)
        project.add_world_point(wp3)

        # Add constraints
        constraint1 = DistanceConstraint(wp_i="wp1", wp_j="wp2", distance=5.0)
        constraint2 = DistanceConstraint(wp_i="wp2", wp_j="wp3", distance=3.0)
        project.add_constraint(constraint1)
        project.add_constraint(constraint2)

        assert len(project.constraints) == 2

        # Remove wp1 - should remove constraint1 but keep constraint2
        project.remove_world_point("wp1")

        assert "wp1" not in project.world_points
        assert len(project.constraints) == 1
        assert project.constraints[0] == constraint2

    def test_remove_nonexistent_world_point(self):
        """Test error when removing non-existent world point."""
        project = Project()
        with pytest.raises(ValueError):
            project.remove_world_point("nonexistent")

    def test_remove_image(self):
        """Test removing images and cascading camera/constraint removal."""
        project = Project()
        wp = WorldPoint(id="wp1")
        image = Image(id="img1", path="/path/to/image.jpg", width=1920, height=1080)
        camera = Camera(
            id="cam1",
            image_id="img1",
            K=[500.0, 500.0, 320.0, 240.0],
            R=[0.0, 0.0, 0.0],
            t=[0.0, 0.0, 0.0],
        )

        project.add_world_point(wp)
        project.add_image(image)
        project.add_camera(camera)

        constraint = ImagePointConstraint(
            image_id="img1", wp_id="wp1", u=100.0, v=200.0
        )
        project.add_constraint(constraint)

        assert len(project.images) == 1
        assert len(project.cameras) == 1
        assert len(project.constraints) == 1

        # Remove image - should cascade to camera and constraints
        project.remove_image("img1")

        assert len(project.images) == 0
        assert len(project.cameras) == 0
        assert len(project.constraints) == 0

    def test_get_constraints_by_type(self):
        """Test filtering constraints by type."""
        project = Project()
        wp1 = WorldPoint(id="wp1")
        wp2 = WorldPoint(id="wp2")
        image = Image(id="img1", path="/path/to/image.jpg", width=1920, height=1080)

        project.add_world_point(wp1)
        project.add_world_point(wp2)
        project.add_image(image)

        ip_constraint = ImagePointConstraint(
            image_id="img1", wp_id="wp1", u=100.0, v=200.0
        )
        dist_constraint = DistanceConstraint(wp_i="wp1", wp_j="wp2", distance=5.0)

        project.add_constraint(ip_constraint)
        project.add_constraint(dist_constraint)

        # Filter by type
        ip_constraints = project.get_constraints_by_type("image_point")
        dist_constraints = project.get_constraints_by_type("distance")

        assert len(ip_constraints) == 1
        assert len(dist_constraints) == 1
        assert ip_constraints[0] == ip_constraint
        assert dist_constraints[0] == dist_constraint

    def test_validate_project(self):
        """Test project validation."""
        project = Project()
        wp1 = WorldPoint(id="wp1")
        image = Image(id="img1", path="/path/to/image.jpg", width=1920, height=1080)
        camera = Camera(
            id="cam1",
            image_id="img1",
            K=[500.0, 500.0, 320.0, 240.0],
            R=[0.0, 0.0, 0.0],
            t=[0.0, 0.0, 0.0],
        )

        project.add_world_point(wp1)
        project.add_image(image)
        project.add_camera(camera)

        # Valid project should have no issues
        issues = project.validate_project()
        assert len(issues) == 0

        # Add invalid constraint manually
        invalid_constraint = DistanceConstraint(
            wp_i="wp1", wp_j="nonexistent", distance=5.0  # Non-existent world point
        )
        project.constraints.append(invalid_constraint)

        issues = project.validate_project()
        assert len(issues) > 0
        assert "non-existent world point" in issues[0].lower()

    def test_project_accessors(self):
        """Test project accessor methods."""
        project = Project()
        wp = WorldPoint(id="wp1")
        image = Image(id="img1", path="/path/to/image.jpg", width=1920, height=1080)
        camera = Camera(
            id="cam1",
            image_id="img1",
            K=[500.0, 500.0, 320.0, 240.0],
            R=[0.0, 0.0, 0.0],
            t=[0.0, 0.0, 0.0],
        )

        project.add_world_point(wp)
        project.add_image(image)
        project.add_camera(camera)

        assert project.get_world_point_ids() == ["wp1"]
        assert project.get_image_ids() == ["img1"]
        assert project.get_camera_ids() == ["cam1"]
