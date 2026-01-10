# Rotera Blender Integration

Import photogrammetry projects from [rotera.xyz](https://rotera.xyz) into Blender for camera mapping, set reconstruction, and VFX work.

## Installation

1. Download the addon: **[rotera_importer.py](https://rotera.xyz/rotera_importer.py)**
2. In Blender: **Edit > Preferences > Add-ons > Install...**
3. Select `rotera_importer.py`
4. Enable "Import: Rotera Project"

Requires Blender 2.80 or newer. Blender 4.0+ supports drag-and-drop import.

## Import

**File > Import > Rotera Project (.rotera)**

Or in Blender 4.0+, drag a `.rotera` file directly into the 3D viewport.

### Import Options

| Option | Description |
|--------|-------------|
| **Scale** | Scale factor for imported geometry (default: 1.0) |
| **Import Cameras** | Create camera objects with correct intrinsics |
| **Import Point Empties** | Create empties at each world point location |
| **Load Background Images** | Set up camera background images |

## What Gets Imported

### Cameras
- Position and orientation from solved viewpoints
- Focal length converted to Blender's 36mm sensor model
- Principal point offset (shift_x, shift_y)
- Render resolution set to match image dimensions
- Background images attached for camera view alignment

### Geometry
- World points as mesh vertices
- Lines as mesh edges
- Vertex groups for each named point
- Point empties with sphere display

### Images
- Embedded images (base64 in `.rotera` file) are extracted and packed
- External images loaded from the same directory as the `.rotera` file

## Camera Mapping Workflow

Camera mapping (also called camera projection) lets you project photos onto 3D geometry for photorealistic results.

### Basic Setup

1. **Import your Rotera project**
   - Enable all import options
   - Use the same scale as your real-world measurements

2. **Create projection geometry**
   - Use the imported points/edges as reference
   - Model simple planes or boxes matching your scene
   - Or import actual 3D models and align to points

3. **Set up UV Project modifier**
   ```
   - Select your geometry
   - Add modifier: UV Project
   - Set "Projectors" to your imported camera
   - Set "Aspect X/Y" to match image dimensions
   ```

4. **Create projection material**
   - New material with Image Texture node
   - Load the same image used in Rotera
   - Connect to UV Map → Image Texture → Principled BSDF

5. **Render from camera view**
   - Select imported camera
   - Ctrl+Numpad 0 to set as active camera
   - The background image should align perfectly with projected geometry

### Multi-Camera Projection

For scenes with multiple viewpoints:

1. Import all cameras from your Rotera project
2. Create separate UV Project modifiers for each camera
3. Use vertex groups or face sets to control which regions use which projection
4. Blend between projections at seams using weight painting

### Tips

- **Scale matters**: Ensure Rotera measurements match real-world units
- **Background alignment**: Use camera view (Numpad 0) to verify background images line up with geometry
- **Lens distortion**: Rotera assumes no lens distortion; for wide-angle photos, undistort before importing
- **Multiple exports**: Re-export from Rotera if you refine the solve

## Coordinate System

Rotera uses Y-up coordinates. The importer converts to Blender's Z-up:
- Rotera `[x, y, z]` → Blender `[x, z, -y]`

## Custom Properties

Imported objects include metadata as custom properties:

| Property | Description |
|----------|-------------|
| `rotera_color` | Original point color from Rotera |
| `rotera_filename` | Source image filename |
| `rotera_image_width` | Image width in pixels |
| `rotera_image_height` | Image height in pixels |

## Troubleshooting

**Cameras don't align with background**
- Check that the `.rotera` file was exported after solving
- Verify the scale factor matches your scene

**Images not loading**
- Ensure "Load Background Images" is enabled
- For external images, place them in the same folder as the `.rotera` file

**Wrong orientation**
- Rotera and Blender use different conventions; the importer handles this
- If still wrong, check your axis constraints in Rotera

**Model too large/small**
- Adjust the Scale import option
- Rotera uses the units you specified (meters, feet, etc.)

## Scripting

Access import programmatically:

```python
import bpy
bpy.ops.import_scene.rotera(
    filepath="/path/to/project.rotera",
    scale=1.0,
    import_cameras=True,
    import_points=True,
    import_bg_images=True
)
```

## Links

- [rotera.xyz](https://rotera.xyz) - Main application
- [GitHub](https://github.com/mfagerlund/Rotera) - Source code and issues
