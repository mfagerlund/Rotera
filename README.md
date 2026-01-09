# Rotera

**Constraint-based photogrammetry in your browser**

**Live at [rotera.xyz](https://rotera.xyz)**

Rotera is a sparse Structure-from-Motion tool that lets you reconstruct 3D geometry from photos using geometric constraints. Think of it as fSpy, but with multiple linked cameras, shared world points, and exportable geometry.

## What it does

- Load photos and mark corresponding points across images
- Add geometric constraints: distances, axis alignments, coplanarity, angles
- Solve camera poses and 3D point positions automatically
- Export geometry for use in Blender, CAD, or other tools

## Quick Start

Visit [rotera.xyz](https://rotera.xyz) to use it directly in your browser - no installation required.

### Run locally

```bash
npm install
npm run dev  # http://localhost:5173
```

## Core Concepts

- **World Point (WP):** A 3D point that can be observed in multiple images
- **Image Point (IP):** A 2D observation linking a world point to a pixel in a photo
- **Viewpoint:** A camera with intrinsics and pose (position + orientation)
- **Constraint:** Geometric relationships like distances, angles, or alignments

## Example Workflow

1. Load a photo of a room. Mark a corner as the origin (0, 0, 0).
2. Mark another floor corner; constrain it to be 5m away along the X-axis.
3. Mark ceiling points; constrain them to be vertical from floor points.
4. Add a second photo with overlapping points.
5. Solve - Rotera computes camera poses and refines all 3D positions.

## Constraints

- **Known coordinates:** Fix any subset of {x, y, z} for a point
- **Distance:** Set exact distance between two points
- **Axis alignment:** Constrain a line to be parallel to X, Y, or Z axis
- **Coplanarity:** Force points to lie on a shared plane
- **Angles:** Set angles between lines
- **And more...**

## Technical Details

- Runs entirely in-browser (no server required)
- Built with React, TypeScript, and MobX
- Uses [ScalarAutograd](https://github.com/mfagerlund/ScalarAutograd) for automatic differentiation
- Nonlinear least squares optimization with Levenberg-Marquardt
- Two-camera initialization via 7-point/8-point algorithms
- Single-camera initialization via PnP when world points are known

## Development

```bash
npm run dev        # Start dev server
npm test           # Run tests
npm run build      # Production build
bash check.sh      # Run all checks (types, tests, lint)
```

## License

MIT
