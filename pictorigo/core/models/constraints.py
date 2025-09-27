"""Constraint models for optimization."""

from typing import Union, List, Literal
from pydantic import BaseModel, Field, field_validator
from abc import ABC, abstractmethod


class BaseConstraint(BaseModel, ABC):
    """Base class for all constraints."""

    @abstractmethod
    def constraint_type(self) -> str:
        """Get constraint type string."""
        pass

    @abstractmethod
    def validate_constraint(self) -> None:
        """Validate constraint-specific requirements."""
        pass


class ImagePointConstraint(BaseConstraint):
    """Image point observation constraint."""

    type: Literal["image_point"] = "image_point"
    image_id: str = Field(description="Image ID")
    wp_id: str = Field(description="World point ID")
    u: float = Field(description="Pixel u coordinate")
    v: float = Field(description="Pixel v coordinate")
    sigma: float = Field(default=1.0, gt=0, description="Measurement uncertainty")

    def constraint_type(self) -> str:
        return "image_point"

    def validate_constraint(self) -> None:
        """Validate image point constraint."""
        pass


class KnownCoordConstraint(BaseConstraint):
    """Known coordinate constraint for world points."""

    type: Literal["known_coord"] = "known_coord"
    wp_id: str = Field(description="World point ID")
    mask_xyz: List[bool] = Field(
        description="Mask for which coordinates are constrained [x, y, z]",
        min_length=3,
        max_length=3
    )
    values: List[float] = Field(
        description="Known coordinate values [x, y, z]",
        min_length=3,
        max_length=3
    )

    @field_validator('mask_xyz')
    @classmethod
    def validate_mask(cls, v):
        if len(v) != 3:
            raise ValueError("mask_xyz must have exactly 3 elements")
        if not any(v):
            raise ValueError("At least one coordinate must be constrained")
        return v

    def constraint_type(self) -> str:
        return "known_coord"

    def validate_constraint(self) -> None:
        """Validate known coordinate constraint."""
        if len(self.mask_xyz) != 3 or len(self.values) != 3:
            raise ValueError("mask_xyz and values must both have 3 elements")


class DistanceConstraint(BaseConstraint):
    """Distance constraint between two world points."""

    type: Literal["distance"] = "distance"
    wp_i: str = Field(description="First world point ID")
    wp_j: str = Field(description="Second world point ID")
    distance: float = Field(ge=0, description="Distance in meters")

    def constraint_type(self) -> str:
        return "distance"

    def validate_constraint(self) -> None:
        """Validate distance constraint."""
        if self.wp_i == self.wp_j:
            raise ValueError("Distance constraint requires two different world points")


class AxisAlignConstraint(BaseConstraint):
    """Axis alignment constraint."""

    type: Literal["axis_align"] = "axis_align"
    wp_i: str = Field(description="First world point ID")
    wp_j: str = Field(description="Second world point ID")
    axis: Union[Literal["x", "y", "z", "-x", "-y", "-z"], List[float]] = Field(
        description="Target axis direction"
    )

    @field_validator('axis')
    @classmethod
    def validate_axis(cls, v):
        if isinstance(v, list):
            if len(v) != 3:
                raise ValueError("Custom axis must have exactly 3 elements")
            if abs(sum(x**2 for x in v) - 1.0) > 1e-6:
                raise ValueError("Custom axis must be unit vector")
        return v

    def constraint_type(self) -> str:
        return "axis_align"

    def validate_constraint(self) -> None:
        """Validate axis alignment constraint."""
        if self.wp_i == self.wp_j:
            raise ValueError("Axis alignment requires two different world points")


class CoplanarConstraint(BaseConstraint):
    """Coplanarity constraint for multiple points."""

    type: Literal["coplanar"] = "coplanar"
    wp_ids: List[str] = Field(
        description="World point IDs that should be coplanar",
        min_length=3
    )

    def constraint_type(self) -> str:
        return "coplanar"

    def validate_constraint(self) -> None:
        """Validate coplanarity constraint."""
        if len(set(self.wp_ids)) != len(self.wp_ids):
            raise ValueError("Coplanar constraint cannot have duplicate point IDs")


