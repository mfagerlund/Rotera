"""Perspective-n-Point (PnP) solvers for camera pose estimation."""

import numpy as np
import cv2
from typing import Tuple, Optional, List, Dict
from dataclasses import dataclass

from ..math.se3 import se3_log


@dataclass
class PnPResult:
    """Result of PnP solver."""

    success: bool
    R: Optional[np.ndarray] = None  # 3x3 rotation matrix
    t: Optional[np.ndarray] = None  # 3-element translation vector
    inliers: Optional[np.ndarray] = None  # Boolean mask of inlier correspondences
    reprojection_error: float = 0.0
    method_used: str = ""


class EPnPSolver:
    """Efficient Perspective-n-Point solver using OpenCV."""

    def __init__(
        self,
        use_ransac: bool = True,
        ransac_threshold: float = 4.0,
        ransac_confidence: float = 0.99,
        max_iterations: int = 1000
    ):
        """Initialize EPnP solver.

        Args:
            use_ransac: Whether to use RANSAC for robust estimation
            ransac_threshold: RANSAC inlier threshold in pixels
            ransac_confidence: RANSAC confidence level
            max_iterations: Maximum RANSAC iterations
        """
        self.use_ransac = use_ransac
        self.ransac_threshold = ransac_threshold
        self.ransac_confidence = ransac_confidence
        self.max_iterations = max_iterations

    def solve(
        self,
        world_points: np.ndarray,
        image_points: np.ndarray,
        camera_matrix: np.ndarray,
        distortion_coeffs: Optional[np.ndarray] = None
    ) -> PnPResult:
        """Solve PnP problem.

        Args:
            world_points: Nx3 array of 3D points in world coordinates
            image_points: Nx2 array of corresponding 2D image points
            camera_matrix: 3x3 camera intrinsic matrix
            distortion_coeffs: Distortion coefficients (optional)

        Returns:
            PnPResult with estimated pose
        """
        if len(world_points) != len(image_points):
            return PnPResult(success=False, method_used="input_validation_failed")

        if len(world_points) < 4:
            return PnPResult(success=False, method_used="insufficient_points")

        # Ensure proper array formats
        world_points = np.ascontiguousarray(world_points, dtype=np.float32)
        image_points = np.ascontiguousarray(image_points, dtype=np.float32)
        camera_matrix = np.ascontiguousarray(camera_matrix, dtype=np.float32)

        if distortion_coeffs is None:
            distortion_coeffs = np.zeros(4, dtype=np.float32)
        else:
            distortion_coeffs = np.ascontiguousarray(distortion_coeffs, dtype=np.float32)

        try:
            if self.use_ransac:
                # Use RANSAC for robust estimation
                success, rvec, tvec, inliers = cv2.solvePnPRansac(
                    world_points,
                    image_points,
                    camera_matrix,
                    distortion_coeffs,
                    reprojectionError=self.ransac_threshold,
                    confidence=self.ransac_confidence,
                    iterationsCount=self.max_iterations,
                    flags=cv2.SOLVEPNP_EPNP
                )

                if not success or inliers is None:
                    return PnPResult(success=False, method_used="ransac_failed")

                inlier_mask = np.zeros(len(world_points), dtype=bool)
                inlier_mask[inliers.flatten()] = True

                method_used = "epnp_ransac"

            else:
                # Use all points without RANSAC
                success, rvec, tvec = cv2.solvePnP(
                    world_points,
                    image_points,
                    camera_matrix,
                    distortion_coeffs,
                    flags=cv2.SOLVEPNP_EPNP
                )

                if not success:
                    return PnPResult(success=False, method_used="epnp_failed")

                inlier_mask = np.ones(len(world_points), dtype=bool)
                method_used = "epnp"

            # Convert rotation vector to rotation matrix
            R, _ = cv2.Rodrigues(rvec)
            t = tvec.flatten()

            # Compute reprojection error
            projected_points, _ = cv2.projectPoints(
                world_points[inlier_mask],
                rvec,
                tvec,
                camera_matrix,
                distortion_coeffs
            )
            projected_points = projected_points.reshape(-1, 2)

            reprojection_errors = np.linalg.norm(
                projected_points - image_points[inlier_mask], axis=1
            )
            rms_error = np.sqrt(np.mean(reprojection_errors**2))

            return PnPResult(
                success=True,
                R=R,
                t=t,
                inliers=inlier_mask,
                reprojection_error=rms_error,
                method_used=method_used
            )

        except Exception as e:
            return PnPResult(
                success=False,
                method_used=f"opencv_error: {str(e)}"
            )

    def solve_multiple_hypotheses(
        self,
        world_points: np.ndarray,
        image_points: np.ndarray,
        camera_matrix: np.ndarray,
        distortion_coeffs: Optional[np.ndarray] = None,
        n_hypotheses: int = 5
    ) -> List[PnPResult]:
        """Solve PnP with multiple RANSAC runs to get multiple hypotheses.

        Args:
            world_points: Nx3 array of 3D points
            image_points: Nx2 array of 2D points
            camera_matrix: 3x3 camera matrix
            distortion_coeffs: Distortion coefficients
            n_hypotheses: Number of hypotheses to generate

        Returns:
            List of PnPResult objects sorted by reprojection error
        """
        if not self.use_ransac:
            # Without RANSAC, we can only get one hypothesis
            result = self.solve(world_points, image_points, camera_matrix, distortion_coeffs)
            return [result] if result.success else []

        results = []

        for i in range(n_hypotheses):
            # Run RANSAC with different random seed
            np.random.seed(i * 42)  # Different seed for each run

            result = self.solve(world_points, image_points, camera_matrix, distortion_coeffs)

            if result.success:
                results.append(result)

        # Sort by reprojection error (best first)
        results.sort(key=lambda r: r.reprojection_error)

        return results


