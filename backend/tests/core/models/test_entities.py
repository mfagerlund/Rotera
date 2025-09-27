"""Tests for entity models."""

import numpy as np
import pytest
from pydantic import ValidationError

from pictorigo.core.models.entities import WorldPoint, Image, Camera, CameraLockFlags


class TestWorldPoint:
    """Test WorldPoint model."""

    def test_world_point_creation(self):
        """Test basic world point creation."""
        wp = WorldPoint(id="wp1")
        assert wp.id == "wp1"
        assert wp.xyz is None
        assert not wp.is_initialized()

    def test_world_point_with_coordinates(self):
        """Test world point with coordinates."""
        wp = WorldPoint(id="wp1", xyz=[1.0, 2.0, 3.0])
        assert wp.id == "wp1"
        assert wp.xyz == [1.0, 2.0, 3.0]
        assert wp.is_initialized()

    def test_world_point_numpy_conversion(self):
        """Test numpy array conversion."""
        wp = WorldPoint(id="wp1", xyz=[1.0, 2.0, 3.0])
        arr = wp.to_numpy()
        expected = np.array([1.0, 2.0, 3.0])
        np.testing.assert_array_equal(arr, expected)

    def test_world_point_set_from_numpy(self):
        """Test setting coordinates from numpy array."""
        wp = WorldPoint(id="wp1")
        arr = np.array([4.0, 5.0, 6.0])
        wp.set_from_numpy(arr)
        assert wp.xyz == [4.0, 5.0, 6.0]

    def test_world_point_invalid_coordinates(self):
        """Test validation of coordinate length."""
        with pytest.raises(ValidationError):
            WorldPoint(id="wp1", xyz=[1.0, 2.0])  # Too few

        with pytest.raises(ValidationError):
            WorldPoint(id="wp1", xyz=[1.0, 2.0, 3.0, 4.0])  # Too many

    def test_world_point_invalid_numpy_shape(self):
        """Test invalid numpy array shape."""
        wp = WorldPoint(id="wp1")
        with pytest.raises(ValueError):
            wp.set_from_numpy(np.array([1.0, 2.0]))  # Wrong shape


class TestImage:
    """Test Image model."""

    def test_image_creation(self):
        """Test basic image creation."""
        img = Image(id="img1", path="/path/to/image.jpg", width=1920, height=1080)
        assert img.id == "img1"
        assert img.path == "/path/to/image.jpg"
        assert img.width == 1920
        assert img.height == 1080

    def test_image_aspect_ratio(self):
        """Test aspect ratio calculation."""
        img = Image(id="img1", path="/path/to/image.jpg", width=1920, height=1080)
        assert abs(img.aspect_ratio() - 16/9) < 1e-10

    def test_image_contains_pixel(self):
        """Test pixel bounds checking."""
        img = Image(id="img1", path="/path/to/image.jpg", width=1920, height=1080)

        assert img.contains_pixel(0, 0)  # Top-left corner
        assert img.contains_pixel(1919, 1079)  # Bottom-right corner
        assert img.contains_pixel(960, 540)  # Center

        assert not img.contains_pixel(-1, 0)  # Outside left
        assert not img.contains_pixel(1920, 0)  # Outside right
        assert not img.contains_pixel(0, -1)  # Outside top
        assert not img.contains_pixel(0, 1080)  # Outside bottom

    def test_image_invalid_dimensions(self):
        """Test validation of image dimensions."""
        with pytest.raises(ValidationError):
            Image(id="img1", path="/path/to/image.jpg", width=0, height=1080)

        with pytest.raises(ValidationError):
            Image(id="img1", path="/path/to/image.jpg", width=1920, height=-1)


