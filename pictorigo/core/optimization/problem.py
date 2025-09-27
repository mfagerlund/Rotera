"""Optimization problem builder for Pictorigo."""

import numpy as np
from typing import Dict, List, Optional, Tuple, Any

from .factor_graph import FactorGraph, Variable, VariableType
from .residuals import (
    ReprojectionResidual,
    KnownCoordinateResidual,
    DistanceResidual,
    AxisAlignmentResidual,
    CoplanarityResidual,
    EqualityResidual,
)
from ..models.project import Project
from ..models.constraints import (
    ImagePointConstraint,
    KnownCoordConstraint,
    DistanceConstraint,
    AxisAlignConstraint,
    CoplanarConstraint,
    PlaneFromThreeConstraint,
    EqualityConstraint,
    GaugeFixConstraint,
)


class OptimizationProblem:
    """Builder for optimization problems from Pictorigo projects."""

    def __init__(self, project: Project):
        """Initialize optimization problem.

        Args:
            project: Pictorigo project containing the scene
        """
        self.project = project
        self.factor_graph = FactorGraph()
        self._constraint_counter = 0

    def build_factor_graph(self) -> FactorGraph:
        """Build factor graph from project.

        Returns:
            Complete factor graph ready for optimization
        """
        # Clear existing graph
        self.factor_graph = FactorGraph()
        self._constraint_counter = 0

        # Add variables
        self._add_world_point_variables()
        self._add_camera_variables()

        # Add factors for constraints
        self._add_constraint_factors()

        return self.factor_graph

    def _add_world_point_variables(self) -> None:
        """Add world point variables to factor graph."""
        for wp_id, world_point in self.project.world_points.items():
            # Create variable
            variable = Variable(
                id=wp_id,
                type=VariableType.WORLD_POINT,
                size=3,
                value=np.array(world_point.xyz) if world_point.xyz is not None else None
            )

            self.factor_graph.add_variable(variable)

    def _add_camera_variables(self) -> None:
        """Add camera variables to factor graph."""
        for cam_id, camera in self.project.cameras.items():
            # Camera rotation (axis-angle)
            rotation_var = Variable(
                id=f"{cam_id}_rotation",
                type=VariableType.CAMERA_ROTATION,
                size=3,
                value=np.array(camera.R),
                is_constant=camera.lock_flags.rotation if camera.lock_flags else False
            )
            self.factor_graph.add_variable(rotation_var)

            # Camera translation
            translation_var = Variable(
                id=f"{cam_id}_translation",
                type=VariableType.CAMERA_TRANSLATION,
                size=3,
                value=np.array(camera.t),
                is_constant=camera.lock_flags.translation if camera.lock_flags else False
            )
            self.factor_graph.add_variable(translation_var)

            # Camera intrinsics
            intrinsics_var = Variable(
                id=f"{cam_id}_intrinsics",
                type=VariableType.CAMERA_INTRINSICS,
                size=len(camera.K),
                value=np.array(camera.K),
                is_constant=camera.lock_flags.intrinsics if camera.lock_flags else False,
                lower_bounds=np.array([10.0, 10.0, 0.0, 0.0] + [-1.0] * (len(camera.K) - 4)),
                upper_bounds=np.array([10000.0, 10000.0, 10000.0, 10000.0] + [1.0] * (len(camera.K) - 4))
            )
            self.factor_graph.add_variable(intrinsics_var)

    def _add_constraint_factors(self) -> None:
        """Add factors for all constraints."""
        for constraint in self.project.constraints:
            self._add_constraint_factor(constraint)

    def _add_constraint_factor(self, constraint) -> None:
        """Add factor for a single constraint."""
        constraint_type = constraint.constraint_type()

        if constraint_type == "image_point":
            self._add_image_point_factor(constraint)
        elif constraint_type == "known_coord":
            self._add_known_coord_factor(constraint)
        elif constraint_type == "distance":
            self._add_distance_factor(constraint)
        elif constraint_type == "axis_align":
            self._add_axis_align_factor(constraint)
        elif constraint_type == "coplanar":
            self._add_coplanar_factor(constraint)
        elif constraint_type == "plane_from_three":
            self._add_plane_from_three_factor(constraint)
        elif constraint_type == "equality":
            self._add_equality_factor(constraint)
        elif constraint_type == "gauge_fix":
            self._add_gauge_fix_factor(constraint)
        else:
            raise ValueError(f"Unknown constraint type: {constraint_type}")

    def _add_image_point_factor(self, constraint: ImagePointConstraint) -> None:
        """Add reprojection factor for image point constraint."""
        # Find camera for this image
        camera = None
        for cam in self.project.cameras.values():
            if cam.image_id == constraint.image_id:
                camera = cam
                break

        if camera is None:
            raise ValueError(f"No camera found for image {constraint.image_id}")

        factor_id = f"reprojection_{self._constraint_counter}"
        self._constraint_counter += 1

        factor = ReprojectionResidual(
            factor_id=factor_id,
            world_point_id=constraint.wp_id,
            camera_rotation_id=f"{camera.id}_rotation",
            camera_translation_id=f"{camera.id}_translation",
            camera_intrinsics_id=f"{camera.id}_intrinsics",
            observed_u=constraint.u,
            observed_v=constraint.v,
            sigma=constraint.sigma
        )

        self.factor_graph.add_factor(factor)

    def _add_known_coord_factor(self, constraint: KnownCoordConstraint) -> None:
        """Add known coordinate factor."""
        factor_id = f"known_coord_{self._constraint_counter}"
        self._constraint_counter += 1

        factor = KnownCoordinateResidual(
            factor_id=factor_id,
            world_point_id=constraint.wp_id,
            mask_xyz=constraint.mask_xyz,
            target_xyz=constraint.values
        )

        self.factor_graph.add_factor(factor)

    def _add_distance_factor(self, constraint: DistanceConstraint) -> None:
        """Add distance factor."""
        factor_id = f"distance_{self._constraint_counter}"
        self._constraint_counter += 1

        factor = DistanceResidual(
            factor_id=factor_id,
            world_point_i_id=constraint.wp_i,
            world_point_j_id=constraint.wp_j,
            target_distance=constraint.distance
        )

        self.factor_graph.add_factor(factor)

    def _add_axis_align_factor(self, constraint: AxisAlignConstraint) -> None:
        """Add axis alignment factor."""
        factor_id = f"axis_align_{self._constraint_counter}"
        self._constraint_counter += 1

        factor = AxisAlignmentResidual(
            factor_id=factor_id,
            world_point_i_id=constraint.wp_i,
            world_point_j_id=constraint.wp_j,
            target_axis=constraint.axis
        )

        self.factor_graph.add_factor(factor)

    def _add_coplanar_factor(self, constraint: CoplanarConstraint) -> None:
        """Add coplanarity factor."""
        factor_id = f"coplanar_{self._constraint_counter}"
        self._constraint_counter += 1

        factor = CoplanarityResidual(
            factor_id=factor_id,
            world_point_ids=constraint.wp_ids
        )

        self.factor_graph.add_factor(factor)

    def _add_plane_from_three_factor(self, constraint: PlaneFromThreeConstraint) -> None:
        """Add plane from three factor."""
        # This constraint defines a plane from three points and constrains additional points to it
        # We implement it as a coplanarity constraint over all points

        all_point_ids = [constraint.wp_a, constraint.wp_b, constraint.wp_c] + constraint.members

        if len(all_point_ids) >= 4:
            factor_id = f"plane_from_three_{self._constraint_counter}"
            self._constraint_counter += 1

            factor = CoplanarityResidual(
                factor_id=factor_id,
                world_point_ids=all_point_ids
            )

            self.factor_graph.add_factor(factor)

    def _add_equality_factor(self, constraint: EqualityConstraint) -> None:
        """Add equality factor."""
        factor_id = f"equality_{self._constraint_counter}"
        self._constraint_counter += 1

        factor = EqualityResidual(
            factor_id=factor_id,
            world_point_a_id=constraint.wp_a,
            world_point_b_id=constraint.wp_b
        )

        self.factor_graph.add_factor(factor)

    def _add_gauge_fix_factor(self, constraint: GaugeFixConstraint) -> None:
        """Add gauge fixing factors."""
        # Gauge fixing is implemented as multiple constraints:
        # 1. Origin point at (0,0,0)
        # 2. X-axis point has y=0, z=0
        # 3. XY-plane point has z=0
        # 4. Distance from origin to X-axis point

        # Origin at (0,0,0)
        origin_factor = KnownCoordinateResidual(
            factor_id=f"gauge_origin_{self._constraint_counter}",
            world_point_id=constraint.origin_wp,
            mask_xyz=[True, True, True],
            target_xyz=[0.0, 0.0, 0.0]
        )
        self.factor_graph.add_factor(origin_factor)
        self._constraint_counter += 1

        # X-axis point constraints (y=0, z=0)
        x_axis_factor = KnownCoordinateResidual(
            factor_id=f"gauge_x_axis_{self._constraint_counter}",
            world_point_id=constraint.x_wp,
            mask_xyz=[False, True, True],
            target_xyz=[0.0, 0.0, 0.0]
        )
        self.factor_graph.add_factor(x_axis_factor)
        self._constraint_counter += 1

        # XY-plane point constraint (z=0)
        xy_plane_factor = KnownCoordinateResidual(
            factor_id=f"gauge_xy_plane_{self._constraint_counter}",
            world_point_id=constraint.xy_wp,
            mask_xyz=[False, False, True],
            target_xyz=[0.0, 0.0, 0.0]
        )
        self.factor_graph.add_factor(xy_plane_factor)
        self._constraint_counter += 1

        # Distance constraint for scale
        distance_factor = DistanceResidual(
            factor_id=f"gauge_scale_{self._constraint_counter}",
            world_point_i_id=constraint.origin_wp,
            world_point_j_id=constraint.x_wp,
            target_distance=constraint.scale_d
        )
        self.factor_graph.add_factor(distance_factor)
        self._constraint_counter += 1

    def set_robust_loss_for_constraint_type(
        self,
        constraint_type: str,
        loss_type: str,
        **params
    ) -> None:
        """Set robust loss for all factors of a given constraint type.

        Args:
            constraint_type: Type of constraint ("image_point", "distance", etc.)
            loss_type: Type of robust loss ("huber", "cauchy", "none")
            **params: Parameters for the loss function
        """
        for factor in self.factor_graph.factors.values():
            # Check if factor corresponds to the constraint type
            if (constraint_type == "image_point" and isinstance(factor, ReprojectionResidual)) or \
               (constraint_type == "distance" and isinstance(factor, DistanceResidual)) or \
               (constraint_type == "known_coord" and isinstance(factor, KnownCoordinateResidual)) or \
               (constraint_type == "axis_align" and isinstance(factor, AxisAlignmentResidual)) or \
               (constraint_type == "coplanar" and isinstance(factor, CoplanarityResidual)) or \
               (constraint_type == "equality" and isinstance(factor, EqualityResidual)):
                factor.set_robust_loss(loss_type, **params)

    def get_optimization_summary(self) -> Dict[str, Any]:
        """Get summary of optimization problem.

        Returns:
            Dictionary with problem statistics
        """
        summary = self.factor_graph.summary()

        # Add additional information
        summary["project_info"] = {
            "world_points": len(self.project.world_points),
            "images": len(self.project.images),
            "cameras": len(self.project.cameras),
            "constraints": len(self.project.constraints)
        }

        # Count constraint types
        constraint_counts = {}
        for constraint in self.project.constraints:
            ctype = constraint.constraint_type()
            constraint_counts[ctype] = constraint_counts.get(ctype, 0) + 1

        summary["constraint_counts"] = constraint_counts

        return summary

    def initialize_from_existing_solution(self, other_problem: 'OptimizationProblem') -> None:
        """Initialize this problem's variables from another problem's solution.

        Args:
            other_problem: Another optimization problem with solved variables
        """
        for var_id, variable in self.factor_graph.variables.items():
            if var_id in other_problem.factor_graph.variables:
                other_var = other_problem.factor_graph.variables[var_id]
                if other_var.is_initialized():
                    variable.set_value(other_var.get_value())

    def extract_solution_to_project(self) -> None:
        """Extract optimized variable values back to the project."""
        # Update world points
        for wp_id, world_point in self.project.world_points.items():
            if wp_id in self.factor_graph.variables:
                variable = self.factor_graph.variables[wp_id]
                if variable.is_initialized():
                    world_point.set_from_numpy(variable.get_value())

        # Update cameras
        for cam_id, camera in self.project.cameras.items():
            # Update rotation
            rot_var_id = f"{cam_id}_rotation"
            if rot_var_id in self.factor_graph.variables:
                rot_var = self.factor_graph.variables[rot_var_id]
                if rot_var.is_initialized():
                    camera.set_rotation(rot_var.get_value())

            # Update translation
            trans_var_id = f"{cam_id}_translation"
            if trans_var_id in self.factor_graph.variables:
                trans_var = self.factor_graph.variables[trans_var_id]
                if trans_var.is_initialized():
                    camera.set_translation(trans_var.get_value())

            # Update intrinsics
            intrinsics_var_id = f"{cam_id}_intrinsics"
            if intrinsics_var_id in self.factor_graph.variables:
                intrinsics_var = self.factor_graph.variables[intrinsics_var_id]
                if intrinsics_var.is_initialized():
                    camera.set_intrinsics(intrinsics_var.get_value())