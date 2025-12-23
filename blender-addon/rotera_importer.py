# Rotera Importer for Blender
# https://rotera.xyz
#
# Installation:
#   Edit > Preferences > Add-ons > Install... > Select this file
#   Enable "Import: Rotera Project"
#
# Usage:
#   File > Import > Rotera Project (.rotera)

bl_info = {
    "name": "Rotera Project Importer",
    "author": "Rotera (rotera.xyz)",
    "version": (1, 0, 0),
    "blender": (2, 80, 0),
    "location": "File > Import > Rotera Project",
    "description": "Import photogrammetry projects from Rotera",
    "warning": "",
    "doc_url": "https://rotera.xyz",
    "category": "Import-Export",
}

import bpy
import json
import math
from bpy.props import StringProperty, FloatProperty, BoolProperty
from bpy_extras.io_utils import ImportHelper
from mathutils import Vector, Quaternion, Matrix


# =============================================================================
# Coordinate Conversion
# =============================================================================

def rotera_to_blender_position(xyz):
    """Convert position from Rotera (Y-up) to Blender (Z-up): [x, y, z] -> [x, z, -y]"""
    x, y, z = xyz
    return Vector((x, z, -y))


def rotera_to_blender_quaternion(quat):
    """
    Convert camera quaternion from Rotera to Blender using direction vectors.
    """
    q = Quaternion((quat[0], quat[1], quat[2], quat[3]))
    q_inv = q.inverted()

    # Rotera camera looks at -Z, extract look and up directions
    look_rotera = q_inv @ Vector((0, 0, -1))
    up_rotera = q_inv @ Vector((0, 1, 0))

    # Convert directions: [x, y, z] -> [x, z, -y] for look, [x, z, y] for up
    look_blend = Vector((look_rotera.x, look_rotera.z, -look_rotera.y))
    up_blend = Vector((up_rotera.x, up_rotera.z, up_rotera.y))

    # Build rotation matrix for Blender camera
    forward = look_blend.normalized()

    # Orthogonalize: right = forward x up
    right = forward.cross(up_blend)
    if right.length < 0.001:
        right = forward.cross(Vector((0, 0, 1)))
        if right.length < 0.001:
            right = forward.cross(Vector((0, 1, 0)))
    right.normalize()

    # Recompute up to be perpendicular
    up = right.cross(forward)
    up.normalize()

    # Build matrix: columns are X (right), Y (up), Z (-forward)
    rot_matrix = Matrix((
        (right.x, up.x, -forward.x),
        (right.y, up.y, -forward.y),
        (right.z, up.z, -forward.z)
    ))

    return rot_matrix.to_quaternion()


# =============================================================================
# Import Functions
# =============================================================================

