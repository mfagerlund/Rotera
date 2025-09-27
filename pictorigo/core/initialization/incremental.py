"""Incremental solver for adding cameras and points to existing reconstructions."""

import numpy as np
from typing import Dict, List, Optional, Set, Tuple, Any
from dataclasses import dataclass
import logging

from ..models.project import Project
from ..optimization.problem import OptimizationProblem
from ..solver.scipy_solver import SciPySolver, SolverOptions
from .pnp import initialize_camera_from_correspondences, extract_3d_2d_correspondences


@dataclass
class IncrementalState:
    """State of incremental reconstruction."""

    initialized_cameras: Set[str]
    initialized_points: Set[str]
    total_cameras: int
    total_points: int
    last_solve_success: bool
    last_solve_cost: float
    iteration: int


class IncrementalSolver:
    """Incremental solver for sequential camera and point addition."""

    def __init__(
        self,
        solver_options: Optional[SolverOptions] = None,
        pnp_ransac_threshold: float = 4.0,
        min_correspondences: int = 6,
        max_solve_iterations: int = 50
    ):
        """Initialize incremental solver.

        Args:
            solver_options: Options for the bundle adjustment solver
            pnp_ransac_threshold: RANSAC threshold for PnP initialization
            min_correspondences: Minimum correspondences required for camera initialization
            max_solve_iterations: Maximum iterations per solve
        """
        self.solver_options = solver_options or SolverOptions(
            max_iterations=max_solve_iterations,
            tolerance=1e-6
        )
        self.pnp_ransac_threshold = pnp_ransac_threshold
        self.min_correspondences = min_correspondences

        self.logger = logging.getLogger(__name__)
        self.state = IncrementalState(
            initialized_cameras=set(),
            initialized_points=set(),
            total_cameras=0,
            total_points=0,
            last_solve_success=False,
            last_solve_cost=0.0,
            iteration=0
        )

    def solve_incremental(self, project: Project) -> Dict[str, Any]:
        """Perform incremental reconstruction.

        Args:
            project: Pictorigo project to reconstruct

        Returns:
            Dictionary with reconstruction results and statistics
        """
        self.logger.info("Starting incremental reconstruction")

        # Reset state
        self.state = IncrementalState(
            initialized_cameras=set(),
            initialized_points=set(),
            total_cameras=len(project.cameras),
            total_points=len(project.world_points),
            last_solve_success=False,
            last_solve_cost=0.0,
            iteration=0
        )

        results = {
            "success": False,
            "cameras_initialized": 0,
            "points_initialized": 0,
            "total_iterations": 0,
            "final_cost": 0.0,
            "iteration_log": []
        }

        try:
            # Step 1: Initialize first cameras and points that have gauge fixing
            self._initialize_gauge_fixed_elements(project)

            # Step 2: Incremental addition loop
            max_iterations = 100  # Prevent infinite loops
            for iteration in range(max_iterations):
                self.state.iteration = iteration

                progress_made = False

                # Try to add new cameras
                new_cameras = self._add_cameras(project)
                if new_cameras:
                    progress_made = True
                    self.logger.info(f"Iteration {iteration}: Added cameras {new_cameras}")

                # Try to add new points
                new_points = self._add_points(project)
                if new_points:
                    progress_made = True
                    self.logger.info(f"Iteration {iteration}: Added {len(new_points)} points")

                # Perform bundle adjustment if changes were made
                if progress_made:
                    solve_result = self._solve_current_problem(project)
                    self.state.last_solve_success = solve_result.success
                    self.state.last_solve_cost = solve_result.final_cost

                    iteration_info = {
                        "iteration": iteration,
                        "cameras_added": len(new_cameras) if new_cameras else 0,
                        "points_added": len(new_points) if new_points else 0,
                        "solve_success": solve_result.success,
                        "solve_cost": solve_result.final_cost,
                        "total_cameras": len(self.state.initialized_cameras),
                        "total_points": len(self.state.initialized_points)
                    }
                    results["iteration_log"].append(iteration_info)

                    if not solve_result.success:
                        self.logger.warning(f"Bundle adjustment failed at iteration {iteration}")
                        break

                else:
                    # No progress made - reconstruction complete
                    self.logger.info(f"Incremental reconstruction completed after {iteration} iterations")
                    break

            # Final statistics
            results["success"] = True
            results["cameras_initialized"] = len(self.state.initialized_cameras)
            results["points_initialized"] = len(self.state.initialized_points)
            results["total_iterations"] = self.state.iteration + 1
            results["final_cost"] = self.state.last_solve_cost

            self.logger.info(
                f"Reconstruction complete: {results['cameras_initialized']}/{self.state.total_cameras} cameras, "
                f"{results['points_initialized']}/{self.state.total_points} points"
            )

            return results

        except Exception as e:
            self.logger.error(f"Incremental reconstruction failed: {str(e)}")
            results["error"] = str(e)
            return results

    def _initialize_gauge_fixed_elements(self, project: Project) -> None:
        """Initialize elements that are gauge-fixed."""
        # Find gauge fixing constraints
        gauge_constraints = project.get_constraints_by_type("gauge_fix")

        for constraint in gauge_constraints:
            # Mark gauge-fixed points as initialized
            gauge_points = [constraint.origin_wp, constraint.x_wp, constraint.xy_wp]
            for wp_id in gauge_points:
                if wp_id in project.world_points:
                    wp = project.world_points[wp_id]
                    if wp.xyz is not None:
                        self.state.initialized_points.add(wp_id)

        # Also initialize any points with known coordinates
        known_coord_constraints = project.get_constraints_by_type("known_coord")
        for constraint in known_coord_constraints:
            if constraint.wp_id in project.world_points:
                wp = project.world_points[constraint.wp_id]
                if wp.xyz is not None:
                    self.state.initialized_points.add(constraint.wp_id)

        self.logger.info(f"Initialized {len(self.state.initialized_points)} gauge-fixed points")

    def _add_cameras(self, project: Project) -> List[str]:
        """Attempt to add new cameras to the reconstruction.

        Args:
            project: Pictorigo project

        Returns:
            List of camera IDs that were successfully added
        """
        new_cameras = []

        for cam_id, camera in project.cameras.items():
            if cam_id in self.state.initialized_cameras:
                continue

            # Check if this camera has enough correspondences with initialized points
            world_points, image_points = extract_3d_2d_correspondences(project, cam_id)

            # Filter to only initialized points
            valid_correspondences = []
            for i, (wp_3d, ip_2d) in enumerate(zip(world_points, image_points)):
                # Find which world point this corresponds to
                image_id = camera.image_id
                ip_constraints = [
                    c for c in project.constraints
                    if hasattr(c, 'image_id') and c.image_id == image_id and
                       hasattr(c, 'u') and hasattr(c, 'v') and
                       abs(c.u - ip_2d[0]) < 1e-6 and abs(c.v - ip_2d[1]) < 1e-6
                ]

                if ip_constraints:
                    wp_id = ip_constraints[0].wp_id
                    if wp_id in self.state.initialized_points:
                        valid_correspondences.append((wp_3d, ip_2d))

            if len(valid_correspondences) >= self.min_correspondences:
                # Try to initialize this camera
                result = initialize_camera_from_correspondences(
                    project, cam_id, use_ransac=True,
                    ransac_threshold=self.pnp_ransac_threshold
                )

                if result.success:
                    self.state.initialized_cameras.add(cam_id)
                    new_cameras.append(cam_id)
                    self.logger.debug(
                        f"Initialized camera {cam_id} with {len(valid_correspondences)} correspondences, "
                        f"RMS error: {result.reprojection_error:.2f} px"
                    )

        return new_cameras

    def _add_points(self, project: Project) -> List[str]:
        """Attempt to add new 3D points to the reconstruction.

        Args:
            project: Pictorigo project

        Returns:
            List of world point IDs that were successfully added
        """
        new_points = []

        for wp_id, world_point in project.world_points.items():
            if wp_id in self.state.initialized_points:
                continue

            # Check if this point is observed by enough initialized cameras
            observing_cameras = self._get_observing_cameras(project, wp_id)
            initialized_observing_cameras = [
                cam_id for cam_id in observing_cameras
                if cam_id in self.state.initialized_cameras
            ]

            if len(initialized_observing_cameras) >= 2:
                # This point can potentially be triangulated
                # For now, we'll add it if it has coordinates (might be from constraints)
                if world_point.xyz is not None:
                    self.state.initialized_points.add(wp_id)
                    new_points.append(wp_id)

        return new_points

    def _get_observing_cameras(self, project: Project, wp_id: str) -> List[str]:
        """Get list of cameras that observe a world point.

        Args:
            project: Pictorigo project
            wp_id: World point ID

        Returns:
            List of camera IDs that observe this point
        """
        observing_cameras = []

        # Find image point constraints for this world point
        ip_constraints = [
            c for c in project.constraints
            if hasattr(c, 'wp_id') and c.wp_id == wp_id and hasattr(c, 'image_id')
        ]

        for constraint in ip_constraints:
            # Find camera for this image
            for cam_id, camera in project.cameras.items():
                if camera.image_id == constraint.image_id:
                    observing_cameras.append(cam_id)
                    break

        return observing_cameras

    def _solve_current_problem(self, project: Project):
        """Solve the current state of the reconstruction problem.

        Args:
            project: Pictorigo project

        Returns:
            Solve result
        """
        # Create a restricted problem with only initialized elements
        restricted_project = self._create_restricted_project(project)

        # Build and solve optimization problem
        problem = OptimizationProblem(restricted_project)
        factor_graph = problem.build_factor_graph()

        solver = SciPySolver(self.solver_options)
        result = solver.solve(factor_graph)

        # Extract solution back to main project
        if result.success:
            problem.extract_solution_to_project()
            self._copy_solution_back(restricted_project, project)

        return result

    def _create_restricted_project(self, project: Project) -> Project:
        """Create a project with only initialized cameras and points.

        Args:
            project: Original project

        Returns:
            Restricted project
        """
        from ..models.project import Project as ProjectClass

        restricted_project = ProjectClass()

        # Copy initialized world points
        for wp_id in self.state.initialized_points:
            if wp_id in project.world_points:
                restricted_project.world_points[wp_id] = project.world_points[wp_id]

        # Copy initialized cameras and their images
        for cam_id in self.state.initialized_cameras:
            if cam_id in project.cameras:
                camera = project.cameras[cam_id]
                restricted_project.cameras[cam_id] = camera

                # Copy associated image
                if camera.image_id in project.images:
                    restricted_project.images[camera.image_id] = project.images[camera.image_id]

        # Copy relevant constraints
        for constraint in project.constraints:
            should_include = False

            # Image point constraints
            if hasattr(constraint, 'wp_id') and hasattr(constraint, 'image_id'):
                if (constraint.wp_id in self.state.initialized_points and
                    any(camera.image_id == constraint.image_id
                        for cam_id, camera in restricted_project.cameras.items())):
                    should_include = True

            # Point-to-point constraints
            elif hasattr(constraint, 'wp_i') and hasattr(constraint, 'wp_j'):
                if (constraint.wp_i in self.state.initialized_points and
                    constraint.wp_j in self.state.initialized_points):
                    should_include = True

            # Single point constraints
            elif hasattr(constraint, 'wp_id'):
                if constraint.wp_id in self.state.initialized_points:
                    should_include = True

            # Multi-point constraints
            elif hasattr(constraint, 'wp_ids'):
                if all(wp_id in self.state.initialized_points for wp_id in constraint.wp_ids):
                    should_include = True

            # Gauge fixing and other constraints
            elif hasattr(constraint, 'origin_wp'):
                gauge_points = [constraint.origin_wp, constraint.x_wp, constraint.xy_wp]
                if all(wp_id in self.state.initialized_points for wp_id in gauge_points):
                    should_include = True

            if should_include:
                restricted_project.constraints.append(constraint)

        # Copy project settings
        restricted_project.settings = project.settings

        return restricted_project

    def _copy_solution_back(self, restricted_project: Project, main_project: Project) -> None:
        """Copy solution from restricted project back to main project.

        Args:
            restricted_project: Solved restricted project
            main_project: Main project to update
        """
        # Copy world point coordinates
        for wp_id, wp in restricted_project.world_points.items():
            if wp_id in main_project.world_points and wp.xyz is not None:
                main_project.world_points[wp_id].set_from_numpy(np.array(wp.xyz))

        # Copy camera parameters
        for cam_id, camera in restricted_project.cameras.items():
            if cam_id in main_project.cameras:
                main_camera = main_project.cameras[cam_id]
                main_camera.set_rotation(np.array(camera.R))
                main_camera.set_translation(np.array(camera.t))
                main_camera.set_intrinsics(np.array(camera.K))

    def get_reconstruction_statistics(self) -> Dict[str, Any]:
        """Get statistics about the current reconstruction state.

        Returns:
            Dictionary with reconstruction statistics
        """
        return {
            "initialized_cameras": len(self.state.initialized_cameras),
            "total_cameras": self.state.total_cameras,
            "camera_initialization_rate": len(self.state.initialized_cameras) / max(1, self.state.total_cameras),
            "initialized_points": len(self.state.initialized_points),
            "total_points": self.state.total_points,
            "point_initialization_rate": len(self.state.initialized_points) / max(1, self.state.total_points),
            "last_solve_success": self.state.last_solve_success,
            "last_solve_cost": self.state.last_solve_cost,
            "current_iteration": self.state.iteration
        }

    def can_add_camera(self, project: Project, camera_id: str) -> Tuple[bool, str]:
        """Check if a camera can be added to the reconstruction.

        Args:
            project: Pictorigo project
            camera_id: Camera ID to check

        Returns:
            Tuple of (can_add, reason)
        """
        if camera_id in self.state.initialized_cameras:
            return False, "Camera already initialized"

        if camera_id not in project.cameras:
            return False, "Camera not found in project"

        # Check correspondences
        world_points, image_points = extract_3d_2d_correspondences(project, camera_id)

        if len(world_points) < self.min_correspondences:
            return False, f"Insufficient correspondences: {len(world_points)} < {self.min_correspondences}"

        # Check how many correspondences are with initialized points
        camera = project.cameras[camera_id]
        image_id = camera.image_id

        initialized_correspondences = 0
        ip_constraints = [
            c for c in project.constraints
            if hasattr(c, 'image_id') and c.image_id == image_id and hasattr(c, 'wp_id')
        ]

        for constraint in ip_constraints:
            if constraint.wp_id in self.state.initialized_points:
                initialized_correspondences += 1

        if initialized_correspondences < self.min_correspondences:
            return False, f"Insufficient initialized correspondences: {initialized_correspondences} < {self.min_correspondences}"

        return True, "Can be added"

    def can_add_point(self, project: Project, wp_id: str) -> Tuple[bool, str]:
        """Check if a world point can be added to the reconstruction.

        Args:
            project: Pictorigo project
            wp_id: World point ID to check

        Returns:
            Tuple of (can_add, reason)
        """
        if wp_id in self.state.initialized_points:
            return False, "Point already initialized"

        if wp_id not in project.world_points:
            return False, "Point not found in project"

        # Check if observed by enough initialized cameras
        observing_cameras = self._get_observing_cameras(project, wp_id)
        initialized_observing_cameras = [
            cam_id for cam_id in observing_cameras
            if cam_id in self.state.initialized_cameras
        ]

        if len(initialized_observing_cameras) < 2:
            return False, f"Observed by only {len(initialized_observing_cameras)} initialized cameras"

        return True, "Can be added"