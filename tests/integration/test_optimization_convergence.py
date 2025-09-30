"""Test optimization convergence with real project data."""

import json
from pathlib import Path

import pytest

# Import from root pictorigo package
from pictorigo.core.models.entities import Camera, Image, WorldPoint
from pictorigo.core.models.project import Project
from pictorigo.core.models.constraints import ImagePointConstraint
from pictorigo.core.optimization.problem import OptimizationProblem
from pictorigo.core.solver.scipy_solver import SciPySolver, SolverOptions
from pictorigo.core.initialization.incremental import IncrementalSolver


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
        version="0.1.0",
    )

    # Convert world points
    for wp_data in real_project_data["worldPoints"]:
        wp = WorldPoint(
            id=wp_data["id"],
            xyz=wp_data.get("xyz"),
        )
        project.add_world_point(wp)

    # Convert images and cameras
    # Note: We match images to cameras by index (same order)
    cameras_list = real_project_data["cameras"]

    for i, img_data in enumerate(real_project_data["images"]):
        # Create image (use filename if available, otherwise use ID)
        image = Image(
            id=img_data["id"],
            path=img_data.get("filename", img_data["id"]),
            width=img_data["width"],
            height=img_data["height"],
        )
        project.add_image(image)

        # Get camera for this image (by index if no imageId present)
        camera_data = cameras_list[i] if i < len(cameras_list) else None

        if camera_data:
            # Check if new format (with intrinsics/extrinsics) or old format
            if "intrinsics" in camera_data and "extrinsics" in camera_data:
                # New optimization export format
                intrinsics = camera_data["intrinsics"]
                extrinsics = camera_data["extrinsics"]
                camera = Camera(
                    id=camera_data["id"],
                    image_id=camera_data.get("imageId", img_data["id"]),
                    K=[
                        intrinsics["fx"],
                        intrinsics["fy"],
                        intrinsics["cx"],
                        intrinsics["cy"],
                    ],
                    R=extrinsics["rotation"],
                    t=extrinsics["translation"],
                )
            else:
                # Old backend DTO format
                camera = Camera(
                    id=camera_data["id"],
                    image_id=img_data["id"],
                    K=[
                        camera_data["focalLength"],
                        camera_data["focalLength"] * camera_data["aspectRatio"],
                        camera_data["principalPointX"],
                        camera_data["principalPointY"],
                    ],
                    R=camera_data["rotation"],
                    t=camera_data["position"],
                )
            project.add_camera(camera)

    # Convert image points to ImagePointConstraints
    for img_data in real_project_data["images"]:
        for ip_id, ip_data in img_data["imagePoints"].items():
            world_point_id = ip_data["worldPointId"]
            if world_point_id in project.world_points:
                # Create image point constraint
                constraint = ImagePointConstraint(
                    image_id=img_data["id"],
                    wp_id=world_point_id,
                    u=ip_data["u"],
                    v=ip_data["v"],
                    sigma=1.0,  # Default uncertainty
                )
                project.add_constraint(constraint)

    return project


def test_project_loads_correctly(project_from_export):
    """Test that the project loads from export format."""
    project = project_from_export

    assert len(project.world_points) > 0, "No world points loaded"
    assert len(project.images) > 0, "No images loaded"
    assert len(project.cameras) > 0, "No cameras loaded"
    assert len(project.constraints) > 0, "No constraints loaded"

    # Check we have image point constraints
    image_constraints = project.get_constraints_by_type("image_point")
    assert len(image_constraints) > 0, "No image point constraints loaded"

    # Validate project consistency
    issues = project.validate_project()
    assert len(issues) == 0, f"Project validation issues: {issues}"


