"""Tests for extended constraint types with comprehensive coverage."""

import pytest
from pictorigo.core.models.constraints import (
    AngleConstraint,
    ConstraintRegistry,
    EqualDistanceConstraint,
    EqualSpacingConstraint,
    MirrorSymmetryConstraint,
    PointOnCircleConstraint,
    PointOnLineConstraint,
    PointOnPlaneConstraint,
    PointOnSphereConstraint,
    RectangleConstraint,
    create_constraint,
)
from pydantic import ValidationError


class TestPointOnLineConstraint:
    """Test PointOnLineConstraint model."""

    def test_point_on_line_creation(self):
        """Test basic point-on-line constraint creation."""
        constraint = PointOnLineConstraint(
            point_id="p1", line_wp_a="p2", line_wp_b="p3"
        )
        assert constraint.type == "point_on_line"
        assert constraint.point_id == "p1"
        assert constraint.line_wp_a == "p2"
        assert constraint.line_wp_b == "p3"

    def test_point_on_line_same_line_points(self):
        """Test validation that line requires distinct points."""
        constraint = PointOnLineConstraint(
            point_id="p1", line_wp_a="p2", line_wp_b="p2"  # Same point
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()

    def test_point_on_line_point_on_line(self):
        """Test validation that point should be different from line points."""
        constraint = PointOnLineConstraint(
            point_id="p2", line_wp_a="p2", line_wp_b="p3"  # Same as line point
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()


class TestPointOnPlaneConstraint:
    """Test PointOnPlaneConstraint model."""

    def test_point_on_plane_creation(self):
        """Test basic point-on-plane constraint creation."""
        constraint = PointOnPlaneConstraint(
            point_id="p1", plane_wp_a="p2", plane_wp_b="p3", plane_wp_c="p4"
        )
        assert constraint.type == "point_on_plane"
        assert constraint.point_id == "p1"
        assert constraint.plane_wp_a == "p2"

    def test_point_on_plane_duplicate_plane_points(self):
        """Test validation that plane requires distinct points."""
        constraint = PointOnPlaneConstraint(
            point_id="p1",
            plane_wp_a="p2",
            plane_wp_b="p2",  # Duplicate
            plane_wp_c="p4",
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()

    def test_point_on_plane_point_in_plane_definition(self):
        """Test validation that point should be different from plane points."""
        constraint = PointOnPlaneConstraint(
            point_id="p2",  # Same as plane point
            plane_wp_a="p2",
            plane_wp_b="p3",
            plane_wp_c="p4",
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()


class TestPointOnCircleConstraint:
    """Test PointOnCircleConstraint model."""

    def test_point_on_circle_creation(self):
        """Test basic point-on-circle constraint creation."""
        constraint = PointOnCircleConstraint(
            point_id="p1",
            center_id="p2",
            radius_ref_id="p3",
            plane_wp_a="p4",
            plane_wp_b="p5",
            plane_wp_c="p6",
        )
        assert constraint.type == "point_on_circle"
        assert constraint.point_id == "p1"
        assert constraint.center_id == "p2"

    def test_point_on_circle_duplicate_plane_points(self):
        """Test validation of plane definition."""
        constraint = PointOnCircleConstraint(
            point_id="p1",
            center_id="p2",
            radius_ref_id="p3",
            plane_wp_a="p4",
            plane_wp_b="p4",  # Duplicate
            plane_wp_c="p6",
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()

    def test_point_on_circle_duplicate_all_points(self):
        """Test validation that all points must be distinct."""
        constraint = PointOnCircleConstraint(
            point_id="p1",
            center_id="p1",  # Duplicate with point_id
            radius_ref_id="p3",
            plane_wp_a="p4",
            plane_wp_b="p5",
            plane_wp_c="p6",
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()


class TestPointOnSphereConstraint:
    """Test PointOnSphereConstraint model."""

    def test_point_on_sphere_creation(self):
        """Test basic point-on-sphere constraint creation."""
        constraint = PointOnSphereConstraint(
            point_id="p1", center_id="p2", radius_ref_id="p3"
        )
        assert constraint.type == "point_on_sphere"
        assert constraint.point_id == "p1"
        assert constraint.center_id == "p2"
        assert constraint.radius_ref_id == "p3"

    def test_point_on_sphere_duplicate_points(self):
        """Test validation that all points must be distinct."""
        constraint = PointOnSphereConstraint(
            point_id="p1", center_id="p1", radius_ref_id="p3"  # Duplicate
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()


class TestEqualDistanceConstraint:
    """Test EqualDistanceConstraint model."""

    def test_equal_distance_creation(self):
        """Test basic equal distance constraint creation."""
        constraint = EqualDistanceConstraint(
            line1_wp_a="p1", line1_wp_b="p2", line2_wp_a="p3", line2_wp_b="p4"
        )
        assert constraint.type == "equal_distance"
        assert constraint.line1_wp_a == "p1"

    def test_equal_distance_same_points_line1(self):
        """Test validation that line1 requires distinct points."""
        constraint = EqualDistanceConstraint(
            line1_wp_a="p1",
            line1_wp_b="p1",  # Same point
            line2_wp_a="p3",
            line2_wp_b="p4",
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()

    def test_equal_distance_same_points_line2(self):
        """Test validation that line2 requires distinct points."""
        constraint = EqualDistanceConstraint(
            line1_wp_a="p1",
            line1_wp_b="p2",
            line2_wp_a="p3",
            line2_wp_b="p3",  # Same point
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()


class TestRectangleConstraint:
    """Test RectangleConstraint model."""

    def test_rectangle_creation(self):
        """Test basic rectangle constraint creation."""
        constraint = RectangleConstraint(
            corner_a="p1", corner_b="p2", corner_c="p3", corner_d="p4"
        )
        assert constraint.type == "rectangle"
        assert constraint.corner_a == "p1"
        assert constraint.aspect_ratio is None

    def test_rectangle_with_aspect_ratio(self):
        """Test rectangle with aspect ratio."""
        constraint = RectangleConstraint(
            corner_a="p1", corner_b="p2", corner_c="p3", corner_d="p4", aspect_ratio=2.0
        )
        assert constraint.aspect_ratio == 2.0

    def test_square_creation(self):
        """Test square creation (aspect ratio = 1.0)."""
        constraint = RectangleConstraint(
            corner_a="p1", corner_b="p2", corner_c="p3", corner_d="p4", aspect_ratio=1.0
        )
        assert constraint.aspect_ratio == 1.0

    def test_rectangle_duplicate_corners(self):
        """Test validation that corners must be distinct."""
        constraint = RectangleConstraint(
            corner_a="p1", corner_b="p1", corner_c="p3", corner_d="p4"  # Duplicate
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()

    def test_rectangle_negative_aspect_ratio(self):
        """Test validation of positive aspect ratio."""
        with pytest.raises(ValidationError):
            RectangleConstraint(
                corner_a="p1",
                corner_b="p2",
                corner_c="p3",
                corner_d="p4",
                aspect_ratio=-1.0,  # Invalid
            )

    def test_rectangle_zero_aspect_ratio(self):
        """Test validation of positive aspect ratio."""
        with pytest.raises(ValidationError):
            RectangleConstraint(
                corner_a="p1",
                corner_b="p2",
                corner_c="p3",
                corner_d="p4",
                aspect_ratio=0.0,  # Invalid
            )


class TestMirrorSymmetryConstraint:
    """Test MirrorSymmetryConstraint model."""

    def test_mirror_symmetry_creation(self):
        """Test basic mirror symmetry constraint creation."""
        constraint = MirrorSymmetryConstraint(
            point_a="p1",
            point_b="p2",
            mirror_plane_a="p3",
            mirror_plane_b="p4",
            mirror_plane_c="p5",
        )
        assert constraint.type == "mirror_symmetry"
        assert constraint.point_a == "p1"
        assert constraint.point_b == "p2"

    def test_mirror_symmetry_same_symmetric_points(self):
        """Test validation that symmetric points must be distinct."""
        constraint = MirrorSymmetryConstraint(
            point_a="p1",
            point_b="p1",  # Same point
            mirror_plane_a="p3",
            mirror_plane_b="p4",
            mirror_plane_c="p5",
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()

    def test_mirror_symmetry_duplicate_plane_points(self):
        """Test validation of mirror plane definition."""
        constraint = MirrorSymmetryConstraint(
            point_a="p1",
            point_b="p2",
            mirror_plane_a="p3",
            mirror_plane_b="p3",  # Duplicate
            mirror_plane_c="p5",
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()

    def test_mirror_symmetry_overlapping_points(self):
        """Test validation that all points must be distinct."""
        constraint = MirrorSymmetryConstraint(
            point_a="p1",
            point_b="p2",
            mirror_plane_a="p1",  # Overlaps with point_a
            mirror_plane_b="p4",
            mirror_plane_c="p5",
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()


class TestEqualSpacingConstraint:
    """Test EqualSpacingConstraint model."""

    def test_equal_spacing_creation(self):
        """Test basic equal spacing constraint creation."""
        constraint = EqualSpacingConstraint(point_ids=["p1", "p2", "p3"])
        assert constraint.type == "equal_spacing"
        assert constraint.point_ids == ["p1", "p2", "p3"]

    def test_equal_spacing_many_points(self):
        """Test equal spacing with many points."""
        constraint = EqualSpacingConstraint(point_ids=["p1", "p2", "p3", "p4", "p5"])
        assert len(constraint.point_ids) == 5

    def test_equal_spacing_minimum_points(self):
        """Test validation of minimum number of points."""
        with pytest.raises(ValidationError):
            EqualSpacingConstraint(point_ids=["p1", "p2"])  # Too few points

    def test_equal_spacing_duplicate_points(self):
        """Test validation against duplicate points."""
        constraint = EqualSpacingConstraint(point_ids=["p1", "p2", "p1"])  # Duplicate
        with pytest.raises(ValueError):
            constraint.validate_constraint()


class TestAngleConstraintExtended:
    """Test AngleConstraint with consolidation features."""

    def test_angle_constraint_general(self):
        """Test general angle constraint."""
        constraint = AngleConstraint(
            line1_wp_a="p1",
            line1_wp_b="p2",
            line2_wp_a="p3",
            line2_wp_b="p4",
            angle_degrees=45.0,
        )
        assert constraint.type == "angle"
        assert constraint.angle_degrees == 45.0

    def test_angle_constraint_perpendicular_factory(self):
        """Test perpendicular constraint factory method."""
        constraint = AngleConstraint.perpendicular(
            line1_wp_a="p1", line1_wp_b="p2", line2_wp_a="p3", line2_wp_b="p4"
        )
        assert constraint.angle_degrees == 90.0

    def test_angle_constraint_parallel_factory(self):
        """Test parallel constraint factory method."""
        constraint = AngleConstraint.parallel(
            line1_wp_a="p1", line1_wp_b="p2", line2_wp_a="p3", line2_wp_b="p4"
        )
        assert constraint.angle_degrees == 0.0

    def test_angle_constraint_boundary_values(self):
        """Test angle constraint boundary values."""
        # Test 0 degrees (parallel)
        constraint_0 = AngleConstraint(
            line1_wp_a="p1",
            line1_wp_b="p2",
            line2_wp_a="p3",
            line2_wp_b="p4",
            angle_degrees=0.0,
        )
        assert constraint_0.angle_degrees == 0.0

        # Test 180 degrees (anti-parallel)
        constraint_180 = AngleConstraint(
            line1_wp_a="p1",
            line1_wp_b="p2",
            line2_wp_a="p3",
            line2_wp_b="p4",
            angle_degrees=180.0,
        )
        assert constraint_180.angle_degrees == 180.0

    def test_angle_constraint_invalid_angles(self):
        """Test validation of angle range."""
        with pytest.raises(ValidationError):
            AngleConstraint(
                line1_wp_a="p1",
                line1_wp_b="p2",
                line2_wp_a="p3",
                line2_wp_b="p4",
                angle_degrees=-10.0,  # Invalid
            )

        with pytest.raises(ValidationError):
            AngleConstraint(
                line1_wp_a="p1",
                line1_wp_b="p2",
                line2_wp_a="p3",
                line2_wp_b="p4",
                angle_degrees=190.0,  # Invalid
            )


class TestExtendedConstraintFactory:
    """Test factory functions for extended constraints."""

    def test_create_point_on_line_constraint(self):
        """Test creating point-on-line constraint from dict."""
        data = {
            "type": "point_on_line",
            "point_id": "p1",
            "line_wp_a": "p2",
            "line_wp_b": "p3",
        }
        constraint = create_constraint(data)
        assert isinstance(constraint, PointOnLineConstraint)
        assert constraint.point_id == "p1"

    def test_create_point_on_plane_constraint(self):
        """Test creating point-on-plane constraint from dict."""
        data = {
            "type": "point_on_plane",
            "point_id": "p1",
            "plane_wp_a": "p2",
            "plane_wp_b": "p3",
            "plane_wp_c": "p4",
        }
        constraint = create_constraint(data)
        assert isinstance(constraint, PointOnPlaneConstraint)

    def test_create_point_on_sphere_constraint(self):
        """Test creating point-on-sphere constraint from dict."""
        data = {
            "type": "point_on_sphere",
            "point_id": "p1",
            "center_id": "p2",
            "radius_ref_id": "p3",
        }
        constraint = create_constraint(data)
        assert isinstance(constraint, PointOnSphereConstraint)

    def test_create_equal_distance_constraint(self):
        """Test creating equal distance constraint from dict."""
        data = {
            "type": "equal_distance",
            "line1_wp_a": "p1",
            "line1_wp_b": "p2",
            "line2_wp_a": "p3",
            "line2_wp_b": "p4",
        }
        constraint = create_constraint(data)
        assert isinstance(constraint, EqualDistanceConstraint)

    def test_create_rectangle_constraint(self):
        """Test creating rectangle constraint from dict."""
        data = {
            "type": "rectangle",
            "corner_a": "p1",
            "corner_b": "p2",
            "corner_c": "p3",
            "corner_d": "p4",
        }
        constraint = create_constraint(data)
        assert isinstance(constraint, RectangleConstraint)

    def test_create_rectangle_constraint_with_aspect(self):
        """Test creating rectangle constraint with aspect ratio from dict."""
        data = {
            "type": "rectangle",
            "corner_a": "p1",
            "corner_b": "p2",
            "corner_c": "p3",
            "corner_d": "p4",
            "aspect_ratio": 1.0,
        }
        constraint = create_constraint(data)
        assert isinstance(constraint, RectangleConstraint)
        assert constraint.aspect_ratio == 1.0

    def test_create_mirror_symmetry_constraint(self):
        """Test creating mirror symmetry constraint from dict."""
        data = {
            "type": "mirror_symmetry",
            "point_a": "p1",
            "point_b": "p2",
            "mirror_plane_a": "p3",
            "mirror_plane_b": "p4",
            "mirror_plane_c": "p5",
        }
        constraint = create_constraint(data)
        assert isinstance(constraint, MirrorSymmetryConstraint)

    def test_create_equal_spacing_constraint(self):
        """Test creating equal spacing constraint from dict."""
        data = {"type": "equal_spacing", "point_ids": ["p1", "p2", "p3", "p4"]}
        constraint = create_constraint(data)
        assert isinstance(constraint, EqualSpacingConstraint)
        assert len(constraint.point_ids) == 4


class TestExtendedConstraintRegistry:
    """Test ConstraintRegistry with extended constraint types."""

    def test_extended_constraint_types_registered(self):
        """Test that extended constraint types are registered."""
        types = ConstraintRegistry.list_constraint_types()

        extended_types = [
            "point_on_line",
            "point_on_plane",
            "point_on_circle",
            "point_on_sphere",
            "equal_distance",
            "rectangle",
            "mirror_symmetry",
            "equal_spacing",
        ]

        for constraint_type in extended_types:
            assert constraint_type in types

    def test_get_extended_constraint_classes(self):
        """Test getting extended constraint classes by type."""
        assert (
            ConstraintRegistry.get_constraint_class("point_on_line")
            == PointOnLineConstraint
        )
        assert (
            ConstraintRegistry.get_constraint_class("point_on_plane")
            == PointOnPlaneConstraint
        )
        assert (
            ConstraintRegistry.get_constraint_class("point_on_sphere")
            == PointOnSphereConstraint
        )
        assert (
            ConstraintRegistry.get_constraint_class("equal_distance")
            == EqualDistanceConstraint
        )
        assert (
            ConstraintRegistry.get_constraint_class("rectangle") == RectangleConstraint
        )
        assert (
            ConstraintRegistry.get_constraint_class("mirror_symmetry")
            == MirrorSymmetryConstraint
        )
        assert (
            ConstraintRegistry.get_constraint_class("equal_spacing")
            == EqualSpacingConstraint
        )

    def test_validate_extended_constraint_data(self):
        """Test validation of extended constraint data."""
        # Valid constraints
        valid_constraints = [
            {
                "type": "point_on_line",
                "point_id": "p1",
                "line_wp_a": "p2",
                "line_wp_b": "p3",
            },
            {
                "type": "rectangle",
                "corner_a": "p1",
                "corner_b": "p2",
                "corner_c": "p3",
                "corner_d": "p4",
                "aspect_ratio": 1.0,
            },
            {"type": "equal_spacing", "point_ids": ["p1", "p2", "p3"]},
        ]

        for data in valid_constraints:
            assert ConstraintRegistry.validate_constraint_data(data)

        # Invalid constraints
        invalid_constraints = [
            {
                "type": "point_on_line",
                "point_id": "p1",
                "line_wp_a": "p1",  # Same as point
                "line_wp_b": "p3",
            },
            {
                "type": "rectangle",
                "corner_a": "p1",
                "corner_b": "p1",  # Duplicate corner
                "corner_c": "p3",
                "corner_d": "p4",
            },
        ]

        for data in invalid_constraints:
            assert not ConstraintRegistry.validate_constraint_data(data)


class TestUIConsolidation:
    """Test constraint consolidation for UI purposes."""

    def test_perpendicular_ui_mapping(self):
        """Test that UI perpendicular button maps to angle constraint."""
        # UI would create this when user clicks "Perpendicular" button
        constraint = AngleConstraint.perpendicular("p1", "p2", "p3", "p4")

        assert constraint.angle_degrees == 90.0
        assert constraint.constraint_type() == "angle"

    def test_parallel_ui_mapping(self):
        """Test that UI parallel button maps to angle constraint."""
        # UI would create this when user clicks "Parallel" button
        constraint = AngleConstraint.parallel("p1", "p2", "p3", "p4")

        assert constraint.angle_degrees == 0.0
        assert constraint.constraint_type() == "angle"

    def test_custom_angle_ui_mapping(self):
        """Test that UI custom angle input maps to angle constraint."""
        # UI would create this when user enters custom angle
        constraint = AngleConstraint(
            line1_wp_a="p1",
            line1_wp_b="p2",
            line2_wp_a="p3",
            line2_wp_b="p4",
            angle_degrees=30.0,
        )

        assert constraint.angle_degrees == 30.0
        assert constraint.constraint_type() == "angle"

    def test_square_ui_mapping(self):
        """Test that UI square button maps to rectangle constraint."""
        # UI would create this when user clicks "Square" button
        constraint = RectangleConstraint(
            corner_a="p1", corner_b="p2", corner_c="p3", corner_d="p4", aspect_ratio=1.0
        )

        assert constraint.aspect_ratio == 1.0
        assert constraint.constraint_type() == "rectangle"

    def test_rectangle_ui_mapping(self):
        """Test that UI rectangle button maps to rectangle constraint."""
        # UI would create this when user clicks "Rectangle" button
        constraint = RectangleConstraint(
            corner_a="p1",
            corner_b="p2",
            corner_c="p3",
            corner_d="p4",
            # No aspect ratio = general rectangle
        )

        assert constraint.aspect_ratio is None
        assert constraint.constraint_type() == "rectangle"
