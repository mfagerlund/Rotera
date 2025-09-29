"""Constraint models for Pictorigo backend."""

from typing import Any

from pydantic import BaseModel, Field, field_validator


class ImagePointConstraint(BaseModel):
    """Image point constraint for bundle adjustment."""

    id: str
    world_point_id: str
    image_id: str
    camera_id: str
    u: float  # Observed pixel x
    v: float  # Observed pixel y
    weight: float = 1.0
    enabled: bool = True

    def constraint_type(self) -> str:
        """Get constraint type."""
        return "image_point"


class DistanceConstraint(BaseModel):
    """Distance constraint between points."""

    id: str
    point_a_id: str
    point_b_id: str
    target_distance: float
    weight: float = 1.0
    enabled: bool = True

    @field_validator('target_distance')
    @classmethod
    def validate_target_distance(cls, v):
        if v < 0:
            raise ValueError('target_distance must be non-negative')
        return v

    def constraint_type(self) -> str:
        """Get constraint type."""
        return "distance_point_point"


class AngleConstraint(BaseModel):
    """Angle constraint between three points."""

    id: str
    point_a_id: str
    vertex_id: str
    point_c_id: str
    target_angle: float  # In degrees
    weight: float = 1.0
    enabled: bool = True

    def constraint_type(self) -> str:
        """Get constraint type."""
        return "angle_point_point_point"


class ParallelLinesConstraint(BaseModel):
    """Parallel lines constraint."""

    id: str
    line_a_id: str
    line_b_id: str
    weight: float = 1.0
    enabled: bool = True

    def constraint_type(self) -> str:
        """Get constraint type."""
        return "parallel_lines"


class PerpendicularLinesConstraint(BaseModel):
    """Perpendicular lines constraint."""

    id: str
    line_a_id: str
    line_b_id: str
    weight: float = 1.0
    enabled: bool = True

    def constraint_type(self) -> str:
        """Get constraint type."""
        return "perpendicular_lines"


class FixedPointConstraint(BaseModel):
    """Fixed point constraint."""

    id: str
    point_id: str
    target_xyz: list[float] = Field(min_items=3, max_items=3)
    weight: float = 1.0
    enabled: bool = True

    def constraint_type(self) -> str:
        """Get constraint type."""
        return "fixed_point"


class CollinearPointsConstraint(BaseModel):
    """Collinear points constraint."""

    id: str
    point_ids: list[str] = Field(min_items=3)
    weight: float = 1.0
    enabled: bool = True

    def constraint_type(self) -> str:
        """Get constraint type."""
        return "collinear_points"


class CoplanarPointsConstraint(BaseModel):
    """Coplanar points constraint."""

    id: str
    point_ids: list[str] = Field(min_items=4)
    weight: float = 1.0
    enabled: bool = True

    def constraint_type(self) -> str:
        """Get constraint type."""
        return "coplanar_points"


class HorizontalLineConstraint(BaseModel):
    """Horizontal line constraint."""

    id: str
    line_id: str
    weight: float = 1.0
    enabled: bool = True

    def constraint_type(self) -> str:
        """Get constraint type."""
        return "horizontal_line"


class VerticalLineConstraint(BaseModel):
    """Vertical line constraint."""

    id: str
    line_id: str
    weight: float = 1.0
    enabled: bool = True

    def constraint_type(self) -> str:
        """Get constraint type."""
        return "vertical_line"


class EqualDistancesConstraint(BaseModel):
    """Equal distances constraint."""

    id: str
    distance_pairs: list[list[str]] = Field(min_items=2)  # Pairs: [point_a_id, point_b_id]
    weight: float = 1.0
    enabled: bool = True

    def constraint_type(self) -> str:
        """Get constraint type."""
        return "equal_distances"


class EqualAnglesConstraint(BaseModel):
    """Equal angles constraint."""

    id: str
    angle_triplets: list[list[str]] = Field(min_items=2)  # Triplets: [point_a, vertex, point_c]
    weight: float = 1.0
    enabled: bool = True

    def constraint_type(self) -> str:
        """Get constraint type."""
        return "equal_angles"


# Map of constraint type names to classes
CONSTRAINT_CLASSES = {
    "image_point": ImagePointConstraint,
    "distance_point_point": DistanceConstraint,
    "angle_point_point_point": AngleConstraint,
    "parallel_lines": ParallelLinesConstraint,
    "perpendicular_lines": PerpendicularLinesConstraint,
    "fixed_point": FixedPointConstraint,
    "collinear_points": CollinearPointsConstraint,
    "coplanar_points": CoplanarPointsConstraint,
    "horizontal_line": HorizontalLineConstraint,
    "vertical_line": VerticalLineConstraint,
    "equal_distances": EqualDistancesConstraint,
    "equal_angles": EqualAnglesConstraint
}


def create_constraint_from_type(constraint_type: str, **kwargs) -> Any:
    """Create a constraint instance from type name."""
    if constraint_type not in CONSTRAINT_CLASSES:
        raise ValueError(f"Unknown constraint type: {constraint_type}")

    constraint_class = CONSTRAINT_CLASSES[constraint_type]
    return constraint_class(**kwargs)


def convert_frontend_constraint_to_backend(frontend_constraint: dict) -> Any:
    """Convert frontend Constraint to backend constraint classes."""
    constraint_type = frontend_constraint.get("type")
    if not constraint_type:
        raise ValueError("Constraint must have a type")

    # Map frontend constraint to backend parameters
    backend_params = {"id": frontend_constraint["id"]}

    entities = frontend_constraint.get("entities", {})
    parameters = frontend_constraint.get("parameters", {})

    if constraint_type == "distance_point_point":
        points = entities.get("points", [])
        if len(points) >= 2:
            backend_params.update({
                "point_a_id": points[0],
                "point_b_id": points[1],
                "target_distance": parameters.get("targetValue", 1.0)
            })

    elif constraint_type == "angle_point_point_point":
        points = entities.get("points", [])
        if len(points) >= 3:
            backend_params.update({
                "point_a_id": points[0],
                "vertex_id": points[1],
                "point_c_id": points[2],
                "target_angle": parameters.get("targetValue", 90.0)
            })

    elif constraint_type in ["parallel_lines", "perpendicular_lines"]:
        lines = entities.get("lines", [])
        if len(lines) >= 2:
            backend_params.update({
                "line_a_id": lines[0],
                "line_b_id": lines[1]
            })

    elif constraint_type == "fixed_point":
        points = entities.get("points", [])
        if len(points) >= 1:
            backend_params.update({
                "point_id": points[0],
                "target_xyz": [
                    parameters.get("x", 0.0),
                    parameters.get("y", 0.0),
                    parameters.get("z", 0.0)
                ]
            })

    elif constraint_type == "collinear_points" or constraint_type == "coplanar_points":
        points = entities.get("points", [])
        backend_params["point_ids"] = points

    elif constraint_type == "horizontal_line" or constraint_type == "vertical_line":
        lines = entities.get("lines", [])
        if len(lines) >= 1:
            backend_params["line_id"] = lines[0]

    # Add common parameters
    backend_params.update({
        "weight": parameters.get("priority", 1.0),
        "enabled": frontend_constraint.get("isEnabled", True)
    })

    return create_constraint_from_type(constraint_type, **backend_params)
