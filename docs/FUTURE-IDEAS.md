# Future Development Ideas

Ideas for future development, not currently planned.

## ArUco / OpenCV Marker Support

**Priority:** High value for the right use case

Add support for ArUco markers (OpenCV's fiducial markers) that automatically provide XYZ coordinates in images.

**Why it's a great fit:**
- Markers give precise, known 3D positions automatically
- Perfect for situations where you're photographing something locally (product photography, small objects, room scanning)
- Could dramatically simplify setup - just place markers, take photos, auto-detect points

**Limitations:**
- Less useful for architecture (would need HUGE printed markers)
- Requires physical marker placement (not applicable to existing photos)

**Implementation notes:**
- OpenCV.js exists for browser-based detection
- ArUco markers encode their ID, so matching across images is automatic
- Could auto-create WorldPoints at marker corners with known relative positions
