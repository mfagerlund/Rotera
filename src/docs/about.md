# Welcome to Rotera

Rotera helps you **extract 3D information from photographs**. Point at features in your photos, tell it what you know about them (distances, alignments, coordinates), and Rotera figures out where your cameras were and where things are in 3D space.

![Overview of Rotera interface](screenshots/overview.png)

## What Can You Do With It?

- **Camera matching for VFX** — Get exact camera positions to composite 3D elements into footage
- **Architectural visualization** — Reconstruct room dimensions from photos for accurate 3D modeling
- **Set reconstruction** — Build 3D geometry from reference photos for Blender or other 3D tools
- **Product photography** — Calibrate camera setups for consistent product shots

**Important:** Rotera is for *extracting* geometry from photos, not *designing* geometry. You mark what you see, add constraints based on what you know, and Rotera computes the rest. For actual 3D modeling, export to Blender or Fusion 360.

## How It Compares to fSpy

[fSpy](https://fspy.io/) is a great tool for single-image camera matching. Rotera extends that idea to **multiple cameras** that share geometry.

| Feature | fSpy | Rotera |
|---------|------|--------|
| Images | Single image | **Multiple linked images** |
| Camera calibration | Yes | Yes |
| Workflow | Manual vanishing points | **Constraint-based solving** |
| 3D geometry | Camera only | **Camera + reconstructed points** |
| Known measurements | Limited | **Distances, angles, coordinates, planes** |
| Export | Camera to Blender | **Camera + geometry to Blender** |

![Comparison: single vs multi-camera](screenshots/fspy-comparison.png)

---

## Core Concepts

### World Points

A **World Point** is a 3D point in your scene. It represents a real location—a corner, an edge, a feature you can identify.

![World point marked on a corner](screenshots/world-point.png)

World Points can be:
- **Free** — Position computed by the solver
- **Partially locked** — You know some coordinates (e.g., "this point is on the floor, Y=0")
- **Fully locked** — You know the exact position (e.g., "this is my origin at 0,0,0")

### Viewpoints (Cameras)

A **Viewpoint** is a camera—a photo you've loaded. Each viewpoint has:
- **Position** — Where the camera was in 3D space
- **Orientation** — Which way it was pointing
- **Focal length** — The lens zoom level
- **Principal point** — Where the optical axis hits the sensor

You don't set these directly. Instead, you mark points in the image and add constraints, and Rotera computes the camera parameters.

![Camera viewpoint with background image](screenshots/viewpoint.png)

### Image Points

An **Image Point** connects a World Point to a specific pixel location in a photo. When you click on a feature in an image, you're creating an Image Point that says "this World Point appears at this pixel."

The same World Point can have Image Points in multiple photos—that's how Rotera links cameras together.

![Image point connecting world point to pixel](screenshots/image-point.png)

### Lines

A **Line** connects two World Points. Lines are useful for:
- **Axis alignment** — Constrain a line to be parallel to X, Y, or Z axis
- **Distance constraints** — Set the length of a line
- **Visual reference** — See edges and structures in your reconstruction

![Lines connecting world points](screenshots/lines.png)

---

## The Interface

Rotera has two main views that you'll switch between as you work.

### 2D View (Image View)

This is where you mark points on your photos. Each viewpoint shows its image, and you click to place Image Points that correspond to World Points.

- Pan with **Space + drag** or middle mouse
- Zoom with **scroll wheel**
- Click to place or select points

### 3D View

See your reconstruction in 3D. Camera positions, world points, and lines are all visualized here. Use this to verify your solve looks correct.

- Rotate with **left mouse drag**
- Pan with **middle mouse drag** or **Space + drag**
- Zoom with **scroll wheel**

### Viewpoint List

The left panel shows all your loaded images (viewpoints). You can:

- **Click** to select a viewpoint
- **Resize the panel** by dragging its edge
- **Resize individual viewpoint thumbnails** for a better overview
- **Drag to reorder** viewpoints

![Interface overview](screenshots/interface-views.png)

---

## Constraints

Constraints are how you tell Rotera what you know about your scene. The solver uses them to compute everything else.

### Coordinate Locking

Lock any combination of X, Y, Z coordinates on a World Point.

**Examples:**
- Lock Y=0 for points on the floor
- Lock X=0, Y=0, Z=0 for your origin point
- Lock Z=2.4 for ceiling points (if ceiling is 2.4m high)

![Coordinate locking panel](screenshots/constraint-coordinate.png)

### Distance Constraints

Set the exact distance between two World Points.

**Examples:**
- "These two corners are 5 meters apart"
- "This doorway is 0.9m wide"

![Distance constraint between points](screenshots/constraint-distance.png)

### Axis Alignment

Constrain a Line to be parallel to a world axis.

| Direction | Meaning |
|-----------|---------|
| **X** | Horizontal, left-right |
| **Y** | Vertical, up-down |
| **Z** | Horizontal, front-back |
| **XY plane** | Line lies flat in vertical wall |
| **XZ plane** | Line lies flat on ground |
| **YZ plane** | Line lies flat in side wall |

**Examples:**
- Vertical edges of buildings → Y axis
- Floor edges → XZ plane
- Wall edges → X or Z axis

![Axis alignment options](screenshots/constraint-axis.png)

### Coplanar Points

Force multiple points to lie on the same plane.

**Examples:**
- All corners of a floor are coplanar
- Window frame corners share a plane
- Tabletop points are coplanar

![Coplanar constraint on floor points](screenshots/constraint-coplanar.png)

### Other Constraints

Rotera also supports:
- **Parallel lines** — Two lines must be parallel
- **Perpendicular lines** — Two lines must be at 90°
- **Angle constraints** — Set specific angles between lines
- **Equal distances** — Two distances must match

---

## Typical Workflow

### 1. Load Your Photos

Drag photos into Rotera or use the Add Image button. Each photo becomes a Viewpoint.

### 2. Mark Key Points

Click on identifiable features—corners, edges, distinctive marks. Each click creates a World Point and an Image Point.

### 3. Connect Across Photos

If the same feature appears in multiple photos, connect them to the same World Point. This is how Rotera links cameras together.

### 4. Add What You Know

Add constraints based on real-world knowledge:
- "This corner is my origin (0,0,0)"
- "This wall is 4 meters long"
- "These edges are vertical"

### 5. Optimize

Click Optimize. Rotera computes:
- Camera positions and orientations
- Focal lengths (if not locked)
- 3D positions of all World Points

### 6. Export to Blender

Export your project as a `.rotera` file and import it into Blender using the addon. You get:
- Calibrated cameras with background images
- 3D geometry from your World Points and Lines
- Ready for camera projection and 3D modeling

![Blender with imported Rotera project](screenshots/blender-export.png)

---

## Tips

- **Start with constraints you're confident about** — Lock your origin first, then add known distances
- **Vertical lines are powerful** — Marking vertical edges gives the solver strong information
- **More photos = better accuracy** — Shared points across multiple views improve the solve
- **Check residuals** — High residuals indicate conflicting constraints or misplaced points

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Space** | Pan view |
| **Scroll** | Zoom |
| **Delete** | Delete selected |
| **Escape** | Deselect |
| **S** | Optimize |

---

## Getting Help

- **Example projects** — Import examples from the project browser to see working setups
- **GitHub** — Report issues at [github.com/mfagerlund/Rotera](https://github.com/mfagerlund/Rotera)

Happy reconstructing!