def test_optimization_converges(project_from_export):
    """Test that optimization converges on real project data."""
    project = project_from_export

    # Print project stats
    print(f"\nProject stats:")
    print(f"  World points: {len(project.world_points)}")
    print(f"  Images: {len(project.images)}")
    print(f"  Cameras: {len(project.cameras)}")
    print(f"  Constraints: {len(project.constraints)}")

    # Check if world points need initialization
    uninitialized = [wp_id for wp_id, wp in project.world_points.items() if wp.xyz is None]
    print(f"  Uninitialized world points: {len(uninitialized)}")

    if len(uninitialized) > 0:
        # Simple initialization: place points at random positions in front of cameras
        print(f"\nInitializing world points with random values...")
        import numpy as np
        np.random.seed(42)  # Reproducible

        for wp_id in uninitialized:
            wp = project.world_points[wp_id]
            # Place at random position in a 10x10x10 meter cube
            wp.xyz = [
                float(np.random.uniform(-5, 5)),
                float(np.random.uniform(-5, 5)),
                float(np.random.uniform(5, 15))  # In front of camera
            ]

        print(f"  Initialized {len(uninitialized)} world points with random positions")

    # Build optimization problem
    problem = OptimizationProblem(project)
    factor_graph = problem.build_factor_graph()

    # Configure solver
    solver_options = SolverOptions(
        method="trf",  # Trust Region Reflective (supports bounds)
        max_iterations=30,  # Reduced for faster testing
        tolerance=1e-3,  # Relaxed tolerance
        verbose=0,  # No solver output
        use_bounds=False,  # Disable bounds for now
    )

    solver = SciPySolver(solver_options)
    result = solver.solve(factor_graph)

    # Print results
    print(f"\nSolver result:")
    print(f"  Success: {result.success}")
    print(f"  Iterations: {result.iterations}")
    print(f"  Final cost: {result.final_cost:.6f}")
    print(f"  Convergence: {result.convergence_reason}")
    if result.computation_time:
        print(f"  Computation time: {result.computation_time:.3f}s")

    # Extract solution back to project
    if result.success:
        problem.extract_solution_to_project()
        print(f"\nSolution extracted to project")

        # Print some optimized world point positions
        print(f"\nOptimized world points (first 3):")
        for i, (wp_id, wp) in enumerate(list(project.world_points.items())[:3]):
            if wp.xyz:
                print(f"  {wp_id}: ({wp.xyz[0]:.4f}, {wp.xyz[1]:.4f}, {wp.xyz[2]:.4f})")

    # Assertions
    assert result.success, f"Optimization failed: {result.convergence_reason}"
    assert result.iterations >= 0, "Invalid iteration count"
    assert result.final_cost >= 0, "Final cost should be non-negative"

    # Check that cost is reasonable (not huge)
    assert result.final_cost < 1e6, f"Final cost too large: {result.final_cost}"


def test_optimization_with_robust_loss(project_from_export):
    """Test optimization with robust loss function."""
    project = project_from_export

    # Initialize world points (same as main test)
    uninitialized = [wp_id for wp_id, wp in project.world_points.items() if wp.xyz is None]
    if len(uninitialized) > 0:
        import numpy as np
        np.random.seed(42)
        for wp_id in uninitialized:
            wp = project.world_points[wp_id]
            wp.xyz = [
                float(np.random.uniform(-5, 5)),
                float(np.random.uniform(-5, 5)),
                float(np.random.uniform(5, 15))
            ]

    # Build optimization problem
    problem = OptimizationProblem(project)
    factor_graph = problem.build_factor_graph()

    # Configure solver with robust loss
    solver_options = SolverOptions(
        method="trf",  # TRF supports bounds
        max_iterations=30,
        tolerance=1e-3,
        loss="huber",  # Use Huber robust loss
        use_bounds=False,
    )

    solver = SciPySolver(solver_options)
    result = solver.solve(factor_graph)

    print(f"\nRobust optimization result:")
    print(f"  Success: {result.success}")
    print(f"  Final cost: {result.final_cost:.6f}")
    print(f"  Iterations: {result.iterations}")

    assert result.success, "Robust optimization failed"
    assert result.final_cost >= 0, "Final cost should be non-negative"
    assert result.final_cost < 1e6, f"Final cost too large: {result.final_cost}"


if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v", "-s"])
