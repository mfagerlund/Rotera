"""Coordinate frame conversion utilities for export."""

import numpy as np


def world_to_gltf_transform(coords: np.ndarray) -> np.ndarray:
    """
    Convert world coordinates to glTF coordinate system.

    Pictorigo uses: Z-forward, Y-up, X-right (right-handed)
    glTF uses: -Z-forward, Y-up, X-right (right-handed)

    Args:
        coords: Coordinates in Pictorigo world frame

    Returns:
        Coordinates in glTF frame
    """
    if coords.ndim == 1:
        # Single point [x, y, z] -> [x, y, -z]
        return np.array([coords[0], coords[1], -coords[2]])
    else:
        # Multiple points
        result = coords.copy()
        result[:, 2] = -result[:, 2]  # Flip Z axis
        return result


def gltf_to_world_transform(coords: np.ndarray) -> np.ndarray:
    """
    Convert glTF coordinates to world coordinate system.

    Args:
        coords: Coordinates in glTF frame

    Returns:
        Coordinates in Pictorigo world frame
    """
    # Same transformation (symmetric)
    return world_to_gltf_transform(coords)


def world_to_fusion360_transform(coords: np.ndarray) -> np.ndarray:
    """
    Convert world coordinates to Fusion 360 coordinate system.

    Pictorigo uses: Z-forward, Y-up, X-right (right-handed, meters)
    Fusion 360 uses: Z-up, Y-forward, X-right (right-handed, millimeters)

    Args:
        coords: Coordinates in Pictorigo world frame (meters)

    Returns:
        Coordinates in Fusion 360 frame (millimeters)
    """
    if coords.ndim == 1:
        # Single point [x, y, z] -> [x*1000, z*1000, y*1000]
        return np.array([coords[0] * 1000, coords[2] * 1000, coords[1] * 1000])
    else:
        # Multiple points
        result = np.zeros_like(coords)
        result[:, 0] = coords[:, 0] * 1000  # X stays X, convert to mm
        result[:, 1] = coords[:, 2] * 1000  # Z becomes Y, convert to mm
        result[:, 2] = coords[:, 1] * 1000  # Y becomes Z, convert to mm
        return result


def fusion360_to_world_transform(coords: np.ndarray) -> np.ndarray:
    """
    Convert Fusion 360 coordinates to world coordinate system.

    Args:
        coords: Coordinates in Fusion 360 frame (millimeters)

    Returns:
        Coordinates in Pictorigo world frame (meters)
    """
    if coords.ndim == 1:
        # Single point [x, y, z] -> [x/1000, z/1000, y/1000]
        return np.array([coords[0] / 1000, coords[2] / 1000, coords[1] / 1000])
    else:
        # Multiple points
        result = np.zeros_like(coords)
        result[:, 0] = coords[:, 0] / 1000  # X stays X, convert to m
        result[:, 1] = coords[:, 2] / 1000  # Z becomes Y, convert to m
        result[:, 2] = coords[:, 1] / 1000  # Y becomes Z, convert to m
        return result


def euler_to_quaternion(roll: float, pitch: float, yaw: float) -> np.ndarray:
    """
    Convert Euler angles to quaternion.

    Args:
        roll: Rotation around X axis (radians)
        pitch: Rotation around Y axis (radians)
        yaw: Rotation around Z axis (radians)

    Returns:
        Quaternion [w, x, y, z]
    """
    cr = np.cos(roll * 0.5)
    sr = np.sin(roll * 0.5)
    cp = np.cos(pitch * 0.5)
    sp = np.sin(pitch * 0.5)
    cy = np.cos(yaw * 0.5)
    sy = np.sin(yaw * 0.5)

    w = cr * cp * cy + sr * sp * sy
    x = sr * cp * cy - cr * sp * sy
    y = cr * sp * cy + sr * cp * sy
    z = cr * cp * sy - sr * sp * cy

    return np.array([w, x, y, z])


def quaternion_to_euler(q: np.ndarray) -> tuple[float, float, float]:
    """
    Convert quaternion to Euler angles.

    Args:
        q: Quaternion [w, x, y, z]

    Returns:
        Tuple of (roll, pitch, yaw) in radians
    """
    w, x, y, z = q

    # Roll (x-axis rotation)
    sinr_cosp = 2 * (w * x + y * z)
    cosr_cosp = 1 - 2 * (x * x + y * y)
    roll = np.arctan2(sinr_cosp, cosr_cosp)

    # Pitch (y-axis rotation)
    sinp = 2 * (w * y - z * x)
    if abs(sinp) >= 1:
        pitch = np.copysign(np.pi / 2, sinp)  # Use 90 degrees if out of range
    else:
        pitch = np.arcsin(sinp)

    # Yaw (z-axis rotation)
    siny_cosp = 2 * (w * z + x * y)
    cosy_cosp = 1 - 2 * (y * y + z * z)
    yaw = np.arctan2(siny_cosp, cosy_cosp)

    return roll, pitch, yaw


def compute_camera_frustum_points(K: np.ndarray, width: int, height: int, near: float = 0.1, far: float = 10.0) -> np.ndarray:
    """
    Compute frustum corner points for camera visualization.

    Args:
        K: Camera intrinsic matrix [fx, fy, cx, cy, ...]
        width: Image width in pixels
        height: Image height in pixels
        near: Near plane distance
        far: Far plane distance

    Returns:
        Array of frustum corner points [8, 3]
    """
    fx, fy, cx, cy = K[:4]

    # Corner points in image coordinates
    corners_2d = np.array([
        [0, 0],           # Top-left
        [width, 0],       # Top-right
        [width, height],  # Bottom-right
        [0, height]       # Bottom-left
    ])

    # Unproject to 3D at near and far planes
    corners_3d = []

    for z in [near, far]:
        for corner in corners_2d:
            u, v = corner
            # Unproject to normalized coordinates
            x = (u - cx) * z / fx
            y = (v - cy) * z / fy
            corners_3d.append([x, y, z])

    return np.array(corners_3d)