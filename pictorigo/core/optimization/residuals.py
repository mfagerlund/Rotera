"""Residual functors for different constraint types."""

import numpy as np
from typing import Dict, List, Union
from abc import ABC, abstractmethod

from .factor_graph import Factor
from ..math.camera import project
from ..math.se3 import se3_exp


class ResidualFunctor(Factor):
    """Base class for residual functors."""

    def __init__(self, factor_id: str, variable_ids: List[str]):
        """Initialize residual functor."""
        super().__init__(factor_id, variable_ids)

    @abstractmethod
    def compute_residual(self, variables: Dict[str, np.ndarray]) -> np.ndarray:
        """Compute residual given variable values."""
        pass

    @abstractmethod
    def compute_jacobian(self, variables: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        """Compute Jacobian matrices."""
        pass


class ReprojectionResidual(ResidualFunctor):
    """Reprojection residual for image point observations."""

    def __init__(
        self,
        factor_id: str,
        world_point_id: str,
        camera_rotation_id: str,
        camera_translation_id: str,
        camera_intrinsics_id: str,
        observed_u: float,
        observed_v: float,
        sigma: float = 1.0
    ):
        """Initialize reprojection residual.

        Args:
            factor_id: Unique factor identifier
            world_point_id: World point variable ID
            camera_rotation_id: Camera rotation variable ID
            camera_translation_id: Camera translation variable ID
            camera_intrinsics_id: Camera intrinsics variable ID
            observed_u: Observed u coordinate
            observed_v: Observed v coordinate
            sigma: Measurement uncertainty
        """
        variable_ids = [world_point_id, camera_rotation_id, camera_translation_id, camera_intrinsics_id]
        super().__init__(factor_id, variable_ids)

        self.world_point_id = world_point_id
        self.camera_rotation_id = camera_rotation_id
        self.camera_translation_id = camera_translation_id
        self.camera_intrinsics_id = camera_intrinsics_id
        self.observed_u = observed_u
        self.observed_v = observed_v
        self.sigma = sigma

    def compute_residual(self, variables: Dict[str, np.ndarray]) -> np.ndarray:
        """Compute reprojection residual."""
        # Get variables
        X = variables[self.world_point_id]  # 3D point
        R_aa = variables[self.camera_rotation_id]  # Axis-angle rotation
        t = variables[self.camera_translation_id]  # Translation
        K = variables[self.camera_intrinsics_id]  # Intrinsics

        # Convert axis-angle to rotation matrix
        xi = np.concatenate([t, R_aa])
        R, t_se3 = se3_exp(xi)
        # se3_exp gives camera-to-world, we need world-to-camera
        R_cam = R.T
        t_cam = -R_cam @ t_se3

        # Project point
        X_reshaped = X.reshape(1, 3)
        uv_projected = project(K, R_cam, t_cam, X_reshaped)
        u_proj, v_proj = uv_projected[0]

        # Compute residual (observation - prediction)
        residual = np.array([self.observed_u - u_proj, self.observed_v - v_proj]) / self.sigma

        return residual

    def compute_jacobian(self, variables: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        """Compute Jacobian using finite differences."""
        from ..math.jacobians import finite_difference_jacobian

        def residual_func(params):
            # Unpack parameters
            X = params[:3]
            R_aa = params[3:6]
            t = params[6:9]
            K = params[9:]

            var_dict = {
                self.world_point_id: X,
                self.camera_rotation_id: R_aa,
                self.camera_translation_id: t,
                self.camera_intrinsics_id: K
            }
            return self.compute_residual(var_dict)

        # Pack variables
        X = variables[self.world_point_id]
        R_aa = variables[self.camera_rotation_id]
        t = variables[self.camera_translation_id]
        K = variables[self.camera_intrinsics_id]

        params = np.concatenate([X, R_aa, t, K])

        # Compute Jacobian
        J_full = finite_difference_jacobian(residual_func, params)

        # Split Jacobian by variables
        jacobians = {}
        offset = 0

        jacobians[self.world_point_id] = J_full[:, offset:offset+3]
        offset += 3

        jacobians[self.camera_rotation_id] = J_full[:, offset:offset+3]
        offset += 3

        jacobians[self.camera_translation_id] = J_full[:, offset:offset+3]
        offset += 3

        jacobians[self.camera_intrinsics_id] = J_full[:, offset:]

        return jacobians

    def residual_dimension(self) -> int:
        """Get residual dimension."""
        return 2


class KnownCoordinateResidual(ResidualFunctor):
    """Residual for known coordinate constraints."""

    def __init__(
        self,
        factor_id: str,
        world_point_id: str,
        mask_xyz: List[bool],
        target_xyz: List[float]
    ):
        """Initialize known coordinate residual.

        Args:
            factor_id: Unique factor identifier
            world_point_id: World point variable ID
            mask_xyz: Mask indicating which coordinates are constrained
            target_xyz: Target coordinate values
        """
        super().__init__(factor_id, [world_point_id])

        self.world_point_id = world_point_id
        self.mask_xyz = np.array(mask_xyz)
        self.target_xyz = np.array(target_xyz)

        if len(self.mask_xyz) != 3 or len(self.target_xyz) != 3:
            raise ValueError("mask_xyz and target_xyz must have length 3")

        self.n_constrained = np.sum(self.mask_xyz)
        if self.n_constrained == 0:
            raise ValueError("At least one coordinate must be constrained")

    def compute_residual(self, variables: Dict[str, np.ndarray]) -> np.ndarray:
        """Compute known coordinate residual."""
        X = variables[self.world_point_id]

        # Extract constrained coordinates
        constrained_coords = X[self.mask_xyz]
        target_coords = self.target_xyz[self.mask_xyz]

        # Residual is difference (target - current)
        residual = target_coords - constrained_coords

        return residual

    def compute_jacobian(self, variables: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        """Compute Jacobian for known coordinate residual."""
        # Jacobian is -I for constrained coordinates, 0 for others
        J = np.zeros((self.n_constrained, 3))

        constrained_indices = np.where(self.mask_xyz)[0]
        for i, coord_idx in enumerate(constrained_indices):
            J[i, coord_idx] = -1.0

        return {self.world_point_id: J}

    def residual_dimension(self) -> int:
        """Get residual dimension."""
        return self.n_constrained


class DistanceResidual(ResidualFunctor):
    """Residual for distance constraints between world points."""

    def __init__(
        self,
        factor_id: str,
        world_point_i_id: str,
        world_point_j_id: str,
        target_distance: float
    ):
        """Initialize distance residual.

        Args:
            factor_id: Unique factor identifier
            world_point_i_id: First world point variable ID
            world_point_j_id: Second world point variable ID
            target_distance: Target distance
        """
        super().__init__(factor_id, [world_point_i_id, world_point_j_id])

        self.world_point_i_id = world_point_i_id
        self.world_point_j_id = world_point_j_id
        self.target_distance = target_distance

        if target_distance < 0:
            raise ValueError("Target distance must be non-negative")

    def compute_residual(self, variables: Dict[str, np.ndarray]) -> np.ndarray:
        """Compute distance residual."""
        Xi = variables[self.world_point_i_id]
        Xj = variables[self.world_point_j_id]

        # Compute current distance
        diff = Xj - Xi
        current_distance = np.linalg.norm(diff)

        # Residual is target - current
        residual = np.array([self.target_distance - current_distance])

        return residual

    def compute_jacobian(self, variables: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        """Compute Jacobian for distance residual."""
        Xi = variables[self.world_point_i_id]
        Xj = variables[self.world_point_j_id]

        # Compute difference vector
        diff = Xj - Xi
        distance = np.linalg.norm(diff)

        if distance < 1e-12:
            # Handle degenerate case
            # Jacobian is undefined when points coincide
            J_i = np.zeros((1, 3))
            J_j = np.zeros((1, 3))
        else:
            # Unit vector from Xi to Xj
            unit_vec = diff / distance

            # d(||Xj - Xi||)/d(Xi) = -unit_vec
            # d(||Xj - Xi||)/d(Xj) = unit_vec
            # Since residual is target - distance:
            # d(residual)/d(Xi) = unit_vec
            # d(residual)/d(Xj) = -unit_vec

            J_i = unit_vec.reshape(1, 3)
            J_j = -unit_vec.reshape(1, 3)

        return {
            self.world_point_i_id: J_i,
            self.world_point_j_id: J_j
        }

    def residual_dimension(self) -> int:
        """Get residual dimension."""
        return 1


class AxisAlignmentResidual(ResidualFunctor):
    """Residual for axis alignment constraints."""

    def __init__(
        self,
        factor_id: str,
        world_point_i_id: str,
        world_point_j_id: str,
        target_axis: Union[str, List[float]]
    ):
        """Initialize axis alignment residual.

        Args:
            factor_id: Unique factor identifier
            world_point_i_id: First world point variable ID
            world_point_j_id: Second world point variable ID
            target_axis: Target axis ("x", "y", "z", "-x", "-y", "-z" or 3D vector)
        """
        super().__init__(factor_id, [world_point_i_id, world_point_j_id])

        self.world_point_i_id = world_point_i_id
        self.world_point_j_id = world_point_j_id

        # Parse target axis
        if isinstance(target_axis, str):
            axis_map = {
                "x": np.array([1, 0, 0]),
                "y": np.array([0, 1, 0]),
                "z": np.array([0, 0, 1]),
                "-x": np.array([-1, 0, 0]),
                "-y": np.array([0, -1, 0]),
                "-z": np.array([0, 0, -1])
            }
            if target_axis not in axis_map:
                raise ValueError(f"Unknown axis: {target_axis}")
            self.target_axis = axis_map[target_axis]
        else:
            self.target_axis = np.array(target_axis)
            if len(self.target_axis) != 3:
                raise ValueError("Custom axis must have 3 elements")
            # Normalize
            norm = np.linalg.norm(self.target_axis)
            if norm < 1e-12:
                raise ValueError("Target axis cannot be zero vector")
            self.target_axis = self.target_axis / norm

    def compute_residual(self, variables: Dict[str, np.ndarray]) -> np.ndarray:
        """Compute axis alignment residual."""
        Xi = variables[self.world_point_i_id]
        Xj = variables[self.world_point_j_id]

        # Vector from Xi to Xj
        vec = Xj - Xi
        vec_norm = np.linalg.norm(vec)

        if vec_norm < 1e-12:
            # Degenerate case - points coincide
            # Residual is large penalty
            residual = np.array([1.0, 1.0])  # Two components for cross product
        else:
            # Normalize vector
            unit_vec = vec / vec_norm

            # Cross product with target axis gives alignment error
            cross_product = np.cross(unit_vec, self.target_axis)

            # For 3D vectors, cross product is a 3D vector
            # We take its first two components as residual
            if len(cross_product) == 3:
                residual = cross_product[:2]
            else:
                # 2D case (shouldn't happen with 3D points)
                residual = np.array([cross_product, 0.0])

        return residual

    def compute_jacobian(self, variables: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        """Compute Jacobian using finite differences."""
        from ..math.jacobians import finite_difference_jacobian

        def residual_func(params):
            Xi = params[:3]
            Xj = params[3:6]
            var_dict = {
                self.world_point_i_id: Xi,
                self.world_point_j_id: Xj
            }
            return self.compute_residual(var_dict)

        # Pack variables
        Xi = variables[self.world_point_i_id]
        Xj = variables[self.world_point_j_id]
        params = np.concatenate([Xi, Xj])

        # Compute Jacobian
        J_full = finite_difference_jacobian(residual_func, params)

        # Split Jacobian
        return {
            self.world_point_i_id: J_full[:, :3],
            self.world_point_j_id: J_full[:, 3:]
        }

    def residual_dimension(self) -> int:
        """Get residual dimension."""
        return 2


class CoplanarityResidual(ResidualFunctor):
    """Residual for coplanarity constraints."""

    def __init__(
        self,
        factor_id: str,
        world_point_ids: List[str]
    ):
        """Initialize coplanarity residual.

        Args:
            factor_id: Unique factor identifier
            world_point_ids: List of world point variable IDs (minimum 4)
        """
        if len(world_point_ids) < 4:
            raise ValueError("Coplanarity constraint requires at least 4 points")

        super().__init__(factor_id, world_point_ids)
        self.world_point_ids = world_point_ids
        self.n_points = len(world_point_ids)

    def compute_residual(self, variables: Dict[str, np.ndarray]) -> np.ndarray:
        """Compute coplanarity residual."""
        # Get all points
        points = np.array([variables[wp_id] for wp_id in self.world_point_ids])

        # Use first three points to define plane
        p0, p1, p2 = points[:3]

        # Compute plane normal
        v1 = p1 - p0
        v2 = p2 - p0
        normal = np.cross(v1, v2)
        normal_norm = np.linalg.norm(normal)

        if normal_norm < 1e-12:
            # First three points are collinear - cannot define plane
            # Return large residuals
            residual = np.ones(self.n_points - 3)
            return residual

        normal = normal / normal_norm

        # Plane equation: normal . (X - p0) = 0
        # Residual for each additional point
        residuals = []
        for i in range(3, self.n_points):
            point = points[i]
            distance_to_plane = np.dot(normal, point - p0)
            residuals.append(distance_to_plane)

        return np.array(residuals)

    def compute_jacobian(self, variables: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        """Compute Jacobian using finite differences."""
        from ..math.jacobians import finite_difference_jacobian

        def residual_func(params):
            var_dict = {}
            offset = 0
            for wp_id in self.world_point_ids:
                var_dict[wp_id] = params[offset:offset+3]
                offset += 3
            return self.compute_residual(var_dict)

        # Pack all points
        all_points = np.concatenate([variables[wp_id] for wp_id in self.world_point_ids])

        # Compute Jacobian
        J_full = finite_difference_jacobian(residual_func, all_points)

        # Split Jacobian by variables
        jacobians = {}
        for i, wp_id in enumerate(self.world_point_ids):
            jacobians[wp_id] = J_full[:, i*3:(i+1)*3]

        return jacobians

    def residual_dimension(self) -> int:
        """Get residual dimension."""
        return self.n_points - 3


class EqualityResidual(ResidualFunctor):
    """Residual for equality constraints (point merging)."""

    def __init__(
        self,
        factor_id: str,
        world_point_a_id: str,
        world_point_b_id: str
    ):
        """Initialize equality residual.

        Args:
            factor_id: Unique factor identifier
            world_point_a_id: First world point variable ID
            world_point_b_id: Second world point variable ID
        """
        super().__init__(factor_id, [world_point_a_id, world_point_b_id])

        self.world_point_a_id = world_point_a_id
        self.world_point_b_id = world_point_b_id

    def compute_residual(self, variables: Dict[str, np.ndarray]) -> np.ndarray:
        """Compute equality residual."""
        Xa = variables[self.world_point_a_id]
        Xb = variables[self.world_point_b_id]

        # Residual is difference
        residual = Xa - Xb

        return residual

    def compute_jacobian(self, variables: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        """Compute Jacobian for equality residual."""
        # d(Xa - Xb)/d(Xa) = I
        # d(Xa - Xb)/d(Xb) = -I

        I = np.eye(3)

        return {
            self.world_point_a_id: I,
            self.world_point_b_id: -I
        }

    def residual_dimension(self) -> int:
        """Get residual dimension."""
        return 3


class ResidualRegistry:
    """Registry for residual functor types."""

    _residual_types = {
        "reprojection": ReprojectionResidual,
        "known_coordinate": KnownCoordinateResidual,
        "distance": DistanceResidual,
        "axis_alignment": AxisAlignmentResidual,
        "coplanarity": CoplanarityResidual,
        "equality": EqualityResidual,
    }

    @classmethod
    def get_residual_class(cls, residual_type: str):
        """Get residual class by type string."""
        if residual_type not in cls._residual_types:
            raise ValueError(f"Unknown residual type: {residual_type}")
        return cls._residual_types[residual_type]

    @classmethod
    def list_residual_types(cls) -> List[str]:
        """List all available residual types."""
        return list(cls._residual_types.keys())

    @classmethod
    def create_residual(cls, residual_type: str, **kwargs) -> ResidualFunctor:
        """Create residual functor of specified type."""
        residual_class = cls.get_residual_class(residual_type)
        return residual_class(**kwargs)