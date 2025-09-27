"""Tests that verify constraints produce geometrically correct solutions."""

import numpy as np
import pytest

from pictorigo.core.models.project import Project
from pictorigo.core.models.entities import WorldPoint, Camera, Image
from pictorigo.core.models.constraints import (
    DistanceConstraint,
    AngleConstraint,
    CollinearConstraint,
    RectangleConstraint,
    PointOnLineConstraint,
    PointOnPlaneConstraint,
    PointOnSphereConstraint,
    EqualDistanceConstraint,
    EqualSpacingConstraint,
    GaugeFixConstraint,
)
from pictorigo.core.optimization.problem import OptimizationProblem
from pictorigo.core.solver.scipy_solver import SciPySolver, SolverOptions


class TestGeometricAccuracy:
    """Test that constraints actually produce correct geometric shapes."""

    def create_basic_project(self):
        """Create basic project for testing."""
        project = Project()

        # Add world points with initial rough positions
        points = {
            "p1": [0.1, 0.1, 0.1],
            "p2": [1.1, 0.1, 0.1],
            "p3": [2.1, 0.1, 0.1],
            "p4": [0.1, 1.1, 0.1],
            "p5": [1.1, 1.1, 0.1],
            "p6": [0.1, 0.1, 1.1],
        }

        for wp_id, xyz in points.items():
            project.add_world_point(WorldPoint(id=wp_id, xyz=xyz))

        return project

    def solve_project(self, project):
        """Solve optimization problem and return final positions."""
        problem = OptimizationProblem(project)
        factor_graph = problem.build_factor_graph()

        solver = SciPySolver(SolverOptions(
            method="lm",
            max_iterations=100,
            tolerance=1e-8
        ))

        result = solver.solve(factor_graph)
        problem.extract_solution_to_project()

        return result, {wp_id: np.array(wp.xyz) for wp_id, wp in project.world_points.items()}

    def test_distance_constraint_accuracy(self):
        """Test that distance constraint produces exact distance."""
        project = self.create_basic_project()

        # Add distance constraint: p1-p2 should be exactly 2.0 units
        project.add_constraint(DistanceConstraint(
            wp_i="p1",
            wp_j="p2",
            distance=2.0
        ))

        # Gauge fixing
        project.add_constraint(GaugeFixConstraint(
            origin_wp="p1",
            x_wp="p2",
            xy_wp="p4",
            scale_d=2.0
        ))

        result, positions = self.solve_project(project)

        # Verify distance is exactly 2.0
        actual_distance = np.linalg.norm(positions["p2"] - positions["p1"])
        assert abs(actual_distance - 2.0) < 1e-6, f"Expected distance 2.0, got {actual_distance}"

        # Verify optimization succeeded
        assert result.success, "Optimization should succeed"
        assert result.final_cost < 1e-10, f"Final cost too high: {result.final_cost}"

    def test_perpendicular_constraint_accuracy(self):
        """Test that perpendicular constraint produces exactly 90° angle."""
        project = self.create_basic_project()

        # Lines p1-p2 and p1-p4 should be perpendicular
        project.add_constraint(AngleConstraint.perpendicular(
            line1_wp_a="p1",
            line1_wp_b="p2",
            line2_wp_a="p1",
            line2_wp_b="p4"
        ))

        # Add some distances for stability
        project.add_constraint(DistanceConstraint(wp_i="p1", wp_j="p2", distance=1.0))
        project.add_constraint(DistanceConstraint(wp_i="p1", wp_j="p4", distance=1.0))

        # Gauge fixing
        project.add_constraint(GaugeFixConstraint(
            origin_wp="p1",
            x_wp="p2",
            xy_wp="p4",
            scale_d=1.0
        ))

        result, positions = self.solve_project(project)

        # Compute actual angle
        vec1 = positions["p2"] - positions["p1"]
        vec2 = positions["p4"] - positions["p1"]

        # Normalize vectors
        vec1 = vec1 / np.linalg.norm(vec1)
        vec2 = vec2 / np.linalg.norm(vec2)

        # Compute angle
        dot_product = np.dot(vec1, vec2)
        angle_rad = np.arccos(np.clip(dot_product, -1.0, 1.0))
        angle_deg = np.degrees(angle_rad)

        assert abs(angle_deg - 90.0) < 1e-3, f"Expected 90°, got {angle_deg}°"
        assert result.final_cost < 1e-8, f"Final cost too high: {result.final_cost}"

    def test_parallel_constraint_accuracy(self):
        """Test that parallel constraint produces exactly parallel lines."""
        project = self.create_basic_project()

        # Lines p1-p2 and p4-p5 should be parallel
        project.add_constraint(AngleConstraint.parallel(
            line1_wp_a="p1",
            line1_wp_b="p2",
            line2_wp_a="p4",
            line2_wp_b="p5"
        ))

        # Add distances for stability
        project.add_constraint(DistanceConstraint(wp_i="p1", wp_j="p2", distance=1.0))
        project.add_constraint(DistanceConstraint(wp_i="p4", wp_j="p5", distance=1.0))

        # Gauge fixing
        project.add_constraint(GaugeFixConstraint(
            origin_wp="p1",
            x_wp="p2",
            xy_wp="p4",
            scale_d=1.0
        ))

        result, positions = self.solve_project(project)

        # Compute line directions
        dir1 = positions["p2"] - positions["p1"]
        dir2 = positions["p5"] - positions["p4"]

        # Normalize
        dir1 = dir1 / np.linalg.norm(dir1)
        dir2 = dir2 / np.linalg.norm(dir2)

        # Cross product should be zero for parallel lines
        cross_product = np.cross(dir1, dir2)
        cross_magnitude = np.linalg.norm(cross_product)

        assert cross_magnitude < 1e-6, f"Lines not parallel, cross product magnitude: {cross_magnitude}"

        # Dot product should be ±1 for parallel lines
        dot_product = abs(np.dot(dir1, dir2))
        assert abs(dot_product - 1.0) < 1e-6, f"Lines not parallel, dot product: {dot_product}"

    def test_collinear_constraint_accuracy(self):
        """Test that collinear constraint produces exactly collinear points."""
        project = self.create_basic_project()

        # Points p1, p2, p3 should be collinear
        project.add_constraint(CollinearConstraint(
            wp_ids=["p1", "p2", "p3"]
        ))

        # Add distances for ordering
        project.add_constraint(DistanceConstraint(wp_i="p1", wp_j="p2", distance=1.0))
        project.add_constraint(DistanceConstraint(wp_i="p2", wp_j="p3", distance=1.0))

        # Gauge fixing
        project.add_constraint(GaugeFixConstraint(
            origin_wp="p1",
            x_wp="p2",
            xy_wp="p4",
            scale_d=1.0
        ))

        result, positions = self.solve_project(project)

        # Check collinearity using cross product
        p1, p2, p3 = positions["p1"], positions["p2"], positions["p3"]

        # Vectors from p1
        v12 = p2 - p1
        v13 = p3 - p1

        # Cross product should be zero for collinear points
        cross_product = np.cross(v12, v13)
        cross_magnitude = np.linalg.norm(cross_product)

        assert cross_magnitude < 1e-6, f"Points not collinear, cross product magnitude: {cross_magnitude}"

        # Verify distances are correct
        dist_12 = np.linalg.norm(p2 - p1)
        dist_23 = np.linalg.norm(p3 - p2)
        assert abs(dist_12 - 1.0) < 1e-6, f"Distance p1-p2 not 1.0: {dist_12}"
        assert abs(dist_23 - 1.0) < 1e-6, f"Distance p2-p3 not 1.0: {dist_23}"

    def test_rectangle_constraint_accuracy(self):
        """Test that rectangle constraint produces a proper rectangle."""
        project = self.create_basic_project()

        # Create rectangle with p1, p2, p3, p4 as corners
        project.add_constraint(RectangleConstraint(
            corner_a="p1",
            corner_b="p2",
            corner_c="p3",
            corner_d="p4"
        ))

        # Gauge fixing to establish scale
        project.add_constraint(GaugeFixConstraint(
            origin_wp="p1",
            x_wp="p2",
            xy_wp="p4",
            scale_d=1.0
        ))

        result, positions = self.solve_project(project)

        p1, p2, p3, p4 = positions["p1"], positions["p2"], positions["p3"], positions["p4"]

        # Check rectangle properties
        # 1. Opposite sides are parallel and equal
        edge_12 = p2 - p1
        edge_43 = p3 - p4
        assert np.allclose(edge_12, edge_43, atol=1e-6), "Opposite sides p1-p2 and p4-p3 not equal"

        edge_14 = p4 - p1
        edge_23 = p3 - p2
        assert np.allclose(edge_14, edge_23, atol=1e-6), "Opposite sides p1-p4 and p2-p3 not equal"

        # 2. Adjacent sides are perpendicular
        dot_product = np.dot(edge_12, edge_14)
        assert abs(dot_product) < 1e-6, f"Adjacent sides not perpendicular, dot product: {dot_product}"

        # 3. All points are coplanar
        # Check if p3 lies on plane defined by p1, p2, p4
        v1 = p2 - p1
        v2 = p4 - p1
        normal = np.cross(v1, v2)
        normal = normal / np.linalg.norm(normal)

        distance_to_plane = abs(np.dot(normal, p3 - p1))
        assert distance_to_plane < 1e-6, f"Points not coplanar, distance: {distance_to_plane}"

    def test_square_constraint_accuracy(self):
        """Test that square constraint (aspect ratio = 1) produces a proper square."""
        project = self.create_basic_project()

        # Create square with aspect ratio 1.0
        project.add_constraint(RectangleConstraint(
            corner_a="p1",
            corner_b="p2",
            corner_c="p3",
            corner_d="p4",
            aspect_ratio=1.0
        ))

        # Gauge fixing
        project.add_constraint(GaugeFixConstraint(
            origin_wp="p1",
            x_wp="p2",
            xy_wp="p4",
            scale_d=1.0
        ))

        result, positions = self.solve_project(project)

        p1, p2, p3, p4 = positions["p1"], positions["p2"], positions["p3"], positions["p4"]

        # Check square properties
        # 1. All sides equal length
        side_lengths = [
            np.linalg.norm(p2 - p1),
            np.linalg.norm(p3 - p2),
            np.linalg.norm(p4 - p3),
            np.linalg.norm(p1 - p4)
        ]

        for i, length in enumerate(side_lengths):
            assert abs(length - 1.0) < 1e-6, f"Side {i} length not 1.0: {length}"

        # 2. All angles are 90 degrees
        edges = [p2-p1, p3-p2, p4-p3, p1-p4]
        for i in range(4):
            edge1 = edges[i] / np.linalg.norm(edges[i])
            edge2 = edges[(i+1) % 4] / np.linalg.norm(edges[(i+1) % 4])
            dot_product = np.dot(edge1, edge2)
            angle_deg = np.degrees(np.arccos(np.clip(abs(dot_product), 0, 1)))
            assert abs(angle_deg - 90.0) < 1e-3, f"Angle {i} not 90°: {angle_deg}°"

    def test_equal_distance_constraint_accuracy(self):
        """Test that equal distance constraint produces exactly equal distances."""
        project = self.create_basic_project()

        # Distances p1-p2 and p4-p5 should be equal
        project.add_constraint(EqualDistanceConstraint(
            line1_wp_a="p1",
            line1_wp_b="p2",
            line2_wp_a="p4",
            line2_wp_b="p5"
        ))

        # Set one distance to establish scale
        project.add_constraint(DistanceConstraint(wp_i="p1", wp_j="p2", distance=1.5))

        # Gauge fixing
        project.add_constraint(GaugeFixConstraint(
            origin_wp="p1",
            x_wp="p2",
            xy_wp="p4",
            scale_d=1.5
        ))

        result, positions = self.solve_project(project)

        # Check distances are equal
        dist1 = np.linalg.norm(positions["p2"] - positions["p1"])
        dist2 = np.linalg.norm(positions["p5"] - positions["p4"])

        assert abs(dist1 - 1.5) < 1e-6, f"First distance not 1.5: {dist1}"
        assert abs(dist2 - 1.5) < 1e-6, f"Second distance not 1.5: {dist2}"
        assert abs(dist1 - dist2) < 1e-6, f"Distances not equal: {dist1} vs {dist2}"

    def test_point_on_sphere_constraint_accuracy(self):
        """Test that point-on-sphere constraint produces exact sphere placement."""
        project = self.create_basic_project()

        # Point p3 should lie on sphere centered at p1 with radius defined by p1-p2
        project.add_constraint(PointOnSphereConstraint(
            point_id="p3",
            center_id="p1",
            radius_ref_id="p2"
        ))

        # Set radius distance
        project.add_constraint(DistanceConstraint(wp_i="p1", wp_j="p2", distance=2.0))

        # Gauge fixing
        project.add_constraint(GaugeFixConstraint(
            origin_wp="p1",
            x_wp="p2",
            xy_wp="p4",
            scale_d=2.0
        ))

        result, positions = self.solve_project(project)

        # Check sphere constraint
        center = positions["p1"]
        radius_ref = positions["p2"]
        point_on_sphere = positions["p3"]

        expected_radius = np.linalg.norm(radius_ref - center)
        actual_radius = np.linalg.norm(point_on_sphere - center)

        assert abs(expected_radius - 2.0) < 1e-6, f"Reference radius not 2.0: {expected_radius}"
        assert abs(actual_radius - expected_radius) < 1e-6, f"Point not on sphere: radius {actual_radius} vs {expected_radius}"

    def test_equal_spacing_constraint_accuracy(self):
        """Test that equal spacing constraint produces exactly equal intervals."""
        project = self.create_basic_project()

        # Points p1, p2, p3 should be equally spaced
        project.add_constraint(EqualSpacingConstraint(
            point_ids=["p1", "p2", "p3"]
        ))

        # Make them collinear and set total distance
        project.add_constraint(CollinearConstraint(wp_ids=["p1", "p2", "p3"]))
        project.add_constraint(DistanceConstraint(wp_i="p1", wp_j="p3", distance=4.0))

        # Gauge fixing
        project.add_constraint(GaugeFixConstraint(
            origin_wp="p1",
            x_wp="p3",
            xy_wp="p4",
            scale_d=4.0
        ))

        result, positions = self.solve_project(project)

        # Check equal spacing
        p1, p2, p3 = positions["p1"], positions["p2"], positions["p3"]

        spacing1 = np.linalg.norm(p2 - p1)
        spacing2 = np.linalg.norm(p3 - p2)

        assert abs(spacing1 - spacing2) < 1e-6, f"Spacings not equal: {spacing1} vs {spacing2}"
        assert abs(spacing1 - 2.0) < 1e-6, f"Expected spacing 2.0, got {spacing1}"

    def test_complex_structure_accuracy(self):
        """Test complex structure with multiple constraints working together."""
        project = self.create_basic_project()

        # Create L-shaped structure:
        # - p1-p2-p3 collinear (horizontal)
        # - p1-p4 perpendicular to p1-p2 (vertical)
        # - Equal distances

        project.add_constraint(CollinearConstraint(wp_ids=["p1", "p2", "p3"]))
        project.add_constraint(AngleConstraint.perpendicular(
            line1_wp_a="p1", line1_wp_b="p2",
            line2_wp_a="p1", line2_wp_b="p4"
        ))
        project.add_constraint(EqualDistanceConstraint(
            line1_wp_a="p1", line1_wp_b="p2",
            line2_wp_a="p2", line2_wp_b="p3"
        ))
        project.add_constraint(EqualDistanceConstraint(
            line1_wp_a="p1", line1_wp_b="p2",
            line2_wp_a="p1", line2_wp_b="p4"
        ))

        # Set scale
        project.add_constraint(DistanceConstraint(wp_i="p1", wp_j="p2", distance=1.0))

        # Gauge fixing
        project.add_constraint(GaugeFixConstraint(
            origin_wp="p1",
            x_wp="p2",
            xy_wp="p4",
            scale_d=1.0
        ))

        result, positions = self.solve_project(project)

        p1, p2, p3, p4 = positions["p1"], positions["p2"], positions["p3"], positions["p4"]

        # Verify all geometric properties
        # 1. Collinearity
        v12 = p2 - p1
        v13 = p3 - p1
        cross_magnitude = np.linalg.norm(np.cross(v12, v13))
        assert cross_magnitude < 1e-6, f"Points not collinear: {cross_magnitude}"

        # 2. Perpendicularity
        v14 = p4 - p1
        dot_product = np.dot(v12, v14)
        assert abs(dot_product) < 1e-6, f"Lines not perpendicular: {dot_product}"

        # 3. Equal distances
        distances = [
            np.linalg.norm(p2 - p1),
            np.linalg.norm(p3 - p2),
            np.linalg.norm(p4 - p1)
        ]

        for i, dist in enumerate(distances):
            assert abs(dist - 1.0) < 1e-6, f"Distance {i} not 1.0: {dist}"

        assert result.final_cost < 1e-10, f"Final cost too high: {result.final_cost}"