def create_collection(name):
    """Create or get a collection for the imported data"""
    if name in bpy.data.collections:
        collection = bpy.data.collections[name]
        # Clear existing objects
        for obj in list(collection.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
    else:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
    return collection


def create_mesh(project, collection, scale):
    """Create mesh from world points and lines"""
    wp_map = {}  # id -> index
    vertices = []
    point_names = []
    point_colors = []

    for i, wp in enumerate(project.get('worldPoints', [])):
        xyz = wp.get('optimizedXyz')
        if xyz:
            pos = rotera_to_blender_position(xyz)
            vertices.append(pos * scale)
            wp_map[wp['id']] = len(vertices) - 1
            point_names.append(wp.get('name', f'WP{i}'))
            point_colors.append(wp.get('color', '#ffffff'))

    # Create edges from lines
    edges = []
    for line in project.get('lines', []):
        pa_id = line.get('pointAId')
        pb_id = line.get('pointBId')
        if pa_id in wp_map and pb_id in wp_map:
            edges.append((wp_map[pa_id], wp_map[pb_id]))

    if not vertices:
        return None

    mesh = bpy.data.meshes.new("Rotera_Mesh")
    mesh.from_pydata(vertices, edges, [])
    mesh.update()

    obj = bpy.data.objects.new("Rotera_Model", mesh)
    collection.objects.link(obj)

    # Create vertex groups for each point
    for i, name in enumerate(point_names):
        vg = obj.vertex_groups.new(name=name)
        vg.add([i], 1.0, 'REPLACE')

    return obj, wp_map, point_names


def create_point_empties(project, collection, scale):
    """Create empties at each world point for easier manipulation"""
    empties = []
    for wp in project.get('worldPoints', []):
        xyz = wp.get('optimizedXyz')
        if xyz:
            pos = rotera_to_blender_position(xyz)
            name = wp.get('name', 'WP')
            empty = bpy.data.objects.new(f"WP_{name}", None)
            empty.empty_display_type = 'SPHERE'
            empty.empty_display_size = 0.1 * scale
            empty.location = pos * scale
            empty["rotera_color"] = wp.get('color', '#ffffff')
            collection.objects.link(empty)
            empties.append(empty)
    return empties


def create_cameras(project, collection, scale, import_bg_images, image_dir):
    """Create cameras from viewpoints"""
    cameras = []

    for vp in project.get('viewpoints', []):
        name = vp.get('name', 'Camera')
        pos = rotera_to_blender_position(vp['position']) * scale
        quat = rotera_to_blender_quaternion(vp['rotation'])

        # Get image dimensions and intrinsics
        image_width = vp.get('imageWidth', 1920)
        image_height = vp.get('imageHeight', 1080)
        focal_length_px = vp.get('focalLength', max(image_width, image_height))
        pp_x = vp.get('principalPointX', image_width / 2)
        pp_y = vp.get('principalPointY', image_height / 2)

        # Convert to Blender units (36mm sensor width)
        sensor_width = 36.0
        sensor_height = sensor_width * (image_height / image_width)
        focal_length_mm = (focal_length_px / image_width) * sensor_width

        # Create camera data
        cam_data = bpy.data.cameras.new(name)
        cam_data.lens = focal_length_mm
        cam_data.sensor_width = sensor_width
        cam_data.sensor_height = sensor_height
        cam_data.sensor_fit = 'AUTO'

        # Principal point offset (Y-flipped for image coords -> Blender)
        cam_data.shift_x = (pp_x / image_width) - 0.5
        cam_data.shift_y = 0.5 - (pp_y / image_height)

        # Create camera object
        cam_obj = bpy.data.objects.new(name, cam_data)
        collection.objects.link(cam_obj)

        cam_obj.location = pos
        cam_obj.rotation_mode = 'QUATERNION'
        cam_obj.rotation_quaternion = quat

        # Store metadata
        cam_obj["rotera_filename"] = vp.get('filename', '')
        cam_obj["rotera_image_width"] = image_width
        cam_obj["rotera_image_height"] = image_height

        # Set render resolution
        bpy.context.scene.render.resolution_x = image_width
        bpy.context.scene.render.resolution_y = image_height
        bpy.context.scene.render.resolution_percentage = 100

        # Load background image if requested
        if import_bg_images and image_dir:
            filename = vp.get('filename', '')
            if filename:
                import os
                image_path = os.path.join(image_dir, filename)
                if os.path.exists(image_path):
                    try:
                        cam_data.show_background_images = True
                        bg = cam_data.background_images.new()
                        img = bpy.data.images.load(image_path)
                        bg.image = img
                        bg.alpha = 0.5
                        bg.display_depth = 'BACK'
                        bg.frame_method = 'FIT'
                    except Exception as e:
                        print(f"Could not load background image: {image_path}: {e}")

        cameras.append(cam_obj)

    return cameras


# =============================================================================
# Import Operator
# =============================================================================

class IMPORT_OT_rotera(bpy.types.Operator, ImportHelper):
    """Import a Rotera photogrammetry project"""
    bl_idname = "import_scene.rotera"
    bl_label = "Import Rotera Project"
    bl_options = {'REGISTER', 'UNDO'}

    # File browser settings
    filename_ext = ".rotera"
    filter_glob: StringProperty(
        default="*.rotera;*.json",
        options={'HIDDEN'},
    )

    # Import options
    scale: FloatProperty(
        name="Scale",
        description="Scale factor for imported geometry",
        default=1.0,
        min=0.001,
        max=1000.0,
    )

    import_cameras: BoolProperty(
        name="Import Cameras",
        description="Import camera positions and orientations",
        default=True,
    )

    import_points: BoolProperty(
        name="Import Point Empties",
        description="Create empty objects at world point locations",
        default=True,
    )

    import_bg_images: BoolProperty(
        name="Load Background Images",
        description="Load images as camera backgrounds (images must be in same folder)",
        default=True,
    )

    def execute(self, context):
        import os

        # Load JSON
        try:
            with open(self.filepath, 'r', encoding='utf-8') as f:
                project = json.load(f)
        except Exception as e:
            self.report({'ERROR'}, f"Failed to load file: {e}")
            return {'CANCELLED'}

        project_name = project.get('name', 'Rotera')
        image_dir = os.path.dirname(self.filepath)

        # Create collection
        collection = create_collection(project_name)

        # Create mesh
        result = create_mesh(project, collection, self.scale)
        if result:
            mesh_obj, wp_map, point_names = result
            point_count = len(point_names)
            edge_count = len(mesh_obj.data.edges)
        else:
            point_count = 0
            edge_count = 0

        # Create point empties
        if self.import_points:
            create_point_empties(project, collection, self.scale)

        # Create cameras
        camera_count = 0
        if self.import_cameras:
            cameras = create_cameras(
                project, collection, self.scale,
                self.import_bg_images, image_dir
            )
            camera_count = len(cameras)

        # Select the mesh
        if result:
            bpy.context.view_layer.objects.active = mesh_obj
            mesh_obj.select_set(True)

        self.report({'INFO'}, f"Imported: {point_count} points, {edge_count} edges, {camera_count} cameras")
        return {'FINISHED'}

    def draw(self, context):
        layout = self.layout
        layout.prop(self, "scale")
        layout.separator()
        layout.prop(self, "import_cameras")
        layout.prop(self, "import_points")
        layout.prop(self, "import_bg_images")


# =============================================================================
# Menu Integration
# =============================================================================

def menu_func_import(self, context):
    self.layout.operator(IMPORT_OT_rotera.bl_idname, text="Rotera Project (.rotera)")


# =============================================================================
# Registration
# =============================================================================

classes = (
    IMPORT_OT_rotera,
)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.types.TOPBAR_MT_file_import.append(menu_func_import)


def unregister():
    bpy.types.TOPBAR_MT_file_import.remove(menu_func_import)
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
