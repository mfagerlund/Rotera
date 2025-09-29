"""Tests for line-specific constraints and operations."""

import pytest
import numpy as np
from pictorigo.core.models.entities import WorldPoint, Line
from pictorigo.core.models.constraints import (
    ParallelLinesConstraint,
    PerpendicularLinesConstraint,
    HorizontalLineConstraint,
    VerticalLineConstraint
)
from pictorigo.core.models.project import Project


class TestLineEntity:
    """Test Line entity with constraints."""

    def test_line_creation(self):
        """Test basic line creation."""
        line = Line(
            id="l1",
            name="Test Line",
            point_a="wp1",
            point_b="wp2"
        )
        assert line.id == "l1"
        assert line.name == "Test Line"
        assert line.point_a == "wp1"
        assert line.point_b == "wp2"
        assert line.color == "#ffffff"
        assert line.is_visible is True
        assert line.is_construction is False
        assert line.line_style == "solid"
        assert line.thickness == 1.0

    def test_line_with_styling(self):
        """Test line creation with custom styling."""
        line = Line(
            id="l1",
            name="Styled Line",
            point_a="wp1",
            point_b="wp2",
            color="#ff0000",
            is_construction=True,
            line_style="dashed",
            thickness=2.0,
            tags=["construction", "guide"]
        )
        assert line.color == "#ff0000"
        assert line.is_construction is True
        assert line.line_style == "dashed"
        assert line.thickness == 2.0
        assert line.tags == ["construction", "guide"]

    def test_line_to_solver_dto(self):
        """Test line conversion to solver DTO."""
        line = Line(
            id="l1",
            name="Test Line",
            point_a="wp1",
            point_b="wp2"
        )
        solver_dto = line.to_solver_dto()

        expected = {
            "id": "l1",
            "pointA": "wp1",
            "pointB": "wp2"
        }
        assert solver_dto == expected


class TestLineProjectIntegration:
    """Test lines integrated with project and world points."""

    def setup_method(self):
        """Set up test project with points and lines."""
        self.project = Project()

        # Create world points
        self.wp1 = WorldPoint(id="wp1", name="Point 1", xyz=[0.0, 0.0, 0.0])
        self.wp2 = WorldPoint(id="wp2", name="Point 2", xyz=[1.0, 0.0, 0.0])
        self.wp3 = WorldPoint(id="wp3", name="Point 3", xyz=[0.0, 1.0, 0.0])
        self.wp4 = WorldPoint(id="wp4", name="Point 4", xyz=[1.0, 1.0, 0.0])

        self.project.add_world_point(self.wp1)
        self.project.add_world_point(self.wp2)
        self.project.add_world_point(self.wp3)
        self.project.add_world_point(self.wp4)

        # Create lines
        self.horizontal_line = Line(
            id="h1", name="Horizontal Line",
            point_a="wp1", point_b="wp2"
        )
        self.vertical_line = Line(
            id="v1", name="Vertical Line",
            point_a="wp1", point_b="wp3"
        )
        self.diagonal_line = Line(
            id="d1", name="Diagonal Line",
            point_a="wp1", point_b="wp4"
        )

        self.project.add_line(self.horizontal_line)
        self.project.add_line(self.vertical_line)
        self.project.add_line(self.diagonal_line)

    def test_project_line_integration(self):
        """Test that lines are properly integrated into project."""
        assert len(self.project.lines) == 3
        assert "h1" in self.project.lines
        assert "v1" in self.project.lines
        assert "d1" in self.project.lines

    def test_line_point_validation(self):
        """Test that line validation catches invalid point references."""
        # This should be caught by project validation
        invalid_line = Line(
            id="invalid",
            name="Invalid Line",
            point_a="wp1",
            point_b="nonexistent"
        )
        self.project.lines["invalid"] = invalid_line

        issues = self.project.validate_project()
        assert len(issues) > 0
        assert any("non-existent point" in issue.lower() for issue in issues)

    def test_line_removal_cascading(self):
        """Test that removing a point removes dependent lines."""
        assert len(self.project.lines) == 3

        # Remove wp1 - should remove all lines that reference it
        self.project.remove_world_point("wp1")

        # All lines should be removed since they all connect to wp1
        assert len(self.project.lines) == 0


