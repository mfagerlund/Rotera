"""Synthetic scene generation utilities."""

import numpy as np
from typing import List, Dict, Tuple, Optional
import uuid

from ..models.entities import WorldPoint, Image, Camera
from ..models.constraints import ImagePointConstraint, DistanceConstraint, KnownCoordConstraint, GaugeFixConstraint
from ..models.project import Project
from ..math.camera import project
from .visibility import check_visibility


class SceneGenerator:
    """Generator for synthetic scenes and test data."""

    def __init__(self, seed: Optional[int] = None):
        """Initialize scene generator.

        Args:
            seed: Random seed for reproducible generation
        """
        if seed is not None:
            np.random.seed(seed)

    def generate_world_points_grid(
        self,
        bounds: Tuple[float, float, float, float, float, float],
        spacing: float,
        noise_std: float = 0.0
    ) -> List[WorldPoint]:
        """Generate world points on a regular grid.

        Args:
            bounds: (xmin, xmax, ymin, ymax, zmin, zmax) in meters
            spacing: Grid spacing in meters
            noise_std: Standard deviation of Gaussian noise to add

        Returns:
            List of WorldPoint objects
        """
        xmin, xmax, ymin, ymax, zmin, zmax = bounds

        x_coords = np.arange(xmin, xmax + spacing, spacing)
        y_coords = np.arange(ymin, ymax + spacing, spacing)
        z_coords = np.arange(zmin, zmax + spacing, spacing)

        world_points = []
        for x in x_coords:
            for y in y_coords:
                for z in z_coords:
                    # Add noise if specified
                    if noise_std > 0:
                        noise = np.random.normal(0, noise_std, 3)
                        coords = [x + noise[0], y + noise[1], z + noise[2]]
                    else:
                        coords = [x, y, z]

                    wp_id = f"wp_{len(world_points):04d}"
                    wp = WorldPoint(id=wp_id, xyz=coords)
                    world_points.append(wp)

        return world_points

    def generate_cameras_circle(
        self,
        center: np.ndarray,
        radius: float,
        n_cameras: int,
        look_at: np.ndarray,
        up: np.ndarray = np.array([0, 0, 1]),
        focal_length: float = 500.0,
        image_size: Tuple[int, int] = (640, 480)
    ) -> List[Tuple[Camera, Image]]:
        """Generate cameras positioned on a circle looking at a target.

        Args:
            center: Center of the circle [x, y, z]
            radius: Radius of the circle
            n_cameras: Number of cameras to generate
            look_at: Point to look at [x, y, z]
            up: Up vector [x, y, z]
            focal_length: Camera focal length in pixels
            image_size: Image dimensions (width, height)

        Returns:
            List of (Camera, Image) tuples
        """
        cameras_and_images = []
        angles = np.linspace(0, 2 * np.pi, n_cameras, endpoint=False)

        for i, angle in enumerate(angles):
            # Camera position on circle
            cam_pos = center + radius * np.array([np.cos(angle), np.sin(angle), 0])

            # Camera orientation (look at target)
            z_cam = look_at - cam_pos  # Camera Z-axis (forward)
            z_cam = z_cam / np.linalg.norm(z_cam)

            x_cam = np.cross(z_cam, up)  # Camera X-axis (right)
            x_cam = x_cam / np.linalg.norm(x_cam)

            y_cam = np.cross(z_cam, x_cam)  # Camera Y-axis (down)

            # Rotation matrix (world to camera)
            R = np.array([x_cam, y_cam, z_cam])

            # Translation (world to camera)
            t = -R @ cam_pos

            # Convert to axis-angle
            from ..math.se3 import se3_log
            xi = se3_log(R, t)
            axis_angle = xi[3:]  # Rotation part

            # Camera intrinsics
            cx, cy = image_size[0] / 2, image_size[1] / 2
            K = [focal_length, focal_length, cx, cy]

            # Create camera and image
            cam_id = f"cam_{i:02d}"
            img_id = f"img_{i:02d}"

            image = Image(
                id=img_id,
                path=f"synthetic_{img_id}.jpg",
                width=image_size[0],
                height=image_size[1]
            )

            camera = Camera(
                id=cam_id,
                image_id=img_id,
                K=K,
                R=axis_angle.tolist(),
                t=t.tolist()
            )

            cameras_and_images.append((camera, image))

        return cameras_and_images

    def generate_image_point_constraints(
        self,
        world_points: List[WorldPoint],
        cameras_and_images: List[Tuple[Camera, Image]],
        noise_std: float = 0.5,
        min_depth: float = 0.1,
        max_depth: float = 1000.0
    ) -> List[ImagePointConstraint]:
        """Generate image point constraints by projecting world points.

        Args:
            world_points: List of world points
            cameras_and_images: List of (Camera, Image) tuples
            noise_std: Standard deviation of projection noise in pixels
            min_depth: Minimum depth for valid projections
            max_depth: Maximum depth for valid projections

        Returns:
            List of ImagePointConstraint objects
        """
        constraints = []

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

            for wp in world_points:
                if wp.xyz is None:
                    continue

                X = np.array(wp.xyz).reshape(1, 3)

                # Check visibility
                visible, uv = check_visibility(K, R, t, X, image.width, image.height, min_depth, max_depth)

                if visible[0]:
                    u, v = uv[0]

                    # Add noise if specified
                    if noise_std > 0:
                        u += np.random.normal(0, noise_std)
                        v += np.random.normal(0, noise_std)

                    # Create constraint
                    constraint = ImagePointConstraint(
                        image_id=image.id,
                        wp_id=wp.id,
                        u=u,
                        v=v,
                        sigma=noise_std if noise_std > 0 else 1.0
                    )
                    constraints.append(constraint)

        return constraints

    def create_project_from_scene(
        self,
        world_points: List[WorldPoint],
        cameras_and_images: List[Tuple[Camera, Image]],
        additional_constraints: Optional[List] = None
    ) -> Project:
        """Create a complete project from scene components.

        Args:
            world_points: List of world points
            cameras_and_images: List of (Camera, Image) tuples
            additional_constraints: Additional constraints to include

        Returns:
            Complete Project object
        """
        project = Project()

        # Add world points
        for wp in world_points:
            project.add_world_point(wp)

        # Add images and cameras
        for camera, image in cameras_and_images:
            project.add_image(image)
            project.add_camera(camera)

        # Generate image point constraints
        ip_constraints = self.generate_image_point_constraints(world_points, cameras_and_images)
        for constraint in ip_constraints:
            project.add_constraint(constraint)

        # Add additional constraints if provided
        if additional_constraints:
            for constraint in additional_constraints:
                project.add_constraint(constraint)

        return project


