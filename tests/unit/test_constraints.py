"""Tests for constraint models."""

import pytest
from pydantic import ValidationError

from pictorigo.core.models.constraints import (
    AngleConstraint,
    CollinearPointsConstraint,
    CoplanarPointsConstraint,
    DistanceConstraint,
    EqualAnglesConstraint,
    EqualDistancesConstraint,
    FixedPointConstraint,
    ImagePointConstraint,
    ParallelLinesConstraint,
    PerpendicularLinesConstraint,
    convert_frontend_constraint_to_backend,
    create_constraint_from_type,
)
from pictorigo.core.models.entities import (
    CONSTRAINT_STATUS_TYPES,
    CONSTRAINT_TYPES,
    Constraint,
)


class TestConstraintEntity:
    """Test the main Constraint entity model."""

    def test_constraint_creation(self):
        """Test basic constraint creation."""
        constraint = Constraint(
            id="c1",
            name="Test Constraint",
            type="distance_point_point",
            status="satisfied",
            entities={"points": ["wp1", "wp2"]},
            parameters={"targetValue": 5.0},
        )
        assert constraint.id == "c1"
        assert constraint.name == "Test Constraint"
        assert constraint.type == "distance_point_point"
        assert constraint.status == "satisfied"
        assert constraint.is_enabled is True
        assert constraint.is_driving is False

    def test_constraint_invalid_type(self):
        """Test validation of constraint type."""
        with pytest.raises(ValidationError):
            Constraint(
                id="c1",
                name="Invalid",
                type="invalid_type",  # Invalid type
                status="satisfied",
                entities={"points": ["wp1", "wp2"]},
                parameters={},
            )

    def test_constraint_invalid_status(self):
        """Test validation of constraint status."""
        with pytest.raises(ValidationError):
            Constraint(
                id="c1",
                name="Invalid Status",
                type="distance_point_point",
                status="invalid_status",  # Invalid status
                entities={"points": ["wp1", "wp2"]},
                parameters={},
            )

    def test_constraint_get_methods(self):
        """Test constraint getter methods."""
        constraint = Constraint(
            id="c1",
            name="Test",
            type="distance_point_point",
            status="satisfied",
            entities={"points": ["wp1", "wp2"], "lines": ["l1"], "planes": ["p1"]},
            parameters={"targetValue": 5.0},
        )

        assert constraint.get_point_ids() == ["wp1", "wp2"]
        assert constraint.get_line_ids() == ["l1"]
        assert constraint.get_plane_ids() == ["p1"]
        assert constraint.constraint_type() == "distance_point_point"

    def test_constraint_types_constants(self):
        """Test constraint type constants."""
        assert "distance_point_point" in CONSTRAINT_TYPES
        assert "angle_point_point_point" in CONSTRAINT_TYPES
        assert "parallel_lines" in CONSTRAINT_TYPES
        assert "fixed_point" in CONSTRAINT_TYPES

        assert "satisfied" in CONSTRAINT_STATUS_TYPES
        assert "violated" in CONSTRAINT_STATUS_TYPES
        assert "warning" in CONSTRAINT_STATUS_TYPES
        assert "disabled" in CONSTRAINT_STATUS_TYPES


class TestImagePointConstraint:
    """Test ImagePointConstraint model."""

    def test_image_point_constraint_creation(self):
        """Test basic image point constraint creation."""
        constraint = ImagePointConstraint(
            id="ip1",
            world_point_id="wp1",
            image_id="img1",
            camera_id="cam1",
            u=100.0,
            v=200.0,
        )
        assert constraint.id == "ip1"
        assert constraint.world_point_id == "wp1"
        assert constraint.image_id == "img1"
        assert constraint.camera_id == "cam1"
        assert constraint.u == 100.0
        assert constraint.v == 200.0
        assert constraint.weight == 1.0
        assert constraint.enabled is True
        assert constraint.constraint_type() == "image_point"

    def test_image_point_constraint_with_custom_weight(self):
        """Test image point constraint with custom weight."""
        constraint = ImagePointConstraint(
            id="ip1",
            world_point_id="wp1",
            image_id="img1",
            camera_id="cam1",
            u=100.0,
            v=200.0,
            weight=0.5,
        )
        assert constraint.weight == 0.5


