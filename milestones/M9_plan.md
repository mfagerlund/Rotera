# Milestone M9: Exporters & Plugins - Detailed Implementation Plan

## Overview
Goal: Enable interoperability with DCC/CAD tools through standardized exports and plugins.

## Sub-tasks Breakdown

### 1. glTF 2.0 Exporter (Priority 1)
- [ ] Research glTF 2.0 specification for cameras and nodes
- [ ] Implement base glTF writer class
- [ ] Export world points as nodes/empties
- [ ] Export cameras with correct transforms
- [ ] Handle coordinate system conversion (Y-up vs Z-up)
- [ ] Add optional mesh generation for visualization
- [ ] Write unit tests for glTF export
- [ ] Test import in Blender/three.js

### 2. Pictorigo JSON Exporter (Priority 1)
- [ ] Define comprehensive JSON schema v1.0
- [ ] Include full scene data (points, cameras, constraints)
- [ ] Include solve diagnostics and residuals
- [ ] Include uncertainty estimates
- [ ] Implement JSON exporter with pretty printing
- [ ] Add version tagging for future compatibility
- [ ] Write schema validation tests

### 3. Core Export Infrastructure (Priority 1)
- [ ] Create export manager class
- [ ] Implement coordinate frame converters
- [ ] Add export endpoint to API
- [ ] Support multiple format selection
- [ ] Add progress reporting for large exports
- [ ] Implement zip bundling for multi-file exports

### 4. Blender Addon (Priority 2)
- [ ] Set up Blender addon structure
- [ ] Implement glTF + JSON importer
- [ ] Create camera objects with correct FOV
- [ ] Create empties for world points
- [ ] Add UI panel for cycling cameras
- [ ] Handle background image loading
- [ ] Add constraint visualization (optional)
- [ ] Package as installable .zip

### 5. Fusion 360 Script (Priority 3)
- [ ] Research Fusion 360 API limitations
- [ ] Create construction points from world points
- [ ] Generate construction planes from constraints
- [ ] Export reference geometry/axes
- [ ] Add named point labels
- [ ] Handle unit conversion (meters to mm)
- [ ] Create installation documentation

## File Structure
```
pictorigo/core/export/
├── __init__.py
├── gltf.py          # glTF 2.0 exporter
├── json_export.py   # Pictorigo JSON exporter
├── converters.py    # Coordinate frame conversions
└── manager.py       # Export orchestration

backend/routers/
└── export.py        # API endpoints

plugins/
├── blender/
│   ├── __init__.py
│   ├── importer.py
│   ├── ui.py
│   └── README.md
└── fusion360/
    ├── pictorigo_import.py
    └── README.md
```

## Acceptance Criteria
- [ ] glTF exports import correctly in Blender
- [ ] Camera positions match within 1mm tolerance
- [ ] Reprojection error < 1px when rendering through imported cameras
- [ ] JSON exports preserve full project state
- [ ] Blender addon installs without errors
- [ ] Fusion 360 script creates correct construction geometry

## Testing Strategy
1. Create synthetic test scene with known geometry
2. Export to all formats
3. Import and verify numeric tolerances
4. Round-trip test: export → import → export → compare
5. Visual verification in target applications

## Time Estimate
- Core exporters: 2 days
- Blender addon: 1 day
- Fusion 360 script: 1 day
- Testing & refinement: 1 day
Total: ~5 days