def make_box_room(
    room_size: Tuple[float, float, float] = (5.0, 4.0, 3.0),
    n_cameras: int = 4,
    camera_height: float = 1.5,
    camera_radius: float = 2.0,
    seed: Optional[int] = None
) -> Project:
    """Create a synthetic box room scene.

    Args:
        room_size: Room dimensions (width, depth, height)
        n_cameras: Number of cameras
        camera_height: Camera height above floor
        camera_radius: Distance of cameras from room center
        seed: Random seed

    Returns:
        Complete project with box room scene
    """
    generator = SceneGenerator(seed=seed)

    width, depth, height = room_size

    # Create room corner points
    corners = [
        WorldPoint(id="corner_000", xyz=[0.0, 0.0, 0.0]),           # Floor corners
        WorldPoint(id="corner_100", xyz=[width, 0.0, 0.0]),
        WorldPoint(id="corner_110", xyz=[width, depth, 0.0]),
        WorldPoint(id="corner_010", xyz=[0.0, depth, 0.0]),
        WorldPoint(id="corner_001", xyz=[0.0, 0.0, height]),       # Ceiling corners
        WorldPoint(id="corner_101", xyz=[width, 0.0, height]),
        WorldPoint(id="corner_111", xyz=[width, depth, height]),
        WorldPoint(id="corner_011", xyz=[0.0, depth, height]),
    ]

    # Add some interior points
    interior_points = [
        WorldPoint(id="center_floor", xyz=[width/2, depth/2, 0.0]),
        WorldPoint(id="center_ceiling", xyz=[width/2, depth/2, height]),
        WorldPoint(id="wall_center", xyz=[width, depth/2, height/2]),
    ]

    all_points = corners + interior_points

    # Generate cameras in a circle at specified height
    room_center = np.array([width/2, depth/2, camera_height])
    look_at = np.array([width/2, depth/2, height/2])

    cameras_and_images = generator.generate_cameras_circle(
        center=room_center,
        radius=camera_radius,
        n_cameras=n_cameras,
        look_at=look_at
    )

    # Create distance constraints for room structure
    distance_constraints = [
        # Floor edges
        DistanceConstraint(wp_i="corner_000", wp_j="corner_100", distance=width),
        DistanceConstraint(wp_i="corner_100", wp_j="corner_110", distance=depth),
        DistanceConstraint(wp_i="corner_110", wp_j="corner_010", distance=width),
        DistanceConstraint(wp_i="corner_010", wp_j="corner_000", distance=depth),
        # Ceiling edges
        DistanceConstraint(wp_i="corner_001", wp_j="corner_101", distance=width),
        DistanceConstraint(wp_i="corner_101", wp_j="corner_111", distance=depth),
        DistanceConstraint(wp_i="corner_111", wp_j="corner_011", distance=width),
        DistanceConstraint(wp_i="corner_011", wp_j="corner_001", distance=depth),
        # Vertical edges
        DistanceConstraint(wp_i="corner_000", wp_j="corner_001", distance=height),
        DistanceConstraint(wp_i="corner_100", wp_j="corner_101", distance=height),
        DistanceConstraint(wp_i="corner_110", wp_j="corner_111", distance=height),
        DistanceConstraint(wp_i="corner_010", wp_j="corner_011", distance=height),
    ]

    # Gauge fixing constraint
    gauge_constraint = GaugeFixConstraint(
        origin_wp="corner_000",
        x_wp="corner_100",
        xy_wp="corner_010",
        scale_d=width
    )

    additional_constraints = distance_constraints + [gauge_constraint]

    return generator.create_project_from_scene(all_points, cameras_and_images, additional_constraints)


