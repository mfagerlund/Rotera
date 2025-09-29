"""Tests for line-specific constraints and operations."""

from pictorigo.core.models.constraints import (
    ParallelLinesConstraint,
    PerpendicularLinesConstraint,
)
from pictorigo.core.models.entities import Line, LineConstraintSettings, WorldPoint
from pictorigo.core.models.project import Project


class TestLineEntity:
    """Test Line entity with constraints."""

    def test_line_creation(self):
        """Test basic line creation."""
        line = Line(id="l1", name="Test Line", point_a="wp1", point_b="wp2")
        assert line.id == "l1"
        assert line.name == "Test Line"
        assert line.point_a == "wp1"
        assert line.point_b == "wp2"
        assert line.color == "#ffffff"
        assert line.is_visible is True
        assert line.is_construction is False
        assert line.line_style == "solid"
        assert line.thickness == 1.0
        assert line.constraints.direction == "free"
        assert line.constraints.distance == "free"
        assert line.constraints.target_length is None


class TestParallelLinesConstraint:
    """Test parallel lines constraints."""

    def test_parallel_lines_constraint_creation(self):
        """Test creating parallel lines constraint."""
        constraint = ParallelLinesConstraint(
            id="parallel_1", line_a_id="l1", line_b_id="l2", weight=1.0
        )
        assert constraint.id == "parallel_1"
        assert constraint.line_a_id == "l1"
        assert constraint.line_b_id == "l2"
        assert constraint.weight == 1.0
        assert constraint.enabled is True
        assert constraint.constraint_type() == "parallel_lines"

    def test_parallel_lines_constraint_integration(self):
        """Test parallel lines constraint in project."""
        project = Project()

        # Create points for two parallel lines
        wp1 = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0])
        wp2 = WorldPoint(id="wp2", xyz=[1.0, 0.0, 0.0])
        wp3 = WorldPoint(id="wp3", xyz=[0.0, 1.0, 0.0])
        wp4 = WorldPoint(id="wp4", xyz=[1.0, 1.0, 0.0])

        project.add_world_point(wp1)
        project.add_world_point(wp2)
        project.add_world_point(wp3)
        project.add_world_point(wp4)

        # Create two lines
        line1 = Line(id="l1", name="Line 1", point_a="wp1", point_b="wp2")
        line2 = Line(id="l2", name="Line 2", point_a="wp3", point_b="wp4")
        project.add_line(line1)
        project.add_line(line2)

        # Add parallel constraint
        constraint = ParallelLinesConstraint(
            id="parallel_constraint", line_a_id="l1", line_b_id="l2"
        )

        assert constraint.constraint_type() == "parallel_lines"
        assert constraint.line_a_id == "l1"
        assert constraint.line_b_id == "l2"


class TestPerpendicularLinesConstraint:
    """Test perpendicular lines constraints."""

    def test_perpendicular_lines_constraint_creation(self):
        """Test creating perpendicular lines constraint."""
        constraint = PerpendicularLinesConstraint(
            id="perpendicular_1", line_a_id="l1", line_b_id="l2", weight=1.0
        )
        assert constraint.id == "perpendicular_1"
        assert constraint.line_a_id == "l1"
        assert constraint.line_b_id == "l2"
        assert constraint.weight == 1.0
        assert constraint.enabled is True
        assert constraint.constraint_type() == "perpendicular_lines"

    def test_perpendicular_lines_constraint_integration(self):
        """Test perpendicular lines constraint in project."""
        project = Project()

        # Create points for perpendicular lines
        wp1 = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0])
        wp2 = WorldPoint(id="wp2", xyz=[1.0, 0.0, 0.0])  # Horizontal line
        wp3 = WorldPoint(id="wp3", xyz=[0.0, 0.0, 0.0])
        wp4 = WorldPoint(id="wp4", xyz=[0.0, 1.0, 0.0])  # Vertical line

        project.add_world_point(wp1)
        project.add_world_point(wp2)
        project.add_world_point(wp3)
        project.add_world_point(wp4)

        # Create two lines
        horizontal_line = Line(
            id="h1", name="Horizontal Line", point_a="wp1", point_b="wp2"
        )
        vertical_line = Line(
            id="v1", name="Vertical Line", point_a="wp3", point_b="wp4"
        )
        project.add_line(horizontal_line)
        project.add_line(vertical_line)

        # Add perpendicular constraint
        constraint = PerpendicularLinesConstraint(
            id="perpendicular_constraint", line_a_id="h1", line_b_id="v1"
        )

        assert constraint.constraint_type() == "perpendicular_lines"
        assert constraint.line_a_id == "h1"
        assert constraint.line_b_id == "v1"


