"""SE(3) Lie group operations for 3D poses."""

import numpy as np
from typing import Tuple

from .quaternions import quat_from_axis_angle, quat_to_matrix, quat_normalize


def se3_exp(xi: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Convert se(3) algebra element to SE(3) group (R, t).

    Args:
        xi: 6-element vector [rho, phi] where rho is translation, phi is rotation

    Returns:
        Tuple of (R, t) where R is 3x3 rotation matrix, t is 3-element translation
    """
    if xi.shape != (6,):
        raise ValueError(f"xi must be 6-element vector, got shape {xi.shape}")

    rho = xi[:3]  # translation part
    phi = xi[3:]  # rotation part

    theta = np.linalg.norm(phi)

    if theta < 1e-6:
        # Small angle approximation
        R = np.eye(3) + skew_symmetric(phi)
        V = np.eye(3) + 0.5 * skew_symmetric(phi)
    else:
        # Full exponential map
        axis = phi / theta
        quat = quat_from_axis_angle(axis, theta)
        R = quat_to_matrix(quat)

        # V matrix for translation
        s = np.sin(theta)
        c = np.cos(theta)
        V = (s / theta) * np.eye(3) + (1 - c) / theta * skew_symmetric(axis) + \
            (theta - s) / theta * np.outer(axis, axis)

    t = V @ rho
    return R, t


def se3_log(R: np.ndarray, t: np.ndarray) -> np.ndarray:
    """Convert SE(3) group element (R, t) to se(3) algebra.

    Args:
        R: 3x3 rotation matrix
        t: 3-element translation vector

    Returns:
        6-element se(3) vector [rho, phi]
    """
    if R.shape != (3, 3):
        raise ValueError(f"R must be 3x3 matrix, got shape {R.shape}")
    if t.shape != (3,):
        raise ValueError(f"t must be 3-element vector, got shape {t.shape}")

    # Extract rotation angle and axis
    trace = np.trace(R)
    theta = np.arccos(np.clip((trace - 1) / 2, -1, 1))

    if theta < 1e-6:
        # Small angle approximation
        phi = 0.5 * np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]])
        V_inv = np.eye(3) - 0.5 * skew_symmetric(phi)
    else:
        axis = 1 / (2 * np.sin(theta)) * np.array([
            R[2, 1] - R[1, 2],
            R[0, 2] - R[2, 0],
            R[1, 0] - R[0, 1]
        ])
        phi = theta * axis

        # V^(-1) matrix
        s = np.sin(theta)
        c = np.cos(theta)
        V_inv = (theta / 2) / np.tan(theta / 2) * np.eye(3) + \
                (theta / 2) * skew_symmetric(axis) + \
                (theta**2 / 2) * (1 - theta * c / (2 * s)) / (s**2) * np.outer(axis, axis)

    rho = V_inv @ t
    return np.concatenate([rho, phi])


def skew_symmetric(v: np.ndarray) -> np.ndarray:
    """Create skew-symmetric matrix from 3D vector."""
    if v.shape != (3,):
        raise ValueError(f"v must be 3-element vector, got shape {v.shape}")

    return np.array([
        [0, -v[2], v[1]],
        [v[2], 0, -v[0]],
        [-v[1], v[0], 0]
    ])


def compose(R1: np.ndarray, t1: np.ndarray, R2: np.ndarray, t2: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Compose two SE(3) transformations: T1 * T2."""
    R = R1 @ R2
    t = R1 @ t2 + t1
    return R, t


def invert(R: np.ndarray, t: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Invert SE(3) transformation."""
    R_inv = R.T
    t_inv = -R_inv @ t
    return R_inv, t_inv