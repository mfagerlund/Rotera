"""Polymorphic constraint models for Pictorigo backend."""

from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel, Field, field_validator


class Constraint(BaseModel, ABC):
    """Abstract base constraint for polymorphic constraint system."""

    id: str
    weight: float = 1.0
    enabled: bool = True

    @abstractmethod
    def constraint_type(self) -> str:
        """Get constraint type identifier."""
        pass

    @abstractmethod
    def validate_constraint_specific(self) -> None:
        """Perform constraint-specific validation."""
        pass


class ImagePointConstraint(Constraint):
    """Image point constraint for bundle adjustment."""

    world_point_id: str
    image_id: str
    camera_id: str
    u: float  # Observed pixel x
    v: float  # Observed pixel y

    def constraint_type(self) -> str:
        return "image_point"

    def validate_constraint_specific(self) -> None:
        # Image points have no additional validation beyond base model
        pass


class DistanceConstraint(Constraint):
    """Distance constraint between points."""

    point_a_id: str
    point_b_id: str
    target_distance: float

    @field_validator("target_distance")
    @classmethod
    def validate_target_distance(cls, v: float) -> float:
        if v < 0:
            raise ValueError("target_distance must be non-negative")
        return v

    def constraint_type(self) -> str:
        return "distance_point_point"

    def validate_constraint_specific(self) -> None:
        if self.point_a_id == self.point_b_id:
            raise ValueError("Distance constraint cannot have identical points")


class AngleConstraint(Constraint):
    """Angle constraint between three points."""

    point_a_id: str
    vertex_id: str
    point_c_id: str
    target_angle: float  # In degrees

    @field_validator("target_angle")
    @classmethod
    def validate_target_angle(cls, v: float) -> float:
        # Allow any angle value, but warn if outside normal range
        return v

    def constraint_type(self) -> str:
        return "angle_point_point_point"

    def validate_constraint_specific(self) -> None:
        unique_points = {self.point_a_id, self.vertex_id, self.point_c_id}
        if len(unique_points) != 3:
            raise ValueError("Angle constraint must have three different points")


class ParallelLinesConstraint(Constraint):
    """Parallel lines constraint."""

    line_a_id: str
    line_b_id: str

    def constraint_type(self) -> str:
        return "parallel_lines"

    def validate_constraint_specific(self) -> None:
        if self.line_a_id == self.line_b_id:
            raise ValueError("Parallel lines constraint cannot have identical lines")


class PerpendicularLinesConstraint(Constraint):
    """Perpendicular lines constraint."""

    line_a_id: str
    line_b_id: str

    def constraint_type(self) -> str:
        return "perpendicular_lines"

    def validate_constraint_specific(self) -> None:
        if self.line_a_id == self.line_b_id:
            raise ValueError(
                "Perpendicular lines constraint cannot have identical lines"
            )


class FixedPointConstraint(Constraint):
    """Fixed point constraint."""

    point_id: str
    target_xyz: list[float] = Field(min_length=3, max_length=3)

    @field_validator("target_xyz")
    @classmethod
    def validate_target_xyz(cls, v: list[float]) -> list[float]:
        if len(v) != 3:
            raise ValueError("target_xyz must have exactly 3 coordinates")
        for i, coord in enumerate(v):
            if not isinstance(coord, (int, float)) or not (-1e10 <= coord <= 1e10):
                raise ValueError(f"target_xyz[{i}] must be a finite number")
        return v

    def constraint_type(self) -> str:
        return "fixed_point"

    def validate_constraint_specific(self) -> None:
        # Fixed point constraints have no additional validation
        pass


class CollinearPointsConstraint(Constraint):
    """Collinear points constraint."""

    point_ids: list[str] = Field(min_length=3)

    @field_validator("point_ids")
    @classmethod
    def validate_point_ids(cls, v: list[str]) -> list[str]:
        if len(v) < 3:
            raise ValueError("Collinear points constraint requires at least 3 points")
        if len(set(v)) != len(v):
            raise ValueError("Collinear points constraint cannot have duplicate points")
        return v

    def constraint_type(self) -> str:
        return "collinear_points"

    def validate_constraint_specific(self) -> None:
        # Validation is handled by field validator
        pass


class CoplanarPointsConstraint(Constraint):
    """Coplanar points constraint."""

    point_ids: list[str] = Field(min_length=4)

    @field_validator("point_ids")
    @classmethod
    def validate_point_ids(cls, v: list[str]) -> list[str]:
        if len(v) < 4:
            raise ValueError("Coplanar points constraint requires at least 4 points")
        if len(set(v)) != len(v):
            raise ValueError("Coplanar points constraint cannot have duplicate points")
        return v

    def constraint_type(self) -> str:
        return "coplanar_points"

    def validate_constraint_specific(self) -> None:
        # Validation is handled by field validator
        pass


