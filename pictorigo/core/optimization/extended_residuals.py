"""Extended residual functors for new constraint types."""

import numpy as np
from typing import Dict, List, Optional
from abc import ABC, abstractmethod

from .factor_graph import Factor
from .residuals import ResidualFunctor


class PointOnLineResidual(ResidualFunctor):
    """Residual for point-on-line constraints."""

    def __init__(
        self,
        factor_id: str,
        point_id: str,
        line_wp_a_id: str,
        line_wp_b_id: str
    ):
        """Initialize point-on-line residual."""
        super().__init__(factor_id, [point_id, line_wp_a_id, line_wp_b_id])

        self.point_id = point_id
        self.line_wp_a_id = line_wp_a_id
        self.line_wp_b_id = line_wp_b_id

    def compute_residual(self, variables: Dict[str, np.ndarray]) -> np.ndarray:
        """Compute point-on-line residual using cross product distance."""
        # Get points
        point = variables[self.point_id]
        line_a = variables[self.line_wp_a_id]
        line_b = variables[self.line_wp_b_id]

        # Line direction
        line_dir = line_b - line_a
        line_dir_norm = np.linalg.norm(line_dir)

        if line_dir_norm < 1e-12:
            return np.array([1.0])  # Large residual for degenerate line

        # Vector from line point to test point
        vec_to_point = point - line_a

        # Cross product gives distance to line (in 3D, take magnitude)
        cross_product = np.cross(vec_to_point, line_dir)
        distance_to_line = np.linalg.norm(cross_product) / line_dir_norm

        return np.array([distance_to_line])

    def compute_jacobian(self, variables: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        """Compute Jacobian using finite differences."""
        from ..math.jacobians import finite_difference_jacobian

        def residual_func(params):
            var_dict = {
                self.point_id: params[0:3],
                self.line_wp_a_id: params[3:6],
                self.line_wp_b_id: params[6:9]
            }
            return self.compute_residual(var_dict)

        # Pack variables
        all_points = np.concatenate([
            variables[self.point_id],
            variables[self.line_wp_a_id],
            variables[self.line_wp_b_id]
        ])

        # Compute Jacobian
        J_full = finite_difference_jacobian(residual_func, all_points)

        # Split Jacobian by variables
        jacobians = {
            self.point_id: J_full[:, 0:3],
            self.line_wp_a_id: J_full[:, 3:6],
            self.line_wp_b_id: J_full[:, 6:9]
        }

        return jacobians

    def residual_dimension(self) -> int:
        """Get residual dimension."""
        return 1


class PointOnPlaneResidual(ResidualFunctor):
    """Residual for point-on-plane constraints."""

    def __init__(
        self,
        factor_id: str,
        point_id: str,
        plane_wp_a_id: str,
        plane_wp_b_id: str,
        plane_wp_c_id: str
    ):
        """Initialize point-on-plane residual."""
        super().__init__(factor_id, [point_id, plane_wp_a_id, plane_wp_b_id, plane_wp_c_id])

        self.point_id = point_id
        self.plane_wp_a_id = plane_wp_a_id
        self.plane_wp_b_id = plane_wp_b_id
        self.plane_wp_c_id = plane_wp_c_id

    def compute_residual(self, variables: Dict[str, np.ndarray]) -> np.ndarray:
        """Compute point-on-plane residual using normal distance."""
        # Get points
        point = variables[self.point_id]
        plane_a = variables[self.plane_wp_a_id]
        plane_b = variables[self.plane_wp_b_id]
        plane_c = variables[self.plane_wp_c_id]

        # Compute plane normal
        v1 = plane_b - plane_a
        v2 = plane_c - plane_a
        normal = np.cross(v1, v2)
        normal_norm = np.linalg.norm(normal)

        if normal_norm < 1e-12:
            return np.array([1.0])  # Large residual for degenerate plane

        normal = normal / normal_norm

        # Distance from point to plane
        distance_to_plane = np.dot(normal, point - plane_a)

        return np.array([distance_to_plane])

    def compute_jacobian(self, variables: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        """Compute Jacobian using finite differences."""
        from ..math.jacobians import finite_difference_jacobian

        def residual_func(params):
            var_dict = {
                self.point_id: params[0:3],
                self.plane_wp_a_id: params[3:6],
                self.plane_wp_b_id: params[6:9],
                self.plane_wp_c_id: params[9:12]
            }
            return self.compute_residual(var_dict)

        # Pack variables
        all_points = np.concatenate([
            variables[self.point_id],
            variables[self.plane_wp_a_id],
            variables[self.plane_wp_b_id],
            variables[self.plane_wp_c_id]
        ])

        # Compute Jacobian
        J_full = finite_difference_jacobian(residual_func, all_points)

        # Split Jacobian by variables
        jacobians = {
            self.point_id: J_full[:, 0:3],
            self.plane_wp_a_id: J_full[:, 3:6],
            self.plane_wp_b_id: J_full[:, 6:9],
            self.plane_wp_c_id: J_full[:, 9:12]
        }

        return jacobians

    def residual_dimension(self) -> int:
        """Get residual dimension."""
        return 1


class PointOnSphereResidual(ResidualFunctor):
    """Residual for point-on-sphere constraints."""

    def __init__(
        self,
        factor_id: str,
        point_id: str,
        center_id: str,
        radius_ref_id: str
    ):
        """Initialize point-on-sphere residual."""
        super().__init__(factor_id, [point_id, center_id, radius_ref_id])

        self.point_id = point_id
        self.center_id = center_id
        self.radius_ref_id = radius_ref_id

    def compute_residual(self, variables: Dict[str, np.ndarray]) -> np.ndarray:
        """Compute point-on-sphere residual."""
        # Get points
        point = variables[self.point_id]
        center = variables[self.center_id]
        radius_ref = variables[self.radius_ref_id]

        # Target radius (distance from center to reference point)
        target_radius = np.linalg.norm(radius_ref - center)

        # Current distance from center to point
        current_distance = np.linalg.norm(point - center)

        # Residual is difference
        residual = current_distance - target_radius

        return np.array([residual])

    def compute_jacobian(self, variables: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        """Compute Jacobian using finite differences."""
        from ..math.jacobians import finite_difference_jacobian

        def residual_func(params):
            var_dict = {
                self.point_id: params[0:3],
                self.center_id: params[3:6],
                self.radius_ref_id: params[6:9]
            }
            return self.compute_residual(var_dict)

        # Pack variables
        all_points = np.concatenate([
            variables[self.point_id],
            variables[self.center_id],
            variables[self.radius_ref_id]
        ])

        # Compute Jacobian
        J_full = finite_difference_jacobian(residual_func, all_points)

        # Split Jacobian by variables
        jacobians = {
            self.point_id: J_full[:, 0:3],
            self.center_id: J_full[:, 3:6],
            self.radius_ref_id: J_full[:, 6:9]
        }

        return jacobians

    def residual_dimension(self) -> int:
        """Get residual dimension."""
        return 1


class EqualDistanceResidual(ResidualFunctor):
    """Residual for equal distance constraints."""

    def __init__(
        self,
        factor_id: str,
        line1_wp_a_id: str,
        line1_wp_b_id: str,
        line2_wp_a_id: str,
        line2_wp_b_id: str
    ):
        """Initialize equal distance residual."""
        super().__init__(factor_id, [line1_wp_a_id, line1_wp_b_id, line2_wp_a_id, line2_wp_b_id])

        self.line1_wp_a_id = line1_wp_a_id
        self.line1_wp_b_id = line1_wp_b_id
        self.line2_wp_a_id = line2_wp_a_id
        self.line2_wp_b_id = line2_wp_b_id

    def compute_residual(self, variables: Dict[str, np.ndarray]) -> np.ndarray:
        """Compute equal distance residual."""
        # Get line points
        line1_a = variables[self.line1_wp_a_id]
        line1_b = variables[self.line1_wp_b_id]
        line2_a = variables[self.line2_wp_a_id]
        line2_b = variables[self.line2_wp_b_id]

        # Compute distances
        dist1 = np.linalg.norm(line1_b - line1_a)
        dist2 = np.linalg.norm(line2_b - line2_a)

        # Residual is difference
        residual = dist1 - dist2

        return np.array([residual])

    def compute_jacobian(self, variables: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        """Compute Jacobian using finite differences."""
        from ..math.jacobians import finite_difference_jacobian

        def residual_func(params):
            var_dict = {
                self.line1_wp_a_id: params[0:3],
                self.line1_wp_b_id: params[3:6],
                self.line2_wp_a_id: params[6:9],
                self.line2_wp_b_id: params[9:12]
            }
            return self.compute_residual(var_dict)

        # Pack variables
        all_points = np.concatenate([
            variables[self.line1_wp_a_id],
            variables[self.line1_wp_b_id],
            variables[self.line2_wp_a_id],
            variables[self.line2_wp_b_id]
        ])

        # Compute Jacobian
        J_full = finite_difference_jacobian(residual_func, all_points)

        # Split Jacobian by variables
        jacobians = {
            self.line1_wp_a_id: J_full[:, 0:3],
            self.line1_wp_b_id: J_full[:, 3:6],
            self.line2_wp_a_id: J_full[:, 6:9],
            self.line2_wp_b_id: J_full[:, 9:12]
        }

        return jacobians

    def residual_dimension(self) -> int:
        """Get residual dimension."""
        return 1


class RectangleResidual(ResidualFunctor):
    """Residual for rectangle constraints."""

    def __init__(
        self,
        factor_id: str,
        corner_a_id: str,
        corner_b_id: str,
        corner_c_id: str,
        corner_d_id: str,
        aspect_ratio: Optional[float] = None
    ):
        """Initialize rectangle residual."""
        super().__init__(factor_id, [corner_a_id, corner_b_id, corner_c_id, corner_d_id])

        self.corner_a_id = corner_a_id
        self.corner_b_id = corner_b_id
        self.corner_c_id = corner_c_id
        self.corner_d_id = corner_d_id
        self.aspect_ratio = aspect_ratio

    def compute_residual(self, variables: Dict[str, np.ndarray]) -> np.ndarray:
        """Compute rectangle residual."""
        # Get corner points (assuming A-B-C-D in order)
        a = variables[self.corner_a_id]
        b = variables[self.corner_b_id]
        c = variables[self.corner_c_id]
        d = variables[self.corner_d_id]

        residuals = []

        # 1. Coplanarity (use first three points to define plane)
        v1 = b - a
        v2 = d - a
        normal = np.cross(v1, v2)
        normal_norm = np.linalg.norm(normal)

        if normal_norm > 1e-12:
            normal = normal / normal_norm
            # Check if C is on the plane
            coplanar_residual = np.dot(normal, c - a)
            residuals.append(coplanar_residual)
        else:
            residuals.append(1.0)  # Degenerate case

        # 2. Orthogonality: adjacent edges should be perpendicular
        edge_ab = b - a
        edge_ad = d - a
        edge_bc = c - b
        edge_dc = c - d

        # AB ⊥ AD
        ortho1 = np.dot(edge_ab, edge_ad)
        residuals.append(ortho1)

        # BC ⊥ AB
        ortho2 = np.dot(edge_bc, edge_ab)
        residuals.append(ortho2)

        # 3. Parallelism: opposite edges should be parallel and equal
        # AB should equal DC
        parallel1 = edge_ab - edge_dc
        residuals.extend(parallel1)

        # AD should equal BC
        parallel2 = edge_ad - edge_bc
        residuals.extend(parallel2)

        # 4. Aspect ratio constraint (if specified)
        if self.aspect_ratio is not None:
            width = np.linalg.norm(edge_ab)
            height = np.linalg.norm(edge_ad)

            if height > 1e-12:
                current_aspect = width / height
                aspect_residual = current_aspect - self.aspect_ratio
                residuals.append(aspect_residual)
            else:
                residuals.append(1.0)

        return np.array(residuals)

    def compute_jacobian(self, variables: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        """Compute Jacobian using finite differences."""
        from ..math.jacobians import finite_difference_jacobian

        def residual_func(params):
            var_dict = {
                self.corner_a_id: params[0:3],
                self.corner_b_id: params[3:6],
                self.corner_c_id: params[6:9],
                self.corner_d_id: params[9:12]
            }
            return self.compute_residual(var_dict)

        # Pack variables
        all_points = np.concatenate([
            variables[self.corner_a_id],
            variables[self.corner_b_id],
            variables[self.corner_c_id],
            variables[self.corner_d_id]
        ])

        # Compute Jacobian
        J_full = finite_difference_jacobian(residual_func, all_points)

        # Split Jacobian by variables
        jacobians = {
            self.corner_a_id: J_full[:, 0:3],
            self.corner_b_id: J_full[:, 3:6],
            self.corner_c_id: J_full[:, 6:9],
            self.corner_d_id: J_full[:, 9:12]
        }

        return jacobians

    def residual_dimension(self) -> int:
        """Get residual dimension."""
        base_residuals = 10  # 1 coplanar + 2 orthogonal + 6 parallel + 1 (optional aspect)
        if self.aspect_ratio is not None:
            return base_residuals
        else:
            return base_residuals - 1


class EqualSpacingResidual(ResidualFunctor):
    """Residual for equal spacing constraints."""

    def __init__(
        self,
        factor_id: str,
        point_ids: List[str]
    ):
        """Initialize equal spacing residual."""
        if len(point_ids) < 3:
            raise ValueError("Equal spacing requires at least 3 points")

        super().__init__(factor_id, point_ids)
        self.point_ids = point_ids
        self.n_points = len(point_ids)

    def compute_residual(self, variables: Dict[str, np.ndarray]) -> np.ndarray:
        """Compute equal spacing residual."""
        # Get all points
        points = np.array([variables[point_id] for point_id in self.point_ids])

        # Compute consecutive spacing distances
        spacings = []
        for i in range(self.n_points - 1):
            spacing = np.linalg.norm(points[i+1] - points[i])
            spacings.append(spacing)

        # All spacings should be equal to the first spacing
        target_spacing = spacings[0]
        residuals = []

        for i in range(1, len(spacings)):
            residual = spacings[i] - target_spacing
            residuals.append(residual)

        return np.array(residuals)

    def compute_jacobian(self, variables: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        """Compute Jacobian using finite differences."""
        from ..math.jacobians import finite_difference_jacobian

        def residual_func(params):
            var_dict = {}
            offset = 0
            for point_id in self.point_ids:
                var_dict[point_id] = params[offset:offset+3]
                offset += 3
            return self.compute_residual(var_dict)

        # Pack all points
        all_points = np.concatenate([variables[point_id] for point_id in self.point_ids])

        # Compute Jacobian
        J_full = finite_difference_jacobian(residual_func, all_points)

        # Split Jacobian by variables
        jacobians = {}
        for i, point_id in enumerate(self.point_ids):
            jacobians[point_id] = J_full[:, i*3:(i+1)*3]

        return jacobians

    def residual_dimension(self) -> int:
        """Get residual dimension."""
        return self.n_points - 2  # n-1 spacings, n-2 residuals