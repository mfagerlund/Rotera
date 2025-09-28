"""Tests for constraint models."""

import pytest
from pictorigo.core.models.constraints import (
    AxisAlignConstraint,
    ConstraintRegistry,
    CoplanarConstraint,
    DistanceConstraint,
    EqualityConstraint,
    GaugeFixConstraint,
    ImagePointConstraint,
    KnownCoordConstraint,
    PlaneFromThreeConstraint,
    create_constraint,
)
from pydantic import ValidationError


class TestImagePointConstraint:
    """Test ImagePointConstraint model."""

    def test_image_point_constraint_creation(self):
        """Test basic image point constraint creation."""
        constraint = ImagePointConstraint(
            image_id="img1", wp_id="wp1", u=100.0, v=200.0
        )
        assert constraint.type == "image_point"
        assert constraint.image_id == "img1"
        assert constraint.wp_id == "wp1"
        assert constraint.u == 100.0
        assert constraint.v == 200.0
        assert constraint.sigma == 1.0  # Default value

    def test_image_point_constraint_with_sigma(self):
        """Test image point constraint with custom sigma."""
        constraint = ImagePointConstraint(
            image_id="img1", wp_id="wp1", u=100.0, v=200.0, sigma=0.5
        )
        assert constraint.sigma == 0.5

    def test_image_point_constraint_invalid_sigma(self):
        """Test validation of sigma parameter."""
        with pytest.raises(ValidationError):
            ImagePointConstraint(
                image_id="img1",
                wp_id="wp1",
                u=100.0,
                v=200.0,
                sigma=0.0,  # Must be positive
            )


class TestKnownCoordConstraint:
    """Test KnownCoordConstraint model."""

    def test_known_coord_constraint_creation(self):
        """Test basic known coordinate constraint creation."""
        constraint = KnownCoordConstraint(
            wp_id="wp1", mask_xyz=[True, False, True], values=[1.0, 0.0, 3.0]
        )
        assert constraint.type == "known_coord"
        assert constraint.wp_id == "wp1"
        assert constraint.mask_xyz == [True, False, True]
        assert constraint.values == [1.0, 0.0, 3.0]

    def test_known_coord_constraint_invalid_mask_length(self):
        """Test validation of mask length."""
        with pytest.raises(ValidationError):
            KnownCoordConstraint(
                wp_id="wp1", mask_xyz=[True, False], values=[1.0, 0.0, 3.0]  # Too short
            )

    def test_known_coord_constraint_no_constrained_coords(self):
        """Test validation that at least one coordinate is constrained."""
        with pytest.raises(ValidationError):
            KnownCoordConstraint(
                wp_id="wp1",
                mask_xyz=[False, False, False],  # No constraints
                values=[1.0, 0.0, 3.0],
            )


