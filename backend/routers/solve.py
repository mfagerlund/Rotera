"""Solver API routes."""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional
from pydantic import BaseModel
import time
import asyncio

from pictorigo.core.models.project import SolveResult
from pictorigo.core.optimization.problem import OptimizationProblem
from pictorigo.core.solver.scipy_solver import SciPySolver, SolverOptions
from pictorigo.core.initialization.incremental import IncrementalSolver
from .projects import projects_store

router = APIRouter(prefix="/solve", tags=["solve"])


class SolveRequest(BaseModel):
    """Request model for solve operation."""

    method: str = "lm"  # "lm", "trf", "dogbox"
    max_iterations: int = 100
    tolerance: float = 1e-6
    use_incremental: bool = False
    robust_loss: str = "none"  # "none", "huber", "cauchy"
    robust_loss_params: Dict[str, float] = {}
    test_mode: bool = False  # Add artificial delays for testing cancellation
    test_delay_seconds: float = 10.0  # How long to delay in test mode


@router.post("/{project_id}")
async def solve_project(project_id: str, request: SolveRequest) -> SolveResult:
    """Solve optimization problem for project."""
    if project_id not in projects_store:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects_store[project_id]

    # Add artificial delay for testing cancellation
    if request.test_mode:
        print(f"Test mode: Adding {request.test_delay_seconds} second delay...")
        await asyncio.sleep(request.test_delay_seconds)
        print("Test delay complete, starting optimization...")

    try:
        if request.use_incremental:
            # Use incremental solver
            solver_options = SolverOptions(
                method=request.method,
                max_iterations=request.max_iterations,
                tolerance=request.tolerance
            )

            incremental_solver = IncrementalSolver(solver_options=solver_options)
            incremental_result = incremental_solver.solve_incremental(project)

            # Convert to SolveResult format
            result = SolveResult(
                success=incremental_result["success"],
                iterations=incremental_result["total_iterations"],
                final_cost=incremental_result["final_cost"],
                convergence_reason="Incremental reconstruction",
                computation_time=0.0  # Not tracked in incremental solver
            )

        else:
            # Use direct bundle adjustment
            problem = OptimizationProblem(project)
            factor_graph = problem.build_factor_graph()

            # Apply robust loss if requested
            if request.robust_loss != "none":
                problem.set_robust_loss_for_constraint_type(
                    "image_point", request.robust_loss, **request.robust_loss_params
                )

            # Configure solver
            solver_options = SolverOptions(
                method=request.method,
                max_iterations=request.max_iterations,
                tolerance=request.tolerance
            )

            solver = SciPySolver(solver_options)
            result = solver.solve(factor_graph)

            # Extract solution back to project
            if result.success:
                problem.extract_solution_to_project()

        # Store diagnostics in project
        project.diagnostics = result
        projects_store[project_id] = project

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Solve failed: {str(e)}")


@router.get("/{project_id}/diagnostics")
async def get_solve_diagnostics(project_id: str) -> Dict[str, Any]:
    """Get solve diagnostics for project."""
    if project_id not in projects_store:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects_store[project_id]

    if project.diagnostics is None:
        raise HTTPException(status_code=404, detail="No solve results found")

    # Create optimization problem to get additional diagnostics
    problem = OptimizationProblem(project)
    factor_graph = problem.build_factor_graph()

    optimization_summary = problem.get_optimization_summary()

    return {
        "solve_result": project.diagnostics,
        "optimization_summary": optimization_summary,
        "factor_graph_summary": factor_graph.summary()
    }


@router.post("/{project_id}/incremental")
async def solve_incremental(project_id: str, request: SolveRequest) -> Dict[str, Any]:
    """Perform incremental reconstruction."""
    if project_id not in projects_store:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects_store[project_id]

    # Add artificial delay for testing cancellation
    if request.test_mode:
        print(f"Test mode (incremental): Adding {request.test_delay_seconds} second delay...")
        await asyncio.sleep(request.test_delay_seconds)
        print("Test delay complete, starting incremental reconstruction...")

    try:
        solver_options = SolverOptions(
            method=request.method,
            max_iterations=request.max_iterations,
            tolerance=request.tolerance
        )

        incremental_solver = IncrementalSolver(solver_options=solver_options)
        result = incremental_solver.solve_incremental(project)

        # Update project store
        projects_store[project_id] = project

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Incremental solve failed: {str(e)}")


@router.get("/{project_id}/optimization-summary")
async def get_optimization_summary(project_id: str) -> Dict[str, Any]:
    """Get optimization problem summary."""
    if project_id not in projects_store:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects_store[project_id]

    try:
        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        return problem.get_optimization_summary()

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to build optimization summary: {str(e)}")


@router.post("/{project_id}/robust-loss")
async def set_robust_loss(
    project_id: str,
    constraint_type: str,
    loss_type: str,
    params: Dict[str, float] = {}
) -> Dict[str, str]:
    """Set robust loss for constraint type."""
    if project_id not in projects_store:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        project = projects_store[project_id]
        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        problem.set_robust_loss_for_constraint_type(constraint_type, loss_type, **params)

        return {"status": "robust_loss_set", "constraint_type": constraint_type, "loss_type": loss_type}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set robust loss: {str(e)}")