def solve_pnp(
    world_points: np.ndarray,
    image_points: np.ndarray,
    camera_matrix: np.ndarray,
    distortion_coeffs: Optional[np.ndarray] = None,
    use_ransac: bool = True,
    ransac_threshold: float = 4.0
) -> PnPResult:
    """Convenience function for PnP solving.

    Args:
        world_points: Nx3 array of 3D points in world coordinates
        image_points: Nx2 array of corresponding 2D image points
        camera_matrix: 3x3 camera intrinsic matrix
        distortion_coeffs: Distortion coefficients (optional)
        use_ransac: Whether to use RANSAC
        ransac_threshold: RANSAC inlier threshold in pixels

    Returns:
        PnPResult with estimated pose
    """
    solver = EPnPSolver(
        use_ransac=use_ransac,
        ransac_threshold=ransac_threshold
    )

    return solver.solve(world_points, image_points, camera_matrix, distortion_coeffs)


def extract_3d_2d_correspondences(
    project,
    camera_id: str
) -> Tuple[np.ndarray, np.ndarray]:
    """Extract 3D-2D correspondences for a camera from project.

    Args:
        project: Pictorigo project
        camera_id: Camera ID to extract correspondences for

    Returns:
        Tuple of (world_points, image_points) arrays
    """
    # Find camera and its image
    if camera_id not in project.cameras:
        raise ValueError(f"Camera {camera_id} not found")

    camera = project.cameras[camera_id]
    image_id = camera.image_id

    # Find image point constraints for this image
    ip_constraints = [
        c for c in project.constraints
        if hasattr(c, 'image_id') and c.image_id == image_id
    ]

    if not ip_constraints:
        return np.array([]).reshape(0, 3), np.array([]).reshape(0, 2)

    world_points = []
    image_points = []

    for constraint in ip_constraints:
        # Get world point
        if constraint.wp_id in project.world_points:
            wp = project.world_points[constraint.wp_id]
            if wp.xyz is not None:
                world_points.append(wp.xyz)
                image_points.append([constraint.u, constraint.v])

    if not world_points:
        return np.array([]).reshape(0, 3), np.array([]).reshape(0, 2)

    return np.array(world_points), np.array(image_points)