class TestLineConstraintProperties:
    """Test line constraint properties embedded in Line entity."""

    def test_horizontal_line_constraint_property(self):
        """Test creating line with horizontal constraint."""
        constraints = LineConstraintSettings(direction="horizontal")
        line = Line(
            id="l1",
            name="Horizontal Line",
            point_a="wp1",
            point_b="wp2",
            constraints=constraints,
        )
        assert line.constraints.direction == "horizontal"
        assert line.constraints.distance == "free"
        assert line.constraints.target_length is None

    def test_vertical_line_constraint_property(self):
        """Test creating line with vertical constraint."""
        constraints = LineConstraintSettings(direction="vertical")
        line = Line(
            id="l1",
            name="Vertical Line",
            point_a="wp1",
            point_b="wp2",
            constraints=constraints,
        )
        assert line.constraints.direction == "vertical"
        assert line.constraints.distance == "free"
        assert line.constraints.target_length is None

    def test_axis_aligned_line_constraint_property(self):
        """Test creating line with axis-aligned constraint."""
        constraints = LineConstraintSettings(direction="axis_aligned")
        line = Line(
            id="l1",
            name="Axis Aligned Line",
            point_a="wp1",
            point_b="wp2",
            constraints=constraints,
        )
        assert line.constraints.direction == "axis_aligned"
        assert line.constraints.distance == "free"
        assert line.constraints.target_length is None

    def test_fixed_distance_line_constraint_property(self):
        """Test creating line with fixed distance constraint."""
        constraints = LineConstraintSettings(distance="fixed", target_length=10.0)
        line = Line(
            id="l1",
            name="Fixed Distance Line",
            point_a="wp1",
            point_b="wp2",
            constraints=constraints,
        )
        assert line.constraints.direction == "free"
        assert line.constraints.distance == "fixed"
        assert line.constraints.target_length == 10.0

    def test_combined_line_constraints(self):
        """Test line with combined constraints."""
        constraints = LineConstraintSettings(
            direction="horizontal", distance="fixed", target_length=5.0, tolerance=0.001
        )
        line = Line(
            id="l1",
            name="Constrained Line",
            point_a="wp1",
            point_b="wp2",
            constraints=constraints,
        )
        assert line.constraints.direction == "horizontal"
        assert line.constraints.distance == "fixed"
        assert line.constraints.target_length == 5.0
        assert line.constraints.tolerance == 0.001

    def test_line_constraint_integration(self):
        """Test line constraints in project."""
        project = Project()

        # Create points for constrained line
        wp1 = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0])
        wp2 = WorldPoint(id="wp2", xyz=[1.0, 0.0, 0.0])  # Same Y coordinate

        project.add_world_point(wp1)
        project.add_world_point(wp2)

        # Create horizontal line with fixed distance
        constraints = LineConstraintSettings(
            direction="horizontal", distance="fixed", target_length=1.0
        )
        line = Line(
            id="constrained_line",
            name="Constrained Line",
            point_a="wp1",
            point_b="wp2",
            constraints=constraints,
        )
        project.add_line(line)

        # Verify line is in project with correct constraints
        assert "constrained_line" in project.lines
        stored_line = project.lines["constrained_line"]
        assert stored_line.constraints.direction == "horizontal"
        assert stored_line.constraints.distance == "fixed"
        assert stored_line.constraints.target_length == 1.0
