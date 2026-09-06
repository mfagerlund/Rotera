---
oneliner: Browser-based constraint photogrammetry tool that reconstructs 3D geometry and camera poses from photos
tags: [photogrammetry, structure-from-motion, 3d-reconstruction, camera-calibration, blender, constraint-solving, react, typescript, mobx, vanishing-points]
stack: [React, TypeScript, MobX, Vite]
generated: 2026-09-06
commit: 2c0eb98
placeholder: false
---
Rotera is a sparse structure-from-motion tool (like fSpy, but multi-camera) that lets users mark points on photos, add geometric constraints (distances, axis alignments, coplanarity, angles), and solve for camera poses and 3D world points via Levenberg-Marquardt optimization. It exports to Blender for camera mapping and set reconstruction. The project is actively developed and working, with a live deployment at rotera.xyz, a Blender importer addon, and a substantial passing test suite.
