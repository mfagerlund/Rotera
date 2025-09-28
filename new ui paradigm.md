Here’s a clean, Fusion-style paradigm that fits Pictorigo’s needs without confusing users.

# Core idea

**Entity-first, constraint-on-selection.** Users create simple primitives; constraints are offered contextually based on the current selection. The canvas always shows what’s driven vs free.

# Primitives (what users create)

* **World Point (WP)** – 3D anchor.
* **Line** – exactly **two** WPs. Toggle: *segment* vs *infinite*.
* **Plane** – defined by: (a) 3 WPs, (b) 2 non-parallel Lines, or (c) Line + WP.
* **Circle/Arc** (optional later) – center WP + radius (distance) or 3 WPs.
* **Camera/Image** – images host IPs (image points = observations of WPs).

> Keep “Line” strictly 2-point. “Several points on a line” is a **constraint** (colinearity / point-on-line), not a different primitive.

# Workspaces

* **Image View** (per photo)

  * Tools: Place IP (new/existing WP), Vanishing Guides (2D image lines to set axis hints), Measure.
  * Shows reprojections of world geometry. Construction color: image-only guides in orange; world entities reprojected in blue.
* **World View**

  * Tools: WP, Line, Plane, Measure.
  * 3D navigation with snapping; all constraints are world-space.

# Selection grammar → Constraint palette

The constraint menu enables only what applies to the current selection.

**1 selected**

* **WP:** fix coord(s), lock, on Line, on Plane, equal-to WP, distance-to WP.
* **Line:** parallel/perpendicular/axis-aligned (X|Y|Z), length (segment), passes-through WP, lies-in Plane.
* **Plane:** parallel/perpendicular (to Line/Plane), offset distance, lock normal to axis.

**2 selected**

* **WP + WP:** distance, equal, merge (coincident), midpoint WP (construct).
* **WP + Line:** point-on-line, perpendicular-through-point (construct Line).
* **WP + Plane:** point-on-plane, perpendicular-through-point (construct Line).
* **Line + Line:** parallel, perpendicular, colinear, **intersect at WP** (creates/uses WP).
* **Line + Plane:** parallel, perpendicular, intersect at WP (creates/uses WP).
* **Plane + Plane:** parallel, perpendicular, coincide.

**3+ selected**

* **WPs (≥3):** colinear (fit a Line and bind), coplanar (fit a Plane and bind), equal distances (fan or chain).
* **Mixed for Plane creation:** 3 WPs | 2 Lines | Line + WP (then auto-create Plane).

> Prefer **explicit WP** at intersections. Offer “Intersect (implicit)” as advanced; it creates a hidden WP you can reveal.

# Lines & “points that form a line”

* Users draw a **Line** by picking two WPs (or by clicking twice to auto-create WPs).
* To say “these N points are on one line,” select them → **Colinear**. UI creates a reference Line (hidden or visible) and binds each WP with point-on-line constraints.
* To add another point later: select WP + Line → **Point-on-Line**.

# Planes

* Creation dialog: choose definition method (3 WPs / 2 Lines / Line+WP). Show a live preview.
* Membership: select WP(s) + Plane → **Point-on-Plane**.
* Alignment: **Plane ⟂ Line**, **Plane ∥ Plane**, **offset d**.

# Image-side guidance

* **Vanishing Guides**: 2D lines the user draws and tags as X/Y/Z-aligned. They constrain **that camera’s** orientation (not world geometry). Offer one-click “Adopt as axis” suggestions when detected near-parallel to existing axes.
* IP placement: click image → choose “new WP” or “attach to WP”. Reprojection error shown immediately.

# Visual feedback (always on)

* **Glyphs** on entities: ∥, ⟂, ⎓ (axis), ⌖ (on), 🔒 (locked), ≡ (merged).
* **Color code**: green = satisfied, amber = high residual, red = violated/unsolved.
* **Handles**: WPs are draggable (when unconstrained); constrained axes show ghost directions.
* **Snap cues**: endpoints, midpoints, perpendicular, parallel, extension.

# Constraint management