class PlaneFromThreeConstraint(BaseConstraint):
    """Plane definition from three points with optional members."""

    type: Literal["plane_from_three"] = "plane_from_three"
    wp_a: str = Field(description="First defining point ID")
    wp_b: str = Field(description="Second defining point ID")
    wp_c: str = Field(description="Third defining point ID")
    members: List[str] = Field(
        default_factory=list,
        description="Additional points constrained to this plane"
    )

    def constraint_type(self) -> str:
        return "plane_from_three"

    def validate_constraint(self) -> None:
        """Validate plane from three constraint."""
        defining_points = [self.wp_a, self.wp_b, self.wp_c]
        if len(set(defining_points)) != 3:
            raise ValueError("Plane definition requires three distinct points")

        all_points = defining_points + self.members
        if len(set(all_points)) != len(all_points):
            raise ValueError("Plane constraint cannot have duplicate point IDs")


class EqualityConstraint(BaseConstraint):
    """Equality constraint (merge two world points)."""

    type: Literal["equality"] = "equality"
    wp_a: str = Field(description="First world point ID")
    wp_b: str = Field(description="Second world point ID")

    def constraint_type(self) -> str:
        return "equality"

    def validate_constraint(self) -> None:
        """Validate equality constraint."""
        if self.wp_a == self.wp_b:
            raise ValueError("Equality constraint requires two different world points")


class GaugeFixConstraint(BaseConstraint):
    """Gauge fixing constraint for origin, scale, and orientation."""

    type: Literal["gauge_fix"] = "gauge_fix"
    origin_wp: str = Field(description="World point for origin (0,0,0)")
    x_wp: str = Field(description="World point defining +X direction")
    xy_wp: str = Field(description="World point defining XY plane (+Y side)")
    scale_d: float = Field(gt=0, description="Distance for scale (origin to x_wp)")

    def constraint_type(self) -> str:
        return "gauge_fix"

    def validate_constraint(self) -> None:
        """Validate gauge fix constraint."""
        points = [self.origin_wp, self.x_wp, self.xy_wp]
        if len(set(points)) != 3:
            raise ValueError("Gauge fix requires three distinct world points")


# Union type for all constraints
Constraint = Union[
    ImagePointConstraint,
    KnownCoordConstraint,
    DistanceConstraint,
    AxisAlignConstraint,
    CoplanarConstraint,
    PlaneFromThreeConstraint,
    EqualityConstraint,
    GaugeFixConstraint,
]


def create_constraint(constraint_data: dict) -> Constraint:
    """Factory function to create constraint from dictionary."""
    constraint_type = constraint_data.get("type")

    if constraint_type == "image_point":
        return ImagePointConstraint(**constraint_data)
    elif constraint_type == "known_coord":
        return KnownCoordConstraint(**constraint_data)
    elif constraint_type == "distance":
        return DistanceConstraint(**constraint_data)
    elif constraint_type == "axis_align":
        return AxisAlignConstraint(**constraint_data)
    elif constraint_type == "coplanar":
        return CoplanarConstraint(**constraint_data)
    elif constraint_type == "plane_from_three":
        return PlaneFromThreeConstraint(**constraint_data)
    elif constraint_type == "equality":
        return EqualityConstraint(**constraint_data)
    elif constraint_type == "gauge_fix":
        return GaugeFixConstraint(**constraint_data)
    else:
        raise ValueError(f"Unknown constraint type: {constraint_type}")


class ConstraintRegistry:
    """Registry for constraint types and validation."""

    _constraint_types = {
        "image_point": ImagePointConstraint,
        "known_coord": KnownCoordConstraint,
        "distance": DistanceConstraint,
        "axis_align": AxisAlignConstraint,
        "coplanar": CoplanarConstraint,
        "plane_from_three": PlaneFromThreeConstraint,
        "equality": EqualityConstraint,
        "gauge_fix": GaugeFixConstraint,
    }

    @classmethod
    def get_constraint_class(cls, constraint_type: str):
        """Get constraint class by type string."""
        if constraint_type not in cls._constraint_types:
            raise ValueError(f"Unknown constraint type: {constraint_type}")
        return cls._constraint_types[constraint_type]

    @classmethod
    def list_constraint_types(cls) -> List[str]:
        """List all available constraint types."""
        return list(cls._constraint_types.keys())

    @classmethod
    def validate_constraint_data(cls, constraint_data: dict) -> bool:
        """Validate constraint data dictionary."""
        try:
            constraint = create_constraint(constraint_data)
            constraint.validate_constraint()
            return True
        except Exception:
            return False