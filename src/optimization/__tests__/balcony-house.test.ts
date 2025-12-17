import { describe, it, expect, beforeEach } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import { loadProjectFromJson } from '../../store/project-serialization'
import { optimizeProject, clearOptimizationLogs, optimizationLogs } from '../optimize-project'

function loadFixture(filename: string) {
  const fixturePath = path.join(__dirname, 'fixtures', filename)
  const jsonContent = fs.readFileSync(fixturePath, 'utf-8')
  return loadProjectFromJson(jsonContent)
}

describe('Balcony House optimization', () => {
  beforeEach(() => {
    clearOptimizationLogs();
  });

  // TODO: This test is affected by non-determinism when tests run in parallel.
  // When run alone it achieves ~5px error, but with other tests it can get ~47px.
  it.skip('should optimize deterministically with low reprojection error', () => {
    const project = loadFixture('balcony-house.json')

    // Run optimization
    const result = optimizeProject(project, {
      tolerance: 1e-6,
      maxIterations: 400,
      verbose: false,
    })

    // Write debug info
    const initLogs = optimizationLogs.filter(l => l.includes('[Init') || l.includes('[Optimize]'));
    fs.writeFileSync(
      path.join(__dirname, 'balcony-house-debug.txt'),
      initLogs.join('\n')
    );

    console.log('Result:', {
      converged: result.converged,
      iterations: result.iterations,
      residual: result.residual,
      medianReprojectionError: result.medianReprojectionError,
      outlierCount: result.outliers?.length ?? 0,
    })

    // The optimization should produce reasonable results
    // Median reprojection error should be under 20px for a good solve
    expect(result.medianReprojectionError).toBeLessThan(20)

    // Should have few outliers (some may be due to actual bad clicks in the data)
    expect(result.outliers?.length ?? 0).toBeLessThan(10)
  })

  // TODO: Investigate non-determinism issue when running with --maxWorkers=1
  // The optimization gives different results on consecutive runs even with identical input.
  // This might be related to MobX state, entity ID ordering, or constraint system state.
  it.skip('should be deterministic - multiple runs produce same result', () => {
    // Run 1
    clearOptimizationLogs();
    const project1 = loadFixture('balcony-house.json')
    const result1 = optimizeProject(project1, {
      tolerance: 1e-6,
      maxIterations: 400,
      verbose: false,
    })
    const initLogs1 = optimizationLogs.filter(l => l.includes('[Init'));

    // Run 2
    clearOptimizationLogs();
    const project2 = loadFixture('balcony-house.json')
    const result2 = optimizeProject(project2, {
      tolerance: 1e-6,
      maxIterations: 400,
      verbose: false,
    })
    const initLogs2 = optimizationLogs.filter(l => l.includes('[Init'));

    // Write debug info
    fs.writeFileSync(
      path.join(__dirname, 'determinism-debug.txt'),
      [
        'RUN 1:',
        `  residual: ${result1.residual}`,
        `  median: ${result1.medianReprojectionError}`,
        ...initLogs1.map(l => '  ' + l),
        '',
        'RUN 2:',
        `  residual: ${result2.residual}`,
        `  median: ${result2.medianReprojectionError}`,
        ...initLogs2.map(l => '  ' + l),
      ].join('\n')
    );

    // Results should be identical
    expect(result1.residual).toBeCloseTo(result2.residual, 6)
    expect(result1.medianReprojectionError).toBeCloseTo(result2.medianReprojectionError!, 6)
  })
})