class EqualDistancesConstraint(Constraint):
    """Equal distances constraint."""

    distance_pairs: list[list[str]] = Field(min_length=2)

    @field_validator("distance_pairs")
    @classmethod
    def validate_distance_pairs(cls, v: list[list[str]]) -> list[list[str]]:
        if len(v) < 2:
            raise ValueError(
                "Equal distances constraint requires at least 2 distance pairs"
            )

        for i, pair in enumerate(v):
            if len(pair) != 2:
                raise ValueError(f"Distance pair {i} must contain exactly 2 point IDs")
            if pair[0] == pair[1]:
                raise ValueError(f"Distance pair {i} cannot have identical points")

        return v

    def constraint_type(self) -> str:
        return "equal_distances"

    def validate_constraint_specific(self) -> None:
        # Validation is handled by field validator
        pass


class EqualAnglesConstraint(Constraint):
    """Equal angles constraint."""

    angle_triplets: list[list[str]] = Field(min_length=2)

    @field_validator("angle_triplets")
    @classmethod
    def validate_angle_triplets(cls, v: list[list[str]]) -> list[list[str]]:
        if len(v) < 2:
            raise ValueError(
                "Equal angles constraint requires at least 2 angle triplets"
            )

        for i, triplet in enumerate(v):
            if len(triplet) != 3:
                raise ValueError(f"Angle triplet {i} must contain exactly 3 point IDs")
            if len(set(triplet)) != 3:
                raise ValueError(f"Angle triplet {i} cannot have duplicate points")

        return v

    def constraint_type(self) -> str:
        return "equal_angles"

    def validate_constraint_specific(self) -> None:
        # Validation is handled by field validator
        pass


# Map of constraint type names to classes
CONSTRAINT_CLASSES: dict[str, type] = {
    "image_point": ImagePointConstraint,
    "distance_point_point": DistanceConstraint,
    "angle_point_point_point": AngleConstraint,
    "parallel_lines": ParallelLinesConstraint,
    "perpendicular_lines": PerpendicularLinesConstraint,
    "fixed_point": FixedPointConstraint,
    "collinear_points": CollinearPointsConstraint,
    "coplanar_points": CoplanarPointsConstraint,
    "equal_distances": EqualDistancesConstraint,
    "equal_angles": EqualAnglesConstraint,
}


def create_constraint_from_type(constraint_type: str, **kwargs: Any) -> Constraint:
    """Create a constraint instance from type name."""
    if constraint_type not in CONSTRAINT_CLASSES:
        raise ValueError(f"Unknown constraint type: {constraint_type}")

    constraint_class: type[Constraint] = CONSTRAINT_CLASSES[constraint_type]
    constraint = constraint_class(**kwargs)

    # Run constraint-specific validation
    constraint.validate_constraint_specific()

    return constraint


def convert_frontend_constraint_to_backend(
    frontend_constraint: dict[str, Any],
) -> Constraint:
    """Convert frontend Constraint to backend constraint classes."""
    constraint_type = frontend_constraint.get("type")
    if not constraint_type:
        raise ValueError("Constraint must have a type")

    # Map frontend constraint to backend parameters
    backend_params = {
        "id": frontend_constraint["id"],
        "weight": frontend_constraint.get("parameters", {}).get("priority", 1.0),
        "enabled": frontend_constraint.get("isEnabled", True),
    }

    entities = frontend_constraint.get("entities", {})
    parameters = frontend_constraint.get("parameters", {})

    # Type-specific parameter mapping
    if constraint_type == "distance_point_point":
        points = entities.get("points", [])
        if len(points) >= 2:
            backend_params.update(
                {
                    "point_a_id": points[0],
                    "point_b_id": points[1],
                    "target_distance": parameters.get(
                        "targetValue", parameters.get("targetDistance", 1.0)
                    ),
                }
            )

    elif constraint_type == "angle_point_point_point":
        points = entities.get("points", [])
        if len(points) >= 3:
            backend_params.update(
                {
                    "point_a_id": points[0],
                    "vertex_id": points[1],
                    "point_c_id": points[2],
                    "target_angle": parameters.get(
                        "targetValue", parameters.get("targetAngle", 90.0)
                    ),
                }
            )

    elif constraint_type in ["parallel_lines", "perpendicular_lines"]:
        lines = entities.get("lines", [])
        if len(lines) >= 2:
            backend_params.update({"line_a_id": lines[0], "line_b_id": lines[1]})

    elif constraint_type == "fixed_point":
        points = entities.get("points", [])
        if len(points) >= 1:
            backend_params.update(
                {
                    "point_id": points[0],
                    "target_xyz": parameters.get(
                        "targetXyz",
                        [
                            parameters.get("x", 0.0),
                            parameters.get("y", 0.0),
                            parameters.get("z", 0.0),
                        ],
                    ),
                }
            )

    elif constraint_type == "collinear_points" or constraint_type == "coplanar_points":
        points = entities.get("points", [])
        backend_params["point_ids"] = points

    elif constraint_type == "equal_distances":
        backend_params["distance_pairs"] = parameters.get("distancePairs", [])

    elif constraint_type == "equal_angles":
        backend_params["angle_triplets"] = parameters.get("angleTriplets", [])

    return create_constraint_from_type(constraint_type, **backend_params)


