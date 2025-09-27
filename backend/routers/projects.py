"""Project management API routes."""

from fastapi import APIRouter, HTTPException, UploadFile, File
from typing import Dict, Any, Optional
import json
import tempfile
import os

from pictorigo.core.models.project import Project
from pictorigo.core.optimization.problem import OptimizationProblem
from pictorigo.core.solver.scipy_solver import SciPySolver, SolverOptions
from pictorigo.core.initialization.incremental import IncrementalSolver

router = APIRouter(prefix="/projects", tags=["projects"])

# In-memory project store (replace with database in production)
projects_store: Dict[str, Project] = {}


@router.post("/", response_model=Dict[str, str])
async def create_project() -> Dict[str, str]:
    """Create a new empty project."""
    project = Project()
    project_id = f"project_{len(projects_store)}"
    projects_store[project_id] = project

    return {"project_id": project_id, "status": "created"}


@router.get("/{project_id}")
async def get_project(project_id: str) -> Project:
    """Get project by ID."""
    if project_id not in projects_store:
        raise HTTPException(status_code=404, detail="Project not found")

    return projects_store[project_id]


@router.put("/{project_id}")
async def update_project(project_id: str, project: Project) -> Dict[str, str]:
    """Update project."""
    projects_store[project_id] = project
    return {"status": "updated"}


@router.delete("/{project_id}")
async def delete_project(project_id: str) -> Dict[str, str]:
    """Delete project."""
    if project_id not in projects_store:
        raise HTTPException(status_code=404, detail="Project not found")

    del projects_store[project_id]
    return {"status": "deleted"}


@router.post("/{project_id}/upload")
async def upload_project(project_id: str, file: UploadFile = File(...)) -> Dict[str, str]:
    """Upload project from .pgo file."""
    try:
        content = await file.read()

        # Save to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pgo') as temp_file:
            temp_file.write(content)
            temp_path = temp_file.name

        try:
            # For now, assume .pgo is just JSON (will implement zip format later)
            project_data = json.loads(content.decode('utf-8'))
            project = Project(**project_data)
            projects_store[project_id] = project

            return {"status": "uploaded", "project_id": project_id}

        finally:
            os.unlink(temp_path)

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Upload failed: {str(e)}")


@router.get("/{project_id}/summary")
async def get_project_summary(project_id: str) -> Dict[str, Any]:
    """Get project summary."""
    if project_id not in projects_store:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects_store[project_id]

    summary = {
        "world_points": len(project.world_points),
        "images": len(project.images),
        "cameras": len(project.cameras),
        "constraints": len(project.constraints),
        "constraint_types": {}
    }

    # Count constraint types
    for constraint in project.constraints:
        constraint_type = constraint.constraint_type()
        summary["constraint_types"][constraint_type] = summary["constraint_types"].get(constraint_type, 0) + 1

    return summary


@router.get("/{project_id}/validate")
async def validate_project(project_id: str) -> Dict[str, Any]:
    """Validate project consistency."""
    if project_id not in projects_store:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects_store[project_id]
    issues = project.validate_project()

    return {
        "valid": len(issues) == 0,
        "issues": issues
    }