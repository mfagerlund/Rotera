"""Tests for project model."""

from datetime import datetime

import pytest
from pydantic import ValidationError

from pictorigo.core.models.entities import Camera, Constraint, Image, Line, WorldPoint
from pictorigo.core.models.project import (
    CoordinateSystem,
    GroundPlane,
    OptimizationInfo,
    PointGroup,
    Project,
    ProjectSettings,
    SolveResult,
)


class TestProjectSettings:
    """Test ProjectSettings model."""

    def test_project_settings_defaults(self):
        """Test default project settings."""
        settings = ProjectSettings()
        assert settings.show_point_names is True
        assert settings.auto_save is True
        assert settings.theme == "dark"
        assert settings.measurement_units == "meters"
        assert settings.precision_digits == 3
        assert settings.show_constraint_glyphs is True
        assert settings.auto_optimize is False
        assert settings.default_workspace == "image"
        assert settings.enable_smart_snapping is True

    def test_project_settings_custom(self):
        """Test custom project settings."""
        settings = ProjectSettings(
            show_point_names=False,
            theme="light",
            measurement_units="feet",
            precision_digits=2,
        )
        assert settings.show_point_names is False
        assert settings.theme == "light"
        assert settings.measurement_units == "feet"
        assert settings.precision_digits == 2


class TestSolveResult:
    """Test SolveResult model."""

    def test_solve_result_creation(self):
        """Test solve result creation."""
        result = SolveResult(
            success=True,
            iterations=50,
            final_cost=1.23,
            convergence_reason="Converged",
            computation_time=2.5,
            residuals=0.1,
        )
        assert result.success
        assert result.iterations == 50
        assert result.final_cost == 1.23
        assert result.convergence_reason == "Converged"
        assert result.computation_time == 2.5
        assert result.residuals == 0.1


class TestOptimizationInfo:
    """Test OptimizationInfo model."""

    def test_optimization_info_defaults(self):
        """Test default optimization info."""
        opt = OptimizationInfo()
        assert opt.status == "not_run"
        assert opt.last_run is None
        assert opt.residuals is None
        assert opt.iterations is None

    def test_optimization_info_custom(self):
        """Test custom optimization info."""
        timestamp = datetime.now().isoformat()
        opt = OptimizationInfo(
            status="converged", last_run=timestamp, residuals=0.05, iterations=25
        )
        assert opt.status == "converged"
        assert opt.last_run == timestamp
        assert opt.residuals == 0.05
        assert opt.iterations == 25


class TestCoordinateSystem:
    """Test CoordinateSystem model."""

    def test_coordinate_system_creation(self):
        """Test coordinate system creation."""
        cs = CoordinateSystem(origin="wp1", scale=1.0)
        assert cs.origin == "wp1"
        assert cs.scale == 1.0
        assert cs.ground_plane is None


class TestPointGroup:
    """Test PointGroup model."""

    def test_point_group_creation(self):
        """Test point group creation."""
        group = PointGroup(
            name="Control Points", color="#ff0000", points=["wp1", "wp2", "wp3"]
        )
        assert group.name == "Control Points"
        assert group.color == "#ff0000"
        assert group.visible is True
        assert group.points == ["wp1", "wp2", "wp3"]


class TestGroundPlane:
    """Test GroundPlane model."""

    def test_ground_plane_creation(self):
        """Test ground plane creation."""
        gp = GroundPlane(id="gp1", name="Main Ground", point_ids=["wp1", "wp2", "wp3"])
        assert gp.id == "gp1"
        assert gp.name == "Main Ground"
        assert gp.point_ids == ["wp1", "wp2", "wp3"]
        assert gp.equation is None

    def test_ground_plane_invalid_points(self):
        """Test validation of point count."""
        with pytest.raises(ValidationError):  # Pydantic validation error
            GroundPlane(
                id="gp1", name="Invalid", point_ids=["wp1", "wp2"]  # Too few points
            )


