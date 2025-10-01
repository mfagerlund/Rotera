"""Core entities: WorldPoint, Image, Camera, Line."""

from typing import Optional, List, Dict, Any, Literal
import numpy as np
from pydantic import BaseModel, Field, field_validator


class WorldPoint(BaseModel):
    """3D point in world coordinates.

    Separates position (xyz) from constraints (locked).
    - xyz: Current 3D position [x, y, z]
    - locked: Boolean mask [lock_x, lock_y, lock_z] indicating which axes are constrained
    - tolerance: Constraint tolerance for locked axes (smaller = tighter constraint)
    """

    id: str = Field(description="Unique identifier for the world point")
    xyz: Optional[List[float]] = Field(
        default=None,
        description="3D coordinates [x, y, z]",
        min_length=3,
        max_length=3
    )
    locked: Optional[List[bool]] = Field(
        default=None,
        description="Per-axis lock flags [lock_x, lock_y, lock_z]",
        min_length=3,
        max_length=3
    )
    tolerance: float = Field(
        default=0.001,
        gt=0,
        description="Constraint tolerance for locked axes"
    )

    @field_validator('xyz')
    @classmethod
    def validate_xyz(cls, v):
        if v is not None and len(v) != 3:
            raise ValueError("xyz must be exactly 3 elements")
        return v

    @field_validator('locked')
    @classmethod
    def validate_locked(cls, v):
        if v is not None and len(v) != 3:
            raise ValueError("locked must be exactly 3 elements")
        return v

    def to_numpy(self) -> Optional[np.ndarray]:
        """Convert coordinates to numpy array."""
        if self.xyz is None:
            return None
        return np.array(self.xyz)

    def set_from_numpy(self, xyz: np.ndarray) -> None:
        """Set coordinates from numpy array.

        Only updates free axes - locked axes remain unchanged.
        """
        if xyz.shape != (3,):
            raise ValueError("xyz must be 3-element array")

        if self.xyz is None:
            # Initialize all axes
            self.xyz = xyz.tolist()
        else:
            # Preserve locked axes, update free axes
            lock_mask = self.get_lock_mask()
            self.xyz = [
                self.xyz[i] if lock_mask[i] else xyz[i]
                for i in range(3)
            ]

    def is_initialized(self) -> bool:
        """Check if point has coordinate data."""
        return self.xyz is not None

    def has_locked_axes(self) -> bool:
        """Check if any axes are locked."""
        if self.locked is None:
            return False
        return any(self.locked)

    def get_lock_mask(self) -> List[bool]:
        """Get boolean mask indicating which axes are locked."""
        if self.locked is None:
            return [False, False, False]
        return self.locked

    def get_locked_values(self) -> List[Optional[float]]:
        """Get the coordinate values for locked axes.

        Returns None for unlocked axes, the coordinate value for locked axes.
        """
        if self.xyz is None or self.locked is None:
            return [None, None, None]
        return [
            self.xyz[i] if self.locked[i] else None
            for i in range(3)
        ]


class Image(BaseModel):
    """Image with metadata."""

    id: str = Field(description="Unique identifier for the image")
    path: str = Field(description="Path to image file")
    width: int = Field(gt=0, description="Image width in pixels")
    height: int = Field(gt=0, description="Image height in pixels")

    def aspect_ratio(self) -> float:
        """Get image aspect ratio."""
        return self.width / self.height

    def contains_pixel(self, u: float, v: float) -> bool:
        """Check if pixel coordinates are within image bounds."""
        return 0 <= u < self.width and 0 <= v < self.height


class CameraLockFlags(BaseModel):
    """Flags indicating which camera parameters should be locked during optimization."""

    intrinsics: bool = Field(default=False, description="Lock intrinsic parameters")
    rotation: bool = Field(default=False, description="Lock rotation")
    translation: bool = Field(default=False, description="Lock translation")


