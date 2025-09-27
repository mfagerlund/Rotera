"""Project model and settings."""

import math
from typing import Dict, List, Optional, Literal
from pydantic import BaseModel, Field, field_validator

from .entities import WorldPoint, Image, Camera
from .constraints import Constraint


class SolverSettings(BaseModel):
    """Solver configuration settings."""

    max_iterations: int = Field(default=100, gt=0, description="Maximum solver iterations")
    tolerance: float = Field(default=1e-6, gt=0, description="Convergence tolerance")
    robust_loss: Literal["none", "huber", "cauchy"] = Field(
        default="huber",
        description="Robust loss function type"
    )
    huber_delta: float = Field(default=1.0, gt=0, description="Huber loss delta parameter")
    cauchy_sigma: float = Field(default=1.0, gt=0, description="Cauchy loss sigma parameter")


class ProjectSettings(BaseModel):
    """Project-wide settings."""

    solver: SolverSettings = Field(default_factory=SolverSettings)
    units: Literal["meters", "millimeters", "inches"] = Field(
        default="meters",
        description="Distance units"
    )
    coordinate_system: Literal["right_handed", "left_handed"] = Field(
        default="right_handed",
        description="Coordinate system handedness"
    )


class SolveResult(BaseModel):
    """Results from optimization solve."""

    success: bool = Field(description="Whether solve succeeded")
    iterations: int = Field(description="Number of iterations performed")
    final_cost: float = Field(description="Final optimization cost")
    convergence_reason: str = Field(description="Reason for convergence/termination")
    residuals: Dict[str, float] = Field(
        default_factory=dict,
        description="Per-constraint residual magnitudes"
    )
    uncertainties: Dict[str, List[float]] = Field(
        default_factory=dict,
        description="Per-world-point uncertainty estimates [σx, σy, σz]"
    )
    unconstrained_dofs: List[str] = Field(
        default_factory=list,
        description="List of unconstrained degrees of freedom"
    )
    largest_residuals: List[tuple[str, float]] = Field(
        default_factory=list,
        description="Largest residuals by constraint ID"
    )
    computation_time: Optional[float] = Field(
        default=None,
        description="Solve time in seconds"
    )

    @field_validator('final_cost')
    @classmethod
    def validate_final_cost(cls, v):
        """Ensure final_cost is JSON serializable."""
        if math.isinf(v) or math.isnan(v):
            return 1e10  # Large but finite value
        return v

    @field_validator('computation_time')
    @classmethod
    def validate_computation_time(cls, v):
        """Ensure computation_time is JSON serializable."""
        if v is not None and (math.isinf(v) or math.isnan(v)):
            return None
        return v

    @field_validator('residuals')
    @classmethod
    def validate_residuals(cls, v):
        """Ensure residuals are JSON serializable."""
        result = {}
        for key, value in v.items():
            if math.isinf(value) or math.isnan(value):
                result[key] = 1e10  # Large but finite value
            else:
                result[key] = value
        return result

    @field_validator('largest_residuals')
    @classmethod
    def validate_largest_residuals(cls, v):
        """Ensure largest residuals are JSON serializable."""
        result = []
        for constraint_id, residual in v:
            if math.isinf(residual) or math.isnan(residual):
                result.append((constraint_id, 1e10))
            else:
                result.append((constraint_id, residual))
        return result


