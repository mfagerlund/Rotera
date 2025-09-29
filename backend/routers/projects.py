"""Project management API routes."""

import json
import os
import tempfile
from typing import Any

from fastapi import APIRouter, Body, File, HTTPException, UploadFile

from pictorigo.core.models.project import Project

router = APIRouter(prefix="/projects", tags=["projects"])

# In-memory project store (replace with database in production)
projects_store: dict[str, Project] = {}


@router.post("/", response_model=dict[str, str])
async def create_project() -> dict[str, str]:
    """Create a new empty project."""
    project = Project()
    project_id = f"project_{len(projects_store)}"
    projects_store[project_id] = project

    return {"project_id": project_id, "status": "created"}


@router.get("/{project_id}")
async def get_project(project_id: str) -> dict:
    """Get project by ID - returns frontend format."""
    if project_id not in projects_store:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects_store[project_id]
    return project.to_frontend_format()


@router.put("/{project_id}")
async def update_project(project_id: str, project_data: dict = Body(...)) -> dict[str, str]:
    """Update project - accepts frontend format."""
    try:
        # Convert frontend format to backend Project
        project = Project.from_frontend_format(project_data)
        project.id = project_id  # Ensure ID matches URL
        projects_store[project_id] = project
        return {"status": "updated"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid project data: {str(e)}")


@router.post("/{project_id}/from-frontend")
async def create_project_from_frontend(project_id: str, project_data: dict = Body(...)) -> dict[str, str]:
    """Create/update project from frontend format."""
    try:
        project = Project.from_frontend_format(project_data)
        project.id = project_id
        projects_store[project_id] = project
        return {"status": "created", "project_id": project_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid project data: {str(e)}")


@router.delete("/{project_id}")
async def delete_project(project_id: str) -> dict[str, str]:
    """Delete project."""
    if project_id not in projects_store:
        raise HTTPException(status_code=404, detail="Project not found")

    del projects_store[project_id]
    return {"status": "deleted"}


@router.post("/{project_id}/upload")
async def upload_project(
    project_id: str, file: UploadFile = File(...)
) -> dict[str, str]:
    """Upload project from .pgo file."""
    try:
        content = await file.read()

        # Save to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pgo") as temp_file:
            temp_file.write(content)
            temp_path = temp_file.name

        try:
            # Parse JSON data
            project_data = json.loads(content.decode("utf-8"))

            # Try to determine if this is frontend or backend format
            if "worldPoints" in project_data or "nextWpNumber" in project_data:
                # Frontend format
                project = Project.from_frontend_format(project_data)
            else:
                # Backend format
                project = Project(**project_data)

            project.id = project_id  # Ensure ID matches
            projects_store[project_id] = project

            return {"status": "uploaded", "project_id": project_id}

        finally:
            os.unlink(temp_path)

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Upload failed: {str(e)}")


@router.get("/{project_id}/summary")
async def get_project_summary(project_id: str) -> dict[str, Any]:
    """Get project summary."""
    if project_id not in projects_store:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects_store[project_id]

    summary = {
        "world_points": len(project.world_points),
        "images": len(project.images),
        "cameras": len(project.cameras),
        "constraints": len(project.constraints),
        "constraint_types": {},
    }

    # Count constraint types
    for constraint in project.constraints:
        constraint_type = constraint.constraint_type()
        summary["constraint_types"][constraint_type] = (
            summary["constraint_types"].get(constraint_type, 0) + 1
        )

    return summary


@router.get("/{project_id}/validate")
async def validate_project(project_id: str) -> dict[str, Any]:
    """Validate project consistency."""
    if project_id not in projects_store:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects_store[project_id]
    issues = project.validate_project()

    return {"valid": len(issues) == 0, "issues": issues}
