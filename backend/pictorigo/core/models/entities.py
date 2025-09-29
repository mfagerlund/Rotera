"""Core entity models for Pictorigo backend."""

from typing import Any

import numpy as np
from pydantic import BaseModel, Field, validator


class WorldPoint(BaseModel):
    """World point entity matching frontend WorldPoint DTO."""

    id: str
    name: str = ""
    xyz: list[float] | None = Field(None, min_length=3, max_length=3)
    image_points: list[dict[str, Any]] = Field(default_factory=list)
    is_visible: bool = True
    color: str = "#ffffff"
    is_origin: bool = False
    is_locked: bool = False
    group: str | None = None
    tags: list[str] = Field(default_factory=list)
    created_at: str | None = None

    @validator("xyz")
    def validate_xyz(cls, v: list[float] | None) -> list[float] | None:  # noqa: N805
        if v is not None and len(v) != 3:
            raise ValueError("xyz must have exactly 3 coordinates")
        return v

    def is_initialized(self) -> bool:
        """Check if point has coordinates."""
        return self.xyz is not None

    def to_numpy(self) -> np.ndarray:
        """Convert coordinates to numpy array."""
        if self.xyz is None:
            raise ValueError("Point has no coordinates")
        return np.array(self.xyz)

    def set_from_numpy(self, arr: np.ndarray) -> None:
        """Set coordinates from numpy array."""
        if arr.shape != (3,):
            raise ValueError("Array must have shape (3,)")
        self.xyz = arr.tolist()

    def has_coordinates(self) -> bool:
        """Check if point has valid coordinates."""
        return self.xyz is not None

    def distance_to(self, other: "WorldPoint") -> float | None:
        """Calculate distance to another world point."""
        if not self.has_coordinates() or not other.has_coordinates():
            return None

        p1 = np.array(self.xyz)
        p2 = np.array(other.xyz)
        return float(np.linalg.norm(p2 - p1))


class ImagePoint(BaseModel):
    """Image point observation."""

    image_id: str
    u: float  # Pixel x coordinate
    v: float  # Pixel y coordinate
    wp_id: str  # Associated world point ID


class Image(BaseModel):
    """Image entity matching frontend ProjectImage DTO."""

    id: str
    name: str = ""
    path: str = ""  # File path instead of blob for backend
    blob: str | None = None  # Base64 data if provided
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    camera_id: str | None = None

    def aspect_ratio(self) -> float:
        """Calculate aspect ratio."""
        return self.width / self.height

    def contains_pixel(self, u: int, v: int) -> bool:
        """Check if pixel coordinates are within image bounds."""
        return 0 <= u < self.width and 0 <= v < self.height


class CameraIntrinsics(BaseModel):
    """Camera intrinsics matching frontend."""

    fx: float
    fy: float
    cx: float
    cy: float
    k1: float | None = None
    k2: float | None = None
    k3: float | None = None
    p1: float | None = None
    p2: float | None = None


class CameraExtrinsics(BaseModel):
    """Camera extrinsics matching frontend."""

    rotation: list[float] = Field(min_length=3, max_length=3)  # Rodrigues vector
    translation: list[float] = Field(min_length=3, max_length=3)  # Translation vector


class CameraLockFlags(BaseModel):
    """Camera lock flags for optimization."""

    intrinsics: bool = False
    rotation: bool = False
    translation: bool = False


class Camera(BaseModel):
    """Camera entity matching frontend Camera DTO."""

    id: str
    name: str = ""
    image_id: str

    # Backend uses different format for optimization
    K: list[float] = Field(
        min_length=4
    )  # [fx, fy, cx, cy] or [fx, fy, cx, cy, k1, k2, ...]
    R: list[float] = Field(min_length=3, max_length=3)  # Rodrigues rotation vector
    t: list[float] = Field(min_length=3, max_length=3)  # Translation vector

    # Optional fields
    intrinsics: CameraIntrinsics | None = None
    extrinsics: CameraExtrinsics | None = None
    calibration_quality: float | None = None
    calibration_method: str | None = None
    lock_flags: CameraLockFlags | None = None

    @validator("K")
    def validate_k(cls, v: list[float]) -> list[float]:  # noqa: N805
        if len(v) < 4:
            raise ValueError("K must have at least 4 elements [fx, fy, cx, cy]")
        return v

    def has_distortion(self) -> bool:
        """Check if camera has distortion parameters."""
        return len(self.K) > 4

    def get_distortion(self) -> list[float]:
        """Get distortion parameters."""
        return self.K[4:] if self.has_distortion() else []

    def get_intrinsics(self) -> np.ndarray:
        """Get intrinsics as numpy array."""
        return np.array(self.K)

    def get_rotation(self) -> np.ndarray:
        """Get rotation as numpy array."""
        return np.array(self.R)

    def get_translation(self) -> np.ndarray:
        """Get translation as numpy array."""
        return np.array(self.t)

    def set_intrinsics(self, k: np.ndarray) -> None:
        """Set intrinsics from numpy array."""
        if k.shape[0] < 4:
            raise ValueError("K must have at least 4 elements")
        self.K = k.tolist()

    def set_rotation(self, r: np.ndarray) -> None:
        """Set rotation from numpy array."""
        if r.shape != (3,):
            raise ValueError("R must have shape (3,)")
        self.R = r.tolist()

    def set_translation(self, t: np.ndarray) -> None:
        """Set translation from numpy array."""
        if t.shape != (3,):
            raise ValueError("t must have shape (3,)")
        self.t = t.tolist()

    def get_focal_length(self) -> tuple[float, float]:
        """Get focal length components."""
        return self.K[0], self.K[1]

    def get_principal_point(self) -> tuple[float, float]:
        """Get principal point."""
        return self.K[2], self.K[3]

    def to_frontend_format(self) -> dict[str, Any]:
        """Convert to frontend Camera format."""
        result = {
            "id": self.id,
            "name": self.name,
            "intrinsics": {
                "fx": self.K[0],
                "fy": self.K[1],
                "cx": self.K[2],
                "cy": self.K[3],
            },
            "extrinsics": {"rotation": self.R, "translation": self.t},
        }

        # Add distortion if present
        if self.has_distortion():
            distortion = self.get_distortion()
            intrinsics = result["intrinsics"]
            assert isinstance(intrinsics, dict)  # Type hint for mypy
            if len(distortion) >= 1:
                intrinsics["k1"] = distortion[0]
            if len(distortion) >= 2:
                intrinsics["k2"] = distortion[1]
            if len(distortion) >= 3:
                intrinsics["k3"] = distortion[2]
            if len(distortion) >= 4:
                intrinsics["p1"] = distortion[3]
            if len(distortion) >= 5:
                intrinsics["p2"] = distortion[4]

        return result


