"""Constraint models for optimization."""

from typing import Union, List, Literal, Optional
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


class CollinearConstraint(BaseConstraint):
    """Collinear constraint for points on the same line."""

    type: Literal["collinear"] = "collinear"
    wp_ids: List[str] = Field(
        description="World point IDs that should be collinear",
        min_length=3
    )

    def constraint_type(self) -> str:
        return "collinear"

    def validate_constraint(self) -> None:
        """Validate collinear constraint."""
        if len(set(self.wp_ids)) != len(self.wp_ids):
            raise ValueError("Collinear constraint cannot have duplicate point IDs")


class PerpendicularConstraint(BaseConstraint):
    """Perpendicular constraint between two lines."""

    type: Literal["perpendicular"] = "perpendicular"
    line1_wp_a: str = Field(description="First point of first line")
    line1_wp_b: str = Field(description="Second point of first line")
    line2_wp_a: str = Field(description="First point of second line")
    line2_wp_b: str = Field(description="Second point of second line")

    def constraint_type(self) -> str:
        return "perpendicular"

    def validate_constraint(self) -> None:
        """Validate perpendicular constraint."""
        line1_points = [self.line1_wp_a, self.line1_wp_b]
        line2_points = [self.line2_wp_a, self.line2_wp_b]

        if len(set(line1_points)) != 2:
            raise ValueError("First line requires two distinct points")
        if len(set(line2_points)) != 2:
            raise ValueError("Second line requires two distinct points")


class ParallelConstraint(BaseConstraint):
    """Parallel constraint between two lines."""

    type: Literal["parallel"] = "parallel"
    line1_wp_a: str = Field(description="First point of first line")
    line1_wp_b: str = Field(description="Second point of first line")
    line2_wp_a: str = Field(description="First point of second line")
    line2_wp_b: str = Field(description="Second point of second line")

    def constraint_type(self) -> str:
        return "parallel"

    def validate_constraint(self) -> None:
        """Validate parallel constraint."""
        line1_points = [self.line1_wp_a, self.line1_wp_b]
        line2_points = [self.line2_wp_a, self.line2_wp_b]

        if len(set(line1_points)) != 2:
            raise ValueError("First line requires two distinct points")
        if len(set(line2_points)) != 2:
            raise ValueError("Second line requires two distinct points")


class AngleConstraint(BaseConstraint):
    """Angle constraint between two lines. Can specify perpendicular (90°) or parallel (0°/180°)."""

    type: Literal["angle"] = "angle"
    line1_wp_a: str = Field(description="First point of first line")
    line1_wp_b: str = Field(description="Second point of first line")
    line2_wp_a: str = Field(description="First point of second line")
    line2_wp_b: str = Field(description="Second point of second line")
    angle_degrees: float = Field(
        description="Target angle in degrees (0=parallel, 90=perpendicular, 180=anti-parallel)",
        ge=0,
        le=180
    )

    def constraint_type(self) -> str:
        return "angle"

    def validate_constraint(self) -> None:
        """Validate angle constraint."""
        line1_points = [self.line1_wp_a, self.line1_wp_b]
        line2_points = [self.line2_wp_a, self.line2_wp_b]

        if len(set(line1_points)) != 2:
            raise ValueError("First line requires two distinct points")
        if len(set(line2_points)) != 2:
            raise ValueError("Second line requires two distinct points")

    @classmethod
    def perpendicular(cls, line1_wp_a: str, line1_wp_b: str, line2_wp_a: str, line2_wp_b: str):
        """Create perpendicular constraint (90 degrees)."""
        return cls(
            line1_wp_a=line1_wp_a,
            line1_wp_b=line1_wp_b,
            line2_wp_a=line2_wp_a,
            line2_wp_b=line2_wp_b,
            angle_degrees=90.0
        )

    @classmethod
    def parallel(cls, line1_wp_a: str, line1_wp_b: str, line2_wp_a: str, line2_wp_b: str):
        """Create parallel constraint (0 degrees)."""
        return cls(
            line1_wp_a=line1_wp_a,
            line1_wp_b=line1_wp_b,
            line2_wp_a=line2_wp_a,
            line2_wp_b=line2_wp_b,
            angle_degrees=0.0
        )


class FixedDistanceRatioConstraint(BaseConstraint):
    """Fixed ratio between two distances."""

    type: Literal["distance_ratio"] = "distance_ratio"
    line1_wp_a: str = Field(description="First point of first distance")
    line1_wp_b: str = Field(description="Second point of first distance")
    line2_wp_a: str = Field(description="First point of second distance")
    line2_wp_b: str = Field(description="Second point of second distance")
    ratio: float = Field(gt=0, description="Target ratio: distance1 / distance2")

    def constraint_type(self) -> str:
        return "distance_ratio"

    def validate_constraint(self) -> None:
        """Validate distance ratio constraint."""
        line1_points = [self.line1_wp_a, self.line1_wp_b]
        line2_points = [self.line2_wp_a, self.line2_wp_b]

        if len(set(line1_points)) != 2:
            raise ValueError("First distance requires two distinct points")
        if len(set(line2_points)) != 2:
            raise ValueError("Second distance requires two distinct points")


