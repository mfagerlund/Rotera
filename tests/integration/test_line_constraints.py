"""Integration tests for line constraint optimization."""

import numpy as np
import pytest

from pictorigo.core.models.entities import WorldPoint, Line, LineConstraints
from pictorigo.core.models.project import Project
from pictorigo.core.optimization.problem import OptimizationProblem
from pictorigo.core.solver.scipy_solver import SciPySolver, SolverOptions


@pytest.fixture
def simple_project():
    """Create a simple project with two world points (all axes free)."""
    project = Project(version="0.1.0")

    # Add two world points with all axes free (no locked array = all free)
    # Initial values will be set from factor graph variables
    wp1 = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0])
    wp2 = WorldPoint(id="wp2", xyz=[0.0, 0.0, 0.0])

    project.add_world_point(wp1)
    project.add_world_point(wp2)

    return project


def test_line_horizontal_constraint(simple_project):
    """Test that horizontal constraint makes line parallel to XY plane."""
    # Add line with horizontal constraint
    line = Line(
        id="line1",
        name="L1",
        pointA="wp1",
        pointB="wp2",
        constraints=LineConstraints(
            direction="horizontal",
            tolerance=0.001
        )
    )
    simple_project.add_line(line)

    # Build and solve
    problem = OptimizationProblem(simple_project)
    graph = problem.build_factor_graph()

    # Set initial positions
    graph.variables["wp1"].value = np.array([0.0, 0.0, 0.0])
    graph.variables["wp2"].value = np.array([5.0, 0.5, 0.3])  # Close to horizontal, ~5m long

    # Verify line factor was added
    assert len(graph.factors) == 1
    factor = list(graph.factors.values())[0]
    assert factor.line_id == "line1"
    assert factor.line_name == "L1"

    # Solve (use TRF since we have fewer residuals than variables)
    solver = SciPySolver(SolverOptions(
        method="trf",
        max_iterations=20,
        tolerance=1e-6
    ))
    result = solver.solve(graph)

    print(f"\nHorizontal constraint test:")
    print(f"  Success: {result.success}")
    print(f"  Iterations: {result.iterations}")
    print(f"  Final cost: {result.final_cost:.8f}")

    # Extract solution
    problem.extract_solution_to_project()

    wp1_final = simple_project.world_points["wp1"].xyz
    wp2_final = simple_project.world_points["wp2"].xyz

    print(f"  WP1 final: {wp1_final}")
    print(f"  WP2 final: {wp2_final}")

    # Check that line is horizontal (z components equal)
    z_diff = abs(wp2_final[2] - wp1_final[2])
    print(f"  Z difference: {z_diff:.8f}")

    assert result.success
    assert z_diff < 0.01, f"Line should be horizontal, but z_diff = {z_diff}"


def test_line_vertical_constraint(simple_project):
    """Test that vertical constraint makes line parallel to Z axis."""
    # Add line with vertical constraint
    line = Line(
        id="line1",
        name="L1",
        pointA="wp1",
        pointB="wp2",
        constraints=LineConstraints(
            direction="vertical",
            tolerance=0.001
        )
    )
    simple_project.add_line(line)

    # Build and solve
    problem = OptimizationProblem(simple_project)
    graph = problem.build_factor_graph()

    # Set initial positions to be roughly vertical
    graph.variables["wp1"].value = np.array([0.0, 0.0, 0.0])
    graph.variables["wp2"].value = np.array([0.2, 0.3, 5.0])

    solver = SciPySolver(SolverOptions(
        method="trf",
        max_iterations=20,
        tolerance=1e-6
    ))
    result = solver.solve(graph)

    print(f"\nVertical constraint test:")
    print(f"  Success: {result.success}")
    print(f"  Final cost: {result.final_cost:.8f}")

    # Extract solution
    problem.extract_solution_to_project()

    wp1_final = simple_project.world_points["wp1"].xyz
    wp2_final = simple_project.world_points["wp2"].xyz

    # Check that line is vertical (x,y components equal)
    xy_dist = np.linalg.norm([wp2_final[0] - wp1_final[0], wp2_final[1] - wp1_final[1]])
    print(f"  XY distance: {xy_dist:.8f}")

    assert result.success
    assert xy_dist < 0.01, f"Line should be vertical, but xy_dist = {xy_dist}"


def test_line_length_constraint(simple_project):
    """Test that length constraint enforces target distance."""
    target_length = 10.0

    # Add line with length constraint
    line = Line(
        id="line1",
        name="L1",
        pointA="wp1",
        pointB="wp2",
        constraints=LineConstraints(
            targetLength=target_length,
            tolerance=0.001
        )
    )
    simple_project.add_line(line)

    # Build and solve
    problem = OptimizationProblem(simple_project)
    graph = problem.build_factor_graph()

    # Set initial positions
    graph.variables["wp1"].value = np.array([0.0, 0.0, 0.0])
    graph.variables["wp2"].value = np.array([5.0, 0.5, 0.3])

    solver = SciPySolver(SolverOptions(
        method="trf",
        max_iterations=20,
        tolerance=1e-6
    ))
    result = solver.solve(graph)

    print(f"\nLength constraint test:")
    print(f"  Success: {result.success}")
    print(f"  Final cost: {result.final_cost:.8f}")

    # Extract solution
    problem.extract_solution_to_project()

    wp1_final = simple_project.world_points["wp1"].xyz
    wp2_final = simple_project.world_points["wp2"].xyz

    actual_length = np.linalg.norm(np.array(wp2_final) - np.array(wp1_final))
    print(f"  Target length: {target_length}")
    print(f"  Actual length: {actual_length:.8f}")

    assert result.success
    assert abs(actual_length - target_length) < 0.01, \
        f"Length should be {target_length}, got {actual_length}"


