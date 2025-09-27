"""Visibility checking utilities for synthetic scene generation."""

import numpy as np
from typing import Tuple, List, Optional

from ..math.camera import project, point_depth


def check_visibility(
    K: np.ndarray,
    R: np.ndarray,
    t: np.ndarray,
    X: np.ndarray,
    image_width: int,
    image_height: int,
    min_depth: float = 0.1,
    max_depth: float = 1000.0,
    border_margin: int = 5
) -> Tuple[np.ndarray, np.ndarray]:
    """Check visibility of 3D points in camera.

    Args:
        K: Camera intrinsics
        R: Rotation matrix (world to camera)
        t: Translation vector (world to camera)
        X: Nx3 array of 3D points
        image_width: Image width in pixels
        image_height: Image height in pixels
        min_depth: Minimum valid depth
        max_depth: Maximum valid depth
        border_margin: Margin from image border in pixels

    Returns:
        Tuple of (visibility_mask, projected_points) where visibility_mask is
        boolean array indicating which points are visible
    """
    X = np.atleast_2d(X)

    # Project points
    uv = project(K, R, t, X)

    # Check depth constraints
    depths = point_depth(R, t, X)
    depth_valid = (depths >= min_depth) & (depths <= max_depth)

    # Check image bounds with margin
    u_valid = (uv[:, 0] >= border_margin) & (uv[:, 0] < image_width - border_margin)
    v_valid = (uv[:, 1] >= border_margin) & (uv[:, 1] < image_height - border_margin)
    bounds_valid = u_valid & v_valid

    # Check for NaN projections (points behind camera, etc.)
    projection_valid = ~(np.isnan(uv[:, 0]) | np.isnan(uv[:, 1]))

    # Combined visibility
    visible = depth_valid & bounds_valid & projection_valid

    return visible, uv


def filter_visible_points(
    world_points: List,
    cameras_and_images: List,
    min_visible_cameras: int = 2
) -> List:
    """Filter world points to keep only those visible in sufficient cameras.

    Args:
        world_points: List of WorldPoint objects
        cameras_and_images: List of (Camera, Image) tuples
        min_visible_cameras: Minimum number of cameras that must see each point

    Returns:
        Filtered list of WorldPoint objects
    """
    filtered_points = []

    for wp in world_points:
        if wp.xyz is None:
            continue

        X = np.array(wp.xyz).reshape(1, 3)
        visible_count = 0

        for camera, image in cameras_and_images:
            # Get camera parameters
            K = np.array(camera.K)
            R_aa = np.array(camera.R)
            t = np.array(camera.t)

            # Convert axis-angle to rotation matrix
            from ..math.se3 import se3_exp
            xi = np.concatenate([t, R_aa])
            R, t_recovered = se3_exp(xi)
            # Note: se3_exp gives camera to world, we need world to camera
            R = R.T
            t = -R @ t_recovered

            # Check visibility
            visible, _ = check_visibility(K, R, t, X, image.width, image.height)

            if visible[0]:
                visible_count += 1

        if visible_count >= min_visible_cameras:
            filtered_points.append(wp)

    return filtered_points


def compute_visibility_matrix(
    world_points: List,
    cameras_and_images: List
) -> np.ndarray:
    """Compute visibility matrix for world points and cameras.

    Args:
        world_points: List of WorldPoint objects
        cameras_and_images: List of (Camera, Image) tuples

    Returns:
        Boolean matrix of shape (n_points, n_cameras) where entry (i,j)
        indicates if point i is visible in camera j
    """
    n_points = len(world_points)
    n_cameras = len(cameras_and_images)

    visibility_matrix = np.zeros((n_points, n_cameras), dtype=bool)

    for i, wp in enumerate(world_points):
        if wp.xyz is None:
            continue

        X = np.array(wp.xyz).reshape(1, 3)

        for j, (camera, image) in enumerate(cameras_and_images):
            # Get camera parameters
            K = np.array(camera.K)
            R_aa = np.array(camera.R)
            t = np.array(camera.t)

            # Convert axis-angle to rotation matrix
            from ..math.se3 import se3_exp
            xi = np.concatenate([t, R_aa])
            R, t_recovered = se3_exp(xi)
            # Note: se3_exp gives camera to world, we need world to camera
            R = R.T
            t = -R @ t_recovered

            # Check visibility
            visible, _ = check_visibility(K, R, t, X, image.width, image.height)
            visibility_matrix[i, j] = visible[0]

    return visibility_matrix


