import * as fs from 'fs'
import * as path from 'path'
import { loadProjectFromJson } from '../../store/project-serialization'
import { optimizeProject, OptimizeProjectOptions } from '../optimize-project'
import { optimizationLogs } from '../optimization-logger'

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'Calibration')

// Fast tests: single attempt, quick convergence expected
async function runFixtureTest(filename: string, maxMedianError: number) {
  await runTest(filename, maxMedianError, {
    maxIterations: 500,
    maxAttempts: 1,
    verbose: false
  })
}

// Challenging tests: need multiple attempts to escape local minima
async function runChallengingTest(filename: string, maxMedianError: number) {
  await runTest(filename, maxMedianError, {
    maxIterations: 500,
    maxAttempts: 3,
    verbose: false
  })
}

async function runTest(filename: string, maxMedianError: number, options: OptimizeProjectOptions, showLogs = false) {
  const jsonPath = path.join(FIXTURES_DIR, filename)

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Fixture not found: ${jsonPath}`)
  }

  const jsonData = fs.readFileSync(jsonPath, 'utf8')
  const project = loadProjectFromJson(jsonData)

  const result = await optimizeProject(project, options)

  if (showLogs || result.medianReprojectionError! >= maxMedianError) {
    console.log('\n=== Optimization Logs ===')
    for (const log of optimizationLogs) {
      console.log(log)
    }
    console.log('=========================\n')
  }

  expect(result.medianReprojectionError).toBeDefined()
  expect(result.medianReprojectionError!).toBeLessThan(maxMedianError)
}

describe('Regression - Calibration', () => {
  it('Fixture With 2 Images.json', async () => {
    await runFixtureTest('Fixture With 2 Images.json', 2)
  })

  it('Fixture With 2 Image 2.json', async () => {
    await runFixtureTest('Fixture With 2 Image 2.json', 2)
  })

  it('Fixture With 2-1 Image 2.json', async () => {
    await runFixtureTest('Fixture With 2-1 Image 2.json', 2)
  })

  it('Full Solve.json', async () => {
    await runFixtureTest('Full Solve.json', 2)
  })

  // Challenging: no vanishing points for guidance, needs multiple attempts
  it('No Vanisining Lines.json', async () => {
    await runChallengingTest('No Vanisining Lines.json', 2)
  })

  it('No Vanisining Lines Now With VL.json', async () => {
    await runFixtureTest('No Vanisining Lines Now With VL.json', 2)
  })

  it('VL And non VL.json', async () => {
    await runFixtureTest('VL And non VL.json', 2)
  })

  // Fixed by inference-branching: tries all ± sign combinations
  it('Six Points and VL.json', async () => {
    await runFixtureTest('Six Points and VL.json', 2)
  })

  // Multi-camera Essential Matrix case with sign ambiguity
  it('Fixture With 2 Images - branching.json', async () => {
    await runFixtureTest('Fixture With 2 Images - branching.json', 2)
  })

  // Multi-camera with X, Y, and Z direction lines
  it('Balcony House X,Y and Z Lines.json', async () => {
    await runFixtureTest('Balcony House X,Y and Z Lines.json', 2)
  })

  // Single Z-aligned line - fixed by using perpendicular camera offset
  it('Balcony House Z Line.json', async () => {
    await runFixtureTest('Balcony House Z Line.json', 2)
  })

  // Challenging: degenerate local minimum - cameras collapse to same position
  // A 0.3px shift in one image point causes error to go from 132 to 0.84
  it('Minimal 2 Image 2 Axis Degenerate.json', async () => {
    await runChallengingTest('Minimal 2 Image 2 Axis Degenerate.json', 2)
  })

  // Challenging: Distance constraint on O-Y line - requires multiple attempts
  // 4 viewpoints, 40 image points - complex optimization
  it('Tower 2 - O-Y Distance.json', async () => {
    await runChallengingTest('Tower 2 - O-Y Distance.json', 2)
  })

  it('Balcony House Y Line Fast.json', async () => {
    await runFixtureTest('Balcony House Y Line Fast.json', 2)
  })

  // Tower 2 projects - 4 viewpoints, similar to Tower 2 - O-Y Distance
  it('Tower 2.json', async () => {
    await runChallengingTest('Tower 2.json', 2)
  })

  it('Tower 2 With Roof.json', async () => {
    await runChallengingTest('Tower 2 With Roof.json', 2)
  })

  // 3 cameras: cameras 3 and 4 can VP-init
  // Camera 2 cannot be initialized: only sees Y-direction lines (can't VP-init),
  // and only 2 triangulated points (WP5, WP6 - collinear, not enough for PnP)
  // This test verifies the system handles this gracefully (solves what it can)
  it('3 Loose.json', async () => {
    const jsonPath = path.join(FIXTURES_DIR, '3 Loose.json')
    const jsonData = fs.readFileSync(jsonPath, 'utf8')
    const project = loadProjectFromJson(jsonData)

    const result = await optimizeProject(project, {
      maxIterations: 500,
      maxAttempts: 1,
      verbose: false
    })

    // Only cameras 3 and 4 can be initialized (camera 2 lacks sufficient constraints)
    expect(result.camerasInitialized).toBeDefined()
    expect(result.camerasInitialized!.sort()).toEqual(['3', '4'])

    // Camera 2 should NOT be excluded (it was never initialized, not initialized-then-excluded)
    expect(result.camerasExcluded).toBeUndefined()

    // Check median error for initialized cameras
    expect(result.medianReprojectionError).toBeDefined()
    expect(result.medianReprojectionError!).toBeLessThan(2)
  })
})
