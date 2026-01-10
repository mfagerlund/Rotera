# Rotera

**Constraint-based photogrammetry in your browser**

**[rotera.xyz](https://rotera.xyz)**

Rotera is a sparse Structure-from-Motion tool that lets you reconstruct 3D geometry from photos using geometric constraints. Think of it as fSpy, but with multiple linked cameras, shared world points, and exportable geometry.

## Features

- **Multi-camera solving** - Link multiple photos together through shared world points
- **Constraint-based reconstruction** - Use distances, angles, axis alignments, and coplanarity constraints
- **No installation required** - Runs entirely in your browser
- **Blender integration** - Import cameras, geometry, and background images for camera mapping/projection
- **Export formats** - Download `.rotera` project files for Blender, or raw geometry data

## Blender Integration

Download the Blender addon: **[rotera_importer.py](https://rotera.xyz/rotera_importer.py)**

The addon imports:
- Calibrated cameras with correct focal length, position, and orientation
- Camera background images (embedded in `.rotera` files)
- World points as mesh vertices with edges
- Point empties for easy manipulation

Perfect for **camera mapping** (projecting photos onto 3D geometry) and set reconstruction.

See [BLENDER.md](BLENDER.md) for detailed instructions.

## Quick Start

1. Visit [rotera.xyz](https://rotera.xyz)
2. Load a photo and mark key points (corners, edges)
3. Add constraints (distances, axis alignments)
4. Solve to compute camera pose and 3D positions
5. Export to Blender for camera mapping

## Core Concepts

| Concept | Description |
|---------|-------------|
| **World Point (WP)** | A 3D point that can be observed in multiple images |
| **Image Point (IP)** | A 2D observation linking a world point to a pixel |
| **Viewpoint** | A camera with intrinsics and pose |
| **Constraint** | Geometric relationships: distances, angles, alignments |

## Constraints

- **Known coordinates** - Fix any subset of {x, y, z} for a point
- **Distance** - Exact distance between two points
- **Axis alignment** - Line parallel to X, Y, or Z axis
- **Coplanarity** - Points on a shared plane
- **Angles** - Angles between lines

## Example Workflow

1. Load a photo of a room. Mark a corner as the origin (0, 0, 0).
2. Mark another floor corner; constrain it to be 5m away along the X-axis.
3. Mark ceiling points; constrain them to be vertical from floor points.
4. Add a second photo with overlapping points.
5. Solve - Rotera computes camera poses and refines all 3D positions.
6. Export to Blender. Set up camera projection for photorealistic renders.

## Technical Details

- Built with React, TypeScript, and MobX
- Uses [ScalarAutograd](https://github.com/mfagerlund/ScalarAutograd) for automatic differentiation
- Nonlinear least squares optimization with Levenberg-Marquardt
- Two-camera initialization via 7-point/8-point algorithms
- Single-camera initialization via PnP when world points are known

## Run Locally

```bash
npm install
npm run dev  # http://localhost:5173
```

## Development

```bash
npm run dev        # Start dev server
npm test           # Run tests
npm run build      # Production build
bash check.sh      # Run all checks (types, tests, lint)
```

## License

MIT