class TestProject:
    """Test Project model."""

    def test_project_creation(self):
        """Test basic project creation."""
        project = Project()
        assert project.name == "New Project"
        assert len(project.world_points) == 0
        assert len(project.images) == 0
        assert len(project.cameras) == 0
        assert len(project.constraints) == 0
        assert isinstance(project.settings, ProjectSettings)
        assert project.diagnostics is None
        assert project.next_wp_number == 1
        assert project.next_line_number == 1
        assert project.next_plane_number == 1

    def test_project_custom_creation(self):
        """Test project creation with custom values."""
        project = Project(id="test-project", name="Test Project")
        assert project.id == "test-project"
        assert project.name == "Test Project"

    def test_add_world_point(self):
        """Test adding world points."""
        project = Project()
        wp = WorldPoint(id="wp1", name="Point 1", xyz=[1.0, 2.0, 3.0])
        project.add_world_point(wp)

        assert "wp1" in project.world_points
        assert project.world_points["wp1"] == wp

    def test_add_line(self):
        """Test adding lines."""
        project = Project()
        wp1 = WorldPoint(id="wp1", name="Point 1")
        wp2 = WorldPoint(id="wp2", name="Point 2")
        line = Line(id="l1", name="Line 1", point_a="wp1", point_b="wp2")

        project.add_world_point(wp1)
        project.add_world_point(wp2)
        project.add_line(line)

        assert "l1" in project.lines
        assert project.lines["l1"] == line

    def test_add_image(self):
        """Test adding images."""
        project = Project()
        image = Image(id="img1", name="Image 1", width=1920, height=1080)
        project.add_image(image)

        assert "img1" in project.images
        assert project.images["img1"] == image

    def test_add_camera(self):
        """Test adding cameras."""
        project = Project()
        image = Image(id="img1", name="Image 1", width=1920, height=1080)
        camera = Camera(
            id="cam1",
            name="Camera 1",
            image_id="img1",
            K=[500.0, 500.0, 320.0, 240.0],
            R=[0.0, 0.0, 0.0],
            t=[0.0, 0.0, 0.0],
        )

        project.add_image(image)
        project.add_camera(camera)

        assert "cam1" in project.cameras
        assert project.cameras["cam1"] == camera

    def test_add_constraint(self):
        """Test adding constraints."""
        project = Project()
        wp1 = WorldPoint(id="wp1", name="Point 1")
        wp2 = WorldPoint(id="wp2", name="Point 2")

        project.add_world_point(wp1)
        project.add_world_point(wp2)

        # Distance constraint
        constraint = Constraint(
            id="c1",
            name="Distance 1-2",
            type="distance_point_point",
            status="satisfied",
            entities={"points": ["wp1", "wp2"]},
            parameters={"targetValue": 5.0},
        )
        project.add_constraint(constraint)

        assert len(project.constraints) == 1
        assert project.constraints[0] == constraint

    def test_remove_world_point(self):
        """Test removing world points and cascading removal."""
        project = Project()
        wp1 = WorldPoint(id="wp1", name="Point 1")
        wp2 = WorldPoint(id="wp2", name="Point 2")
        wp3 = WorldPoint(id="wp3", name="Point 3")

        project.add_world_point(wp1)
        project.add_world_point(wp2)
        project.add_world_point(wp3)

        # Add line connecting wp1 and wp2
        line = Line(id="l1", name="Line 1", point_a="wp1", point_b="wp2")
        project.add_line(line)

        # Add constraint involving wp1
        constraint = Constraint(
            id="c1",
            name="Distance 1-3",
            type="distance_point_point",
            status="satisfied",
            entities={"points": ["wp1", "wp3"]},
            parameters={"targetValue": 5.0},
        )
        project.add_constraint(constraint)

        assert len(project.lines) == 1
        assert len(project.constraints) == 1

        # Remove wp1 - should cascade to line and constraint
        project.remove_world_point("wp1")

        assert "wp1" not in project.world_points
        assert len(project.lines) == 0  # Line should be removed
        assert len(project.constraints) == 0  # Constraint should be removed

    def test_validate_project(self):
        """Test project validation."""
        project = Project()
        wp1 = WorldPoint(id="wp1", name="Point 1")
        image = Image(id="img1", name="Image 1", width=1920, height=1080)
        camera = Camera(
            id="cam1",
            name="Camera 1",
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

        # Add invalid line manually (referencing non-existent point)
        invalid_line = Line(
            id="l1",
            name="Invalid Line",
            point_a="wp1",
            point_b="nonexistent",  # Non-existent world point
        )
        project.lines["l1"] = invalid_line

        issues = project.validate_project()
        assert len(issues) > 0
        assert "non-existent point" in issues[0].lower()

    def test_get_stats(self):
        """Test project statistics."""
        project = Project()
        wp = WorldPoint(id="wp1", name="Point 1")
        image = Image(id="img1", name="Image 1", width=1920, height=1080)
        camera = Camera(
            id="cam1",
            name="Camera 1",
            image_id="img1",
            K=[500.0, 500.0, 320.0, 240.0],
            R=[0.0, 0.0, 0.0],
            t=[0.0, 0.0, 0.0],
        )

        project.add_world_point(wp)
        project.add_image(image)
        project.add_camera(camera)

        stats = project.get_stats()
        assert stats["world_points"] == 1
        assert stats["images"] == 1
        assert stats["cameras"] == 1
        assert stats["constraints"] == 0
        assert stats["lines"] == 0
        assert stats["planes"] == 0

    def test_frontend_conversion(self):
        """Test frontend format conversion."""
        project = Project(id="test", name="Test Project")
        wp = WorldPoint(id="wp1", name="Point 1", xyz=[1.0, 2.0, 3.0])
        project.add_world_point(wp)

        # Convert to frontend format
        frontend_data = project.to_frontend_format()
        assert frontend_data["id"] == "test"
        assert frontend_data["name"] == "Test Project"
        assert "wp1" in frontend_data["worldPoints"]
        assert frontend_data["worldPoints"]["wp1"]["xyz"] == [1.0, 2.0, 3.0]

        # Convert back from frontend format
        project2 = Project.from_frontend_format(frontend_data)
        assert project2.id == "test"
        assert project2.name == "Test Project"
        assert "wp1" in project2.world_points
        assert project2.world_points["wp1"].xyz == [1.0, 2.0, 3.0]

    def test_frontend_conversion_with_cameras(self):
        """Test frontend conversion with cameras."""
        project = Project()
        image = Image(id="img1", name="Image 1", width=1920, height=1080)
        camera = Camera(
            id="cam1",
            name="Camera 1",
            image_id="img1",
            K=[500.0, 600.0, 320.0, 240.0, 0.1, 0.01],  # With distortion
            R=[0.1, 0.2, 0.3],
            t=[1.0, 2.0, 3.0],
        )

        project.add_image(image)
        project.add_camera(camera)

        # Convert to frontend
        frontend_data = project.to_frontend_format()
        camera_data = frontend_data["cameras"]["cam1"]

        assert camera_data["intrinsics"]["fx"] == 500.0
        assert camera_data["intrinsics"]["fy"] == 600.0
        assert camera_data["intrinsics"]["k1"] == 0.1
        assert camera_data["intrinsics"]["k2"] == 0.01
        assert camera_data["extrinsics"]["rotation"] == [0.1, 0.2, 0.3]
        assert camera_data["extrinsics"]["translation"] == [1.0, 2.0, 3.0]

        # Convert back
        project2 = Project.from_frontend_format(frontend_data)
        camera2 = project2.cameras["cam1"]
        assert camera2.K == [500.0, 600.0, 320.0, 240.0, 0.1, 0.01]
        assert camera2.R == [0.1, 0.2, 0.3]
        assert camera2.t == [1.0, 2.0, 3.0]

    def test_get_constraint_types_summary(self):
        """Test constraint types summary."""
        project = Project()
        wp1 = WorldPoint(id="wp1")
        wp2 = WorldPoint(id="wp2")
        project.add_world_point(wp1)
        project.add_world_point(wp2)

        # Add different constraint types
        constraint1 = Constraint(
            id="c1",
            name="Distance",
            type="distance_point_point",
            status="satisfied",
            entities={"points": ["wp1", "wp2"]},
            parameters={"targetValue": 5.0},
        )
        constraint2 = Constraint(
            id="c2",
            name="Fixed",
            type="fixed_point",
            status="satisfied",
            entities={"points": ["wp1"]},
            parameters={"x": 0, "y": 0, "z": 0},
        )
        constraint3 = Constraint(
            id="c3",
            name="Distance2",
            type="distance_point_point",
            status="satisfied",
            entities={"points": ["wp1", "wp2"]},
            parameters={"targetValue": 3.0},
        )

        project.add_constraint(constraint1)
        project.add_constraint(constraint2)
        project.add_constraint(constraint3)

        summary = project.get_constraint_types_summary()
        assert summary["distance_point_point"] == 2
        assert summary["fixed_point"] == 1