class TestParallelLinesConstraint:
    """Test parallel lines constraints."""

    def test_parallel_lines_constraint_creation(self):
        """Test creating parallel lines constraint."""
        constraint = ParallelLinesConstraint(
            id="parallel_1",
            line_a_id="l1",
            line_b_id="l2",
            weight=1.5
        )
        assert constraint.id == "parallel_1"
        assert constraint.line_a_id == "l1"
        assert constraint.line_b_id == "l2"
        assert constraint.weight == 1.5
        assert constraint.enabled is True
        assert constraint.constraint_type() == "parallel_lines"

    def test_parallel_lines_constraint_integration(self):
        """Test parallel lines constraint in project context."""
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

        # Create parallel lines (both horizontal)
        line1 = Line(id="l1", name="Line 1", point_a="wp1", point_b="wp2")
        line2 = Line(id="l2", name="Line 2", point_a="wp3", point_b="wp4")

        project.add_line(line1)
        project.add_line(line2)

        # Add parallel constraint
        constraint = ParallelLinesConstraint(
            id="parallel_12",
            line_a_id="l1",
            line_b_id="l2"
        )

        # Convert to general constraint format for project
        general_constraint = {
            "id": "parallel_12",
            "type": "parallel_lines",
            "entities": {"lines": ["l1", "l2"]},
            "parameters": {},
            "isEnabled": True
        }

        # This would normally be added through the constraint conversion system
        assert constraint.constraint_type() == "parallel_lines"


class TestPerpendicularLinesConstraint:
    """Test perpendicular lines constraints."""

    def test_perpendicular_lines_constraint_creation(self):
        """Test creating perpendicular lines constraint."""
        constraint = PerpendicularLinesConstraint(
            id="perp_1",
            line_a_id="l1",
            line_b_id="l2",
            weight=2.0
        )
        assert constraint.id == "perp_1"
        assert constraint.line_a_id == "l1"
        assert constraint.line_b_id == "l2"
        assert constraint.weight == 2.0
        assert constraint.constraint_type() == "perpendicular_lines"

    def test_perpendicular_lines_constraint_integration(self):
        """Test perpendicular lines constraint in project context."""
        project = Project()

        # Create points for perpendicular lines
        wp1 = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0])
        wp2 = WorldPoint(id="wp2", xyz=[1.0, 0.0, 0.0])  # Horizontal line
        wp3 = WorldPoint(id="wp3", xyz=[0.0, 1.0, 0.0])  # Vertical line

        project.add_world_point(wp1)
        project.add_world_point(wp2)
        project.add_world_point(wp3)

        # Create perpendicular lines
        horizontal_line = Line(id="h1", name="Horizontal", point_a="wp1", point_b="wp2")
        vertical_line = Line(id="v1", name="Vertical", point_a="wp1", point_b="wp3")

        project.add_line(horizontal_line)
        project.add_line(vertical_line)

        # Add perpendicular constraint
        constraint = PerpendicularLinesConstraint(
            id="perp_hv",
            line_a_id="h1",
            line_b_id="v1"
        )

        assert constraint.constraint_type() == "perpendicular_lines"
        assert constraint.line_a_id == "h1"
        assert constraint.line_b_id == "v1"


class TestHorizontalLineConstraint:
    """Test horizontal line constraints."""

    def test_horizontal_line_constraint_creation(self):
        """Test creating horizontal line constraint."""
        constraint = HorizontalLineConstraint(
            id="horizontal_1",
            line_id="l1",
            weight=1.0
        )
        assert constraint.id == "horizontal_1"
        assert constraint.line_id == "l1"
        assert constraint.weight == 1.0
        assert constraint.enabled is True
        assert constraint.constraint_type() == "horizontal_line"

    def test_horizontal_line_constraint_integration(self):
        """Test horizontal line constraint in project."""
        project = Project()

        # Create points for horizontal line
        wp1 = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0])
        wp2 = WorldPoint(id="wp2", xyz=[1.0, 0.0, 0.0])  # Same Y coordinate

        project.add_world_point(wp1)
        project.add_world_point(wp2)

        # Create horizontal line
        line = Line(id="h1", name="Horizontal Line", point_a="wp1", point_b="wp2")
        project.add_line(line)

        # Add horizontal constraint
        constraint = HorizontalLineConstraint(
            id="h1_horizontal",
            line_id="h1"
        )

        assert constraint.constraint_type() == "horizontal_line"
        assert constraint.line_id == "h1"


