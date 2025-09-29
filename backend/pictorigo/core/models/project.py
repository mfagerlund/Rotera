"""Project model matching frontend Project DTO."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from .entities import Camera, Constraint, Image, Line, Plane, WorldPoint


class ProjectSettings(BaseModel):
    """Project settings matching frontend."""

    show_point_names: bool = True
    auto_save: bool = True
    theme: str = "dark"
    measurement_units: str = "meters"
    precision_digits: int = 3
    show_constraint_glyphs: bool = True
    show_measurements: bool = True
    auto_optimize: bool = False
    grid_visible: bool = True
    snap_to_grid: bool = False
    default_workspace: str = "image"
    show_construction_geometry: bool = True
    enable_smart_snapping: bool = True
    constraint_preview: bool = True
    visual_feedback_level: str = "standard"


class PointGroup(BaseModel):
    """Point group definition."""

    id: str | None = None
    name: str
    color: str
    visible: bool = True
    points: list[str] = Field(default_factory=list)


class GroundPlane(BaseModel):
    """Ground plane definition."""

    id: str
    name: str
    point_ids: list[str] = Field(min_items=3, max_items=3)
    equation: list[float] | None = Field(None, min_items=4, max_items=4)


class ProjectHistoryEntry(BaseModel):
    """Project history entry."""

    id: str
    timestamp: str
    action: str
    description: str
    before: Any | None = None
    after: Any | None = None


class SolveResult(BaseModel):
    """Solve result for optimization."""

    success: bool
    iterations: int
    final_cost: float
    convergence_reason: str
    computation_time: float
    residuals: float | None = None


class OptimizationInfo(BaseModel):
    """Optimization information."""

    last_run: str | None = None
    status: str = "not_run"  # 'not_run', 'running', 'converged', 'failed'
    residuals: float | None = None
    iterations: int | None = None


class CoordinateSystem(BaseModel):
    """Coordinate system definition."""

    origin: str  # World point ID
    scale: float | None = None
    ground_plane: dict | None = None


class Project(BaseModel):
    """Main project model matching frontend Project DTO."""

    id: str = ""
    name: str = "New Project"

    # Core data - using dicts for fast lookup like frontend
    world_points: dict[str, WorldPoint] = Field(default_factory=dict)
    lines: dict[str, Line] = Field(default_factory=dict)
    planes: dict[str, Plane] = Field(default_factory=dict)
    images: dict[str, Image] = Field(default_factory=dict)
    cameras: dict[str, Camera] = Field(default_factory=dict)
    constraints: list[Constraint] = Field(default_factory=list)

    # Auto-naming counters
    next_wp_number: int = 1
    next_line_number: int = 1
    next_plane_number: int = 1

    # Configuration
    settings: ProjectSettings = Field(default_factory=ProjectSettings)
    coordinate_system: CoordinateSystem | None = None
    point_groups: dict[str, PointGroup] = Field(default_factory=dict)

    # Optimization state
    optimization: OptimizationInfo | None = Field(default_factory=OptimizationInfo)
    ground_planes: list[GroundPlane] = Field(default_factory=list)

    # History and metadata
    history: list[ProjectHistoryEntry] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())

    # Diagnostics (for solver results)
    diagnostics: SolveResult | None = None

    def __init__(self, **data):
        super().__init__(**data)
        if not self.id:
            self.id = f"project_{int(datetime.now().timestamp())}"

    def validate_project(self) -> list[str]:
        """Validate project consistency."""
        issues = []

        # Check point references in lines
        for line_id, line in self.lines.items():
            if line.point_a not in self.world_points:
                issues.append(f"Line {line_id} references non-existent point {line.point_a}")
            if line.point_b not in self.world_points:
                issues.append(f"Line {line_id} references non-existent point {line.point_b}")

        # Check entity references in constraints
        for i, constraint in enumerate(self.constraints):
            # Check point references
            for point_id in constraint.get_point_ids():
                if point_id not in self.world_points:
                    issues.append(f"Constraint {i} references non-existent point {point_id}")

            # Check line references
            for line_id in constraint.get_line_ids():
                if line_id not in self.lines:
                    issues.append(f"Constraint {i} references non-existent line {line_id}")

            # Check plane references
            for plane_id in constraint.get_plane_ids():
                if plane_id not in self.planes:
                    issues.append(f"Constraint {i} references non-existent plane {plane_id}")

        # Check camera-image associations
        for camera_id, camera in self.cameras.items():
            if camera.image_id not in self.images:
                issues.append(f"Camera {camera_id} references non-existent image {camera.image_id}")

        return issues

    def get_stats(self) -> dict[str, int]:
        """Get project statistics."""
        return {
            "world_points": len(self.world_points),
            "lines": len(self.lines),
            "planes": len(self.planes),
            "images": len(self.images),
            "cameras": len(self.cameras),
            "constraints": len(self.constraints)
        }

    def add_world_point(self, point: WorldPoint) -> None:
        """Add a world point to the project."""
        self.world_points[point.id] = point
        self.updated_at = datetime.now().isoformat()

    def add_line(self, line: Line) -> None:
        """Add a line to the project."""
        self.lines[line.id] = line
        self.updated_at = datetime.now().isoformat()

    def add_plane(self, plane: Plane) -> None:
        """Add a plane to the project."""
        self.planes[plane.id] = plane
        self.updated_at = datetime.now().isoformat()

    def add_image(self, image: Image) -> None:
        """Add an image to the project."""
        self.images[image.id] = image
        self.updated_at = datetime.now().isoformat()

    def add_camera(self, camera: Camera) -> None:
        """Add a camera to the project."""
        self.cameras[camera.id] = camera
        self.updated_at = datetime.now().isoformat()

    def add_constraint(self, constraint: Constraint) -> None:
        """Add a constraint to the project."""
        self.constraints.append(constraint)
        self.updated_at = datetime.now().isoformat()

    def remove_world_point(self, point_id: str) -> None:
        """Remove a world point and dependent entities."""
        if point_id in self.world_points:
            del self.world_points[point_id]

            # Remove dependent lines
            lines_to_remove = []
            for line_id, line in self.lines.items():
                if line.point_a == point_id or line.point_b == point_id:
                    lines_to_remove.append(line_id)

            for line_id in lines_to_remove:
                del self.lines[line_id]

            # Remove dependent constraints
            constraints_to_remove = []
            for i, constraint in enumerate(self.constraints):
                if point_id in constraint.get_point_ids():
                    constraints_to_remove.append(i)

            # Remove in reverse order to maintain indices
            for i in reversed(constraints_to_remove):
                del self.constraints[i]

            self.updated_at = datetime.now().isoformat()

    def get_constraint_types_summary(self) -> dict[str, int]:
        """Get summary of constraint types."""
        summary = {}
        for constraint in self.constraints:
            constraint_type = constraint.constraint_type()
            summary[constraint_type] = summary.get(constraint_type, 0) + 1
        return summary

    def to_frontend_format(self) -> dict:
        """Convert to frontend Project format."""
        return {
            "id": self.id,
            "name": self.name,
            "worldPoints": {k: dict(v) for k, v in self.world_points.items()},
            "lines": {k: dict(v) for k, v in self.lines.items()},
            "planes": {k: dict(v) for k, v in self.planes.items()},
            "images": {k: dict(v) for k, v in self.images.items()},
            "cameras": {k: v.to_frontend_format() for k, v in self.cameras.items()},
            "constraints": [dict(c) for c in self.constraints],
            "nextWpNumber": self.next_wp_number,
            "nextLineNumber": self.next_line_number,
            "nextPlaneNumber": self.next_plane_number,
            "settings": dict(self.settings),
            "coordinateSystem": dict(self.coordinate_system) if self.coordinate_system else None,
            "pointGroups": {k: dict(v) for k, v in self.point_groups.items()},
            "optimization": dict(self.optimization) if self.optimization else None,
            "groundPlanes": [dict(gp) for gp in self.ground_planes],
            "history": [dict(h) for h in self.history],
            "createdAt": self.created_at,
            "updatedAt": self.updated_at
        }

    @classmethod
    def from_frontend_format(cls, data: dict) -> 'Project':
        """Create project from frontend format."""
        # Convert frontend format to backend format
        project_data = {
            "id": data.get("id", ""),
            "name": data.get("name", "New Project"),
            "world_points": {k: WorldPoint(**v) for k, v in data.get("worldPoints", {}).items()},
            "lines": {k: Line(**v) for k, v in data.get("lines", {}).items()},
            "planes": {k: Plane(**v) for k, v in data.get("planes", {}).items()},
            "images": {k: Image(**v) for k, v in data.get("images", {}).items()},
            "cameras": {},  # Will be converted from frontend format
            "constraints": [Constraint(**c) for c in data.get("constraints", [])],
            "next_wp_number": data.get("nextWpNumber", 1),
            "next_line_number": data.get("nextLineNumber", 1),
            "next_plane_number": data.get("nextPlaneNumber", 1),
            "settings": ProjectSettings(**data.get("settings", {})),
            "coordinate_system": CoordinateSystem(**data["coordinateSystem"]) if data.get("coordinateSystem") else None,
            "point_groups": {k: PointGroup(**v) for k, v in data.get("pointGroups", {}).items()},
            "optimization": OptimizationInfo(**data["optimization"]) if data.get("optimization") else OptimizationInfo(),
            "ground_planes": [GroundPlane(**gp) for gp in data.get("groundPlanes", [])],
            "history": [ProjectHistoryEntry(**h) for h in data.get("history", [])],
            "created_at": data.get("createdAt", datetime.now().isoformat()),
            "updated_at": data.get("updatedAt", datetime.now().isoformat())
        }

        # Convert cameras from frontend format
        for k, v in data.get("cameras", {}).items():
            # Convert frontend Camera to backend Camera format
            camera_data = {
                "id": v["id"],
                "name": v.get("name", ""),
                "image_id": v.get("imageId", ""),  # Handle different naming
                "K": [],  # Will be filled from intrinsics
                "R": v.get("extrinsics", {}).get("rotation", [0, 0, 0]),
                "t": v.get("extrinsics", {}).get("translation", [0, 0, 0])
            }

            # Convert intrinsics to K format
            intrinsics = v.get("intrinsics", {})
            if intrinsics:
                camera_data["K"] = [
                    intrinsics.get("fx", 500.0),
                    intrinsics.get("fy", 500.0),
                    intrinsics.get("cx", 320.0),
                    intrinsics.get("cy", 240.0)
                ]
                # Add distortion if present
                if "k1" in intrinsics:
                    camera_data["K"].append(intrinsics["k1"])
                if "k2" in intrinsics:
                    camera_data["K"].append(intrinsics["k2"])

            project_data["cameras"][k] = Camera(**camera_data)

        return cls(**project_data)
