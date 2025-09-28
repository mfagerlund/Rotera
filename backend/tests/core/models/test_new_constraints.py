"""Tests for new constraint types."""

import pytest
from pictorigo.core.models.constraints import (
    AngleConstraint,
    CollinearConstraint,
    ConstraintRegistry,
    FixedDistanceRatioConstraint,
    ParallelConstraint,
    PerpendicularConstraint,
    create_constraint,
)
from pydantic import ValidationError


class TestCollinearConstraint:
    """Test CollinearConstraint model."""

    def test_collinear_constraint_creation(self):
        """Test basic collinear constraint creation."""
        constraint = CollinearConstraint(wp_ids=["wp1", "wp2", "wp3"])
        assert constraint.type == "collinear"
        assert constraint.wp_ids == ["wp1", "wp2", "wp3"]

    def test_collinear_constraint_many_points(self):
        """Test collinear constraint with many points."""
        constraint = CollinearConstraint(wp_ids=["wp1", "wp2", "wp3", "wp4", "wp5"])
        assert len(constraint.wp_ids) == 5

    def test_collinear_constraint_minimum_points(self):
        """Test validation of minimum number of points."""
        with pytest.raises(ValidationError):
            CollinearConstraint(wp_ids=["wp1", "wp2"])  # Too few points

    def test_collinear_constraint_duplicate_points(self):
        """Test validation against duplicate points."""
        constraint = CollinearConstraint(wp_ids=["wp1", "wp2", "wp1"])  # Duplicate
        with pytest.raises(ValueError):
            constraint.validate_constraint()


