import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject, clearOptimizationLogs } from '../optimize-project';

describe('Late PnP Failure Detection', () => {
  const fixturePath = 'C:/Slask/NowYouSeeItNowYouDon\'t.json';

  // Skip if fixture doesn't exist
  const fixtureExists = fs.existsSync(fixturePath);

  const testFn = fixtureExists ? it : it.skip;

  testFn('should consistently solve the fixture with late PnP camera (10 runs)', () => {
    const NUM_RUNS = 10;
    const results: Array<{ success: boolean; residual: number; camerasExcluded?: string[] }> = [];

    for (let run = 0; run < NUM_RUNS; run++) {
      // Load fresh copy of fixture each time
      const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
      const project = loadProjectFromJson(fixtureJson);

      // Clear ALL optimization state to simulate the user's worst-case scenario:
      // - No inference has run
      // - Only explicitly locked points are available
      // - Cameras are at origin
      // The optimization should STILL work because resetOptimizationState
      // now explicitly calls propagateInferences()
      for (const wp of project.worldPoints) {
        (wp as any).inferredXyz = [null, null, null];
        (wp as any).optimizedXyz = undefined;
      }
      for (const vp of project.viewpoints) {
        (vp as any).position = [0, 0, 0];
        (vp as any).rotation = [1, 0, 0, 0];
      }

      clearOptimizationLogs();

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        maxIterations: 100,
        tolerance: 1e-6,
        damping: 1.0,
        verbose: false
      });

      // Check the reprojection error for C2 specifically
      let c2MaxError = 0;
      for (const vp of project.viewpoints) {
        if (vp.name === 'C2') {
          for (const ip of vp.imagePoints) {
            if (ip.lastResiduals && ip.lastResiduals.length === 2) {
              const error = Math.sqrt(ip.lastResiduals[0] ** 2 + ip.lastResiduals[1] ** 2);
              c2MaxError = Math.max(c2MaxError, error);
            }
          }
        }
      }

      // Success criteria:
      // 1. Residual should be low (< 10)
      // 2. C2 reprojection error should be reasonable (< 100 px) OR C2 should be excluded
      const isSuccess = result.residual < 10 &&
        (c2MaxError < 100 || (result.camerasExcluded && result.camerasExcluded.includes('C2')));

      results.push({
        success: isSuccess ?? false,
        residual: result.residual,
        camerasExcluded: result.camerasExcluded
      });

      console.log(`Run ${run + 1}: residual=${result.residual.toFixed(2)}, C2 max error=${c2MaxError.toFixed(1)}px, excluded=${result.camerasExcluded?.join(',') || 'none'}, success=${isSuccess}`);
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`\nSuccess rate: ${successCount}/${NUM_RUNS} (${(successCount/NUM_RUNS*100).toFixed(0)}%)`);

    // All runs should succeed
    expect(successCount).toBe(NUM_RUNS);
  });
});