def test_line_combined_constraints(simple_project):
    """Test line with both horizontal and length constraints."""
    target_length = 8.0

    # Add line with both constraints
    line = Line(
        id="line1",
        name="L1",
        pointA="wp1",
        pointB="wp2",
        constraints=LineConstraints(
            direction="horizontal",
            targetLength=target_length,
            tolerance=0.001
        )
    )
    simple_project.add_line(line)

    # Build and solve
    problem = OptimizationProblem(simple_project)
    graph = problem.build_factor_graph()

    # Set initial positions
    graph.variables["wp1"].value = np.array([0.0, 0.0, 0.0])
    graph.variables["wp2"].value = np.array([5.0, 0.5, 0.3])

    # Verify factor has both components
    factor = list(graph.factors.values())[0]
    assert factor.residual_dimension() == 2, "Should have 2 residuals (length + direction)"

    solver = SciPySolver(SolverOptions(
        method="trf",
        max_iterations=30,
        tolerance=1e-6
    ))
    result = solver.solve(graph)

    print(f"\nCombined constraints test:")
    print(f"  Success: {result.success}")
    print(f"  Final cost: {result.final_cost:.8f}")

    # Extract solution
    problem.extract_solution_to_project()

    wp1_final = simple_project.world_points["wp1"].xyz
    wp2_final = simple_project.world_points["wp2"].xyz

    # Check both constraints
    z_diff = abs(wp2_final[2] - wp1_final[2])
    actual_length = np.linalg.norm(np.array(wp2_final) - np.array(wp1_final))

    print(f"  Z difference: {z_diff:.8f}")
    print(f"  Target length: {target_length}")
    print(f"  Actual length: {actual_length:.8f}")

    assert result.success
    assert z_diff < 0.01, f"Should be horizontal"
    assert abs(actual_length - target_length) < 0.01, f"Should be {target_length}m long"


def test_line_no_constraints():
    """Test that line without constraints doesn't add a factor."""
    project = Project(version="0.1.0")

    wp1 = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0])
    wp2 = WorldPoint(id="wp2", xyz=[0.0, 0.0, 0.0])
    project.add_world_point(wp1)
    project.add_world_point(wp2)

    # Add line with no constraints (direction='free', no targetLength)
    line = Line(
        id="line1",
        name="L1",
        pointA="wp1",
        pointB="wp2"
        # No constraints field
    )
    project.add_line(line)

    # Build factor graph
    problem = OptimizationProblem(project)
    graph = problem.build_factor_graph()

    # Should have no factors
    assert len(graph.factors) == 0, "Line without constraints should not add factors"


def test_line_free_direction_no_length():
    """Test that line with explicit free direction and no length adds no factor."""
    project = Project(version="0.1.0")

    wp1 = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0])
    wp2 = WorldPoint(id="wp2", xyz=[0.0, 0.0, 0.0])
    project.add_world_point(wp1)
    project.add_world_point(wp2)

    # Add line with explicit 'free' direction and no length
    line = Line(
        id="line1",
        name="L1",
        pointA="wp1",
        pointB="wp2",
        constraints=LineConstraints(
            direction='free'  # Explicit free
            # No targetLength
        )
    )
    project.add_line(line)

    # Build factor graph
    problem = OptimizationProblem(project)
    graph = problem.build_factor_graph()

    # Should have no factors
    assert len(graph.factors) == 0


def test_line_metadata():
    """Test that line residual provides correct metadata for traceability."""
    project = Project(version="0.1.0")

    wp1 = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0])
    wp2 = WorldPoint(id="wp2", xyz=[0.0, 0.0, 0.0])
    project.add_world_point(wp1)
    project.add_world_point(wp2)

    line = Line(
        id="test_line_123",
        name="Test Line",
        pointA="wp1",
        pointB="wp2",
        constraints=LineConstraints(
            direction="horizontal",
            targetLength=7.5
        )
    )
    project.add_line(line)

    # Build factor graph
    problem = OptimizationProblem(project)
    graph = problem.build_factor_graph()

    # Get the factor and check metadata
    factor = list(graph.factors.values())[0]
    metadata = factor.get_metadata()

    assert metadata['entity_type'] == 'line'
    assert metadata['entity_id'] == 'test_line_123'
    assert metadata['entity_name'] == 'Test Line'

    # Check component metadata
    components = metadata['components']
    assert len(components) == 2

    distance_comp = next(c for c in components if c['type'] == 'distance')
    assert distance_comp['enabled'] == True
    assert distance_comp['target'] == 7.5

    direction_comp = next(c for c in components if c['type'] == 'direction')
    assert direction_comp['enabled'] == True
    assert direction_comp['target'] == 'horizontal'