class TestPerpendicularConstraint:
    """Test PerpendicularConstraint model."""

    def test_perpendicular_constraint_creation(self):
        """Test basic perpendicular constraint creation."""
        constraint = PerpendicularConstraint(
            line1_wp_a="wp1", line1_wp_b="wp2", line2_wp_a="wp3", line2_wp_b="wp4"
        )
        assert constraint.type == "perpendicular"
        assert constraint.line1_wp_a == "wp1"
        assert constraint.line1_wp_b == "wp2"
        assert constraint.line2_wp_a == "wp3"
        assert constraint.line2_wp_b == "wp4"

    def test_perpendicular_constraint_same_points_line1(self):
        """Test validation that line1 requires distinct points."""
        constraint = PerpendicularConstraint(
            line1_wp_a="wp1",
            line1_wp_b="wp1",  # Same point
            line2_wp_a="wp3",
            line2_wp_b="wp4",
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()

    def test_perpendicular_constraint_same_points_line2(self):
        """Test validation that line2 requires distinct points."""
        constraint = PerpendicularConstraint(
            line1_wp_a="wp1",
            line1_wp_b="wp2",
            line2_wp_a="wp3",
            line2_wp_b="wp3",  # Same point
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()


class TestParallelConstraint:
    """Test ParallelConstraint model."""

    def test_parallel_constraint_creation(self):
        """Test basic parallel constraint creation."""
        constraint = ParallelConstraint(
            line1_wp_a="wp1", line1_wp_b="wp2", line2_wp_a="wp3", line2_wp_b="wp4"
        )
        assert constraint.type == "parallel"
        assert constraint.line1_wp_a == "wp1"

    def test_parallel_constraint_validation(self):
        """Test parallel constraint validation."""
        constraint = ParallelConstraint(
            line1_wp_a="wp1",
            line1_wp_b="wp1",  # Same point
            line2_wp_a="wp3",
            line2_wp_b="wp4",
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()


class TestAngleConstraint:
    """Test AngleConstraint model."""

    def test_angle_constraint_creation(self):
        """Test basic angle constraint creation."""
        constraint = AngleConstraint(
            line1_wp_a="wp1",
            line1_wp_b="wp2",
            line2_wp_a="wp3",
            line2_wp_b="wp4",
            angle_degrees=90.0,
        )
        assert constraint.type == "angle"
        assert constraint.angle_degrees == 90.0

    def test_angle_constraint_valid_angles(self):
        """Test valid angle ranges."""
        # Test boundary values
        constraint_0 = AngleConstraint(
            line1_wp_a="wp1",
            line1_wp_b="wp2",
            line2_wp_a="wp3",
            line2_wp_b="wp4",
            angle_degrees=0.0,
        )
        assert constraint_0.angle_degrees == 0.0

        constraint_180 = AngleConstraint(
            line1_wp_a="wp1",
            line1_wp_b="wp2",
            line2_wp_a="wp3",
            line2_wp_b="wp4",
            angle_degrees=180.0,
        )
        assert constraint_180.angle_degrees == 180.0

    def test_angle_constraint_invalid_angles(self):
        """Test validation of angle range."""
        with pytest.raises(ValidationError):
            AngleConstraint(
                line1_wp_a="wp1",
                line1_wp_b="wp2",
                line2_wp_a="wp3",
                line2_wp_b="wp4",
                angle_degrees=-10.0,  # Invalid
            )

        with pytest.raises(ValidationError):
            AngleConstraint(
                line1_wp_a="wp1",
                line1_wp_b="wp2",
                line2_wp_a="wp3",
                line2_wp_b="wp4",
                angle_degrees=190.0,  # Invalid
            )


class TestFixedDistanceRatioConstraint:
    """Test FixedDistanceRatioConstraint model."""

    def test_distance_ratio_constraint_creation(self):
        """Test basic distance ratio constraint creation."""
        constraint = FixedDistanceRatioConstraint(
            line1_wp_a="wp1",
            line1_wp_b="wp2",
            line2_wp_a="wp3",
            line2_wp_b="wp4",
            ratio=2.0,
        )
        assert constraint.type == "distance_ratio"
        assert constraint.ratio == 2.0

    def test_distance_ratio_constraint_positive_ratio(self):
        """Test validation of positive ratio."""
        with pytest.raises(ValidationError):
            FixedDistanceRatioConstraint(
                line1_wp_a="wp1",
                line1_wp_b="wp2",
                line2_wp_a="wp3",
                line2_wp_b="wp4",
                ratio=0.0,  # Must be positive
            )

        with pytest.raises(ValidationError):
            FixedDistanceRatioConstraint(
                line1_wp_a="wp1",
                line1_wp_b="wp2",
                line2_wp_a="wp3",
                line2_wp_b="wp4",
                ratio=-1.0,  # Must be positive
            )

    def test_distance_ratio_constraint_validation(self):
        """Test distance ratio constraint validation."""
        constraint = FixedDistanceRatioConstraint(
            line1_wp_a="wp1",
            line1_wp_b="wp1",  # Same point
            line2_wp_a="wp3",
            line2_wp_b="wp4",
            ratio=1.5,
        )
        with pytest.raises(ValueError):
            constraint.validate_constraint()


class TestNewConstraintFactory:
    """Test factory functions for new constraints."""

    def test_create_collinear_constraint(self):
        """Test creating collinear constraint from dict."""
        data = {"type": "collinear", "wp_ids": ["wp1", "wp2", "wp3"]}
        constraint = create_constraint(data)
        assert isinstance(constraint, CollinearConstraint)
        assert constraint.wp_ids == ["wp1", "wp2", "wp3"]

    def test_create_perpendicular_constraint(self):
        """Test creating perpendicular constraint from dict."""
        data = {
            "type": "perpendicular",
            "line1_wp_a": "wp1",
            "line1_wp_b": "wp2",
            "line2_wp_a": "wp3",
            "line2_wp_b": "wp4",
        }
        constraint = create_constraint(data)
        assert isinstance(constraint, PerpendicularConstraint)
        assert constraint.line1_wp_a == "wp1"

    def test_create_parallel_constraint(self):
        """Test creating parallel constraint from dict."""
        data = {
            "type": "parallel",
            "line1_wp_a": "wp1",
            "line1_wp_b": "wp2",
            "line2_wp_a": "wp3",
            "line2_wp_b": "wp4",
        }
        constraint = create_constraint(data)
        assert isinstance(constraint, ParallelConstraint)

    def test_create_angle_constraint(self):
        """Test creating angle constraint from dict."""
        data = {
            "type": "angle",
            "line1_wp_a": "wp1",
            "line1_wp_b": "wp2",
            "line2_wp_a": "wp3",
            "line2_wp_b": "wp4",
            "angle_degrees": 45.0,
        }
        constraint = create_constraint(data)
        assert isinstance(constraint, AngleConstraint)
        assert constraint.angle_degrees == 45.0

    def test_create_distance_ratio_constraint(self):
        """Test creating distance ratio constraint from dict."""
        data = {
            "type": "distance_ratio",
            "line1_wp_a": "wp1",
            "line1_wp_b": "wp2",
            "line2_wp_a": "wp3",
            "line2_wp_b": "wp4",
            "ratio": 1.618,
        }
        constraint = create_constraint(data)
        assert isinstance(constraint, FixedDistanceRatioConstraint)
        assert constraint.ratio == 1.618


class TestNewConstraintRegistry:
    """Test ConstraintRegistry with new constraint types."""

    def test_new_constraint_types_registered(self):
        """Test that new constraint types are registered."""
        types = ConstraintRegistry.list_constraint_types()

        new_types = [
            "collinear",
            "perpendicular",
            "parallel",
            "angle",
            "distance_ratio",
        ]

        for constraint_type in new_types:
            assert constraint_type in types

    def test_get_new_constraint_classes(self):
        """Test getting new constraint classes by type."""
        assert (
            ConstraintRegistry.get_constraint_class("collinear") == CollinearConstraint
        )
        assert (
            ConstraintRegistry.get_constraint_class("perpendicular")
            == PerpendicularConstraint
        )
        assert ConstraintRegistry.get_constraint_class("parallel") == ParallelConstraint
        assert ConstraintRegistry.get_constraint_class("angle") == AngleConstraint
        assert (
            ConstraintRegistry.get_constraint_class("distance_ratio")
            == FixedDistanceRatioConstraint
        )

    def test_validate_new_constraint_data(self):
        """Test validation of new constraint data."""
        # Valid collinear constraint
        collinear_data = {"type": "collinear", "wp_ids": ["wp1", "wp2", "wp3"]}
        assert ConstraintRegistry.validate_constraint_data(collinear_data)

        # Invalid collinear constraint (duplicate points)
        invalid_collinear_data = {"type": "collinear", "wp_ids": ["wp1", "wp2", "wp1"]}
        assert not ConstraintRegistry.validate_constraint_data(invalid_collinear_data)

        # Valid perpendicular constraint
        perpendicular_data = {
            "type": "perpendicular",
            "line1_wp_a": "wp1",
            "line1_wp_b": "wp2",
            "line2_wp_a": "wp3",
            "line2_wp_b": "wp4",
        }
        assert ConstraintRegistry.validate_constraint_data(perpendicular_data)

        # Valid angle constraint
        angle_data = {
            "type": "angle",
            "line1_wp_a": "wp1",
            "line1_wp_b": "wp2",
            "line2_wp_a": "wp3",
            "line2_wp_b": "wp4",
            "angle_degrees": 60.0,
        }
        assert ConstraintRegistry.validate_constraint_data(angle_data)


class TestConstraintCombinations:
    """Test combinations of different constraint types."""

    def test_mixed_constraint_validation(self):
        """Test that multiple constraint types can coexist."""
        constraints = []

        # Create various constraint types
        constraints.append(CollinearConstraint(wp_ids=["wp1", "wp2", "wp3"]))
        constraints.append(
            PerpendicularConstraint(
                line1_wp_a="wp4", line1_wp_b="wp5", line2_wp_a="wp6", line2_wp_b="wp7"
            )
        )
        constraints.append(
            ParallelConstraint(
                line1_wp_a="wp8", line1_wp_b="wp9", line2_wp_a="wp10", line2_wp_b="wp11"
            )
        )
        constraints.append(
            AngleConstraint(
                line1_wp_a="wp12",
                line1_wp_b="wp13",
                line2_wp_a="wp14",
                line2_wp_b="wp15",
                angle_degrees=45.0,
            )
        )
        constraints.append(
            FixedDistanceRatioConstraint(
                line1_wp_a="wp16",
                line1_wp_b="wp17",
                line2_wp_a="wp18",
                line2_wp_b="wp19",
                ratio=2.0,
            )
        )

        # All should validate successfully
        for constraint in constraints:
            constraint.validate_constraint()

        # Check types
        types = [c.constraint_type() for c in constraints]
        expected_types = [
            "collinear",
            "perpendicular",
            "parallel",
            "angle",
            "distance_ratio",
        ]
        assert types == expected_types
