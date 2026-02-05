import * as fs from 'fs'
import * as path from 'path'
import { loadProjectFromJson } from '../../store/project-serialization'
import { optimizeProject, OptimizeProjectOptions, OPTIMIZE_PROJECT_DEFAULTS } from '../optimize-project'
import { fineTuneProject } from '../fine-tune'
import { detectOutliers } from '../outlier-detection'

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'Calibration')

// PRODUCTION SETTINGS - imported from source of truth
// This MUST match production or tests are meaningless!
const PRODUCTION_OPTIONS: OptimizeProjectOptions = {
  ...OPTIMIZE_PROJECT_DEFAULTS,
  verbose: false
}

// Core test function - no shared state, safe for concurrent execution
async function runTest(filename: string, maxMedianError: number, options: OptimizeProjectOptions = PRODUCTION_OPTIONS) {
  const jsonPath = path.join(FIXTURES_DIR, filename)

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Fixture not found: ${jsonPath}`)
  }

  const jsonData = fs.readFileSync(jsonPath, 'utf8')
  const project = loadProjectFromJson(jsonData)

  const result = await optimizeProject(project, options)

  expect(result.medianReprojectionError).toBeDefined()
  expect(result.medianReprojectionError!).toBeLessThan(maxMedianError)

  // Fine-tune and verify loss doesn't increase
  const errorBeforeFineTune = result.medianReprojectionError!
  fineTuneProject(project, { verbose: false, lockCameraPoses: true })
  const { medianError: errorAfterFineTune } = detectOutliers(project, 3.0)

  // Allow 0.5px tolerance
  const tolerance = 0.5
  expect(errorAfterFineTune).toBeLessThanOrEqual(errorBeforeFineTune + tolerance)

  return result
}

describe('Regression - Calibration', () => {
  // ============================================
  // CONCURRENT TESTS - these run in parallel
  // ============================================

  it.concurrent('Fixture With 2 Images.json', async () => {
    await runTest('Fixture With 2 Images.json', 2)
  })

  it.concurrent('Fixture With 2 Image 2.json', async () => {
    await runTest('Fixture With 2 Image 2.json', 2)
  })

  it.concurrent('Fixture With 2-1 Image 2.json', async () => {
    await runTest('Fixture With 2-1 Image 2.json', 2)
  })

  it.concurrent('Full Solve.json', async () => {
    await runTest('Full Solve.json', 2)
  })

  // TODO: Fix analytical solver for this fixture (190px error without dense subsystems)
  it.skip('No Vanisining Lines.json', async () => {
    await runTest('No Vanisining Lines.json', 2)
  })

  it.concurrent('No Vanisining Lines Now With VL.json', async () => {
    await runTest('No Vanisining Lines Now With VL.json', 2)
  })

  it.concurrent('VL And non VL.json', async () => {
    await runTest('VL And non VL.json', 2)
  })

  it.concurrent('Six Points and VL.json', async () => {
    await runTest('Six Points and VL.json', 2)
  })

  it.concurrent('Fixture With 2 Images - branching.json', async () => {
    await runTest('Fixture With 2 Images - branching.json', 2)
  })

  it.concurrent('Balcony House X,Y and Z Lines.json', async () => {
    await runTest('Balcony House X,Y and Z Lines.json', 2)
  })

  it.concurrent('Balcony House Z Line.json', async () => {
    await runTest('Balcony House Z Line.json', 10)  // Relaxed - underconstrained geometry
  })

  it.concurrent('Minimal 2 Image 2 Axis Degenerate.json', async () => {
    await runTest('Minimal 2 Image 2 Axis Degenerate.json', 2)
  })

  it.concurrent('Tower 2 - O-Y Distance.json', async () => {
    await runTest('Tower 2 - O-Y Distance.json', 2)
  })

  it.concurrent('Balcony House Y Line Fast.json', async () => {
    await runTest('Balcony House Y Line Fast.json', 2)
  })

  it.concurrent('Tower 2.json', async () => {
    await runTest('Tower 2.json', 2)
  })

  it.concurrent('Tower 2 With Roof.json', async () => {
    await runTest('Tower 2 With Roof.json', 2)
  })

  it.concurrent('2 Loose.json', async () => {
    await runTest('2 Loose.json', 2)
  })

  // ============================================
  // TESTS WITH CUSTOM ASSERTIONS - concurrent OK
  // ============================================

  it.concurrent('Tower 1 - 1 Img.json', async () => {
    const jsonPath = path.join(FIXTURES_DIR, 'Tower 1 - 1 Img.json')
    const jsonData = fs.readFileSync(jsonPath, 'utf8')
    const project = loadProjectFromJson(jsonData)

    const result = await optimizeProject(project, PRODUCTION_OPTIONS)

    // Single camera should be initialized
    expect(result.camerasInitialized).toBeDefined()
    expect(result.camerasInitialized!.length).toBe(1)

    // Should have reasonable reprojection error (single-camera is harder)
    expect(result.medianReprojectionError).toBeDefined()
    expect(result.medianReprojectionError!).toBeLessThan(3)

    // May have some outliers in single-camera case
    expect(result.outliers?.length ?? 0).toBeLessThan(3)

    // Fine-tune check
    const errorBeforeFineTune = result.medianReprojectionError!
    fineTuneProject(project, { verbose: false, lockCameraPoses: true })
    const { medianError: errorAfterFineTune } = detectOutliers(project, 3.0)
    expect(errorAfterFineTune).toBeLessThanOrEqual(errorBeforeFineTune + 1.0)
  })

  it.concurrent('Three Boxes.json', async () => {
    const jsonPath = path.join(FIXTURES_DIR, 'Three Boxes.json')
    const jsonData = fs.readFileSync(jsonPath, 'utf8')
    const project = loadProjectFromJson(jsonData)

    const result = await optimizeProject(project, PRODUCTION_OPTIONS)

    // Single camera should be initialized
    expect(result.camerasInitialized).toBeDefined()
    expect(result.camerasInitialized!.length).toBe(1)

    // ~6.4px median error expected (conflicting constraints)
    expect(result.medianReprojectionError).toBeDefined()
    expect(result.medianReprojectionError!).toBeLessThan(8)
  })

  it.concurrent('3 Loose.json', async () => {
    const jsonPath = path.join(FIXTURES_DIR, '3 Loose.json')
    const jsonData = fs.readFileSync(jsonPath, 'utf8')
    const project = loadProjectFromJson(jsonData)

    const result = await optimizeProject(project, PRODUCTION_OPTIONS)

    // All cameras should be initialized
    expect(result.camerasInitialized).toBeDefined()
    expect(result.camerasInitialized!.sort()).toEqual(['2', '3', '4'])

    // No cameras should be excluded
    expect(result.camerasExcluded).toBeUndefined()

    // Good accuracy expected
    expect(result.medianReprojectionError).toBeDefined()
    expect(result.medianReprojectionError!).toBeLessThan(5)

    // Fine-tune check
    const errorBeforeFineTune = result.medianReprojectionError!
    fineTuneProject(project, { verbose: false, lockCameraPoses: true })
    const { medianError: errorAfterFineTune } = detectOutliers(project, 3.0)
    expect(errorAfterFineTune).toBeLessThanOrEqual(errorBeforeFineTune + 1.0)
  })

  // ============================================
  // ADDITIONAL TESTS
  // ============================================

  it.concurrent('Tower 1 - 1 Img NEW.json', async () => {
    const jsonPath = path.join(FIXTURES_DIR, 'Tower 1 - 1 Img NEW.json')
    const jsonData = fs.readFileSync(jsonPath, 'utf8')
    const project = loadProjectFromJson(jsonData)

    const result = await optimizeProject(project, PRODUCTION_OPTIONS)

    expect(result.medianReprojectionError).toBeDefined()
    expect(result.medianReprojectionError!).toBeLessThan(3)
  })
})
