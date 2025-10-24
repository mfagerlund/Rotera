Here’s a robust, minimal-drama way to seed a hand-picked SfM:

1. Intrinsics first

* Undistort images.
* Initialize fx, fy from EXIF (35 mm equivalent → pixels), set cx, cy to image center, k1…k2 = 0.
* Normalize pixels (Hartley): shift by (cx,cy), scale so mean |x| ≈ 1. This stabilizes everything.

2. Choose a seed pair

* Build a match graph (your hand points → consistent IDs).
* For several candidate pairs, estimate E with five-point + RANSAC. Keep the pair with: many inliers, wide baseline (large median triangulation angle), low residual.
* Reject near-planar pairs (homography wins over essential → skip).

3. Fix the gauge

* Set camera 1: R₁ = I, t₁ = 0.
* Recover (R₂, t₂) from E; pick the cheirality-correct solution (most points with positive depth in both views).
* Set scale: ‖t₂‖ = 1 (arbitrary) or make median depth ≈ 1. You’ll set absolute scale later from a known distance or stereo baseline.

4. Triangulate seed points

* Linear triangulation (DLT), then refine by reprojection error.
* Keep only points with: reproj < 1–2 px (normalized coords), and parallax angle > 1.5–5°.
* Drop anything behind either camera or with huge uncertainty.

5. Local bundle adjustment (BA)

* BA on {cam1, cam2, seeded points}.
* Use robust loss (Huber/Cauchy).
* Hold intrinsics fixed for the first BA or only let fx,fy move a little; keep distortion frozen.

6. Grow incrementally (standard incremental SfM)
   For each new image k:
   a) Pose init via RANSAC-PnP (P3P/EPnP) using already-triangulated points visible in k.
   b) Triangulate new points from k with any earlier view giving good baseline.
   c) Local BA on {cam k, its neighbors, affected points}.
   d) Occasional global BA after a few additions.

7. Keep it clean

* Enforce cheirality every step.
* Cull points with low viewing angle, high reproj error, or seen in <2–3 views.
* Prefer quaternions/Rodrigues for rotations; re-orthonormalize R after updates.
* If intrinsics are uncertain, release fx,fy (then cx,cy), finally k1…k2 gradually in later BA.

8. Add absolute scale (optional)

* One known distance, object, or GPS/IMU baseline sets meters; rescale all t and point depths accordingly.

9. Useful thresholds (good starters)

* RANSAC: 1–2 px threshold in undistorted pixels.
* Parallax: > 3° preferred, > 1.5° minimal.
* BA robust loss: Huber δ ≈ 1–2 px.

Tiny blueprint (pseudocode):

```
init_intrinsics()
pair = pick_best_pair(matches)
P1 = [I|0]; P2 = pose_from_E(pair)
X = triangulate_inliers(P1,P2)
X = filter_by_parallax_and_error(X)
BA({P1,P2}, X, fix_intrinsics=True)

for img in remaining_images:
    Pk = ransac_pnp(Xvisible_in_img)
    newX = triangulate_with_good_baselines(Pk, previous_P)
    localBA({Pk, neighbors}, affected_points, robust_loss)
    periodic_global_BA(release_intrinsics_gradually)
```

If your trouble is specifically “poor initialization,” the highest-leverage fixes are: pick a truly wide-baseline seed pair, normalize coordinates, freeze intrinsics early, and run a tight local BA before you add a third view.
