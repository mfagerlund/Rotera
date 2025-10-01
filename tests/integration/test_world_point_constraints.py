"""Integration tests for world point per-axis locking constraints."""

import numpy as np
import pytest

from pictorigo.core.models.entities import WorldPoint
from pictorigo.core.models.project import Project
from pictorigo.core.optimization.problem import OptimizationProblem
from pictorigo.core.solver.scipy_solver import SciPySolver, SolverOptions


@pytest.fixture
def simple_project():
    """Create a simple project with two world points."""
    project = Project(version="0.1.0")

    # Add two world points with initial positions (all free)
    wp1 = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0])
    wp2 = WorldPoint(id="wp2", xyz=[5.0, 0.0, 0.0])

    project.add_world_point(wp1)
    project.add_world_point(wp2)

    return project


def test_world_point_single_axis_lock():
    """Test locking a single axis (x=0) on a world point."""
    project = Project(version="0.1.0")

    # Create point with x locked to 0, y and z free
    wp = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0], locked=[True, False, False])
    project.add_world_point(wp)

    # Build factor graph
    problem = OptimizationProblem(project)
    graph = problem.build_factor_graph()

    # Should have 1 factor for the locked x axis
    assert len(graph.factors) == 1
    factor = list(graph.factors.values())[0]
    assert factor.residual_dimension() == 1

    # Set initial position with x perturbed away from locked value
    # Note: When setting xyz, we must preserve the lock (None vs value)
    # For initial position, set y and z to some values
    problem.factor_graph.variables["wp1"].value = np.array([5.0, 1.5, 2.0])

    # Solve (TRF for underconstrained system)
    solver = SciPySolver(SolverOptions(
        method="trf",
        max_iterations=20,
        tolerance=1e-6
    ))
    result = solver.solve(graph)

    print(f"\nSingle axis lock test:")
    print(f"  Success: {result.success}")
    print(f"  Final cost: {result.final_cost:.8f}")

    # Extract solution
    problem.extract_solution_to_project()
    final = project.world_points["wp1"].xyz

    print(f"  Initial: [5.0, 1.5, 2.0]")
    print(f"  Final: {final}")
    print(f"  X error: {abs(final[0] - 0.0):.8f}")

    assert result.success
    assert abs(final[0] - 0.0) < 0.01, f"X should be locked to 0, got {final[0]}"


def test_world_point_two_axes_locked():
    """Test locking two axes (x=0, y=0) with z free."""
    project = Project(version="0.1.0")

    # Create point with x and y locked to 0, z free
    wp = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0], locked=[True, True, False])
    project.add_world_point(wp)

    # Build factor graph
    problem = OptimizationProblem(project)
    graph = problem.build_factor_graph()

    # Should have 1 factor with 2 residuals (x and y locks)
    assert len(graph.factors) == 1
    factor = list(graph.factors.values())[0]
    assert factor.residual_dimension() == 2

    # Perturb the point
    problem.factor_graph.variables["wp1"].value = np.array([3.0, 4.0, 5.0])

    # Solve
    solver = SciPySolver(SolverOptions(
        method="trf",
        max_iterations=20,
        tolerance=1e-6
    ))
    result = solver.solve(graph)

    print(f"\nTwo axes locked test:")
    print(f"  Success: {result.success}")
    print(f"  Final cost: {result.final_cost:.8f}")

    # Extract solution
    problem.extract_solution_to_project()
    final = project.world_points["wp1"].xyz

    print(f"  Final: {final}")

    assert result.success
    assert abs(final[0] - 0.0) < 0.01
    assert abs(final[1] - 0.0) < 0.01