class TestDistanceConstraint:
    """Test DistanceConstraint model."""

    def test_distance_constraint_creation(self):
        """Test basic distance constraint creation."""
        constraint = DistanceConstraint(wp_i="wp1", wp_j="wp2", distance=5.0)
        assert constraint.type == "distance"
        assert constraint.wp_i == "wp1"
        assert constraint.wp_j == "wp2"
        assert constraint.distance == 5.0

    def test_distance_constraint_negative_distance(self):
        """Test validation of non-negative distance."""
        with pytest.raises(ValidationError):
            DistanceConstraint(
                wp_i="wp1", wp_j="wp2", distance=-1.0  # Must be non-negative
            )

    def test_distance_constraint_same_points(self):
        """Test validation that points are different."""
        constraint = DistanceConstraint(
            wp_i="wp1", wp_j="wp1", distance=5.0  # Same point
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()


class TestAxisAlignConstraint:
    """Test AxisAlignConstraint model."""

    def test_axis_align_constraint_standard_axis(self):
        """Test axis alignment with standard axes."""
        constraint = AxisAlignConstraint(wp_i="wp1", wp_j="wp2", axis="x")
        assert constraint.type == "axis_align"
        assert constraint.axis == "x"

    def test_axis_align_constraint_custom_axis(self):
        """Test axis alignment with custom axis vector."""
        constraint = AxisAlignConstraint(wp_i="wp1", wp_j="wp2", axis=[1.0, 0.0, 0.0])
        assert constraint.axis == [1.0, 0.0, 0.0]

    def test_axis_align_constraint_invalid_custom_axis(self):
        """Test validation of custom axis vector."""
        with pytest.raises(ValidationError):
            AxisAlignConstraint(wp_i="wp1", wp_j="wp2", axis=[1.0, 0.0])  # Wrong length

        with pytest.raises(ValidationError):
            AxisAlignConstraint(
                wp_i="wp1", wp_j="wp2", axis=[2.0, 0.0, 0.0]  # Not unit vector
            )

    def test_axis_align_constraint_same_points(self):
        """Test validation that points are different."""
        constraint = AxisAlignConstraint(wp_i="wp1", wp_j="wp1", axis="x")  # Same point
        with pytest.raises(ValueError):
            constraint.validate_constraint()


class TestCoplanarConstraint:
    """Test CoplanarConstraint model."""

    def test_coplanar_constraint_creation(self):
        """Test basic coplanar constraint creation."""
        constraint = CoplanarConstraint(wp_ids=["wp1", "wp2", "wp3", "wp4"])
        assert constraint.type == "coplanar"
        assert constraint.wp_ids == ["wp1", "wp2", "wp3", "wp4"]

    def test_coplanar_constraint_minimum_points(self):
        """Test validation of minimum number of points."""
        with pytest.raises(ValidationError):
            CoplanarConstraint(wp_ids=["wp1", "wp2"])  # Too few points

    def test_coplanar_constraint_duplicate_points(self):
        """Test validation against duplicate points."""
        constraint = CoplanarConstraint(wp_ids=["wp1", "wp2", "wp1"])  # Duplicate
        with pytest.raises(ValueError):
            constraint.validate_constraint()


class TestPlaneFromThreeConstraint:
    """Test PlaneFromThreeConstraint model."""

    def test_plane_from_three_constraint_creation(self):
        """Test basic plane from three constraint creation."""
        constraint = PlaneFromThreeConstraint(wp_a="wp1", wp_b="wp2", wp_c="wp3")
        assert constraint.type == "plane_from_three"
        assert constraint.wp_a == "wp1"
        assert constraint.wp_b == "wp2"
        assert constraint.wp_c == "wp3"
        assert constraint.members == []

    def test_plane_from_three_constraint_with_members(self):
        """Test plane constraint with additional members."""
        constraint = PlaneFromThreeConstraint(
            wp_a="wp1", wp_b="wp2", wp_c="wp3", members=["wp4", "wp5"]
        )
        assert constraint.members == ["wp4", "wp5"]

    def test_plane_from_three_constraint_duplicate_defining_points(self):
        """Test validation against duplicate defining points."""
        constraint = PlaneFromThreeConstraint(
            wp_a="wp1", wp_b="wp1", wp_c="wp3"  # Duplicate
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()

    def test_plane_from_three_constraint_duplicate_members(self):
        """Test validation against duplicate members."""
        constraint = PlaneFromThreeConstraint(
            wp_a="wp1",
            wp_b="wp2",
            wp_c="wp3",
            members=["wp1", "wp4"],  # wp1 already used as defining point
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()


class TestEqualityConstraint:
    """Test EqualityConstraint model."""

    def test_equality_constraint_creation(self):
        """Test basic equality constraint creation."""
        constraint = EqualityConstraint(wp_a="wp1", wp_b="wp2")
        assert constraint.type == "equality"
        assert constraint.wp_a == "wp1"
        assert constraint.wp_b == "wp2"

    def test_equality_constraint_same_points(self):
        """Test validation that points are different."""
        constraint = EqualityConstraint(wp_a="wp1", wp_b="wp1")  # Same point
        with pytest.raises(ValueError):
            constraint.validate_constraint()


class TestGaugeFixConstraint:
    """Test GaugeFixConstraint model."""

    def test_gauge_fix_constraint_creation(self):
        """Test basic gauge fix constraint creation."""
        constraint = GaugeFixConstraint(
            origin_wp="wp1", x_wp="wp2", xy_wp="wp3", scale_d=5.0
        )
        assert constraint.type == "gauge_fix"
        assert constraint.origin_wp == "wp1"
        assert constraint.x_wp == "wp2"
        assert constraint.xy_wp == "wp3"
        assert constraint.scale_d == 5.0

    def test_gauge_fix_constraint_negative_scale(self):
        """Test validation of positive scale."""
        with pytest.raises(ValidationError):
            GaugeFixConstraint(
                origin_wp="wp1",
                x_wp="wp2",
                xy_wp="wp3",
                scale_d=-1.0,  # Must be positive
            )

    def test_gauge_fix_constraint_duplicate_points(self):
        """Test validation against duplicate points."""
        constraint = GaugeFixConstraint(
            origin_wp="wp1", x_wp="wp1", xy_wp="wp3", scale_d=5.0  # Duplicate
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()


class TestConstraintFactory:
    """Test constraint factory functions."""

    def test_create_constraint_image_point(self):
        """Test creating image point constraint from dict."""
        data = {
            "type": "image_point",
            "image_id": "img1",
            "wp_id": "wp1",
            "u": 100.0,
            "v": 200.0,
        }
        constraint = create_constraint(data)
        assert isinstance(constraint, ImagePointConstraint)
        assert constraint.image_id == "img1"

    def test_create_constraint_unknown_type(self):
        """Test error handling for unknown constraint type."""
        data = {"type": "unknown_type", "param": "value"}
        with pytest.raises(ValueError):
            create_constraint(data)


class TestConstraintRegistry:
    """Test ConstraintRegistry functionality."""

    def test_get_constraint_class(self):
        """Test getting constraint class by type."""
        cls = ConstraintRegistry.get_constraint_class("image_point")
        assert cls == ImagePointConstraint

    def test_get_constraint_class_unknown(self):
        """Test error handling for unknown constraint type."""
        with pytest.raises(ValueError):
            ConstraintRegistry.get_constraint_class("unknown_type")

    def test_list_constraint_types(self):
        """Test listing all constraint types."""
        types = ConstraintRegistry.list_constraint_types()
        expected_types = [
            "image_point",
            "known_coord",
            "distance",
            "axis_align",
            "coplanar",
            "plane_from_three",
            "equality",
            "gauge_fix",
        ]
        assert all(t in types for t in expected_types)

    def test_validate_constraint_data_valid(self):
        """Test validation of valid constraint data."""
        data = {"type": "distance", "wp_i": "wp1", "wp_j": "wp2", "distance": 5.0}
        assert ConstraintRegistry.validate_constraint_data(data)

    def test_validate_constraint_data_invalid(self):
        """Test validation of invalid constraint data."""
        data = {
            "type": "distance",
            "wp_i": "wp1",
            "wp_j": "wp1",  # Same point - invalid
            "distance": 5.0,
        }
        assert not ConstraintRegistry.validate_constraint_data(data)
