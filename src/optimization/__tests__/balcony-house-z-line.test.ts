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

describe.skip('Balcony House Z-Line optimization', () => {
  beforeEach(() => {
    clearOptimizationLogs();
  });

  it('should solve Z-axis line constraint with median error < 3px', () => {
    const project = loadFixture('balcony-house-z-line.json')

    // Verify the fixture has what we expect
    const lines = Array.from(project.lines)
    expect(lines.length).toBe(1)
    expect(lines[0].direction).toBe('z')
    expect(lines[0].targetLength).toBe(25)

    const result = optimizeProject(project, {
      tolerance: 1e-6,
      maxIterations: 500,
      verbose: true,
    })

    // Write logs to file for debugging
    const logPath = path.join(__dirname, 'z-line-debug-output.txt')
    fs.writeFileSync(logPath, optimizationLogs.join('\n'))

    expect(result.medianReprojectionError).toBeDefined()
    expect(result.medianReprojectionError!).toBeLessThan(3.0)
  })
})
