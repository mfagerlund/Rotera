"""Pictorigo - Poor Man's Photogrammetry

Constraint-driven sparse Structure-from-Motion (SfM) with CAD-like geometric priors.
"""

__version__ = "0.1.0"

# Core models
from .core.models.entities import Camera, CameraLockFlags, Image, Line, WorldPoint
from .core.models.project import Project, SolveResult
from .core.models.constraints import (
    ImagePointConstraint,
    DistanceConstraint,
    KnownCoordConstraint,
)

# Optimization
from .core.optimization.problem import OptimizationProblem
from .core.solver.scipy_solver import SciPySolver, SolverOptions

# Initialization
from .core.initialization.incremental import IncrementalSolver

__all__ = [
    # Version
    "__version__",
    # Models
    "WorldPoint",
    "Camera",
    "CameraLockFlags",
    "Image",
    "Line",
    "Project",
    "SolveResult",
    # Constraints
    "ImagePointConstraint",
    "DistanceConstraint",
    "KnownCoordConstraint",
    # Optimization
    "OptimizationProblem",
    "SciPySolver",
    "SolverOptions",
    # Initialization
    "IncrementalSolver",
]