def TODO_test_multiple_lines_optimization():
    """Test optimization with multiple lines having different constraints."""
    project = Project(version="0.1.0")

    # Create a rectangle with 4 points
    wp1 = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0])
    wp2 = WorldPoint(id="wp2", xyz=[10.1, 0.2, 0.1])    # Should be (10, 0, 0)
    wp3 = WorldPoint(id="wp3", xyz=[10.2, 5.1, -0.1])   # Should be (10, 5, 0)
    wp4 = WorldPoint(id="wp4", xyz=[-0.1, 4.9, 0.2])    # Should be (0, 5, 0)

    project.add_world_point(wp1)
    project.add_world_point(wp2)
    project.add_world_point(wp3)
    project.add_world_point(wp4)

    # Add constraint to fix wp1 at origin (prevents global translation/rotation)
    from pictorigo.core.models.constraints import KnownCoordConstraint
    project.add_constraint(KnownCoordConstraint(
        wp_id="wp1",
        mask_xyz=[True, True, True],
        values=[0.0, 0.0, 0.0],
        sigma=0.00001  # Very strong constraint
    ))

    # Add horizontal lines with length constraints
    line1 = Line(
        id="line1", name="Bottom", pointA="wp1", pointB="wp2",
        constraints=LineConstraints(direction="horizontal", targetLength=10.0)
    )
    line2 = Line(
        id="line2", name="Top", pointA="wp4", pointB="wp3",
        constraints=LineConstraints(direction="horizontal", targetLength=10.0)
    )

    # Add vertical lines with length constraints
    line3 = Line(
        id="line3", name="Left", pointA="wp1", pointB="wp4",
        constraints=LineConstraints(direction="vertical", targetLength=5.0)
    )
    line4 = Line(
        id="line4", name="Right", pointA="wp2", pointB="wp3",
        constraints=LineConstraints(direction="vertical", targetLength=5.0)
    )

    project.add_line(line1)
    project.add_line(line2)
    project.add_line(line3)
    project.add_line(line4)

    # Build and solve
    problem = OptimizationProblem(project)
    graph = problem.build_factor_graph()

    # Should have 4 line factors + 1 known coord constraint
    assert len(graph.factors) == 5

    solver = SciPySolver(SolverOptions(
        method="trf",
        max_iterations=50,
        tolerance=1e-6
    ))
    result = solver.solve(graph)

    print(f"\nMultiple lines (rectangle) test:")
    print(f"  Success: {result.success}")
    print(f"  Iterations: {result.iterations}")
    print(f"  Final cost: {result.final_cost:.8f}")

    # Extract solution
    problem.extract_solution_to_project()

    # Check results
    wp1_final = np.array(project.world_points["wp1"].xyz)
    wp2_final = np.array(project.world_points["wp2"].xyz)
    wp3_final = np.array(project.world_points["wp3"].xyz)
    wp4_final = np.array(project.world_points["wp4"].xyz)

    print(f"  WP1: {wp1_final}")
    print(f"  WP2: {wp2_final}")
    print(f"  WP3: {wp3_final}")
    print(f"  WP4: {wp4_final}")

    # Check wp1 is at origin (from known coord constraint)
    assert np.linalg.norm(wp1_final) < 0.01

    # Check horizontal lines have same Z (parallel to XY plane)
    z_diff_bottom = abs(wp1_final[2] - wp2_final[2])
    z_diff_top = abs(wp3_final[2] - wp4_final[2])
    print(f"  Bottom Z difference: {z_diff_bottom:.6f}")
    print(f"  Top Z difference: {z_diff_top:.6f}")
    assert z_diff_bottom < 0.01
    assert z_diff_top < 0.01

    # Check vertical lines have same XY (parallel to Z axis)
    xy_dist_left = np.linalg.norm(wp4_final[:2] - wp1_final[:2])
    xy_dist_right = np.linalg.norm(wp3_final[:2] - wp2_final[:2])
    print(f"  Left XY distance: {xy_dist_left:.6f}")
    print(f"  Right XY distance: {xy_dist_right:.6f}")
    assert xy_dist_left < 0.01
    assert xy_dist_right < 0.01

    # Check lengths
    len_bottom = np.linalg.norm(wp2_final - wp1_final)
    len_top = np.linalg.norm(wp3_final - wp4_final)
    len_left = np.linalg.norm(wp4_final - wp1_final)
    len_right = np.linalg.norm(wp3_final - wp2_final)

    print(f"  Bottom length: {len_bottom:.6f} (target: 10.0)")
    print(f"  Top length: {len_top:.6f} (target: 10.0)")
    print(f"  Left length: {len_left:.6f} (target: 5.0)")
    print(f"  Right length: {len_right:.6f} (target: 5.0)")

    assert result.success
    assert abs(len_bottom - 10.0) < 0.01
    assert abs(len_top - 10.0) < 0.01
    assert abs(len_left - 5.0) < 0.01
    assert abs(len_right - 5.0) < 0.01


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
