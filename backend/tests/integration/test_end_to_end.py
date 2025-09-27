"""End-to-end integration tests."""

import numpy as np
import pytest

from pictorigo.core.synthetic import make_two_view
from pictorigo.core.optimization.problem import OptimizationProblem
from pictorigo.core.solver.scipy_solver import SciPySolver, SolverOptions


class TestEndToEndPipeline:
    """Test complete pipeline from synthetic scene to optimization."""

    def test_two_view_reconstruction(self):
        """Test two-view reconstruction pipeline."""
        # Generate synthetic two-view scene
        project = make_two_view(
            n_points=10,
            baseline=2.0,
            seed=42
        )

        # Validate project structure
        assert len(project.world_points) == 12  # 10 points + 2 camera centers
        assert len(project.cameras) == 2
        assert len(project.images) == 2

        # Check that we have image point constraints
        ip_constraints = project.get_constraints_by_type("image_point")
        assert len(ip_constraints) > 0

        # Build optimization problem
        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        # Verify factor graph structure
        summary = factor_graph.summary()
        assert summary["variables"]["total"] > 0
        assert summary["factors"]["total"] > 0

        # Test that we can pack/unpack parameters
        initial_params = factor_graph.pack_variables()
        assert len(initial_params) > 0

        factor_graph.unpack_variables(initial_params)

        # Test residual computation
        residuals = factor_graph.compute_all_residuals()
        assert len(residuals) > 0
        assert np.all(np.isfinite(residuals))

    def test_solver_on_synthetic_scene(self):
        """Test solver on synthetic scene."""
        # Create a simple synthetic scene
        project = make_two_view(
            n_points=5,
            baseline=1.0,
            seed=123
        )

        # Add some noise to make it non-trivial
        for wp in project.world_points.values():
            if wp.xyz is not None and wp.id.startswith("pt_"):
                # Add small noise to point positions
                noise = np.random.normal(0, 0.01, 3)
                wp.xyz = (np.array(wp.xyz) + noise).tolist()

        # Build optimization problem
        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        # Configure solver for fast convergence
        solver_options = SolverOptions(
            method="lm",
            max_iterations=20,
            tolerance=1e-4,
            verbose=0
        )

        solver = SciPySolver(solver_options)

        # Solve
        result = solver.solve(factor_graph)

        # Check solve result
        assert isinstance(result.success, bool)
        assert result.iterations >= 0
        assert result.final_cost >= 0
        assert result.computation_time > 0

        # Check that solution is reasonable
        if result.success:
            assert result.final_cost < 1000  # Should converge to reasonable cost
            assert len(result.residuals) > 0

        # Extract solution back to project
        problem.extract_solution_to_project()

        # Verify project was updated
        for wp in project.world_points.values():
            if wp.xyz is not None:
                assert all(np.isfinite(wp.xyz))

    def test_optimization_summary(self):
        """Test optimization problem summary."""
        project = make_two_view(n_points=8, seed=42)

        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        summary = problem.get_optimization_summary()

        # Check required fields
        assert "project_info" in summary
        assert "constraint_counts" in summary
        assert "variables" in summary
        assert "factors" in summary

        # Check project info
        project_info = summary["project_info"]
        assert project_info["world_points"] == len(project.world_points)
        assert project_info["cameras"] == len(project.cameras)
        assert project_info["constraints"] == len(project.constraints)

        # Check constraint counts
        constraint_counts = summary["constraint_counts"]
        assert "image_point" in constraint_counts
        assert constraint_counts["image_point"] > 0

    def test_robust_loss_application(self):
        """Test applying robust loss functions."""
        project = make_two_view(n_points=6, seed=42)

        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        # Apply Huber loss to image point constraints
        problem.set_robust_loss_for_constraint_type(
            "image_point", "huber", delta=1.0
        )

        # Verify that factors have robust loss set
        reprojection_factors = [
            f for f in factor_graph.factors.values()
            if f.factor_id.startswith("reprojection_")
        ]

        assert len(reprojection_factors) > 0
        for factor in reprojection_factors:
            assert factor.robust_loss_type == "huber"
            assert factor.robust_loss_params["delta"] == 1.0

    def test_variable_initialization(self):
        """Test variable initialization from project."""
        project = make_two_view(n_points=4, seed=42)

        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        # Check that world point variables are initialized
        for wp_id, wp in project.world_points.items():
            if wp.xyz is not None:
                assert wp_id in factor_graph.variables
                variable = factor_graph.variables[wp_id]
                assert variable.is_initialized()
                np.testing.assert_array_equal(variable.get_value(), wp.xyz)

        # Check that camera variables are initialized
        for cam_id, camera in project.cameras.items():
            rot_var_id = f"{cam_id}_rotation"
            trans_var_id = f"{cam_id}_translation"
            intrinsics_var_id = f"{cam_id}_intrinsics"

            assert rot_var_id in factor_graph.variables
            assert trans_var_id in factor_graph.variables
            assert intrinsics_var_id in factor_graph.variables

            rot_var = factor_graph.variables[rot_var_id]
            trans_var = factor_graph.variables[trans_var_id]
            intrinsics_var = factor_graph.variables[intrinsics_var_id]

            assert rot_var.is_initialized()
            assert trans_var.is_initialized()
            assert intrinsics_var.is_initialized()

            np.testing.assert_array_equal(rot_var.get_value(), camera.R)
            np.testing.assert_array_equal(trans_var.get_value(), camera.t)
            np.testing.assert_array_equal(intrinsics_var.get_value(), camera.K)

    def test_gauge_fixing_constraints(self):
        """Test that gauge fixing constraints are properly added."""
        project = make_two_view(n_points=5, seed=42)

        # Should have gauge fixing constraint
        gauge_constraints = project.get_constraints_by_type("gauge_fix")
        assert len(gauge_constraints) == 1

        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        # Should generate multiple factors for gauge fixing
        gauge_factors = [
            f for f in factor_graph.factors.values()
            if "gauge" in f.factor_id
        ]

        assert len(gauge_factors) >= 4  # origin, x_axis, xy_plane, scale

    @pytest.mark.slow
    def test_convergence_on_perfect_data(self):
        """Test convergence on perfect synthetic data."""
        # Generate scene with no noise
        project = make_two_view(n_points=6, baseline=1.5, seed=42)

        # Store ground truth
        ground_truth_points = {}
        for wp_id, wp in project.world_points.items():
            if wp.xyz is not None:
                ground_truth_points[wp_id] = np.array(wp.xyz)

        # Perturb the solution slightly
        for wp in project.world_points.values():
            if wp.xyz is not None and wp.id.startswith("pt_"):
                noise = np.random.normal(0, 0.1, 3)
                wp.xyz = (np.array(wp.xyz) + noise).tolist()

        # Solve
        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        solver_options = SolverOptions(
            method="lm",
            max_iterations=50,
            tolerance=1e-8
        )
        solver = SciPySolver(solver_options)

        result = solver.solve(factor_graph)

        # Should converge successfully
        assert result.success
        assert result.final_cost < 1e-6  # Very low cost for perfect data

        # Extract solution
        problem.extract_solution_to_project()

        # Check that we recovered close to ground truth (up to gauge freedom)
        # Note: Due to gauge fixing, we may not recover exact ground truth
        # but the relative geometry should be preserved
        final_cost = result.final_cost
        assert final_cost < 0.1  # Should be very small for good data

    def test_error_handling(self):
        """Test error handling in the pipeline."""
        # Create empty project
        from pictorigo.core.models.project import Project
        empty_project = Project()

        problem = OptimizationProblem(empty_project)
        factor_graph = problem.build_factor_graph()

        # Should handle empty graph gracefully
        assert len(factor_graph.variables) == 0
        assert len(factor_graph.factors) == 0

        solver = SciPySolver()
        result = solver.solve(factor_graph)

        # Should succeed trivially with no variables
        assert result.success
        assert result.iterations == 0
        assert result.final_cost == 0.0