class TestVerticalLineConstraint:
    """Test vertical line constraints."""

    def test_vertical_line_constraint_creation(self):
        """Test creating vertical line constraint."""
        constraint = VerticalLineConstraint(
            id="vertical_1",
            line_id="l1",
            weight=1.0
        )
        assert constraint.id == "vertical_1"
        assert constraint.line_id == "l1"
        assert constraint.weight == 1.0
        assert constraint.enabled is True
        assert constraint.constraint_type() == "vertical_line"

    def test_vertical_line_constraint_integration(self):
        """Test vertical line constraint in project."""
        project = Project()

        # Create points for vertical line
        wp1 = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0])
        wp2 = WorldPoint(id="wp2", xyz=[0.0, 1.0, 0.0])  # Same X coordinate

        project.add_world_point(wp1)
        project.add_world_point(wp2)

        # Create vertical line
        line = Line(id="v1", name="Vertical Line", point_a="wp1", point_b="wp2")
        project.add_line(line)

        # Add vertical constraint
        constraint = VerticalLineConstraint(
            id="v1_vertical",
            line_id="v1"
        )

        assert constraint.constraint_type() == "vertical_line"
        assert constraint.line_id == "v1"


class TestLineConstraintValidation:
    """Test validation of line constraints."""

    def test_line_constraint_missing_lines(self):
        """Test validation when referenced lines don't exist."""
        project = Project()

        # Try to create constraint without adding lines to project
        from pictorigo.core.models.entities import Constraint

        # This represents how a constraint would look in the general system
        constraint = Constraint(
            id="c1",
            name="Parallel Lines",
            type="parallel_lines",
            status="satisfied",
            entities={"lines": ["l1", "l2"]},
            parameters={}
        )

        project.add_constraint(constraint)

        # Validation should catch missing line references
        issues = project.validate_project()
        assert len(issues) >= 2  # Should report both missing lines
        assert any("non-existent line" in issue.lower() for issue in issues)

    def test_line_constraint_valid_references(self):
        """Test validation passes with valid line references."""
        project = Project()

        # Create required entities
        wp1 = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0])
        wp2 = WorldPoint(id="wp2", xyz=[1.0, 0.0, 0.0])
        wp3 = WorldPoint(id="wp3", xyz=[0.0, 1.0, 0.0])
        wp4 = WorldPoint(id="wp4", xyz=[1.0, 1.0, 0.0])

        project.add_world_point(wp1)
        project.add_world_point(wp2)
        project.add_world_point(wp3)
        project.add_world_point(wp4)

        line1 = Line(id="l1", name="Line 1", point_a="wp1", point_b="wp2")
        line2 = Line(id="l2", name="Line 2", point_a="wp3", point_b="wp4")

        project.add_line(line1)
        project.add_line(line2)

        # Add constraint
        from pictorigo.core.models.entities import Constraint
        constraint = Constraint(
            id="c1",
            name="Parallel Lines",
            type="parallel_lines",
            status="satisfied",
            entities={"lines": ["l1", "l2"]},
            parameters={}
        )

        project.add_constraint(constraint)

        # Validation should pass
        issues = project.validate_project()
        assert len(issues) == 0


class TestLineGeometryOperations:
    """Test geometric operations on lines."""

    def test_line_length_calculation(self):
        """Test line length calculation (would be implemented in domain objects)."""
        # This would test the actual geometric calculations
        # For now, we test the data structures support it

        wp1 = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0])
        wp2 = WorldPoint(id="wp2", xyz=[3.0, 4.0, 0.0])  # 3-4-5 triangle

        # In a full implementation, Line would have geometric methods
        line = Line(id="l1", name="Test Line", point_a="wp1", point_b="wp2")

        # Verify the data structure
        assert line.point_a == "wp1"
        assert line.point_b == "wp2"

        # Length calculation would use the actual WorldPoint objects
        # Expected length: sqrt(3^2 + 4^2) = 5.0
        if wp1.xyz and wp2.xyz:
            dx = wp2.xyz[0] - wp1.xyz[0]
            dy = wp2.xyz[1] - wp1.xyz[1]
            dz = wp2.xyz[2] - wp1.xyz[2]
            length = (dx**2 + dy**2 + dz**2)**0.5
            assert abs(length - 5.0) < 1e-10

    def test_line_direction_calculation(self):
        """Test line direction vector calculation."""
        wp1 = WorldPoint(id="wp1", xyz=[1.0, 1.0, 1.0])
        wp2 = WorldPoint(id="wp2", xyz=[2.0, 3.0, 5.0])  # Direction: [1, 2, 4]

        line = Line(id="l1", name="Direction Test", point_a="wp1", point_b="wp2")

        if wp1.xyz and wp2.xyz:
            dx = wp2.xyz[0] - wp1.xyz[0]
            dy = wp2.xyz[1] - wp1.xyz[1]
            dz = wp2.xyz[2] - wp1.xyz[2]

            # Expected direction vector: [1, 2, 4]
            assert dx == 1.0
            assert dy == 2.0
            assert dz == 4.0

    def test_line_midpoint_calculation(self):
        """Test line midpoint calculation."""
        wp1 = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0])
        wp2 = WorldPoint(id="wp2", xyz=[4.0, 6.0, 8.0])

        line = Line(id="l1", name="Midpoint Test", point_a="wp1", point_b="wp2")

        if wp1.xyz and wp2.xyz:
            midpoint = [
                (wp1.xyz[0] + wp2.xyz[0]) / 2,
                (wp1.xyz[1] + wp2.xyz[1]) / 2,
                (wp1.xyz[2] + wp2.xyz[2]) / 2
            ]

            # Expected midpoint: [2, 3, 4]
            assert midpoint == [2.0, 3.0, 4.0]