class LineConstraintSettings(BaseModel):
    """Line constraint settings embedded in Line entity."""

    direction: str = "free"  # 'free', 'horizontal', 'vertical', 'x-aligned'...
    distance: str = "free"  # 'free' or 'fixed' - whether length is constrained
    target_length: float | None = (
        None  # Fixed length constraint (if undefined, length is free)
    )
    tolerance: float = 0.001


class Line(BaseModel):
    """Line entity matching frontend Line DTO."""

    id: str
    name: str
    point_a: str  # WorldPoint ID
    point_b: str  # WorldPoint ID
    color: str = "#ffffff"
    is_visible: bool = True
    is_construction: bool = False
    line_style: str = "solid"
    thickness: float = 1.0

    # NEW: Constraint settings embedded in line
    constraints: LineConstraintSettings = Field(default_factory=LineConstraintSettings)

    group: str | None = None
    tags: list[str] = Field(default_factory=list)
    created_at: str | None = None
    updated_at: str | None = None

    def to_solver_dto(self) -> dict[str, Any]:
        """Convert to minimal solver DTO format."""
        return {"id": self.id, "pointA": self.point_a, "pointB": self.point_b}


class Plane(BaseModel):
    """Plane entity matching frontend Plane DTO."""

    id: str
    name: str
    definition: dict[str, Any]  # Plane definition (three_points, etc.)
    equation: list[float] | None = Field(
        None, min_length=4, max_length=4
    )  # [a, b, c, d]
    is_visible: bool = True
    color: str = "#ffffff"
    is_construction: bool = False
    created_at: str | None = None


# Constraint types matching frontend
# NOTE: horizontal_line, vertical_line, distance moved to Line entity properties
CONSTRAINT_TYPES = [
    "distance_point_point",
    "distance_point_line",
    "distance_point_plane",
    "angle_point_point_point",
    "angle_line_line",
    "parallel_lines",
    "perpendicular_lines",
    "collinear_points",
    "coplanar_points",
    "fixed_point",
    "equal_distances",
    "equal_angles",
]

CONSTRAINT_STATUS_TYPES = ["satisfied", "violated", "warning", "disabled"]


class Constraint(BaseModel):
    """Constraint entity matching frontend ConstraintDto."""

    id: str
    name: str
    type: str  # One of CONSTRAINT_TYPES
    status: str = "satisfied"  # One of CONSTRAINT_STATUS_TYPES

    # Entity references
    entities: dict[str, Any] = Field(
        default_factory=dict
    )  # {points: [...], lines: [...], planes: [...]}

    # Constraint parameters
    parameters: dict[str, Any] = Field(default_factory=dict)

    # Runtime state
    current_value: float | None = None
    error: float | None = None
    is_enabled: bool = True
    is_driving: bool = False

    # Metadata
    group: str | None = None
    tags: list[str] = Field(default_factory=list)
    notes: str | None = None
    created_at: str | None = None
    updated_at: str | None = None

    @validator("type")
    def validate_constraint_type(cls, v: str) -> str:  # noqa: N805
        if v not in CONSTRAINT_TYPES:
            raise ValueError(f"Invalid constraint type: {v}")
        return v

    @validator("status")
    def validate_status(cls, v: str) -> str:  # noqa: N805
        if v not in CONSTRAINT_STATUS_TYPES:
            raise ValueError(f"Invalid constraint status: {v}")
        return v

    def constraint_type(self) -> str:
        """Get constraint type (for compatibility)."""
        return self.type

    def get_point_ids(self) -> list[str]:
        """Get point IDs referenced by this constraint."""
        points = self.entities.get("points", [])
        return points if isinstance(points, list) else []

    def get_line_ids(self) -> list[str]:
        """Get line IDs referenced by this constraint."""
        lines = self.entities.get("lines", [])
        return lines if isinstance(lines, list) else []

    def get_plane_ids(self) -> list[str]:
        """Get plane IDs referenced by this constraint."""
        planes = self.entities.get("planes", [])
        return planes if isinstance(planes, list) else []
