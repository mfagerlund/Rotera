import { describe, it, expect } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import { loadProjectFromJson } from '../../store/project-serialization'
import { optimizeProject } from '../optimize-project'

function loadFixture(filename: string) {
  const fixturePath = path.join(__dirname, 'fixtures', filename)
  const jsonContent = fs.readFileSync(fixturePath, 'utf-8')
  return loadProjectFromJson(jsonContent)
}

describe('Balcony House optimization', () => {
  it('should optimize deterministically with low reprojection error', () => {
    const project = loadFixture('balcony-house.json')

    // Run optimization
    const result = optimizeProject(project, {
      tolerance: 1e-6,
      maxIterations: 400,
      verbose: true,
    })

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

  it('should be deterministic - multiple runs produce same result', () => {
    // Run 1
    const project1 = loadFixture('balcony-house.json')
    const result1 = optimizeProject(project1, {
      tolerance: 1e-6,
      maxIterations: 400,
      verbose: false,
    })

    // Run 2
    const project2 = loadFixture('balcony-house.json')
    const result2 = optimizeProject(project2, {
      tolerance: 1e-6,
      maxIterations: 400,
      verbose: false,
    })

    // Results should be identical
    expect(result1.residual).toBeCloseTo(result2.residual, 6)
    expect(result1.medianReprojectionError).toBeCloseTo(result2.medianReprojectionError!, 6)
  })
})
