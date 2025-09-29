"""Tests for polymorphic constraint system with comprehensive DTO conversion testing."""

import pytest
from pydantic import ValidationError

from pictorigo.core.models.constraints import (
    AngleConstraint,
    CollinearPointsConstraint,
    Constraint,
    CoplanarPointsConstraint,
    DistanceConstraint,
    EqualAnglesConstraint,
    EqualDistancesConstraint,
    FixedPointConstraint,
    ParallelLinesConstraint,
    PerpendicularLinesConstraint,
    convert_backend_constraint_to_frontend,
    convert_frontend_constraint_to_backend,
    create_constraint_from_type,
)


class TestPolymorphicConstraintSystem:
    """Test the complete polymorphic constraint system."""

    def test_all_constraint_types_inherit_from_constraint(self):
        """Verify all constraint types inherit from base Constraint class."""
        constraint_classes = [
            DistanceConstraint,
            AngleConstraint,
            ParallelLinesConstraint,
            PerpendicularLinesConstraint,
            FixedPointConstraint,
            CollinearPointsConstraint,
            CoplanarPointsConstraint,
            EqualDistancesConstraint,
            EqualAnglesConstraint,
        ]

        for constraint_class in constraint_classes:
            assert issubclass(constraint_class, Constraint)
            # Test that abstract methods are implemented
            assert hasattr(constraint_class, "constraint_type")
            assert hasattr(constraint_class, "validate_constraint_specific")


class TestDistanceConstraintRoundTrip:
    """Test DTO conversion for DistanceConstraint."""

    def test_distance_constraint_dto_round_trip(self):
        """Test frontend -> backend -> frontend conversion for DistanceConstraint."""
        # Original frontend constraint
        frontend_data = {
            "id": "dist_test",
            "type": "distance_point_point",
            "entities": {"points": ["p1", "p2"]},
            "parameters": {"targetValue": 5.5, "tolerance": 0.1, "priority": 8.0},
            "isEnabled": True,
        }

        # Convert to backend
        backend_constraint = convert_frontend_constraint_to_backend(frontend_data)
        assert isinstance(backend_constraint, DistanceConstraint)
        assert backend_constraint.id == "dist_test"
        assert backend_constraint.point_a_id == "p1"
        assert backend_constraint.point_b_id == "p2"
        assert backend_constraint.target_distance == 5.5
        assert backend_constraint.weight == 8.0
        assert backend_constraint.enabled is True

        # Convert back to frontend
        converted_frontend = convert_backend_constraint_to_frontend(backend_constraint)
        assert converted_frontend["id"] == "dist_test"
        assert converted_frontend["type"] == "distance_point_point"
        assert converted_frontend["entities"]["points"] == ["p1", "p2"]
        assert converted_frontend["parameters"]["targetDistance"] == 5.5
        assert converted_frontend["parameters"]["priority"] == 8.0
        assert converted_frontend["isEnabled"] is True


class TestAngleConstraintRoundTrip:
    """Test DTO conversion for AngleConstraint."""

    def test_angle_constraint_dto_round_trip(self):
        """Test frontend -> backend -> frontend conversion for AngleConstraint."""
        frontend_data = {
            "id": "angle_test",
            "type": "angle_point_point_point",
            "entities": {"points": ["p1", "p2", "p3"]},
            "parameters": {"targetValue": 90.0, "priority": 5.0},
            "isEnabled": True,
        }

        backend_constraint = convert_frontend_constraint_to_backend(frontend_data)
        assert isinstance(backend_constraint, AngleConstraint)
        assert backend_constraint.point_a_id == "p1"
        assert backend_constraint.vertex_id == "p2"
        assert backend_constraint.point_c_id == "p3"
        assert backend_constraint.target_angle == 90.0

        converted_frontend = convert_backend_constraint_to_frontend(backend_constraint)
        assert converted_frontend["type"] == "angle_point_point_point"
        assert converted_frontend["entities"]["points"] == ["p1", "p2", "p3"]
        assert converted_frontend["parameters"]["targetAngle"] == 90.0