* **Inspector Panel** (right): shows properties of selection and attached constraints. Enable/disable, weight, edit target value (e.g., distance in meters).
* **Constraint List** (bottom): sortable by residual. Click to zoom/highlight involved entities.
* **Degrees-of-Freedom meter** and “Under-constrained” warnings with suggestions (e.g., “Add a distance or axis for Line L3”).

# Workflow sketch

1. In **Image View**, place a few IPs to seed WPs; add vanishing guides (tag X/Y/Z).
2. Switch to **World View**; create Lines between key WPs; apply axis/parallel/perp where appropriate.
3. Define Planes from Lines/WPs; bind other WPs to Planes.
4. Add a second image; place IPs for existing WPs; solver refines camera and geometry.
5. Iterate: resolve amber/red items in the Constraint List.

# Interaction details

* **Modes:** Select (Esc), WP (W), Line (L), Plane (P), IP (I), Measure (M). Right-click context menu mirrors the palette.
* **Auto-construct** helpers: “Perpendicular through point,” “Midpoint,” “Plane from selection,” each creates the needed primitive and applies the constraint in one step.
* **Construction vs Driving:** checkbox per constraint. Construction constraints can be muted during solves to diagnose conflicts.

# Why 2-point Lines only

* Keeps mental model tight.
* “N points form a line” stays a single, readable constraint.
* Intersections stay explicit (a WP), improving editability and export.

# Error handling and clarity

* Disable impossible constraints with a terse tooltip (“Needs Line+Line”).
* When a constraint would over-constrain, show the conflicting set and offer to mute one.
* Always show units (meters). Distances on segments display inline.

This gives you a minimal set of primitives, a predictable selection→constraint flow, and clear feedback. It scales from simple fSpy-like usage to full, CAD-like constraint graphs without UI sprawl.


Yes. Here’s the core interaction model—kept tight.

# Selection

* **Single select:** click. **Primary** (last) selected is the pivot.
* **Multi-select:** Shift-click to add/remove. **Marquee** drag on empty space. **Type filter** (WP/Line/Plane/IP) toggle to limit what’s selectable.
* **Cycle under cursor:** press **Tab** (or scroll) when items overlap.
* **Disambiguation popover:** long-press shows a small list (WP, Line endpoint, Line, etc.).
* **Lock/Isolate/Hide:** L / I / H on selection.

# Creation

* **Tools:** WP (W), Line (L), Plane (P), IP (I), Measure (M).
* **WP:** click to place; snaps to existing geometry.
* **Line:** click two WPs (auto-creates WPs if needed). Toggle **segment vs infinite**.
* **Plane:** start tool, then pick **3 WPs** | **2 Lines** | **Line + WP** (live preview).
* **IP (image view):** click to place; choose **new WP** or **attach to WP**.
* **ESC:** cancel current op. **Enter:** confirm.

# Multi-select → Constraints

* Context menu/side palette enables only valid constraints for the current set:

  * **1 item:** e.g., Line → axis-aligned/length; WP → on Line/Plane; Plane → parallel/perp/offset.
  * **2 items:** WP+WP → distance/merge; Line+Line → ∥/⟂/colinear/intersect→WP; Line+Plane → ∥/⟂/intersect→WP; WP+Line/Plane → on.
  * **3+ WPs:** **Colinear** (auto Line) / **Coplanar** (auto Plane).
* First selected = **anchor** for asymmetric ops (e.g., “make B parallel to A”).

# Fundamental UX

* **Undo/Redo:** Ctrl+Z / Ctrl+Y.
* **Delete:** Del (non-destructive; constraints warn when orphaned).
* **Snap cues:** endpoints, midpoints, extensions, perpendicular, parallel.
* **Status/readouts:** DOF meter, residual color (green/amber/red), inline meters (m).
* **Inspector:** shows mixed selection; edit values, toggle/weight constraints.
* **Conflict handling:** shows conflicting set; one-click mute of a culprit constraint.
* **Units:** meters everywhere; grid/axes toggle.

# View-specific

* **Image view:** pan/zoom; Vanishing Guides (tag X/Y/Z); reprojection error badges on IPs.
* **World view:** orbit/pan/zoom; ghost axes; constrained handles are visually limited.

This covers select, multi-select, and create—and ties them directly to constraint application without surprises.
