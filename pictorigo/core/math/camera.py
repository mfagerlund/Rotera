"""Camera projection and unprojection operations."""

import numpy as np
from typing import Tuple, Optional


def project(
    K: np.ndarray,
    R: np.ndarray,
    t: np.ndarray,
    X: np.ndarray,
    distortion: Optional[np.ndarray] = None
) -> np.ndarray:
    """Project 3D points to image coordinates.

    Args:
        K: Camera intrinsics [fx, fy, cx, cy, k1, k2?]
        R: 3x3 rotation matrix (world to camera)
        t: 3-element translation vector (world to camera)
        X: Nx3 array of 3D points in world coordinates
        distortion: Optional distortion parameters [k1, k2] (if not in K)

    Returns:
        Nx2 array of projected image coordinates [u, v]
    """
    if K.shape[0] < 4:
        raise ValueError(f"K must have at least 4 elements, got {K.shape}")
    if R.shape != (3, 3):
        raise ValueError(f"R must be 3x3 matrix, got shape {R.shape}")
    if t.shape != (3,):
        raise ValueError(f"t must be 3-element vector, got shape {t.shape}")

    X = np.atleast_2d(X)
    if X.shape[1] != 3:
        raise ValueError(f"X must be Nx3 array, got shape {X.shape}")

    # Transform to camera coordinates
    X_cam = (R @ X.T).T + t

    # Check for points behind camera
    behind_camera = X_cam[:, 2] <= 1e-6
    if np.any(behind_camera):
        # Set invalid points to NaN
        X_cam[behind_camera, 2] = np.nan

    # Project to normalized coordinates
    x_norm = X_cam[:, 0] / X_cam[:, 2]
    y_norm = X_cam[:, 1] / X_cam[:, 2]

    # Apply distortion
    if len(K) > 4 or distortion is not None:
        k1 = K[4] if len(K) > 4 else (distortion[0] if distortion is not None else 0)
        k2 = K[5] if len(K) > 5 else (distortion[1] if distortion is not None and len(distortion) > 1 else 0)

        r2 = x_norm**2 + y_norm**2
        radial_distortion = 1 + k1 * r2 + k2 * r2**2

        x_norm *= radial_distortion
        y_norm *= radial_distortion

    # Apply intrinsics
    fx, fy, cx, cy = K[:4]
    u = fx * x_norm + cx
    v = fy * y_norm + cy

    return np.column_stack([u, v])


def unproject(
    K: np.ndarray,
    R: np.ndarray,
    t: np.ndarray,
    uv: np.ndarray,
    depth: float = 1.0
) -> np.ndarray:
    """Unproject image coordinates to 3D ray or point.

    Args:
        K: Camera intrinsics [fx, fy, cx, cy, k1?, k2?]
        R: 3x3 rotation matrix (world to camera)
        t: 3-element translation vector (world to camera)
        uv: Nx2 array of image coordinates [u, v]
        depth: Depth along ray (1.0 for unit ray)

    Returns:
        Nx3 array of 3D points in world coordinates
    """
    if K.shape[0] < 4:
        raise ValueError(f"K must have at least 4 elements, got {K.shape}")

    uv = np.atleast_2d(uv)
    if uv.shape[1] != 2:
        raise ValueError(f"uv must be Nx2 array, got shape {uv.shape}")

    fx, fy, cx, cy = K[:4]

    # Convert to normalized coordinates
    x_norm = (uv[:, 0] - cx) / fx
    y_norm = (uv[:, 1] - cy) / fy

    # Create 3D points in camera coordinates
    X_cam = np.column_stack([x_norm * depth, y_norm * depth, np.full(len(uv), depth)])

    # Transform to world coordinates
    R_inv = R.T
    t_inv = -R_inv @ t
    X_world = (R_inv @ X_cam.T).T + t_inv

    return X_world


def camera_center(R: np.ndarray, t: np.ndarray) -> np.ndarray:
    """Get camera center in world coordinates.

    Args:
        R: 3x3 rotation matrix (world to camera)
        t: 3-element translation vector (world to camera)

    Returns:
        3-element camera center in world coordinates
    """
    return -R.T @ t


def point_depth(R: np.ndarray, t: np.ndarray, X: np.ndarray) -> np.ndarray:
    """Get depth of 3D points relative to camera.

    Args:
        R: 3x3 rotation matrix (world to camera)
        t: 3-element translation vector (world to camera)
        X: Nx3 array of 3D points in world coordinates

    Returns:
        N-element array of depths (positive = in front of camera)
    """
    X = np.atleast_2d(X)
    X_cam = (R @ X.T).T + t
    return X_cam[:, 2]