def make_grid_plane(
    grid_size: Tuple[int, int] = (5, 5),
    spacing: float = 1.0,
    plane_normal: np.ndarray = np.array([0, 0, 1]),
    plane_origin: np.ndarray = np.array([0, 0, 0]),
    n_cameras: int = 3,
    seed: Optional[int] = None
) -> Project:
    """Create a synthetic planar grid scene.

    Args:
        grid_size: Grid dimensions (nx, ny)
        spacing: Grid spacing in meters
        plane_normal: Plane normal vector
        plane_origin: Plane origin point
        n_cameras: Number of cameras
        seed: Random seed

    Returns:
        Complete project with grid plane scene
    """
    generator = SceneGenerator(seed=seed)

    nx, ny = grid_size

    # Create orthonormal basis for the plane
    normal = plane_normal / np.linalg.norm(plane_normal)
    u_axis = np.array([1, 0, 0]) if abs(normal[0]) < 0.9 else np.array([0, 1, 0])
    u_axis = u_axis - np.dot(u_axis, normal) * normal
    u_axis = u_axis / np.linalg.norm(u_axis)
    v_axis = np.cross(normal, u_axis)

    # Generate grid points
    grid_points = []
    for i in range(nx):
        for j in range(ny):
            u = (i - (nx-1)/2) * spacing
            v = (j - (ny-1)/2) * spacing
            point_3d = plane_origin + u * u_axis + v * v_axis

            wp_id = f"grid_{i:02d}_{j:02d}"
            wp = WorldPoint(id=wp_id, xyz=point_3d.tolist())
            grid_points.append(wp)

    # Generate cameras above and around the plane
    camera_center = plane_origin + 3.0 * normal
    look_at = plane_origin

    cameras_and_images = generator.generate_cameras_circle(
        center=camera_center,
        radius=2.0,
        n_cameras=n_cameras,
        look_at=look_at,
        up=normal
    )

    # Create distance constraints for grid structure
    distance_constraints = []
    for i in range(nx):
        for j in range(ny):
            current_id = f"grid_{i:02d}_{j:02d}"

            # Horizontal neighbor
            if i < nx - 1:
                neighbor_id = f"grid_{i+1:02d}_{j:02d}"
                constraint = DistanceConstraint(
                    wp_i=current_id,
                    wp_j=neighbor_id,
                    distance=spacing
                )
                distance_constraints.append(constraint)

            # Vertical neighbor
            if j < ny - 1:
                neighbor_id = f"grid_{i:02d}_{j+1:02d}"
                constraint = DistanceConstraint(
                    wp_i=current_id,
                    wp_j=neighbor_id,
                    distance=spacing
                )
                distance_constraints.append(constraint)

    # Gauge fixing using corner points
    corner_00 = f"grid_00_{0:02d}"
    corner_10 = f"grid_{nx-1:02d}_00"
    corner_01 = f"grid_00_{ny-1:02d}"

    gauge_constraint = GaugeFixConstraint(
        origin_wp=corner_00,
        x_wp=corner_10,
        xy_wp=corner_01,
        scale_d=(nx-1) * spacing
    )

    additional_constraints = distance_constraints + [gauge_constraint]

    return generator.create_project_from_scene(grid_points, cameras_and_images, additional_constraints)