def initialize_camera_from_correspondences(
    project,
    camera_id: str,
    use_ransac: bool = True,
    ransac_threshold: float = 4.0
) -> PnPResult:
    """Initialize camera pose from 3D-2D correspondences in project.

    Args:
        project: Pictorigo project
        camera_id: Camera ID to initialize
        use_ransac: Whether to use RANSAC
        ransac_threshold: RANSAC threshold in pixels

    Returns:
        PnPResult with estimated pose
    """
    # Extract correspondences
    world_points, image_points = extract_3d_2d_correspondences(project, camera_id)

    if len(world_points) < 4:
        return PnPResult(
            success=False,
            method_used=f"insufficient_correspondences: {len(world_points)}"
        )

    # Get camera intrinsics
    camera = project.cameras[camera_id]
    K_list = camera.K
    K = np.array([
        [K_list[0], 0, K_list[2]],
        [0, K_list[1], K_list[3]],
        [0, 0, 1]
    ])

    # Get distortion coefficients if available
    distortion_coeffs = None
    if len(K_list) > 4:
        distortion_coeffs = np.array(K_list[4:])

    # Solve PnP
    result = solve_pnp(
        world_points,
        image_points,
        K,
        distortion_coeffs,
        use_ransac,
        ransac_threshold
    )

    # If successful, convert to SE(3) representation and update camera
    if result.success:
        # Convert to axis-angle representation
        xi = se3_log(result.R, result.t)
        axis_angle = xi[3:]  # Rotation part

        # Update camera in project
        camera.set_rotation(axis_angle)
        camera.set_translation(result.t)

    return result


def compute_triangulation_angles(
    world_points: np.ndarray,
    camera_centers: List[np.ndarray]
) -> np.ndarray:
    """Compute triangulation angles for world points.

    Args:
        world_points: Nx3 array of world points
        camera_centers: List of camera center positions

    Returns:
        Array of minimum triangulation angles for each point (in degrees)
    """
    if len(camera_centers) < 2:
        return np.full(len(world_points), 0.0)

    min_angles = []

    for point in world_points:
        angles = []

        # Compute angles between all pairs of cameras
        for i in range(len(camera_centers)):
            for j in range(i + 1, len(camera_centers)):
                cam1_center = camera_centers[i]
                cam2_center = camera_centers[j]

                # Vectors from cameras to point
                vec1 = point - cam1_center
                vec2 = point - cam2_center

                # Normalize vectors
                vec1_norm = np.linalg.norm(vec1)
                vec2_norm = np.linalg.norm(vec2)

                if vec1_norm > 1e-12 and vec2_norm > 1e-12:
                    vec1 = vec1 / vec1_norm
                    vec2 = vec2 / vec2_norm

                    # Compute angle between vectors
                    cos_angle = np.clip(np.dot(vec1, vec2), -1, 1)
                    angle = np.arccos(cos_angle)
                    angles.append(angle)

        # Take minimum angle (worst case for triangulation)
        if angles:
            min_angles.append(np.min(angles))
        else:
            min_angles.append(0.0)

    return np.degrees(min_angles)


def filter_good_correspondences(
    world_points: np.ndarray,
    image_points: np.ndarray,
    camera_centers: List[np.ndarray],
    min_triangulation_angle: float = 2.0,
    max_reprojection_error: float = 4.0,
    camera_matrix: Optional[np.ndarray] = None,
    camera_pose: Optional[Tuple[np.ndarray, np.ndarray]] = None
) -> Tuple[np.ndarray, np.ndarray]:
    """Filter correspondences based on geometric criteria.

    Args:
        world_points: Nx3 array of world points
        image_points: Nx2 array of image points
        camera_centers: List of camera centers for triangulation angle computation
        min_triangulation_angle: Minimum triangulation angle in degrees
        max_reprojection_error: Maximum reprojection error in pixels
        camera_matrix: 3x3 camera matrix (for reprojection error check)
        camera_pose: (R, t) camera pose (for reprojection error check)

    Returns:
        Filtered (world_points, image_points) arrays
    """
    valid_mask = np.ones(len(world_points), dtype=bool)

    # Filter by triangulation angle
    if len(camera_centers) >= 2:
        triangulation_angles = compute_triangulation_angles(world_points, camera_centers)
        angle_mask = triangulation_angles >= min_triangulation_angle
        valid_mask = valid_mask & angle_mask

    # Filter by reprojection error (if camera pose is provided)
    if camera_matrix is not None and camera_pose is not None:
        R, t = camera_pose

        # Project world points
        rvec, _ = cv2.Rodrigues(R)
        projected_points, _ = cv2.projectPoints(
            world_points.astype(np.float32),
            rvec,
            t.astype(np.float32),
            camera_matrix.astype(np.float32),
            None
        )
        projected_points = projected_points.reshape(-1, 2)

        # Compute reprojection errors
        reprojection_errors = np.linalg.norm(projected_points - image_points, axis=1)
        error_mask = reprojection_errors <= max_reprojection_error
        valid_mask = valid_mask & error_mask

    return world_points[valid_mask], image_points[valid_mask]