class TestParallelLinesConstraintRoundTrip:
    """Test DTO conversion for ParallelLinesConstraint."""

    def test_parallel_lines_constraint_dto_round_trip(self):
        """Test frontend -> backend -> frontend conversion for ParallelLinesConstraint."""
        frontend_data = {
            "id": "parallel_test",
            "type": "parallel_lines",
            "entities": {"lines": ["l1", "l2"]},
            "parameters": {"priority": 3.0},
            "isEnabled": True,
        }

        backend_constraint = convert_frontend_constraint_to_backend(frontend_data)
        assert isinstance(backend_constraint, ParallelLinesConstraint)
        assert backend_constraint.line_a_id == "l1"
        assert backend_constraint.line_b_id == "l2"

        converted_frontend = convert_backend_constraint_to_frontend(backend_constraint)
        assert converted_frontend["type"] == "parallel_lines"
        assert converted_frontend["entities"]["lines"] == ["l1", "l2"]


class TestPerpendicularLinesConstraintRoundTrip:
    """Test DTO conversion for PerpendicularLinesConstraint."""

    def test_perpendicular_lines_constraint_dto_round_trip(self):
        """Test frontend -> backend -> frontend conversion for PerpendicularLines."""
        frontend_data = {
            "id": "perp_test",
            "type": "perpendicular_lines",
            "entities": {"lines": ["l1", "l2"]},
            "parameters": {},
            "isEnabled": True,
        }

        backend_constraint = convert_frontend_constraint_to_backend(frontend_data)
        assert isinstance(backend_constraint, PerpendicularLinesConstraint)
        assert backend_constraint.line_a_id == "l1"
        assert backend_constraint.line_b_id == "l2"

        converted_frontend = convert_backend_constraint_to_frontend(backend_constraint)
        assert converted_frontend["type"] == "perpendicular_lines"
        assert converted_frontend["entities"]["lines"] == ["l1", "l2"]


class TestFixedPointConstraintRoundTrip:
    """Test DTO conversion for FixedPointConstraint."""

    def test_fixed_point_constraint_dto_round_trip(self):
        """Test frontend -> backend -> frontend conversion for FixedPointConstraint."""
        frontend_data = {
            "id": "fixed_test",
            "type": "fixed_point",
            "entities": {"points": ["p1"]},
            "parameters": {"x": 1.5, "y": 2.5, "z": 3.5},
            "isEnabled": True,
        }

        backend_constraint = convert_frontend_constraint_to_backend(frontend_data)
        assert isinstance(backend_constraint, FixedPointConstraint)
        assert backend_constraint.point_id == "p1"
        assert backend_constraint.target_xyz == [1.5, 2.5, 3.5]

        converted_frontend = convert_backend_constraint_to_frontend(backend_constraint)
        assert converted_frontend["type"] == "fixed_point"
        assert converted_frontend["entities"]["points"] == ["p1"]
        assert converted_frontend["parameters"]["targetXyz"] == [1.5, 2.5, 3.5]

    def test_fixed_point_constraint_with_target_xyz(self):
        """Test fixed point constraint with targetXyz parameter."""
        frontend_data = {
            "id": "fixed_test2",
            "type": "fixed_point",
            "entities": {"points": ["p1"]},
            "parameters": {"targetXyz": [4.0, 5.0, 6.0]},
            "isEnabled": True,
        }

        backend_constraint = convert_frontend_constraint_to_backend(frontend_data)
        assert backend_constraint.target_xyz == [4.0, 5.0, 6.0]


class TestCollinearPointsConstraintRoundTrip:
    """Test DTO conversion for CollinearPointsConstraint."""

    def test_collinear_points_constraint_dto_round_trip(self):
        """Test frontend -> backend -> frontend conversion for CollinearPoints."""
        frontend_data = {
            "id": "collinear_test",
            "type": "collinear_points",
            "entities": {"points": ["p1", "p2", "p3", "p4"]},
            "parameters": {},
            "isEnabled": True,
        }

        backend_constraint = convert_frontend_constraint_to_backend(frontend_data)
        assert isinstance(backend_constraint, CollinearPointsConstraint)
        assert backend_constraint.point_ids == ["p1", "p2", "p3", "p4"]

        converted_frontend = convert_backend_constraint_to_frontend(backend_constraint)
        assert converted_frontend["type"] == "collinear_points"
        assert converted_frontend["entities"]["points"] == ["p1", "p2", "p3", "p4"]