class PointOnLineConstraint(BaseConstraint):
    """Point lies on a line constraint."""

    type: Literal["point_on_line"] = "point_on_line"
    point_id: str = Field(description="Point that should lie on the line")
    line_wp_a: str = Field(description="First point defining the line")
    line_wp_b: str = Field(description="Second point defining the line")

    def constraint_type(self) -> str:
        return "point_on_line"

    def validate_constraint(self) -> None:
        """Validate point on line constraint."""
        if self.line_wp_a == self.line_wp_b:
            raise ValueError("Line requires two distinct points")
        if self.point_id in [self.line_wp_a, self.line_wp_b]:
            raise ValueError("Point should be different from line defining points")


class PointOnPlaneConstraint(BaseConstraint):
    """Point lies on a plane constraint."""

    type: Literal["point_on_plane"] = "point_on_plane"
    point_id: str = Field(description="Point that should lie on the plane")
    plane_wp_a: str = Field(description="First point defining the plane")
    plane_wp_b: str = Field(description="Second point defining the plane")
    plane_wp_c: str = Field(description="Third point defining the plane")

    def constraint_type(self) -> str:
        return "point_on_plane"

    def validate_constraint(self) -> None:
        """Validate point on plane constraint."""
        plane_points = [self.plane_wp_a, self.plane_wp_b, self.plane_wp_c]
        if len(set(plane_points)) != 3:
            raise ValueError("Plane requires three distinct points")
        if self.point_id in plane_points:
            raise ValueError("Point should be different from plane defining points")


class PointOnCircleConstraint(BaseConstraint):
    """Point lies on a circle constraint."""

    type: Literal["point_on_circle"] = "point_on_circle"
    point_id: str = Field(description="Point that should lie on the circle")
    center_id: str = Field(description="Center point of the circle")
    radius_ref_id: str = Field(description="Point defining radius distance from center")
    plane_wp_a: str = Field(description="First point defining circle plane")
    plane_wp_b: str = Field(description="Second point defining circle plane")
    plane_wp_c: str = Field(description="Third point defining circle plane")

    def constraint_type(self) -> str:
        return "point_on_circle"

    def validate_constraint(self) -> None:
        """Validate point on circle constraint."""
        plane_points = [self.plane_wp_a, self.plane_wp_b, self.plane_wp_c]
        if len(set(plane_points)) != 3:
            raise ValueError("Circle plane requires three distinct points")

        all_points = plane_points + [self.point_id, self.center_id, self.radius_ref_id]
        if len(set(all_points)) != len(all_points):
            raise ValueError("All points in circle constraint must be distinct")


class PointOnSphereConstraint(BaseConstraint):
    """Point lies on a sphere constraint."""

    type: Literal["point_on_sphere"] = "point_on_sphere"
    point_id: str = Field(description="Point that should lie on the sphere")
    center_id: str = Field(description="Center point of the sphere")
    radius_ref_id: str = Field(description="Point defining radius distance from center")

    def constraint_type(self) -> str:
        return "point_on_sphere"

    def validate_constraint(self) -> None:
        """Validate point on sphere constraint."""
        points = [self.point_id, self.center_id, self.radius_ref_id]
        if len(set(points)) != 3:
            raise ValueError("Sphere constraint requires three distinct points")


class EqualDistanceConstraint(BaseConstraint):
    """Equal distance constraint between two pairs of points."""

    type: Literal["equal_distance"] = "equal_distance"
    line1_wp_a: str = Field(description="First point of first distance")
    line1_wp_b: str = Field(description="Second point of first distance")
    line2_wp_a: str = Field(description="First point of second distance")
    line2_wp_b: str = Field(description="Second point of second distance")

    def constraint_type(self) -> str:
        return "equal_distance"

    def validate_constraint(self) -> None:
        """Validate equal distance constraint."""
        line1_points = [self.line1_wp_a, self.line1_wp_b]
        line2_points = [self.line2_wp_a, self.line2_wp_b]

        if len(set(line1_points)) != 2:
            raise ValueError("First distance requires two distinct points")
        if len(set(line2_points)) != 2:
            raise ValueError("Second distance requires two distinct points")