def test_world_point_all_axes_locked():
    """Test locking all three axes (fully constrained point)."""
    project = Project(version="0.1.0")

    # Create point with all axes locked
    wp = WorldPoint(id="wp1", xyz=[1.0, 2.0, 3.0], locked=[True, True, True])
    project.add_world_point(wp)

    # Build factor graph
    problem = OptimizationProblem(project)
    graph = problem.build_factor_graph()

    # Should have 1 factor with 3 residuals
    assert len(graph.factors) == 1
    factor = list(graph.factors.values())[0]
    assert factor.residual_dimension() == 3

    # Perturb the point
    problem.factor_graph.variables["wp1"].value = np.array([5.0, 6.0, 7.0])

    # Solve
    solver = SciPySolver(SolverOptions(
        method="trf",
        max_iterations=20,
        tolerance=1e-6
    ))
    result = solver.solve(graph)

    print(f"\nAll axes locked test:")
    print(f"  Success: {result.success}")
    print(f"  Final cost: {result.final_cost:.8f}")

    # Extract solution
    problem.extract_solution_to_project()
    final = project.world_points["wp1"].xyz

    print(f"  Target: [1.0, 2.0, 3.0]")
    print(f"  Final: {final}")

    assert result.success
    assert abs(final[0] - 1.0) < 0.01
    assert abs(final[1] - 2.0) < 0.01
    assert abs(final[2] - 3.0) < 0.01


def test_world_point_no_locked_axes():
    """Test that world point with all free axes doesn't add a factor."""
    project = Project(version="0.1.0")

    # Create point with all axes free (None)
    wp = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0])
    project.add_world_point(wp)

    # Build factor graph
    problem = OptimizationProblem(project)
    graph = problem.build_factor_graph()

    # Should have no factors
    assert len(graph.factors) == 0


def test_world_point_metadata():
    """Test that world point residual provides correct metadata."""
    project = Project(version="0.1.0")

    # Create point with x and z locked
    wp = WorldPoint(id="test_wp_123", xyz=[1.5, 0.0, 3.5], locked=[True, False, True])
    project.add_world_point(wp)

    # Build factor graph
    problem = OptimizationProblem(project)
    graph = problem.build_factor_graph()

    # Get the factor and check metadata
    factor = list(graph.factors.values())[0]
    metadata = factor.get_metadata()

    assert metadata['entity_type'] == 'world_point'
    assert metadata['entity_id'] == 'test_wp_123'

    # Check component metadata
    components = metadata['components']
    assert len(components) == 2  # x and z locked

    # Find lock_x component
    lock_x = next(c for c in components if c['type'] == 'lock_x')
    assert lock_x['enabled'] == True
    assert lock_x['target'] == 1.5

    # Find lock_z component
    lock_z = next(c for c in components if c['type'] == 'lock_z')
    assert lock_z['enabled'] == True
    assert lock_z['target'] == 3.5


def test_world_point_mixed_free_locked():
    """Test optimization with mix of free and locked world points."""
    project = Project(version="0.1.0")

    # wp1: origin fully locked
    wp1 = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0], locked=[True, True, True])
    # wp2: y locked to 0 (in XZ plane), x and z free
    wp2 = WorldPoint(id="wp2", xyz=[0.0, 0.0, 0.0], locked=[False, True, False])

    project.add_world_point(wp1)
    project.add_world_point(wp2)

    # Build and solve
    problem = OptimizationProblem(project)
    graph = problem.build_factor_graph()

    # Set initial positions (perturb away from locked values)
    problem.factor_graph.variables["wp1"].value = np.array([0.1, 0.2, 0.3])
    problem.factor_graph.variables["wp2"].value = np.array([5.0, 2.0, 3.0])

    # Should have 2 factors: wp1 (3 residuals), wp2 (1 residual for y)
    assert len(graph.factors) == 2

    solver = SciPySolver(SolverOptions(
        method="trf",
        max_iterations=30,
        tolerance=1e-6
    ))
    result = solver.solve(graph)

    print(f"\nMixed free/locked test:")
    print(f"  Success: {result.success}")
    print(f"  Final cost: {result.final_cost:.8f}")

    # Extract solution
    problem.extract_solution_to_project()

    wp1_final = project.world_points["wp1"].xyz
    wp2_final = project.world_points["wp2"].xyz

    print(f"  WP1 final: {wp1_final}")
    print(f"  WP2 final: {wp2_final}")

    # Check wp1 at origin
    assert abs(wp1_final[0]) < 0.01
    assert abs(wp1_final[1]) < 0.01
    assert abs(wp1_final[2]) < 0.01

    # Check wp2 y-axis locked
    assert abs(wp2_final[1]) < 0.01


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
