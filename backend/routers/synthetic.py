"""Synthetic scene generation API routes."""

from fastapi import APIRouter, HTTPException
from pictorigo.core.synthetic import make_box_room, make_grid_plane, make_two_view
from pydantic import BaseModel

from .projects import projects_store

router = APIRouter(prefix="/synthetic", tags=["synthetic"])


class BoxRoomRequest(BaseModel):
    """Request model for box room generation."""

    room_size: tuple[float, float, float] = (5.0, 4.0, 3.0)
    n_cameras: int = 4
    camera_height: float = 1.5
    camera_radius: float = 2.0
    seed: int | None = None


class GridPlaneRequest(BaseModel):
    """Request model for grid plane generation."""

    grid_size: tuple[int, int] = (5, 5)
    spacing: float = 1.0
    n_cameras: int = 3
    seed: int | None = None


class TwoViewRequest(BaseModel):
    """Request model for two-view scene generation."""

    n_points: int = 20
    baseline: float = 2.0
    seed: int | None = None


@router.post("/box-room")
async def create_box_room(request: BoxRoomRequest) -> dict[str, str]:
    """Generate a synthetic box room scene."""
    try:
        project = make_box_room(
            room_size=request.room_size,
            n_cameras=request.n_cameras,
            camera_height=request.camera_height,
            camera_radius=request.camera_radius,
            seed=request.seed,
        )

        project_id = f"synthetic_box_room_{len(projects_store)}"
        projects_store[project_id] = project

        return {"project_id": project_id, "type": "box_room", "status": "created"}

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to create box room: {str(e)}"
        )


@router.post("/grid-plane")
async def create_grid_plane(request: GridPlaneRequest) -> dict[str, str]:
    """Generate a synthetic grid plane scene."""
    try:
        project = make_grid_plane(
            grid_size=request.grid_size,
            spacing=request.spacing,
            n_cameras=request.n_cameras,
            seed=request.seed,
        )

        project_id = f"synthetic_grid_plane_{len(projects_store)}"
        projects_store[project_id] = project

        return {"project_id": project_id, "type": "grid_plane", "status": "created"}

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to create grid plane: {str(e)}"
        )


@router.post("/two-view")
async def create_two_view(request: TwoViewRequest) -> dict[str, str]:
    """Generate a synthetic two-view scene."""
    try:
        project = make_two_view(
            n_points=request.n_points, baseline=request.baseline, seed=request.seed
        )

        project_id = f"synthetic_two_view_{len(projects_store)}"
        projects_store[project_id] = project

        return {"project_id": project_id, "type": "two_view", "status": "created"}

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to create two-view scene: {str(e)}"
        )
