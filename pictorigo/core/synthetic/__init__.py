"""Synthetic scene generation for testing."""

from .scene_gen import SceneGenerator, make_box_room, make_grid_plane, make_two_view
from .visibility import check_visibility, filter_visible_points

__all__ = [
    "SceneGenerator",
    "make_box_room",
    "make_grid_plane",
    "make_two_view",
    "check_visibility",
    "filter_visible_points",
]