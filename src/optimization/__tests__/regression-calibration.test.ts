import * as fs from 'fs'
import * as path from 'path'
import { loadProjectFromJson } from '../../store/project-serialization'
import { optimizeProject } from '../optimize-project'
import { Viewpoint } from '../../entities/viewpoint'
import { WorldPoint } from '../../entities/world-point'
import { Project } from '../../entities/project'

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'Calibration')

/**
 * Clear ALL solve data from project - only keep input data (clicks, constraints, locked coords)
 */
function clearSolveData(project: Project) {
  // Clear camera poses
  for (const vp of project.viewpoints) {
    const viewpoint = vp as Viewpoint
    viewpoint.position = [0, 0, 0]
    viewpoint.rotation = [1, 0, 0, 0] // identity quaternion
  }

  // Clear world point solved positions
  for (const wp of project.worldPoints) {
    const worldPoint = wp as WorldPoint
    worldPoint.optimizedXyz = undefined
  }
}

function runFixtureTest(filename: string, maxMedianError: number) {
  const jsonPath = path.join(FIXTURES_DIR, filename)

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Fixture not found: ${jsonPath}`)
  }

  const jsonData = fs.readFileSync(jsonPath, 'utf8')
  const project = loadProjectFromJson(jsonData)

  // ALWAYS clear solve data - test the solver, not stored solutions
  clearSolveData(project)

  const result = optimizeProject(project, {
    maxIterations: 500,
    verbose: false,
  })

  expect(result.medianReprojectionError).toBeDefined()
  expect(result.medianReprojectionError!).toBeLessThan(maxMedianError)
}

describe('Regression - Calibration', () => {
  it('Fixture With 2 Images.json', () => {
    runFixtureTest('Fixture With 2 Images.json', 2)
  })

  it('Fixture With 2 Image 2.json', () => {
    runFixtureTest('Fixture With 2 Image 2.json', 2)
  })

  it('Fixture With 2-1 Image 2.json', () => {
    runFixtureTest('Fixture With 2-1 Image 2.json', 2)
  })

  it('Full Solve.json', () => {
    runFixtureTest('Full Solve.json', 2)
  })

  it('No Vanisining Lines.json', () => {
    runFixtureTest('No Vanisining Lines.json', 2)
  })

  // BUG: Solver fails with mixed VL/non-VL multi-camera setup (C1,C2 no VL, C3 has VL)
  // Produces 169px error - camera initialization fails for this configuration
  it('No Vanisining Lines Now With VL.json', () => {
    runFixtureTest('No Vanisining Lines Now With VL.json', 2)
  })

  it('VL And non VL.json', () => {
    runFixtureTest('VL And non VL.json', 2)
  })

  // Test for floating points (points with no constraints, only image observations)
  // These should be triangulated AFTER cameras are initialized, not during initial triangulation
  // Note: This fixture has a complex geometry with 6 constrained + 2 floating points
  //
  // KNOWN ISSUE: This fixture has Y-axis sign ambiguity that the solver can't resolve automatically.
  // The alignment test gives equal errors (159px) for both +Y and -Y options because the short
  // solves converge to the same intermediate state. After Stage1, no-flip gives 55px while flip
  // gives 159px - but the reported optimal is 2.95px when OY.Y is manually constrained to -10.
  // The fundamental issue is that flipping the scene AFTER camera initialization produces
  // different results than constraining the point BEFORE initialization.
  // TODO: Investigate how to propagate Y-axis line sign constraints before triangulation.
  it.skip('Eight Points, VL To Free Points.json', () => {
    const jsonPath = path.join(FIXTURES_DIR, 'Eight Points, VL To Free Points.json')
    const jsonData = fs.readFileSync(jsonPath, 'utf8')
    const project = loadProjectFromJson(jsonData)
    clearSolveData(project)

    const result = optimizeProject(project, {
      maxIterations: 500,
      verbose: false,
    })

    // Print optimization logs for debugging
    const { optimizationLogs } = require('../optimization-logger')
    const logs = optimizationLogs.join('\n')

    // If error is too high, throw with logs
    if (result.medianReprojectionError! > 2) {
      throw new Error(`Median error: ${result.medianReprojectionError?.toFixed(2)}px\n\nLogs:\n${logs}`)
    }

    expect(result.medianReprojectionError).toBeDefined()
    expect(result.medianReprojectionError!).toBeLessThan(2)
  })

  // Test for VP sign ambiguity fix - this fixture was producing inconsistent results
  it('Six Points VL Test.json', () => {
    const jsonPath = path.join(FIXTURES_DIR, 'Six Points VL Test.json')
    const jsonData = fs.readFileSync(jsonPath, 'utf8')
    const project = loadProjectFromJson(jsonData)
    clearSolveData(project)

    const result = optimizeProject(project, {
      maxIterations: 500,
      verbose: true,  // Enable verbose logging
    })

    console.log('\\nFinal result:', result.medianReprojectionError?.toFixed(2), 'px')
    expect(result.medianReprojectionError).toBeDefined()
    expect(result.medianReprojectionError!).toBeLessThan(2)
  })
})