class TestCoplanarPointsConstraintRoundTrip:
    """Test DTO conversion for CoplanarPointsConstraint."""

    def test_coplanar_points_constraint_dto_round_trip(self):
        """Test frontend -> backend -> frontend conversion for CoplanarPoints."""
        frontend_data = {
            "id": "coplanar_test",
            "type": "coplanar_points",
            "entities": {"points": ["p1", "p2", "p3", "p4", "p5"]},
            "parameters": {},
            "isEnabled": True,
        }

        backend_constraint = convert_frontend_constraint_to_backend(frontend_data)
        assert isinstance(backend_constraint, CoplanarPointsConstraint)
        assert backend_constraint.point_ids == ["p1", "p2", "p3", "p4", "p5"]

        converted_frontend = convert_backend_constraint_to_frontend(backend_constraint)
        assert converted_frontend["type"] == "coplanar_points"
        assert converted_frontend["entities"]["points"] == [
            "p1",
            "p2",
            "p3",
            "p4",
            "p5",
        ]


class TestEqualDistancesConstraintRoundTrip:
    """Test DTO conversion for EqualDistancesConstraint."""

    def test_equal_distances_constraint_dto_round_trip(self):
        """Test frontend -> backend -> frontend conversion for EqualDistances."""
        distance_pairs = [["p1", "p2"], ["p3", "p4"], ["p5", "p6"]]
        frontend_data = {
            "id": "eq_dist_test",
            "type": "equal_distances",
            "entities": {"points": ["p1", "p2", "p3", "p4", "p5", "p6"]},
            "parameters": {"distancePairs": distance_pairs},
            "isEnabled": True,
        }

        backend_constraint = convert_frontend_constraint_to_backend(frontend_data)
        assert isinstance(backend_constraint, EqualDistancesConstraint)
        assert backend_constraint.distance_pairs == distance_pairs

        converted_frontend = convert_backend_constraint_to_frontend(backend_constraint)
        assert converted_frontend["type"] == "equal_distances"
        assert converted_frontend["parameters"]["distancePairs"] == distance_pairs
        # Check that all points from pairs are included
        expected_points = {"p1", "p2", "p3", "p4", "p5", "p6"}
        actual_points = set(converted_frontend["entities"]["points"])
        assert expected_points == actual_points


class TestEqualAnglesConstraintRoundTrip:
    """Test DTO conversion for EqualAnglesConstraint."""

    def test_equal_angles_constraint_dto_round_trip(self):
        """Test frontend -> backend -> frontend conversion for EqualAnglesConstraint."""
        angle_triplets = [["p1", "p2", "p3"], ["p4", "p5", "p6"]]
        frontend_data = {
            "id": "eq_angle_test",
            "type": "equal_angles",
            "entities": {"points": ["p1", "p2", "p3", "p4", "p5", "p6"]},
            "parameters": {"angleTriplets": angle_triplets},
            "isEnabled": True,
        }

        backend_constraint = convert_frontend_constraint_to_backend(frontend_data)
        assert isinstance(backend_constraint, EqualAnglesConstraint)
        assert backend_constraint.angle_triplets == angle_triplets

        converted_frontend = convert_backend_constraint_to_frontend(backend_constraint)
        assert converted_frontend["type"] == "equal_angles"
        assert converted_frontend["parameters"]["angleTriplets"] == angle_triplets
        # Check that all points from triplets are included
        expected_points = {"p1", "p2", "p3", "p4", "p5", "p6"}
        actual_points = set(converted_frontend["entities"]["points"])
        assert expected_points == actual_points


class TestConstraintValidation:
    """Test constraint validation logic."""

    def test_distance_constraint_validation_identical_points(self):
        """Test distance constraint rejects identical points."""
        constraint = DistanceConstraint(
            id="test",
            point_a_id="p1",
            point_b_id="p1",  # Same point
            target_distance=5.0,
        )

        with pytest.raises(ValueError, match="identical points"):
            constraint.validate_constraint_specific()

    def test_angle_constraint_validation_identical_points(self):
        """Test angle constraint rejects duplicate points."""
        constraint = AngleConstraint(
            id="test",
            point_a_id="p1",
            vertex_id="p1",  # Same as point_a_id
            point_c_id="p2",
            target_angle=90.0,
        )

        with pytest.raises(ValueError, match="three different points"):
            constraint.validate_constraint_specific()

    def test_fixed_point_constraint_invalid_xyz(self):
        """Test fixed point constraint validates xyz coordinates."""
        with pytest.raises(ValidationError):
            FixedPointConstraint(
                id="test", point_id="p1", target_xyz=[1.0, 2.0]  # Too few coordinates
            )

    def test_collinear_points_constraint_duplicate_points(self):
        """Test collinear points constraint rejects duplicate points."""
        with pytest.raises(ValidationError):
            CollinearPointsConstraint(
                id="test", point_ids=["p1", "p2", "p1"]  # Duplicate p1
            )

    def test_equal_distances_constraint_identical_pair_points(self):
        """Test equal distances constraint rejects identical points in pairs."""
        with pytest.raises(ValidationError):
            EqualDistancesConstraint(
                id="test",
                distance_pairs=[["p1", "p2"], ["p3", "p3"]],  # p3, p3 is invalid
            )