def make_two_view(
    n_points: int = 20,
    scene_bounds: Tuple[float, float, float, float, float, float] = (-2, 2, -2, 2, 1, 5),
    baseline: float = 2.0,
    seed: Optional[int] = None
) -> Project:
    """Create a simple two-view scene for testing.

    Args:
        n_points: Number of 3D points
        scene_bounds: Scene bounds (xmin, xmax, ymin, ymax, zmin, zmax)
        baseline: Distance between cameras
        seed: Random seed

    Returns:
        Complete project with two-view scene
    """
    generator = SceneGenerator(seed=seed)

    # Generate random 3D points
    xmin, xmax, ymin, ymax, zmin, zmax = scene_bounds
    points = []

    for i in range(n_points):
        x = np.random.uniform(xmin, xmax)
        y = np.random.uniform(ymin, ymax)
        z = np.random.uniform(zmin, zmax)

        wp_id = f"pt_{i:03d}"
        wp = WorldPoint(id=wp_id, xyz=[x, y, z])
        points.append(wp)

    # Create two cameras with known baseline
    cam_positions = [
        np.array([-baseline/2, 0, 0]),
        np.array([baseline/2, 0, 0])
    ]

    cameras_and_images = []
    for i, pos in enumerate(cam_positions):
        # Identity rotation (looking down +Z axis)
        R = np.eye(3)
        t = -R @ pos  # World to camera translation

        # Convert to axis-angle (identity rotation = zero axis-angle)
        axis_angle = [0.0, 0.0, 0.0]

        cam_id = f"cam_{i}"
        img_id = f"img_{i}"

        image = Image(
            id=img_id,
            path=f"synthetic_{img_id}.jpg",
            width=640,
            height=480
        )

        camera = Camera(
            id=cam_id,
            image_id=img_id,
            K=[500.0, 500.0, 320.0, 240.0],
            R=axis_angle,
            t=t.tolist()
        )

        cameras_and_images.append((camera, image))

    # Add gauge fixing constraint using first three points
    gauge_constraint = GaugeFixConstraint(
        origin_wp="pt_000",
        x_wp="pt_001",
        xy_wp="pt_002",
        scale_d=1.0  # Arbitrary scale
    )

    # Add known baseline constraint
    baseline_constraint = DistanceConstraint(
        wp_i="cam_center_0",
        wp_j="cam_center_1",
        distance=baseline
    )

    # Add virtual camera center points
    cam_center_0 = WorldPoint(id="cam_center_0", xyz=cam_positions[0].tolist())
    cam_center_1 = WorldPoint(id="cam_center_1", xyz=cam_positions[1].tolist())
    points.extend([cam_center_0, cam_center_1])

    additional_constraints = [gauge_constraint, baseline_constraint]

    return generator.create_project_from_scene(points, cameras_and_images, additional_constraints)