class Camera(BaseModel):
    """Camera with intrinsics and extrinsics."""

    id: str = Field(description="Unique identifier for the camera")
    image_id: str = Field(description="Associated image ID")
    K: List[float] = Field(
        description="Intrinsics [fx, fy, cx, cy, k1, k2?]",
        min_length=4,
        max_length=6
    )
    R: List[float] = Field(
        description="Rotation as axis-angle [rx, ry, rz]",
        min_length=3,
        max_length=3
    )
    t: List[float] = Field(
        description="Translation [tx, ty, tz]",
        min_length=3,
        max_length=3
    )
    lock_flags: Optional[CameraLockFlags] = Field(
        default=None,
        description="Parameter lock flags"
    )

    @field_validator('K')
    @classmethod
    def validate_K(cls, v):
        if len(v) < 4 or len(v) > 6:
            raise ValueError("K must have 4-6 elements")
        return v

    @field_validator('R')
    @classmethod
    def validate_R(cls, v):
        if len(v) != 3:
            raise ValueError("R must have exactly 3 elements")
        return v

    @field_validator('t')
    @classmethod
    def validate_t(cls, v):
        if len(v) != 3:
            raise ValueError("t must have exactly 3 elements")
        return v

    def get_intrinsics(self) -> np.ndarray:
        """Get intrinsics as numpy array."""
        return np.array(self.K)

    def get_rotation(self) -> np.ndarray:
        """Get rotation as numpy array."""
        return np.array(self.R)

    def get_translation(self) -> np.ndarray:
        """Get translation as numpy array."""
        return np.array(self.t)

    def set_intrinsics(self, K: np.ndarray) -> None:
        """Set intrinsics from numpy array."""
        if K.shape[0] < 4 or K.shape[0] > 6:
            raise ValueError("K must have 4-6 elements")
        self.K = K.tolist()

    def set_rotation(self, R: np.ndarray) -> None:
        """Set rotation from numpy array."""
        if R.shape != (3,):
            raise ValueError("R must be 3-element array")
        self.R = R.tolist()

    def set_translation(self, t: np.ndarray) -> None:
        """Set translation from numpy array."""
        if t.shape != (3,):
            raise ValueError("t must be 3-element array")
        self.t = t.tolist()

    def get_focal_length(self) -> tuple[float, float]:
        """Get focal lengths (fx, fy)."""
        return self.K[0], self.K[1]

    def get_principal_point(self) -> tuple[float, float]:
        """Get principal point (cx, cy)."""
        return self.K[2], self.K[3]

    def has_distortion(self) -> bool:
        """Check if camera has distortion parameters."""
        return len(self.K) > 4

    def get_distortion(self) -> List[float]:
        """Get distortion parameters [k1, k2?]."""
        return self.K[4:] if self.has_distortion() else []


class LineConstraints(BaseModel):
    """Embedded constraints for a line entity."""

    direction: Literal['free', 'horizontal', 'vertical', 'x-aligned', 'z-aligned'] = Field(
        default='free',
        description="Direction constraint for the line"
    )
    targetLength: Optional[float] = Field(
        default=None,
        ge=0,
        description="Target length in meters (optional)"
    )
    tolerance: float = Field(
        default=0.001,
        gt=0,
        description="Constraint tolerance"
    )


class Line(BaseModel):
    """Line entity connecting two world points with optional constraints."""

    id: str = Field(description="Unique identifier for the line")
    name: str = Field(description="Display name (e.g., 'L1', 'Loop_1')")
    pointA: str = Field(description="First world point ID")
    pointB: str = Field(description="Second world point ID")
    constraints: Optional[LineConstraints] = Field(
        default=None,
        description="Embedded geometric constraints"
    )

    def has_constraints(self) -> bool:
        """Check if line has any active constraints."""
        if self.constraints is None:
            return False
        return (
            self.constraints.direction != 'free' or
            self.constraints.targetLength is not None
        )

    def get_constraint_dict(self) -> Dict[str, Any]:
        """Get constraints as dictionary for residual creation."""
        if self.constraints is None:
            return {
                'direction': 'free',
                'targetLength': None,
                'tolerance': 0.001
            }
        return {
            'direction': self.constraints.direction,
            'targetLength': self.constraints.targetLength,
            'tolerance': self.constraints.tolerance
        }