class TestDistanceConstraint:
    """Test DistanceConstraint model."""

    def test_distance_constraint_creation(self):
        """Test basic distance constraint creation."""
        constraint = DistanceConstraint(
            id="d1", point_a_id="wp1", point_b_id="wp2", target_distance=5.0
        )
        assert constraint.id == "d1"
        assert constraint.point_a_id == "wp1"
        assert constraint.point_b_id == "wp2"
        assert constraint.target_distance == 5.0
        assert constraint.constraint_type() == "distance_point_point"

    def test_distance_constraint_negative_distance(self):
        """Test validation of non-negative distance."""
        with pytest.raises(ValidationError):
            DistanceConstraint(
                id="d1",
                point_a_id="wp1",
                point_b_id="wp2",
                target_distance=-1.0,  # Must be non-negative
            )


class TestAngleConstraint:
    """Test AngleConstraint model."""

    def test_angle_constraint_creation(self):
        """Test basic angle constraint creation."""
        constraint = AngleConstraint(
            id="a1",
            point_a_id="wp1",
            vertex_id="wp2",
            point_c_id="wp3",
            target_angle=90.0,
        )
        assert constraint.id == "a1"
        assert constraint.point_a_id == "wp1"
        assert constraint.vertex_id == "wp2"
        assert constraint.point_c_id == "wp3"
        assert constraint.target_angle == 90.0
        assert constraint.constraint_type() == "angle_point_point_point"


class TestParallelLinesConstraint:
    """Test ParallelLinesConstraint model."""

    def test_parallel_lines_constraint_creation(self):
        """Test basic parallel lines constraint creation."""
        constraint = ParallelLinesConstraint(id="pl1", line_a_id="l1", line_b_id="l2")
        assert constraint.id == "pl1"
        assert constraint.line_a_id == "l1"
        assert constraint.line_b_id == "l2"
        assert constraint.constraint_type() == "parallel_lines"


class TestPerpendicularLinesConstraint:
    """Test PerpendicularLinesConstraint model."""

    def test_perpendicular_lines_constraint_creation(self):
        """Test basic perpendicular lines constraint creation."""
        constraint = PerpendicularLinesConstraint(
            id="perp1", line_a_id="l1", line_b_id="l2"
        )
        assert constraint.id == "perp1"
        assert constraint.line_a_id == "l1"
        assert constraint.line_b_id == "l2"
        assert constraint.constraint_type() == "perpendicular_lines"


class TestFixedPointConstraint:
    """Test FixedPointConstraint model."""

    def test_fixed_point_constraint_creation(self):
        """Test basic fixed point constraint creation."""
        constraint = FixedPointConstraint(
            id="fp1", point_id="wp1", target_xyz=[1.0, 2.0, 3.0]
        )
        assert constraint.id == "fp1"
        assert constraint.point_id == "wp1"
        assert constraint.target_xyz == [1.0, 2.0, 3.0]
        assert constraint.constraint_type() == "fixed_point"

    def test_fixed_point_constraint_invalid_xyz_length(self):
        """Test validation of xyz coordinate length."""
        with pytest.raises(ValidationError):
            FixedPointConstraint(
                id="fp1", point_id="wp1", target_xyz=[1.0, 2.0]  # Too few coordinates
            )


class TestCollinearPointsConstraint:
    """Test CollinearPointsConstraint model."""

    def test_collinear_points_constraint_creation(self):
        """Test basic collinear points constraint creation."""
        constraint = CollinearPointsConstraint(
            id="col1", point_ids=["wp1", "wp2", "wp3"]
        )
        assert constraint.id == "col1"
        assert constraint.point_ids == ["wp1", "wp2", "wp3"]
        assert constraint.constraint_type() == "collinear_points"

    def test_collinear_points_constraint_minimum_points(self):
        """Test validation of minimum number of points."""
        with pytest.raises(ValidationError):
            CollinearPointsConstraint(
                id="col1", point_ids=["wp1", "wp2"]  # Too few points
            )