class TestComplexLineConstraintScenarios:
    """Test complex scenarios with multiple line constraints."""

    def test_multiple_parallel_lines(self):
        """Test scenario with multiple parallel lines."""
        project = Project()

        # Create a grid of points
        points = []
        for i in range(3):
            for j in range(3):
                wp = WorldPoint(id=f"wp_{i}_{j}", xyz=[float(i), float(j), 0.0])
                points.append(wp)
                project.add_world_point(wp)

        # Create horizontal lines
        h_lines = []
        for j in range(3):
            line = Line(
                id=f"h_{j}",
                name=f"Horizontal {j}",
                point_a=f"wp_0_{j}",
                point_b=f"wp_2_{j}"
            )
            h_lines.append(line)
            project.add_line(line)

        # Create vertical lines
        v_lines = []
        for i in range(3):
            line = Line(
                id=f"v_{i}",
                name=f"Vertical {i}",
                point_a=f"wp_{i}_0",
                point_b=f"wp_{i}_2"
            )
            v_lines.append(line)
            project.add_line(line)

        # Add parallel constraints for horizontal lines
        for i in range(len(h_lines) - 1):
            constraint = ParallelLinesConstraint(
                id=f"h_parallel_{i}_{i+1}",
                line_a_id=h_lines[i].id,
                line_b_id=h_lines[i+1].id
            )
            # In practice, these would be converted and added to project

        # Add perpendicular constraints between horizontal and vertical
        perp_constraint = PerpendicularLinesConstraint(
            id="h_v_perp",
            line_a_id="h_0",
            line_b_id="v_0"
        )

        # Verify the structure
        assert len(project.lines) == 6
        assert len(project.world_points) == 9

        # Validation should pass
        issues = project.validate_project()
        assert len(issues) == 0

    def test_line_constraint_conflict_detection(self):
        """Test detection of conflicting line constraints."""
        # This would test scenarios where constraints conflict
        # e.g., line constrained to be both horizontal and vertical

        project = Project()
        wp1 = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0])
        wp2 = WorldPoint(id="wp2", xyz=[1.0, 1.0, 0.0])

        project.add_world_point(wp1)
        project.add_world_point(wp2)

        line = Line(id="l1", name="Conflicted Line", point_a="wp1", point_b="wp2")
        project.add_line(line)

        # In practice, the constraint solver would detect conflicts
        # between horizontal and vertical constraints on the same line
        horizontal_constraint = HorizontalLineConstraint(id="h1", line_id="l1")
        vertical_constraint = VerticalLineConstraint(id="v1", line_id="l1")

        # Both constraints reference the same line - potential conflict
        assert horizontal_constraint.line_id == vertical_constraint.line_id
        assert horizontal_constraint.constraint_type() != vertical_constraint.constraint_type()

    def test_line_construction_vs_driving_geometry(self):
        """Test distinction between construction and driving geometry."""
        project = Project()

        wp1 = WorldPoint(id="wp1", xyz=[0.0, 0.0, 0.0])
        wp2 = WorldPoint(id="wp2", xyz=[1.0, 0.0, 0.0])
        wp3 = WorldPoint(id="wp3", xyz=[0.0, 1.0, 0.0])

        project.add_world_point(wp1)
        project.add_world_point(wp2)
        project.add_world_point(wp3)

        # Construction line (helper geometry)
        construction_line = Line(
            id="c1",
            name="Construction Line",
            point_a="wp1",
            point_b="wp2",
            is_construction=True,
            line_style="dashed",
            color="#808080"
        )

        # Driving line (main geometry)
        driving_line = Line(
            id="d1",
            name="Driving Line",
            point_a="wp1",
            point_b="wp3",
            is_construction=False,
            line_style="solid",
            color="#ffffff"
        )

        project.add_line(construction_line)
        project.add_line(driving_line)

        # Verify distinction
        assert construction_line.is_construction is True
        assert driving_line.is_construction is False
        assert construction_line.line_style == "dashed"
        assert driving_line.line_style == "solid"