class Project(BaseModel):
    """Complete Pictorigo project."""

    version: str = Field(default="0.1.0", description="Project format version")
    world_points: Dict[str, WorldPoint] = Field(
        default_factory=dict,
        description="World points by ID"
    )
    images: Dict[str, Image] = Field(
        default_factory=dict,
        description="Images by ID"
    )
    cameras: Dict[str, Camera] = Field(
        default_factory=dict,
        description="Cameras by ID"
    )
    constraints: List[Constraint] = Field(
        default_factory=list,
        description="List of optimization constraints"
    )
    settings: ProjectSettings = Field(
        default_factory=ProjectSettings,
        description="Project settings"
    )
    diagnostics: Optional[SolveResult] = Field(
        default=None,
        description="Latest solve diagnostics"
    )

    def add_world_point(self, wp: WorldPoint) -> None:
        """Add a world point to the project."""
        if wp.id in self.world_points:
            raise ValueError(f"World point {wp.id} already exists")
        self.world_points[wp.id] = wp

    def add_image(self, image: Image) -> None:
        """Add an image to the project."""
        if image.id in self.images:
            raise ValueError(f"Image {image.id} already exists")
        self.images[image.id] = image

    def add_camera(self, camera: Camera) -> None:
        """Add a camera to the project."""
        if camera.id in self.cameras:
            raise ValueError(f"Camera {camera.id} already exists")
        if camera.image_id not in self.images:
            raise ValueError(f"Camera references non-existent image {camera.image_id}")
        self.cameras[camera.id] = camera

    def add_constraint(self, constraint: Constraint) -> None:
        """Add a constraint to the project."""
        # Validate constraint references
        self._validate_constraint_references(constraint)
        constraint.validate_constraint()
        self.constraints.append(constraint)

    def remove_world_point(self, wp_id: str) -> None:
        """Remove a world point and all referencing constraints."""
        if wp_id not in self.world_points:
            raise ValueError(f"World point {wp_id} does not exist")

        # Remove referencing constraints
        self.constraints = [
            c for c in self.constraints
            if not self._constraint_references_wp(c, wp_id)
        ]

        # Remove the world point
        del self.world_points[wp_id]

    def remove_image(self, image_id: str) -> None:
        """Remove an image and all associated cameras and constraints."""
        if image_id not in self.images:
            raise ValueError(f"Image {image_id} does not exist")

        # Find and remove associated cameras
        cameras_to_remove = [
            cam_id for cam_id, cam in self.cameras.items()
            if cam.image_id == image_id
        ]

        for cam_id in cameras_to_remove:
            self.remove_camera(cam_id)

        # Remove the image
        del self.images[image_id]

    def remove_camera(self, camera_id: str) -> None:
        """Remove a camera and all referencing constraints."""
        if camera_id not in self.cameras:
            raise ValueError(f"Camera {camera_id} does not exist")

        camera = self.cameras[camera_id]

        # Remove image point constraints for this camera's image
        self.constraints = [
            c for c in self.constraints
            if not (hasattr(c, 'image_id') and c.image_id == camera.image_id)
        ]

        # Remove the camera
        del self.cameras[camera_id]

    def get_world_point_ids(self) -> List[str]:
        """Get list of all world point IDs."""
        return list(self.world_points.keys())

    def get_image_ids(self) -> List[str]:
        """Get list of all image IDs."""
        return list(self.images.keys())

    def get_camera_ids(self) -> List[str]:
        """Get list of all camera IDs."""
        return list(self.cameras.keys())

    def get_constraints_by_type(self, constraint_type: str) -> List[Constraint]:
        """Get all constraints of a specific type."""
        return [c for c in self.constraints if c.constraint_type() == constraint_type]

    def validate_project(self) -> List[str]:
        """Validate entire project and return list of issues."""
        issues = []

        # Check constraint references
        for i, constraint in enumerate(self.constraints):
            try:
                self._validate_constraint_references(constraint)
                constraint.validate_constraint()
            except ValueError as e:
                issues.append(f"Constraint {i}: {str(e)}")

        # Check camera-image consistency
        for cam_id, camera in self.cameras.items():
            if camera.image_id not in self.images:
                issues.append(f"Camera {cam_id} references non-existent image {camera.image_id}")

        return issues

    def _validate_constraint_references(self, constraint: Constraint) -> None:
        """Validate that constraint references exist."""
        if hasattr(constraint, 'wp_id'):
            if constraint.wp_id not in self.world_points:
                raise ValueError(f"Constraint references non-existent world point {constraint.wp_id}")

        if hasattr(constraint, 'wp_i'):
            if constraint.wp_i not in self.world_points:
                raise ValueError(f"Constraint references non-existent world point {constraint.wp_i}")

        if hasattr(constraint, 'wp_j'):
            if constraint.wp_j not in self.world_points:
                raise ValueError(f"Constraint references non-existent world point {constraint.wp_j}")

        if hasattr(constraint, 'wp_a'):
            for wp_id in [constraint.wp_a, constraint.wp_b, constraint.wp_c]:
                if wp_id not in self.world_points:
                    raise ValueError(f"Constraint references non-existent world point {wp_id}")

        if hasattr(constraint, 'wp_ids'):
            for wp_id in constraint.wp_ids:
                if wp_id not in self.world_points:
                    raise ValueError(f"Constraint references non-existent world point {wp_id}")

        if hasattr(constraint, 'members'):
            for wp_id in constraint.members:
                if wp_id not in self.world_points:
                    raise ValueError(f"Constraint references non-existent world point {wp_id}")

        if hasattr(constraint, 'image_id'):
            if constraint.image_id not in self.images:
                raise ValueError(f"Constraint references non-existent image {constraint.image_id}")

    def _constraint_references_wp(self, constraint: Constraint, wp_id: str) -> bool:
        """Check if constraint references a specific world point."""
        if hasattr(constraint, 'wp_id') and constraint.wp_id == wp_id:
            return True
        if hasattr(constraint, 'wp_i') and constraint.wp_i == wp_id:
            return True
        if hasattr(constraint, 'wp_j') and constraint.wp_j == wp_id:
            return True
        if hasattr(constraint, 'wp_a') and wp_id in [constraint.wp_a, constraint.wp_b, constraint.wp_c]:
            return True
        if hasattr(constraint, 'wp_ids') and wp_id in constraint.wp_ids:
            return True
        if hasattr(constraint, 'members') and wp_id in constraint.members:
            return True
        if hasattr(constraint, 'origin_wp') and wp_id in [constraint.origin_wp, constraint.x_wp, constraint.xy_wp]:
            return True
        return False