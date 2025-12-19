import { describe, it, expect, beforeEach } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import { loadProjectFromJson } from '../../store/project-serialization'
import { optimizeProject, clearOptimizationLogs } from '../optimize-project'

function loadFixture(filename: string) {
  const fixturePath = path.join(__dirname, 'fixtures', filename)
  const jsonContent = fs.readFileSync(fixturePath, 'utf-8')
  return loadProjectFromJson(jsonContent)
}

describe('Balcony House X-Line optimization', () => {
  beforeEach(() => {
    clearOptimizationLogs();
  });

  it('should solve X-axis line constraint with median error < 3px', () => {
    const project = loadFixture('balcony-house-x-line.json')

    const result = optimizeProject(project, {
      tolerance: 1e-6,
      maxIterations: 500,
      verbose: false,
    })

    console.log(`[X Line] Median: ${result.medianReprojectionError?.toFixed(2)}px, Converged: ${result.converged}`)

    expect(result.medianReprojectionError).toBeDefined()
    expect(result.medianReprojectionError!).toBeLessThan(3.0)
  })
})