def analyze_scene_coverage(
    world_points: List,
    cameras_and_images: List
) -> dict:
    """Analyze visibility coverage of a synthetic scene.

    Args:
        world_points: List of WorldPoint objects
        cameras_and_images: List of (Camera, Image) tuples

    Returns:
        Dictionary with coverage statistics
    """
    visibility_matrix = compute_visibility_matrix(world_points, cameras_and_images)

    n_points, n_cameras = visibility_matrix.shape

    # Points visible per camera
    points_per_camera = np.sum(visibility_matrix, axis=0)

    # Cameras seeing each point
    cameras_per_point = np.sum(visibility_matrix, axis=1)

    # Points visible in at least N cameras
    visibility_counts = {}
    for min_cams in range(1, n_cameras + 1):
        count = np.sum(cameras_per_point >= min_cams)
        visibility_counts[f"visible_in_{min_cams}+_cameras"] = count

    stats = {
        "total_points": n_points,
        "total_cameras": n_cameras,
        "points_per_camera": {
            "mean": float(np.mean(points_per_camera)),
            "std": float(np.std(points_per_camera)),
            "min": int(np.min(points_per_camera)),
            "max": int(np.max(points_per_camera))
        },
        "cameras_per_point": {
            "mean": float(np.mean(cameras_per_point)),
            "std": float(np.std(cameras_per_point)),
            "min": int(np.min(cameras_per_point)),
            "max": int(np.max(cameras_per_point))
        },
        "visibility_distribution": visibility_counts,
        "total_observations": int(np.sum(visibility_matrix))
    }

    return stats


def add_projection_noise(
    uv: np.ndarray,
    noise_std: float,
    seed: Optional[int] = None
) -> np.ndarray:
    """Add Gaussian noise to projected image coordinates.

    Args:
        uv: Nx2 array of image coordinates
        noise_std: Standard deviation of noise in pixels
        seed: Random seed for reproducibility

    Returns:
        Noisy image coordinates
    """
    if seed is not None:
        np.random.seed(seed)

    noise = np.random.normal(0, noise_std, uv.shape)
    return uv + noise


def simulate_outliers(
    constraints: List,
    outlier_fraction: float = 0.1,
    outlier_noise_std: float = 10.0,
    seed: Optional[int] = None
) -> List:
    """Simulate outlier observations in image point constraints.

    Args:
        constraints: List of ImagePointConstraint objects
        outlier_fraction: Fraction of constraints to make outliers
        outlier_noise_std: Standard deviation of outlier noise
        seed: Random seed

    Returns:
        Modified list of constraints with outliers
    """
    if seed is not None:
        np.random.seed(seed)

    constraints = constraints.copy()
    n_outliers = int(len(constraints) * outlier_fraction)

    if n_outliers == 0:
        return constraints

    # Randomly select constraints to make outliers
    outlier_indices = np.random.choice(len(constraints), n_outliers, replace=False)

    for idx in outlier_indices:
        constraint = constraints[idx]
        if hasattr(constraint, 'u') and hasattr(constraint, 'v'):
            # Add large noise to make it an outlier
            noise_u = np.random.normal(0, outlier_noise_std)
            noise_v = np.random.normal(0, outlier_noise_std)

            constraints[idx] = type(constraint)(
                **{**constraint.dict(), 'u': constraint.u + noise_u, 'v': constraint.v + noise_v}
            )

    return constraints