class TestCamera:
    """Test Camera model."""

    def test_camera_creation(self):
        """Test basic camera creation."""
        camera = Camera(
            id="cam1",
            image_id="img1",
            K=[500.0, 500.0, 320.0, 240.0],
            R=[0.0, 0.0, 0.0],
            t=[0.0, 0.0, 0.0]
        )
        assert camera.id == "cam1"
        assert camera.image_id == "img1"
        assert len(camera.K) == 4
        assert len(camera.R) == 3
        assert len(camera.t) == 3

    def test_camera_with_distortion(self):
        """Test camera with distortion parameters."""
        camera = Camera(
            id="cam1",
            image_id="img1",
            K=[500.0, 500.0, 320.0, 240.0, 0.1, 0.01],
            R=[0.1, 0.2, 0.3],
            t=[1.0, 2.0, 3.0]
        )
        assert camera.has_distortion()
        assert camera.get_distortion() == [0.1, 0.01]

    def test_camera_numpy_conversion(self):
        """Test numpy array conversions."""
        camera = Camera(
            id="cam1",
            image_id="img1",
            K=[500.0, 500.0, 320.0, 240.0],
            R=[0.1, 0.2, 0.3],
            t=[1.0, 2.0, 3.0]
        )

        K = camera.get_intrinsics()
        R = camera.get_rotation()
        t = camera.get_translation()

        np.testing.assert_array_equal(K, np.array([500.0, 500.0, 320.0, 240.0]))
        np.testing.assert_array_equal(R, np.array([0.1, 0.2, 0.3]))
        np.testing.assert_array_equal(t, np.array([1.0, 2.0, 3.0]))

    def test_camera_set_parameters(self):
        """Test setting camera parameters from numpy."""
        camera = Camera(
            id="cam1",
            image_id="img1",
            K=[500.0, 500.0, 320.0, 240.0],
            R=[0.0, 0.0, 0.0],
            t=[0.0, 0.0, 0.0]
        )

        new_K = np.array([600.0, 600.0, 320.0, 240.0, 0.05])
        new_R = np.array([0.1, 0.2, 0.3])
        new_t = np.array([1.0, 2.0, 3.0])

        camera.set_intrinsics(new_K)
        camera.set_rotation(new_R)
        camera.set_translation(new_t)

        assert camera.K == [600.0, 600.0, 320.0, 240.0, 0.05]
        assert camera.R == [0.1, 0.2, 0.3]
        assert camera.t == [1.0, 2.0, 3.0]

    def test_camera_focal_length_and_principal_point(self):
        """Test focal length and principal point accessors."""
        camera = Camera(
            id="cam1",
            image_id="img1",
            K=[500.0, 600.0, 320.0, 240.0],
            R=[0.0, 0.0, 0.0],
            t=[0.0, 0.0, 0.0]
        )

        fx, fy = camera.get_focal_length()
        assert fx == 500.0
        assert fy == 600.0

        cx, cy = camera.get_principal_point()
        assert cx == 320.0
        assert cy == 240.0

    def test_camera_lock_flags(self):
        """Test camera lock flags."""
        lock_flags = CameraLockFlags(intrinsics=True, rotation=False, translation=True)
        camera = Camera(
            id="cam1",
            image_id="img1",
            K=[500.0, 500.0, 320.0, 240.0],
            R=[0.0, 0.0, 0.0],
            t=[0.0, 0.0, 0.0],
            lock_flags=lock_flags
        )

        assert camera.lock_flags.intrinsics
        assert not camera.lock_flags.rotation
        assert camera.lock_flags.translation

    def test_camera_invalid_parameters(self):
        """Test validation of camera parameters."""
        # Invalid K length
        with pytest.raises(ValidationError):
            Camera(
                id="cam1",
                image_id="img1",
                K=[500.0, 500.0, 320.0],  # Too few elements
                R=[0.0, 0.0, 0.0],
                t=[0.0, 0.0, 0.0]
            )

        # Invalid R length
        with pytest.raises(ValidationError):
            Camera(
                id="cam1",
                image_id="img1",
                K=[500.0, 500.0, 320.0, 240.0],
                R=[0.0, 0.0],  # Too few elements
                t=[0.0, 0.0, 0.0]
            )

        # Invalid t length
        with pytest.raises(ValidationError):
            Camera(
                id="cam1",
                image_id="img1",
                K=[500.0, 500.0, 320.0, 240.0],
                R=[0.0, 0.0, 0.0],
                t=[0.0, 0.0]  # Too few elements
            )

    def test_camera_invalid_numpy_shapes(self):
        """Test invalid numpy array shapes."""
        camera = Camera(
            id="cam1",
            image_id="img1",
            K=[500.0, 500.0, 320.0, 240.0],
            R=[0.0, 0.0, 0.0],
            t=[0.0, 0.0, 0.0]
        )

        with pytest.raises(ValueError):
            camera.set_intrinsics(np.array([500.0, 500.0, 320.0]))  # Too few elements

        with pytest.raises(ValueError):
            camera.set_rotation(np.array([0.1, 0.2]))  # Wrong shape

        with pytest.raises(ValueError):
            camera.set_translation(np.array([1.0, 2.0]))  # Wrong shape