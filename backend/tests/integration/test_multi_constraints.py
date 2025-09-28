"""Tests for multiple constraints working together."""

import numpy as np
from pictorigo.core.models.constraints import (
    AxisAlignConstraint,
    CoplanarConstraint,
    DistanceConstraint,
    GaugeFixConstraint,
    ImagePointConstraint,
    KnownCoordConstraint,
)
from pictorigo.core.models.entities import Camera, Image, WorldPoint
from pictorigo.core.models.project import Project
from pictorigo.core.optimization.problem import OptimizationProblem
from pictorigo.core.solver.scipy_solver import SciPySolver, SolverOptions


class TestMultiConstraintScenarios:
    """Test scenarios with multiple constraint types."""

    def create_test_project(self):
        """Create a basic project for constraint testing."""
        project = Project()

        # Add world points
        points = {
            "p1": [0.0, 0.0, 0.0],
            "p2": [1.0, 0.0, 0.0],
            "p3": [2.0, 0.0, 0.0],
            "p4": [0.0, 1.0, 0.0],
            "p5": [1.0, 1.0, 0.0],
            "p6": [0.0, 0.0, 1.0],
        }

        for wp_id, xyz in points.items():
            project.add_world_point(WorldPoint(id=wp_id, xyz=xyz))

        # Add camera
        camera = Camera(
            id="cam1",
            R=np.eye(3),
            t=np.array([0, 0, -5]),
            K=np.array([[800, 0, 320], [0, 800, 240], [0, 0, 1]], dtype=float),
        )
        project.add_camera(camera)

        # Add image
        image = Image(id="img1", camera_id="cam1")
        project.add_image(image)

        return project

    def test_distance_and_axis_align(self):
        """Test distance constraint combined with axis alignment."""
        project = self.create_test_project()

        # Distance constraint: p1-p2 should be 1.0 units apart
        project.add_constraint(DistanceConstraint(wp_i="p1", wp_j="p2", distance=1.0))

        # Axis alignment: p1-p2 should align with X axis
        project.add_constraint(AxisAlignConstraint(wp_i="p1", wp_j="p2", axis="x"))

        # Gauge fixing to remove degrees of freedom
        project.add_constraint(
            GaugeFixConstraint(origin_wp="p1", x_wp="p2", xy_wp="p4", scale_d=1.0)
        )

        # Build and solve
        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        # Verify constraints are properly converted
        distance_factors = [
            f for f in factor_graph.factors.values() if "distance" in f.factor_id
        ]
        axis_factors = [
            f for f in factor_graph.factors.values() if "axis_align" in f.factor_id
        ]
        gauge_factors = [
            f for f in factor_graph.factors.values() if "gauge" in f.factor_id
        ]

        assert len(distance_factors) >= 1
        assert len(axis_factors) >= 1
        assert len(gauge_factors) >= 4  # origin, x_axis, xy_plane, scale

        # Test that we can compute residuals
        residuals = factor_graph.compute_all_residuals()
        assert len(residuals) > 0
        assert np.all(np.isfinite(residuals))

    def test_coplanar_with_known_coords(self):
        """Test coplanar constraint with known coordinates."""
        project = self.create_test_project()

        # Known coordinates for some points
        project.add_constraint(
            KnownCoordConstraint(
                wp_id="p1", mask_xyz=[True, True, True], values=[0.0, 0.0, 0.0]
            )
        )

        project.add_constraint(
            KnownCoordConstraint(
                wp_id="p2", mask_xyz=[True, False, True], values=[1.0, 0.0, 0.0]
            )
        )

        # Coplanar constraint: p1, p2, p4, p5 should be coplanar
        project.add_constraint(CoplanarConstraint(wp_ids=["p1", "p2", "p4", "p5"]))

        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        # Check constraint conversion
        known_coord_factors = [
            f for f in factor_graph.factors.values() if "known_coord" in f.factor_id
        ]
        coplanar_factors = [
            f for f in factor_graph.factors.values() if "coplanar" in f.factor_id
        ]

        assert len(known_coord_factors) >= 2
        assert len(coplanar_factors) >= 1

        # Test residual computation
        residuals = factor_graph.compute_all_residuals()
        assert np.all(np.isfinite(residuals))

    def test_multiple_distance_constraints(self):
        """Test multiple distance constraints forming a rigid structure."""
        project = self.create_test_project()

        # Create a triangle with known side lengths
        distances = [
            ("p1", "p2", 1.0),
            ("p2", "p3", 1.0),
            ("p1", "p3", np.sqrt(2)),  # Right triangle
        ]

        for wp_i, wp_j, dist in distances:
            project.add_constraint(
                DistanceConstraint(wp_i=wp_i, wp_j=wp_j, distance=dist)
            )

        # Fix gauge
        project.add_constraint(
            GaugeFixConstraint(origin_wp="p1", x_wp="p2", xy_wp="p3", scale_d=1.0)
        )

        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        # Solve the system
        solver = SciPySolver(SolverOptions(max_iterations=50))
        solver.solve(factor_graph)

        # Extract solution
        problem.extract_solution_to_project()

        # Verify distances are preserved
        p1_pos = np.array(project.world_points["p1"].xyz)
        p2_pos = np.array(project.world_points["p2"].xyz)
        p3_pos = np.array(project.world_points["p3"].xyz)

        dist_p1_p2 = np.linalg.norm(p2_pos - p1_pos)
        dist_p2_p3 = np.linalg.norm(p3_pos - p2_pos)
        dist_p1_p3 = np.linalg.norm(p3_pos - p1_pos)

        assert abs(dist_p1_p2 - 1.0) < 0.1
        assert abs(dist_p2_p3 - 1.0) < 0.1
        assert abs(dist_p1_p3 - np.sqrt(2)) < 0.1

    def test_image_points_with_geometric_constraints(self):
        """Test image point observations with geometric constraints."""
        project = self.create_test_project()

        # Add image point observations
        observations = [
            ("p1", 100, 200),
            ("p2", 200, 200),
            ("p4", 100, 100),
        ]

        for wp_id, u, v in observations:
            project.add_constraint(
                ImagePointConstraint(image_id="img1", wp_id=wp_id, u=u, v=v, sigma=1.0)
            )

        # Add geometric constraints
        project.add_constraint(DistanceConstraint(wp_i="p1", wp_j="p2", distance=1.0))

        project.add_constraint(AxisAlignConstraint(wp_i="p1", wp_j="p4", axis="y"))

        # Gauge fixing
        project.add_constraint(
            GaugeFixConstraint(origin_wp="p1", x_wp="p2", xy_wp="p4", scale_d=1.0)
        )

        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        # Check all constraint types are present
        reprojection_factors = [
            f for f in factor_graph.factors.values() if "reprojection" in f.factor_id
        ]
        distance_factors = [
            f for f in factor_graph.factors.values() if "distance" in f.factor_id
        ]
        axis_factors = [
            f for f in factor_graph.factors.values() if "axis_align" in f.factor_id
        ]

        assert len(reprojection_factors) >= 3
        assert len(distance_factors) >= 1
        assert len(axis_factors) >= 1

        # Test optimization
        solver = SciPySolver(SolverOptions(max_iterations=20))
        result = solver.solve(factor_graph)

        assert result.final_cost >= 0
        assert result.iterations >= 0

    def test_conflicting_constraints_detection(self):
        """Test detection of conflicting constraints."""
        project = self.create_test_project()

        # Create conflicting distance constraints
        project.add_constraint(DistanceConstraint(wp_i="p1", wp_j="p2", distance=1.0))

        project.add_constraint(
            DistanceConstraint(
                wp_i="p1", wp_j="p2", distance=2.0  # Conflicting distance!
            )
        )

        # Add gauge fixing
        project.add_constraint(
            GaugeFixConstraint(origin_wp="p1", x_wp="p2", xy_wp="p4", scale_d=1.0)
        )

        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        # Should still build but may not converge well
        solver = SciPySolver(SolverOptions(max_iterations=10))
        result = solver.solve(factor_graph)

        # High residual indicates conflict
        assert result.final_cost > 0.5  # Should have high cost due to conflict

    def test_constraint_weighting(self):
        """Test different weights on constraints."""
        project = self.create_test_project()

        # Strong distance constraint (low sigma = high weight)
        project.add_constraint(DistanceConstraint(wp_i="p1", wp_j="p2", distance=1.0))

        # Weak image point constraint (high sigma = low weight)
        project.add_constraint(
            ImagePointConstraint(
                image_id="img1",
                wp_id="p1",
                u=100,
                v=200,
                sigma=10.0,  # High uncertainty = low weight
            )
        )

        # Gauge fixing
        project.add_constraint(
            GaugeFixConstraint(origin_wp="p1", x_wp="p2", xy_wp="p4", scale_d=1.0)
        )

        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        # Test that we can apply robust losses differently
        problem.set_robust_loss_for_constraint_type("distance", "none")
        problem.set_robust_loss_for_constraint_type("image_point", "huber", delta=1.0)

        # Verify different robust losses applied
        distance_factors = [
            f for f in factor_graph.factors.values() if "distance" in f.factor_id
        ]
        reprojection_factors = [
            f for f in factor_graph.factors.values() if "reprojection" in f.factor_id
        ]

        for factor in distance_factors:
            assert factor.robust_loss_type == "none"

        for factor in reprojection_factors:
            assert factor.robust_loss_type == "huber"

    def test_over_constrained_system(self):
        """Test over-constrained system behavior."""
        project = self.create_test_project()

        # Fix all coordinates of multiple points
        for point_id in ["p1", "p2", "p3"]:
            project.add_constraint(
                KnownCoordConstraint(
                    wp_id=point_id,
                    mask_xyz=[True, True, True],
                    values=project.world_points[point_id].xyz,
                )
            )

        # Add redundant distance constraint
        project.add_constraint(DistanceConstraint(wp_i="p1", wp_j="p2", distance=1.0))

        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        # Should handle gracefully
        solver = SciPySolver(SolverOptions(max_iterations=5))
        result = solver.solve(factor_graph)

        # Should converge quickly since everything is fixed
        assert result.success or result.final_cost < 1e-10

    def test_under_constrained_system(self):
        """Test under-constrained system behavior."""
        project = self.create_test_project()

        # Only add a single distance constraint (insufficient)
        project.add_constraint(DistanceConstraint(wp_i="p1", wp_j="p2", distance=1.0))

        # No gauge fixing - system has many degrees of freedom
        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        solver = SciPySolver(SolverOptions(max_iterations=10))
        result = solver.solve(factor_graph)

        # May not converge well due to gauge freedom
        # This test mainly checks we don't crash
        assert result.final_cost >= 0

    def test_collinear_with_distance_constraints(self):
        """Test collinear constraint combined with distance constraints."""
        from pictorigo.core.models.constraints import CollinearConstraint

        project = self.create_test_project()

        # Points p1, p2, p3 should be collinear
        project.add_constraint(CollinearConstraint(wp_ids=["p1", "p2", "p3"]))

        # Distance constraints between collinear points
        project.add_constraint(DistanceConstraint(wp_i="p1", wp_j="p2", distance=1.0))

        project.add_constraint(DistanceConstraint(wp_i="p2", wp_j="p3", distance=1.0))

        # Gauge fixing
        project.add_constraint(
            GaugeFixConstraint(origin_wp="p1", x_wp="p2", xy_wp="p4", scale_d=1.0)
        )

        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        # Check constraint conversion
        collinear_factors = [
            f for f in factor_graph.factors.values() if "collinear" in f.factor_id
        ]
        distance_factors = [
            f for f in factor_graph.factors.values() if "distance" in f.factor_id
        ]

        assert len(collinear_factors) >= 1
        assert len(distance_factors) >= 2

        # Test optimization
        solver = SciPySolver(SolverOptions(max_iterations=20))
        result = solver.solve(factor_graph)
        assert result.final_cost >= 0

    def test_perpendicular_lines_constraint(self):
        """Test perpendicular constraint between two lines."""
        from pictorigo.core.models.constraints import PerpendicularConstraint

        project = self.create_test_project()

        # Line p1-p2 should be perpendicular to line p4-p5
        project.add_constraint(
            PerpendicularConstraint(
                line1_wp_a="p1", line1_wp_b="p2", line2_wp_a="p4", line2_wp_b="p5"
            )
        )

        # Add some distance constraints for stability
        project.add_constraint(DistanceConstraint(wp_i="p1", wp_j="p2", distance=1.0))

        project.add_constraint(DistanceConstraint(wp_i="p4", wp_j="p5", distance=1.0))

        # Gauge fixing
        project.add_constraint(
            GaugeFixConstraint(origin_wp="p1", x_wp="p2", xy_wp="p4", scale_d=1.0)
        )

        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        # Check constraint conversion
        perpendicular_factors = [
            f for f in factor_graph.factors.values() if "perpendicular" in f.factor_id
        ]
        assert len(perpendicular_factors) >= 1

        # Test residual computation
        residuals = factor_graph.compute_all_residuals()
        assert np.all(np.isfinite(residuals))

    def test_parallel_and_angle_constraints(self):
        """Test parallel and angle constraints together."""
        from pictorigo.core.models.constraints import (
            AngleConstraint,
            ParallelConstraint,
        )

        project = self.create_test_project()

        # Lines p1-p2 and p3-p4 should be parallel
        project.add_constraint(
            ParallelConstraint(
                line1_wp_a="p1", line1_wp_b="p2", line2_wp_a="p3", line2_wp_b="p4"
            )
        )

        # Line p1-p2 should be at 45 degrees to line p5-p6
        project.add_constraint(
            AngleConstraint(
                line1_wp_a="p1",
                line1_wp_b="p2",
                line2_wp_a="p5",
                line2_wp_b="p6",
                angle_degrees=45.0,
            )
        )

        # Gauge fixing
        project.add_constraint(
            GaugeFixConstraint(origin_wp="p1", x_wp="p2", xy_wp="p5", scale_d=1.0)
        )

        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        # Check constraint conversion
        parallel_factors = [
            f for f in factor_graph.factors.values() if "parallel" in f.factor_id
        ]
        angle_factors = [
            f for f in factor_graph.factors.values() if "angle" in f.factor_id
        ]

        assert len(parallel_factors) >= 1
        assert len(angle_factors) >= 1

        # Test optimization
        solver = SciPySolver(SolverOptions(max_iterations=15))
        result = solver.solve(factor_graph)
        assert result.final_cost >= 0

    def test_complex_geometric_structure(self):
        """Test complex structure with multiple new constraint types."""
        from pictorigo.core.models.constraints import (
            CollinearConstraint,
            FixedDistanceRatioConstraint,
            PerpendicularConstraint,
        )

        project = self.create_test_project()

        # Create a rectangular structure
        # p1-p2-p3 collinear (base)
        project.add_constraint(CollinearConstraint(wp_ids=["p1", "p2", "p3"]))

        # p1-p4 perpendicular to p1-p2 (vertical side)
        project.add_constraint(
            PerpendicularConstraint(
                line1_wp_a="p1", line1_wp_b="p4", line2_wp_a="p1", line2_wp_b="p2"
            )
        )

        # Distance ratio: base should be twice the height
        project.add_constraint(
            FixedDistanceRatioConstraint(
                line1_wp_a="p1",
                line1_wp_b="p3",
                line2_wp_a="p1",
                line2_wp_b="p4",
                ratio=2.0,
            )
        )

        # Some distance constraints for scale
        project.add_constraint(DistanceConstraint(wp_i="p1", wp_j="p2", distance=1.0))

        # Gauge fixing
        project.add_constraint(
            GaugeFixConstraint(origin_wp="p1", x_wp="p2", xy_wp="p4", scale_d=1.0)
        )

        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        # Check all constraint types are present
        constraint_types = set()
        for factor in factor_graph.factors.values():
            if "collinear" in factor.factor_id:
                constraint_types.add("collinear")
            elif "perpendicular" in factor.factor_id:
                constraint_types.add("perpendicular")
            elif "distance_ratio" in factor.factor_id:
                constraint_types.add("distance_ratio")
            elif "distance" in factor.factor_id:
                constraint_types.add("distance")
            elif "gauge" in factor.factor_id:
                constraint_types.add("gauge")

        expected_types = {
            "collinear",
            "perpendicular",
            "distance_ratio",
            "distance",
            "gauge",
        }
        assert constraint_types.issuperset(expected_types)

        # Test optimization
        solver = SciPySolver(SolverOptions(max_iterations=30))
        result = solver.solve(factor_graph)

        # Should converge to reasonable cost
        assert result.final_cost >= 0
        if result.success:
            assert result.final_cost < 10.0  # Should be reasonably low

    def test_all_constraint_types_together(self):
        """Test project with all available constraint types."""
        from pictorigo.core.models.constraints import (
            AngleConstraint,
            CollinearConstraint,
            FixedDistanceRatioConstraint,
            ParallelConstraint,
            PerpendicularConstraint,
        )

        # Create larger project
        project = Project()

        # Add more world points
        points = {
            f"p{i}": [i * 0.5, (i % 3) * 0.5, (i % 2) * 0.5] for i in range(1, 16)
        }

        for wp_id, xyz in points.items():
            project.add_world_point(WorldPoint(id=wp_id, xyz=xyz))

        # Add camera and image
        camera = Camera(
            id="cam1",
            R=np.eye(3),
            t=np.array([0, 0, -5]),
            K=np.array([[800, 0, 320], [0, 800, 240], [0, 0, 1]], dtype=float),
        )
        project.add_camera(camera)
        project.add_image(Image(id="img1", camera_id="cam1"))

        # Add constraints of each type
        project.add_constraint(
            ImagePointConstraint(image_id="img1", wp_id="p1", u=100, v=100)
        )

        project.add_constraint(
            KnownCoordConstraint(
                wp_id="p1", mask_xyz=[True, True, True], values=[0.0, 0.0, 0.0]
            )
        )

        project.add_constraint(DistanceConstraint(wp_i="p2", wp_j="p3", distance=1.0))

        project.add_constraint(AxisAlignConstraint(wp_i="p4", wp_j="p5", axis="x"))

        project.add_constraint(CoplanarConstraint(wp_ids=["p6", "p7", "p8", "p9"]))

        project.add_constraint(CollinearConstraint(wp_ids=["p10", "p11", "p12"]))

        project.add_constraint(
            PerpendicularConstraint(
                line1_wp_a="p13", line1_wp_b="p14", line2_wp_a="p14", line2_wp_b="p15"
            )
        )

        project.add_constraint(
            ParallelConstraint(
                line1_wp_a="p2", line1_wp_b="p3", line2_wp_a="p4", line2_wp_b="p5"
            )
        )

        project.add_constraint(
            AngleConstraint(
                line1_wp_a="p6",
                line1_wp_b="p7",
                line2_wp_a="p8",
                line2_wp_b="p9",
                angle_degrees=90.0,
            )
        )

        project.add_constraint(
            FixedDistanceRatioConstraint(
                line1_wp_a="p10",
                line1_wp_b="p11",
                line2_wp_a="p12",
                line2_wp_b="p13",
                ratio=1.5,
            )
        )

        # Gauge fixing
        project.add_constraint(
            GaugeFixConstraint(origin_wp="p1", x_wp="p2", xy_wp="p4", scale_d=1.0)
        )

        # Build factor graph
        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        # Should have factors for all constraint types
        factor_ids = [f.factor_id for f in factor_graph.factors.values()]

        # Check we have diverse factor types
        assert any("reprojection" in fid for fid in factor_ids)
        assert any("distance" in fid for fid in factor_ids)
        assert any("collinear" in fid for fid in factor_ids)
        assert any("perpendicular" in fid for fid in factor_ids)
        assert any("gauge" in fid for fid in factor_ids)

        # Test that we can compute residuals
        residuals = factor_graph.compute_all_residuals()
        assert len(residuals) > 0
        assert np.all(np.isfinite(residuals))

        # Test optimization (may not converge well due to complexity)
        solver = SciPySolver(SolverOptions(max_iterations=10))
        result = solver.solve(factor_graph)

        # Main test is that it doesn't crash
        assert result.final_cost >= 0
        assert result.iterations >= 0
