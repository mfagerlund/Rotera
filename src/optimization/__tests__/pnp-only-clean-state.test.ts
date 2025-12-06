/**
 * Test that PnP-only initialization works from completely clean state.
 *
 * This test addresses the concern:
 * "Sometimes when I've used no vanishing lines and gone to using vanishing lines,
 *  it's kept some data and succeeded to solve where it would actually have failed
 *  if I never ever had the vanishing lines."
 *
 * This test proves that PnP works purely from lockedXyz/inferredXyz coordinates,
 * NOT from stale optimizedXyz values left over from previous VP-based solves.
 *
 * Key insight: The optimization pipeline:
 * 1. Calls resetOptimizationState() which clears inferredXyz, then runs propagateInferences()
 * 2. Sets optimizedXyz = getEffectiveXyz() for constrained points BEFORE PnP runs
 * 3. PnP uses only points where isFullyConstrained() && optimizedXyz exists
 *
 * So the data flow is: lockedXyz + inferredXyz → getEffectiveXyz() → optimizedXyz → PnP
 * NOT: stale optimizedXyz from file → PnP
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { loadProjectFromJson, saveProjectToJson } from '../../store/project-serialization';
import { optimizeProject, resetOptimizationState } from '../optimize-project';
import { Viewpoint } from '../../entities/viewpoint';
import { WorldPoint } from '../../entities/world-point';

function loadFixture(filename: string) {
  const fixturePath = path.join(__dirname, 'fixtures', filename);
  const json = fs.readFileSync(fixturePath, 'utf-8');
  return loadProjectFromJson(json);
}

describe('PnP-only initialization from clean state', () => {
  it('should work WITHOUT vanishing lines when constrained points have lockedXyz', () => {
    // Load ShouldBeSimple.json and REMOVE all vanishing lines
    const project = loadFixture('ShouldBeSimple.json');

    // STEP 1: Remove all vanishing lines to force PnP-only initialization
    const camera = Array.from(project.viewpoints)[0] as Viewpoint;
    const initialVLCount = camera.vanishingLines.size;
    expect(initialVLCount).toBeGreaterThan(0); // Confirm fixture has VLs

    // Remove all vanishing lines
    for (const vl of Array.from(camera.vanishingLines)) {
      camera.removeVanishingLine(vl);
    }
    expect(camera.vanishingLines.size).toBe(0);
    expect(camera.canInitializeWithVanishingPoints(new Set(project.worldPoints))).toBe(false);

    // STEP 2: Clear ALL optimizedXyz to simulate completely fresh state
    // This is the key test: we're proving PnP doesn't need pre-existing optimizedXyz
    for (const wp of project.worldPoints) {
      const point = wp as WorldPoint;
      point.optimizedXyz = undefined;
    }

    // Verify no points have optimizedXyz
    const pointsWithOptimized = Array.from(project.worldPoints).filter(
      wp => (wp as WorldPoint).optimizedXyz !== undefined
    );
    expect(pointsWithOptimized.length).toBe(0);

    // STEP 3: Verify we have enough constrained points for PnP (needs 3+)
    const constrainedPoints = Array.from(project.worldPoints).filter(
      wp => (wp as WorldPoint).isFullyConstrained()
    );
    console.log(`Constrained points: ${constrainedPoints.map(p => p.name).join(', ')}`);
    expect(constrainedPoints.length).toBeGreaterThanOrEqual(3);

    // STEP 4: Run optimization
    const result = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      maxIterations: 100,
      tolerance: 1e-6,
      verbose: false,
    });

    console.log('PnP-only optimization result:', {
      converged: result.converged,
      iterations: result.iterations,
      residual: result.residual,
      medianReprojectionError: result.medianReprojectionError,
      error: result.error,
      camerasInitialized: result.camerasInitialized,
    });

    // STEP 5: Verify PnP initialized the camera (not at origin)
    console.log(`Camera ${camera.name}: position=[${camera.position.map(x => x.toFixed(2)).join(', ')}]`);
    const distFromOrigin = Math.sqrt(
      camera.position[0] ** 2 + camera.position[1] ** 2 + camera.position[2] ** 2
    );
    expect(distFromOrigin).toBeGreaterThan(10); // Camera should be far from origin

    // STEP 6: Verify constrained points now have optimizedXyz (set during optimization)
    for (const wp of constrainedPoints) {
      const point = wp as WorldPoint;
      expect(point.optimizedXyz).toBeDefined();
      console.log(`  ${point.name}: optimizedXyz=[${point.optimizedXyz?.map(x => x.toFixed(2)).join(', ')}]`);
    }

    // STEP 7: Verify reasonable reprojection error
    // With manual clicking, 60px is acceptable
    expect(result.medianReprojectionError).toBeDefined();
    expect(result.medianReprojectionError!).toBeLessThan(60);

    // The key assertion: camera was initialized WITHOUT vanishing lines
    expect(result.camerasInitialized).toContain(camera.name);
  });

  it('should produce same result whether or not fixture had pre-populated optimizedXyz', () => {
    // This test proves that pre-existing optimizedXyz doesn't affect the result
    // because it gets overwritten during initialization

    // First run: start with clean optimizedXyz
    const projectClean = loadFixture('ShouldBeSimple.json');
    const cameraClean = Array.from(projectClean.viewpoints)[0] as Viewpoint;

    // Remove vanishing lines
    for (const vl of Array.from(cameraClean.vanishingLines)) {
      cameraClean.removeVanishingLine(vl);
    }

    // Clear all optimizedXyz
    for (const wp of projectClean.worldPoints) {
      (wp as WorldPoint).optimizedXyz = undefined;
    }

    const resultClean = optimizeProject(projectClean, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      maxIterations: 100,
      tolerance: 1e-6,
      verbose: false,
    });

    // Second run: start WITH pre-populated optimizedXyz (as if from previous solve)
    const projectDirty = loadFixture('ShouldBeSimple.json');
    const cameraDirty = Array.from(projectDirty.viewpoints)[0] as Viewpoint;

    // Remove vanishing lines
    for (const vl of Array.from(cameraDirty.vanishingLines)) {
      cameraDirty.removeVanishingLine(vl);
    }

    // Keep existing optimizedXyz (the fixture has them)
    const dirtyPoints = Array.from(projectDirty.worldPoints).filter(
      wp => (wp as WorldPoint).optimizedXyz !== undefined
    );
    console.log(`Dirty run: ${dirtyPoints.length} points have pre-existing optimizedXyz`);

    const resultDirty = optimizeProject(projectDirty, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      maxIterations: 100,
      tolerance: 1e-6,
      verbose: false,
    });

    console.log('Clean run:', {
      medianError: resultClean.medianReprojectionError?.toFixed(2),
      position: cameraClean.position.map(x => x.toFixed(2)).join(', '),
    });
    console.log('Dirty run:', {
      medianError: resultDirty.medianReprojectionError?.toFixed(2),
      position: cameraDirty.position.map(x => x.toFixed(2)).join(', '),
    });

    // Both should succeed
    expect(resultClean.camerasInitialized).toContain(cameraClean.name);
    expect(resultDirty.camerasInitialized).toContain(cameraDirty.name);

    // Both should have similar (sub-60px) error
    expect(resultClean.medianReprojectionError!).toBeLessThan(60);
    expect(resultDirty.medianReprojectionError!).toBeLessThan(60);

    // Camera positions should be very similar (within 5 units)
    // This proves the pre-existing optimizedXyz didn't corrupt the result
    const posDiff = Math.sqrt(
      (cameraClean.position[0] - cameraDirty.position[0]) ** 2 +
      (cameraClean.position[1] - cameraDirty.position[1]) ** 2 +
      (cameraClean.position[2] - cameraDirty.position[2]) ** 2
    );
    console.log(`Position difference between clean and dirty runs: ${posDiff.toFixed(2)} units`);
    expect(posDiff).toBeLessThan(5);
  });
});