class RectangleConstraint(BaseConstraint):
    """Rectangle constraint for four coplanar points."""

    type: Literal["rectangle"] = "rectangle"
    corner_a: str = Field(description="First corner point")
    corner_b: str = Field(description="Second corner point (adjacent to A)")
    corner_c: str = Field(description="Third corner point (opposite to A)")
    corner_d: str = Field(description="Fourth corner point (adjacent to A)")
    aspect_ratio: Optional[float] = Field(
        default=None,
        description="Optional aspect ratio (width/height). Set to 1.0 for square"
    )

    def constraint_type(self) -> str:
        return "rectangle"

    def validate_constraint(self) -> None:
        """Validate rectangle constraint."""
        corners = [self.corner_a, self.corner_b, self.corner_c, self.corner_d]
        if len(set(corners)) != 4:
            raise ValueError("Rectangle requires four distinct corner points")

        if self.aspect_ratio is not None and self.aspect_ratio <= 0:
            raise ValueError("Aspect ratio must be positive")


class MirrorSymmetryConstraint(BaseConstraint):
    """Mirror symmetry constraint across a plane."""

    type: Literal["mirror_symmetry"] = "mirror_symmetry"
    point_a: str = Field(description="First point in symmetric pair")
    point_b: str = Field(description="Second point in symmetric pair")
    mirror_plane_a: str = Field(description="First point defining mirror plane")
    mirror_plane_b: str = Field(description="Second point defining mirror plane")
    mirror_plane_c: str = Field(description="Third point defining mirror plane")

    def constraint_type(self) -> str:
        return "mirror_symmetry"

    def validate_constraint(self) -> None:
        """Validate mirror symmetry constraint."""
        plane_points = [self.mirror_plane_a, self.mirror_plane_b, self.mirror_plane_c]
        if len(set(plane_points)) != 3:
            raise ValueError("Mirror plane requires three distinct points")

        if self.point_a == self.point_b:
            raise ValueError("Symmetric points must be distinct")

        all_points = plane_points + [self.point_a, self.point_b]
        if len(set(all_points)) != len(all_points):
            raise ValueError("All points in mirror constraint must be distinct")


class EqualSpacingConstraint(BaseConstraint):
    """Equal spacing constraint for points on a line."""

    type: Literal["equal_spacing"] = "equal_spacing"
    point_ids: List[str] = Field(
        description="Points that should be equally spaced on line",
        min_length=3
    )

    def constraint_type(self) -> str:
        return "equal_spacing"

    def validate_constraint(self) -> None:
        """Validate equal spacing constraint."""
        if len(set(self.point_ids)) != len(self.point_ids):
            raise ValueError("Equal spacing constraint cannot have duplicate point IDs")


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
    CollinearConstraint,
    PerpendicularConstraint,
    ParallelConstraint,
    AngleConstraint,
    FixedDistanceRatioConstraint,
    PointOnLineConstraint,
    PointOnPlaneConstraint,
    PointOnCircleConstraint,
    PointOnSphereConstraint,
    EqualDistanceConstraint,
    RectangleConstraint,
    MirrorSymmetryConstraint,
    EqualSpacingConstraint,
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
    elif constraint_type == "collinear":
        return CollinearConstraint(**constraint_data)
    elif constraint_type == "perpendicular":
        return PerpendicularConstraint(**constraint_data)
    elif constraint_type == "parallel":
        return ParallelConstraint(**constraint_data)
    elif constraint_type == "angle":
        return AngleConstraint(**constraint_data)
    elif constraint_type == "distance_ratio":
        return FixedDistanceRatioConstraint(**constraint_data)
    elif constraint_type == "point_on_line":
        return PointOnLineConstraint(**constraint_data)
    elif constraint_type == "point_on_plane":
        return PointOnPlaneConstraint(**constraint_data)
    elif constraint_type == "point_on_circle":
        return PointOnCircleConstraint(**constraint_data)
    elif constraint_type == "point_on_sphere":
        return PointOnSphereConstraint(**constraint_data)
    elif constraint_type == "equal_distance":
        return EqualDistanceConstraint(**constraint_data)
    elif constraint_type == "rectangle":
        return RectangleConstraint(**constraint_data)
    elif constraint_type == "mirror_symmetry":
        return MirrorSymmetryConstraint(**constraint_data)
    elif constraint_type == "equal_spacing":
        return EqualSpacingConstraint(**constraint_data)
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
        "collinear": CollinearConstraint,
        "perpendicular": PerpendicularConstraint,
        "parallel": ParallelConstraint,
        "angle": AngleConstraint,
        "distance_ratio": FixedDistanceRatioConstraint,
        "point_on_line": PointOnLineConstraint,
        "point_on_plane": PointOnPlaneConstraint,
        "point_on_circle": PointOnCircleConstraint,
        "point_on_sphere": PointOnSphereConstraint,
        "equal_distance": EqualDistanceConstraint,
        "rectangle": RectangleConstraint,
        "mirror_symmetry": MirrorSymmetryConstraint,
        "equal_spacing": EqualSpacingConstraint,
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