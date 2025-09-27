"""Quaternion operations for 3D rotations."""

import numpy as np


def quat_normalize(q: np.ndarray) -> np.ndarray:
    """Normalize quaternion to unit length."""
    if q.shape != (4,):
        raise ValueError(f"Quaternion must be 4-element vector, got shape {q.shape}")

    norm = np.linalg.norm(q)
    if norm < 1e-12:
        raise ValueError("Cannot normalize zero quaternion")

    return q / norm


def quat_from_axis_angle(axis: np.ndarray, angle: float) -> np.ndarray:
    """Create quaternion from axis-angle representation.

    Args:
        axis: 3D unit vector representing rotation axis
        angle: Rotation angle in radians

    Returns:
        Unit quaternion [w, x, y, z]
    """
    if axis.shape != (3,):
        raise ValueError(f"Axis must be 3-element vector, got shape {axis.shape}")

    axis_norm = np.linalg.norm(axis)
    if axis_norm < 1e-12:
        return np.array([1.0, 0.0, 0.0, 0.0])

    axis = axis / axis_norm
    half_angle = angle / 2
    sin_half = np.sin(half_angle)
    cos_half = np.cos(half_angle)

    return np.array([cos_half, sin_half * axis[0], sin_half * axis[1], sin_half * axis[2]])


def quat_to_matrix(q: np.ndarray) -> np.ndarray:
    """Convert quaternion to rotation matrix.

    Args:
        q: Unit quaternion [w, x, y, z]

    Returns:
        3x3 rotation matrix
    """
    if q.shape != (4,):
        raise ValueError(f"Quaternion must be 4-element vector, got shape {q.shape}")

    q = quat_normalize(q)
    w, x, y, z = q

    return np.array([
        [1 - 2*(y**2 + z**2), 2*(x*y - w*z), 2*(x*z + w*y)],
        [2*(x*y + w*z), 1 - 2*(x**2 + z**2), 2*(y*z - w*x)],
        [2*(x*z - w*y), 2*(y*z + w*x), 1 - 2*(x**2 + y**2)]
    ])


def quat_multiply(q1: np.ndarray, q2: np.ndarray) -> np.ndarray:
    """Multiply two quaternions."""
    if q1.shape != (4,) or q2.shape != (4,):
        raise ValueError("Both quaternions must be 4-element vectors")

    w1, x1, y1, z1 = q1
    w2, x2, y2, z2 = q2

    return np.array([
        w1*w2 - x1*x2 - y1*y2 - z1*z2,
        w1*x2 + x1*w2 + y1*z2 - z1*y2,
        w1*y2 - x1*z2 + y1*w2 + z1*x2,
        w1*z2 + x1*y2 - y1*x2 + z1*w2
    ])


def quat_conjugate(q: np.ndarray) -> np.ndarray:
    """Return quaternion conjugate."""
    if q.shape != (4,):
        raise ValueError(f"Quaternion must be 4-element vector, got shape {q.shape}")

    return np.array([q[0], -q[1], -q[2], -q[3]])