class TestCoplanarPointsConstraint:
    """Test CoplanarPointsConstraint model."""

    def test_coplanar_points_constraint_creation(self):
        """Test basic coplanar points constraint creation."""
        constraint = CoplanarPointsConstraint(
            id="cop1", point_ids=["wp1", "wp2", "wp3", "wp4"]
        )
        assert constraint.id == "cop1"
        assert constraint.point_ids == ["wp1", "wp2", "wp3", "wp4"]
        assert constraint.constraint_type() == "coplanar_points"

    def test_coplanar_points_constraint_minimum_points(self):
        """Test validation of minimum number of points."""
        with pytest.raises(ValidationError):
            CoplanarPointsConstraint(
                id="cop1", point_ids=["wp1", "wp2", "wp3"]  # Too few points
            )


class TestEqualDistancesConstraint:
    """Test EqualDistancesConstraint model."""

    def test_equal_distances_constraint_creation(self):
        """Test basic equal distances constraint creation."""
        constraint = EqualDistancesConstraint(
            id="ed1", distance_pairs=[["wp1", "wp2"], ["wp3", "wp4"]]
        )
        assert constraint.id == "ed1"
        assert len(constraint.distance_pairs) == 2
        assert constraint.distance_pairs[0] == ["wp1", "wp2"]
        assert constraint.distance_pairs[1] == ["wp3", "wp4"]
        assert constraint.constraint_type() == "equal_distances"

    def test_equal_distances_constraint_minimum_pairs(self):
        """Test validation of minimum number of pairs."""
        with pytest.raises(ValidationError):
            EqualDistancesConstraint(
                id="ed1", distance_pairs=[["wp1", "wp2"]]  # Too few pairs
            )


class TestEqualAnglesConstraint:
    """Test EqualAnglesConstraint model."""

    def test_equal_angles_constraint_creation(self):
        """Test basic equal angles constraint creation."""
        constraint = EqualAnglesConstraint(
            id="ea1", angle_triplets=[["wp1", "wp2", "wp3"], ["wp4", "wp5", "wp6"]]
        )
        assert constraint.id == "ea1"
        assert len(constraint.angle_triplets) == 2
        assert constraint.angle_triplets[0] == ["wp1", "wp2", "wp3"]
        assert constraint.angle_triplets[1] == ["wp4", "wp5", "wp6"]
        assert constraint.constraint_type() == "equal_angles"

    def test_equal_angles_constraint_minimum_triplets(self):
        """Test validation of minimum number of triplets."""
        with pytest.raises(ValidationError):
            EqualAnglesConstraint(
                id="ea1", angle_triplets=[["wp1", "wp2", "wp3"]]  # Too few triplets
            )


class TestConstraintFactory:
    """Test constraint factory functions."""

    def test_create_constraint_from_type_distance(self):
        """Test creating distance constraint from type."""
        constraint = create_constraint_from_type(
            "distance_point_point",
            id="d1",
            point_a_id="wp1",
            point_b_id="wp2",
            target_distance=5.0,
        )
        assert isinstance(constraint, DistanceConstraint)
        assert constraint.id == "d1"
        assert constraint.target_distance == 5.0

    def test_create_constraint_from_type_angle(self):
        """Test creating angle constraint from type."""
        constraint = create_constraint_from_type(
            "angle_point_point_point",
            id="a1",
            point_a_id="wp1",
            vertex_id="wp2",
            point_c_id="wp3",
            target_angle=90.0,
        )
        assert isinstance(constraint, AngleConstraint)
        assert constraint.target_angle == 90.0

    def test_create_constraint_from_type_parallel_lines(self):
        """Test creating parallel lines constraint from type."""
        constraint = create_constraint_from_type(
            "parallel_lines", id="pl1", line_a_id="l1", line_b_id="l2"
        )
        assert isinstance(constraint, ParallelLinesConstraint)
        assert constraint.line_a_id == "l1"
        assert constraint.line_b_id == "l2"

    def test_create_constraint_from_type_unknown(self):
        """Test error handling for unknown constraint type."""
        with pytest.raises(ValueError):
            create_constraint_from_type("unknown_type", id="u1")


