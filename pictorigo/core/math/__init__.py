"""Math primitives for Pictorigo."""

from .se3 import se3_exp, se3_log, compose, invert
from .quaternions import quat_normalize, quat_from_axis_angle, quat_to_matrix
from .camera import project, unproject
from .robust import huber_loss, cauchy_loss
from .jacobians import finite_difference_jacobian, check_jacobian, JacobianTester

__all__ = [
    "se3_exp",
    "se3_log",
    "compose",
    "invert",
    "quat_normalize",
    "quat_from_axis_angle",
    "quat_to_matrix",
    "project",
    "unproject",
    "huber_loss",
    "cauchy_loss",
    "finite_difference_jacobian",
    "check_jacobian",
    "JacobianTester",
]