def convert_backend_constraint_to_frontend(
    backend_constraint: Constraint,
) -> dict[str, Any]:
    """Convert backend constraint to frontend format."""
    base_data: dict[str, Any] = {
        "id": backend_constraint.id,
        "type": backend_constraint.constraint_type(),
        "isEnabled": backend_constraint.enabled,
        "parameters": {"priority": backend_constraint.weight},
        "entities": {},
    }

    # Type-specific conversion
    constraint_type = backend_constraint.constraint_type()

    if constraint_type == "distance_point_point" and isinstance(
        backend_constraint, DistanceConstraint
    ):
        base_data["entities"]["points"] = [
            backend_constraint.point_a_id,
            backend_constraint.point_b_id,
        ]
        base_data["parameters"]["targetDistance"] = backend_constraint.target_distance

    elif constraint_type == "angle_point_point_point" and isinstance(
        backend_constraint, AngleConstraint
    ):
        base_data["entities"]["points"] = [
            backend_constraint.point_a_id,
            backend_constraint.vertex_id,
            backend_constraint.point_c_id,
        ]
        base_data["parameters"]["targetAngle"] = backend_constraint.target_angle

    elif (
        constraint_type == "parallel_lines"
        and isinstance(backend_constraint, ParallelLinesConstraint)
    ) or (
        constraint_type == "perpendicular_lines"
        and isinstance(backend_constraint, PerpendicularLinesConstraint)
    ):
        base_data["entities"]["lines"] = [
            backend_constraint.line_a_id,
            backend_constraint.line_b_id,
        ]

    elif constraint_type == "fixed_point" and isinstance(
        backend_constraint, FixedPointConstraint
    ):
        base_data["entities"]["points"] = [backend_constraint.point_id]
        base_data["parameters"]["targetXyz"] = backend_constraint.target_xyz

    elif (
        constraint_type == "collinear_points"
        and isinstance(backend_constraint, CollinearPointsConstraint)
    ) or (
        constraint_type == "coplanar_points"
        and isinstance(backend_constraint, CoplanarPointsConstraint)
    ):
        base_data["entities"]["points"] = backend_constraint.point_ids

    elif constraint_type == "equal_distances" and isinstance(
        backend_constraint, EqualDistancesConstraint
    ):
        # Extract all unique points from distance pairs
        all_points = set()
        for pair in backend_constraint.distance_pairs:
            all_points.update(pair)
        base_data["entities"]["points"] = list(all_points)
        base_data["parameters"]["distancePairs"] = backend_constraint.distance_pairs

    elif constraint_type == "equal_angles" and isinstance(
        backend_constraint, EqualAnglesConstraint
    ):
        # Extract all unique points from angle triplets
        all_points = set()
        for triplet in backend_constraint.angle_triplets:
            all_points.update(triplet)
        base_data["entities"]["points"] = list(all_points)
        base_data["parameters"]["angleTriplets"] = backend_constraint.angle_triplets

    return base_data


# Utility functions for type checking
def is_distance_constraint(constraint: Constraint) -> bool:
    """Check if constraint is a distance constraint."""
    return isinstance(constraint, DistanceConstraint)


def is_angle_constraint(constraint: Constraint) -> bool:
    """Check if constraint is an angle constraint."""
    return isinstance(constraint, AngleConstraint)


def is_line_constraint(constraint: Constraint) -> bool:
    """Check if constraint involves lines."""
    return isinstance(
        constraint, (ParallelLinesConstraint, PerpendicularLinesConstraint)
    )


def is_point_constraint(constraint: Constraint) -> bool:
    """Check if constraint involves points."""
    return isinstance(
        constraint,
        (
            DistanceConstraint,
            AngleConstraint,
            FixedPointConstraint,
            CollinearPointsConstraint,
            CoplanarPointsConstraint,
        ),
    )