class TestFrontendConstraintConversion:
    """Test frontend constraint conversion."""

    def test_convert_frontend_distance_constraint(self):
        """Test converting frontend distance constraint."""
        frontend_constraint = {
            "id": "c1",
            "type": "distance_point_point",
            "entities": {"points": ["wp1", "wp2"]},
            "parameters": {"targetValue": 5.0, "priority": 2.0},
            "isEnabled": True,
        }

        backend_constraint = convert_frontend_constraint_to_backend(frontend_constraint)
        assert isinstance(backend_constraint, DistanceConstraint)
        assert backend_constraint.id == "c1"
        assert backend_constraint.point_a_id == "wp1"
        assert backend_constraint.point_b_id == "wp2"
        assert backend_constraint.target_distance == 5.0
        assert backend_constraint.weight == 2.0
        assert backend_constraint.enabled is True

    def test_convert_frontend_angle_constraint(self):
        """Test converting frontend angle constraint."""
        frontend_constraint = {
            "id": "c1",
            "type": "angle_point_point_point",
            "entities": {"points": ["wp1", "wp2", "wp3"]},
            "parameters": {"targetValue": 90.0},
            "isEnabled": True,
        }

        backend_constraint = convert_frontend_constraint_to_backend(frontend_constraint)
        assert isinstance(backend_constraint, AngleConstraint)
        assert backend_constraint.point_a_id == "wp1"
        assert backend_constraint.vertex_id == "wp2"
        assert backend_constraint.point_c_id == "wp3"
        assert backend_constraint.target_angle == 90.0

    def test_convert_frontend_parallel_lines_constraint(self):
        """Test converting frontend parallel lines constraint."""
        frontend_constraint = {
            "id": "c1",
            "type": "parallel_lines",
            "entities": {"lines": ["l1", "l2"]},
            "parameters": {},
            "isEnabled": True,
        }

        backend_constraint = convert_frontend_constraint_to_backend(frontend_constraint)
        assert isinstance(backend_constraint, ParallelLinesConstraint)
        assert backend_constraint.line_a_id == "l1"
        assert backend_constraint.line_b_id == "l2"

    def test_convert_frontend_perpendicular_lines_constraint(self):
        """Test converting frontend perpendicular lines constraint."""
        frontend_constraint = {
            "id": "c1",
            "type": "perpendicular_lines",
            "entities": {"lines": ["l1", "l2"]},
            "parameters": {},
            "isEnabled": True,
        }

        backend_constraint = convert_frontend_constraint_to_backend(frontend_constraint)
        assert isinstance(backend_constraint, PerpendicularLinesConstraint)
        assert backend_constraint.line_a_id == "l1"
        assert backend_constraint.line_b_id == "l2"

    def test_convert_frontend_fixed_point_constraint(self):
        """Test converting frontend fixed point constraint."""
        frontend_constraint = {
            "id": "c1",
            "type": "fixed_point",
            "entities": {"points": ["wp1"]},
            "parameters": {"x": 1.0, "y": 2.0, "z": 3.0},
            "isEnabled": True,
        }

        backend_constraint = convert_frontend_constraint_to_backend(frontend_constraint)
        assert isinstance(backend_constraint, FixedPointConstraint)
        assert backend_constraint.point_id == "wp1"
        assert backend_constraint.target_xyz == [1.0, 2.0, 3.0]

    def test_convert_frontend_collinear_points_constraint(self):
        """Test converting frontend collinear points constraint."""
        frontend_constraint = {
            "id": "c1",
            "type": "collinear_points",
            "entities": {"points": ["wp1", "wp2", "wp3"]},
            "parameters": {},
            "isEnabled": True,
        }

        backend_constraint = convert_frontend_constraint_to_backend(frontend_constraint)
        assert isinstance(backend_constraint, CollinearPointsConstraint)
        assert backend_constraint.point_ids == ["wp1", "wp2", "wp3"]

    def test_convert_frontend_constraint_missing_type(self):
        """Test error handling for missing constraint type."""
        frontend_constraint = {
            "id": "c1",
            "entities": {"points": ["wp1", "wp2"]},
            "parameters": {},
            "isEnabled": True,
        }

        with pytest.raises(ValueError):
            convert_frontend_constraint_to_backend(frontend_constraint)

    def test_convert_frontend_constraint_unknown_type(self):
        """Test error handling for unknown constraint type."""
        frontend_constraint = {
            "id": "c1",
            "type": "unknown_constraint_type",
            "entities": {"points": ["wp1", "wp2"]},
            "parameters": {},
            "isEnabled": True,
        }

        with pytest.raises(ValueError):
            convert_frontend_constraint_to_backend(frontend_constraint)