class TestConstraintFactoryComplete:
    """Test complete constraint factory functionality."""

    def test_factory_creates_all_constraint_types(self):
        """Test factory can create all supported constraint types."""
        test_cases = [
            (
                "distance_point_point",
                DistanceConstraint,
                {"point_a_id": "p1", "point_b_id": "p2", "target_distance": 1.0},
            ),
            (
                "angle_point_point_point",
                AngleConstraint,
                {
                    "point_a_id": "p1",
                    "vertex_id": "p2",
                    "point_c_id": "p3",
                    "target_angle": 90.0,
                },
            ),
            (
                "parallel_lines",
                ParallelLinesConstraint,
                {"line_a_id": "l1", "line_b_id": "l2"},
            ),
            (
                "perpendicular_lines",
                PerpendicularLinesConstraint,
                {"line_a_id": "l1", "line_b_id": "l2"},
            ),
            (
                "fixed_point",
                FixedPointConstraint,
                {"point_id": "p1", "target_xyz": [1.0, 2.0, 3.0]},
            ),
            (
                "collinear_points",
                CollinearPointsConstraint,
                {"point_ids": ["p1", "p2", "p3"]},
            ),
            (
                "coplanar_points",
                CoplanarPointsConstraint,
                {"point_ids": ["p1", "p2", "p3", "p4"]},
            ),
            (
                "equal_distances",
                EqualDistancesConstraint,
                {"distance_pairs": [["p1", "p2"], ["p3", "p4"]]},
            ),
            (
                "equal_angles",
                EqualAnglesConstraint,
                {"angle_triplets": [["p1", "p2", "p3"], ["p4", "p5", "p6"]]},
            ),
        ]

        for constraint_type, expected_class, kwargs in test_cases:
            constraint = create_constraint_from_type(
                constraint_type, id=f"test_{constraint_type}", **kwargs
            )
            assert isinstance(constraint, expected_class)
            assert constraint.constraint_type() == constraint_type

    def test_factory_unknown_constraint_type(self):
        """Test factory raises error for unknown constraint type."""
        with pytest.raises(ValueError, match="Unknown constraint type"):
            create_constraint_from_type("unknown_type", id="test")


class TestBackendToFrontendEdgeCases:
    """Test edge cases in backend to frontend conversion."""

    def test_backend_to_frontend_all_constraint_types(self):
        """Test backend to frontend conversion for all constraint types."""
        # Create one of each constraint type
        constraints = [
            DistanceConstraint(
                id="d1", point_a_id="p1", point_b_id="p2", target_distance=5.0
            ),
            AngleConstraint(
                id="a1",
                point_a_id="p1",
                vertex_id="p2",
                point_c_id="p3",
                target_angle=90.0,
            ),
            ParallelLinesConstraint(id="pl1", line_a_id="l1", line_b_id="l2"),
            PerpendicularLinesConstraint(id="pr1", line_a_id="l1", line_b_id="l2"),
            FixedPointConstraint(id="f1", point_id="p1", target_xyz=[1.0, 2.0, 3.0]),
            CollinearPointsConstraint(id="cl1", point_ids=["p1", "p2", "p3"]),
            CoplanarPointsConstraint(id="cp1", point_ids=["p1", "p2", "p3", "p4"]),
            EqualDistancesConstraint(
                id="ed1", distance_pairs=[["p1", "p2"], ["p3", "p4"]]
            ),
            EqualAnglesConstraint(
                id="ea1", angle_triplets=[["p1", "p2", "p3"], ["p4", "p5", "p6"]]
            ),
        ]

        for constraint in constraints:
            frontend_data = convert_backend_constraint_to_frontend(constraint)
            assert frontend_data["id"] == constraint.id
            assert frontend_data["type"] == constraint.constraint_type()
            assert "entities" in frontend_data
            assert "parameters" in frontend_data
            assert "isEnabled" in frontend_data


if __name__ == "__main__":
    pytest.main([__file__])
