"""Test optimization convergence with real project data."""

import json
from pathlib import Path

import pytest

# Import backend models (relative to backend directory)
from pictorigo.core.models.entities import Camera, Image, Line, WorldPoint
from pictorigo.core.models.project import Project

# Import optimization from root level (needs sys path manipulation)
import sys
root_path = Path(__file__).parent.parent.parent.parent
if str(root_path) not in sys.path:
    sys.path.insert(0, str(root_path))

# Now import from root pictorigo (the one with optimization modules)
import pictorigo.core.optimization.problem as opt_problem
import pictorigo.core.solver.scipy_solver as scipy_solver

OptimizationProblem = opt_problem.OptimizationProblem
SciPySolver = scipy_solver.SciPySolver
SolverOptions = scipy_solver.SolverOptions


@pytest.fixture
def real_project_data():
    """Load the real project data from fixtures."""
    fixture_path = Path(__file__).parent.parent / "fixtures" / "project1.json"
    with open(fixture_path) as f:
        return json.load(f)


@pytest.fixture
def project_from_export(real_project_data):
    """Convert exported DTO format to Project model."""
    project = Project(
        id="test_project",
        name="Real Project Test",
    )

    # Convert world points
    for wp_data in real_project_data["worldPoints"]:
        wp = WorldPoint(
            id=wp_data["id"],
            name=wp_data["name"],
            xyz=wp_data.get("xyz"),
            color=wp_data.get("color", "#0696d7"),
            is_visible=wp_data.get("isVisible", True),
            is_origin=wp_data.get("isOrigin", False),
            is_locked=wp_data.get("isLocked", False),
            group=wp_data.get("group"),
            tags=wp_data.get("tags"),
            created_at=wp_data.get("createdAt", ""),
            updated_at=wp_data.get("updatedAt", ""),
        )
        project.add_world_point(wp)

    # Convert lines
    for line_data in real_project_data["lines"]:
        line = Line(
            id=line_data["id"],
            name=line_data["name"],
            point_a=line_data["pointA"],
            point_b=line_data["pointB"],
            color=line_data.get("color", "#0696d7"),
            is_visible=line_data.get("isVisible", True),
            is_construction=line_data.get("isConstruction", False),
            line_style=line_data.get("lineStyle", "solid"),
            thickness=line_data.get("thickness", 1),
            group=line_data.get("group"),
            tags=line_data.get("tags"),
            created_at=line_data.get("createdAt", ""),
            updated_at=line_data.get("updatedAt", ""),
        )
        project.add_line(line)

    # Convert images and cameras
    for img_data in real_project_data["images"]:
        # Create image
        image = Image(
            id=img_data["id"],
            name=img_data["name"],
            path=img_data.get("filename", ""),
            width=img_data["width"],
            height=img_data["height"],
        )
        project.add_image(image)

        # Create camera for this image
        camera_data = next(
            (c for c in real_project_data["cameras"] if c["imageId"] == img_data["id"]),
            None,
        )
        if camera_data:
            intrinsics = camera_data["intrinsics"]
            extrinsics = camera_data["extrinsics"]

            camera = Camera(
                id=camera_data["id"],
                name=camera_data["name"],
                image_id=camera_data["imageId"],
                K=[
                    intrinsics["fx"],
                    intrinsics["fy"],
                    intrinsics["cx"],
                    intrinsics["cy"],
                ],
                R=extrinsics["rotation"],
                t=extrinsics["translation"],
            )
            project.add_camera(camera)

    # Convert image points - attach to world points
    for img_data in real_project_data["images"]:
        for ip_id, ip_data in img_data["imagePoints"].items():
            world_point_id = ip_data["worldPointId"]
            if world_point_id in project.world_points:
                wp = project.world_points[world_point_id]
                # Add image point to world point's image_points list
                wp.image_points.append({
                    "imageId": img_data["id"],
                    "u": ip_data["u"],
                    "v": ip_data["v"],
                })

    # Note: Constraints would be converted here if present in the export
    # For now, we'll test with just the geometric data

    return project


def test_project_loads_correctly(project_from_export):
    """Test that the project loads from export format."""
    project = project_from_export

    assert len(project.world_points) > 0
    assert len(project.lines) > 0
    assert len(project.images) > 0
    assert len(project.cameras) > 0

    # Validate project consistency
    issues = project.validate_project()
    assert len(issues) == 0, f"Project validation issues: {issues}"


def test_optimization_converges(project_from_export):
    """Test that optimization converges on real project data."""
    project = project_from_export

    # Build optimization problem
    problem = OptimizationProblem(project)
    factor_graph = problem.build_factor_graph()

    # Get initial cost
    initial_cost = factor_graph.compute_cost()
    print(f"\nInitial cost: {initial_cost:.6f}")

    # Print optimization summary
    summary = problem.get_optimization_summary()
    print(f"\nOptimization summary:")
    print(f"  Variables: {summary['variable_counts']}")
    print(f"  Factors: {summary['factor_counts']}")
    print(f"  Total residuals: {summary['total_residuals']}")

    # Configure solver
    solver_options = SolverOptions(
        method="lm",  # Levenberg-Marquardt
        max_iterations=100,
        tolerance=1e-6,
    )

    solver = SciPySolver(solver_options)
    result = solver.solve(factor_graph)

    # Print results
    print(f"\nSolver result:")
    print(f"  Success: {result.success}")
    print(f"  Iterations: {result.iterations}")
    print(f"  Final cost: {result.final_cost:.6f}")
    print(f"  Convergence: {result.convergence_reason}")
    print(f"  Computation time: {result.computation_time:.3f}s")

    # Extract solution back to project
    if result.success:
        problem.extract_solution_to_project()
        print(f"\nSolution extracted to project")

        # Print some optimized world point positions
        print(f"\nOptimized world points (first 3):")
        for i, (wp_id, wp) in enumerate(list(project.world_points.items())[:3]):
            if wp.xyz:
                print(f"  {wp.name}: ({wp.xyz[0]:.4f}, {wp.xyz[1]:.4f}, {wp.xyz[2]:.4f})")

    # Assertions
    assert result.success, f"Optimization failed: {result.convergence_reason}"
    assert result.iterations > 0, "No iterations performed"
    assert result.final_cost < initial_cost, "Cost did not decrease"
    assert result.final_cost >= 0, "Final cost should be non-negative"

    # Check convergence quality
    cost_reduction = (initial_cost - result.final_cost) / initial_cost
    print(f"\nCost reduction: {cost_reduction * 100:.2f}%")
    assert cost_reduction > 0.01, "Cost reduction too small"


def test_optimization_with_robust_loss(project_from_export):
    """Test optimization with robust loss function."""
    project = project_from_export

    # Build optimization problem
    problem = OptimizationProblem(project)
    factor_graph = problem.build_factor_graph()

    # Apply Huber loss to image point constraints
    problem.set_robust_loss_for_constraint_type("image_point", "huber", delta=1.0)

    initial_cost = factor_graph.compute_cost()

    # Configure solver
    solver_options = SolverOptions(
        method="lm",
        max_iterations=100,
        tolerance=1e-6,
    )

    solver = SciPySolver(solver_options)
    result = solver.solve(factor_graph)

    print(f"\nRobust optimization result:")
    print(f"  Success: {result.success}")
    print(f"  Final cost: {result.final_cost:.6f}")
    print(f"  Cost reduction: {(initial_cost - result.final_cost) / initial_cost * 100:.2f}%")

    assert result.success, "Robust optimization failed"
    assert result.final_cost < initial_cost, "Cost did not decrease with robust loss"


if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v", "-s"])
