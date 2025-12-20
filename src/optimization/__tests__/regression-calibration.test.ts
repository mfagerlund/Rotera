import * as fs from 'fs'
import * as path from 'path'
import { loadProjectFromJson } from '../../store/project-serialization'
import { optimizeProject } from '../optimize-project'

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'Calibration')

function runFixtureTest(filename: string, maxMedianError: number) {
  const jsonPath = path.join(FIXTURES_DIR, filename)

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Fixture not found: ${jsonPath}`)
  }

  const jsonData = fs.readFileSync(jsonPath, 'utf8')
  const project = loadProjectFromJson(jsonData)

  const result = await optimizeProject(project, {
    maxIterations: 500,
    verbose: false
  })

  expect(result.medianReprojectionError).toBeDefined()
  expect(result.medianReprojectionError!).toBeLessThan(maxMedianError)
}

describe('Regression - Calibration', () => {
  it('Fixture With 2 Images.json', async () => {
    runFixtureTest('Fixture With 2 Images.json', 2)
  })

  it('Fixture With 2 Image 2.json', async () => {
    runFixtureTest('Fixture With 2 Image 2.json', 2)
  })

  it('Fixture With 2-1 Image 2.json', async () => {
    runFixtureTest('Fixture With 2-1 Image 2.json', 2)
  })

  it('Full Solve.json', async () => {
    runFixtureTest('Full Solve.json', 2)
  })

  it('No Vanisining Lines.json', async () => {
    runFixtureTest('No Vanisining Lines.json', 2)
  })

  it('No Vanisining Lines Now With VL.json', async () => {
    runFixtureTest('No Vanisining Lines Now With VL.json', 2)
  })

  it('VL And non VL.json', async () => {
    runFixtureTest('VL And non VL.json', 2)
  })

  // Fixed by inference-branching: tries all ± sign combinations
  it('Six Points and VL.json', async () => {
    runFixtureTest('Six Points and VL.json', 2)
  })

  // Multi-camera Essential Matrix case with sign ambiguity
  it('Fixture With 2 Images - branching.json', async () => {
    runFixtureTest('Fixture With 2 Images - branching.json', 2)
  })

  // Multi-camera with X, Y, and Z direction lines
  it('Balcony House X,Y and Z Lines.json', async () => {
    runFixtureTest('Balcony House X,Y and Z Lines.json', 2)
  })

  // Single Z-aligned line - fixed by using perpendicular camera offset
  it('Balcony House Z Line.json', async () => {
    runFixtureTest('Balcony House Z Line.json', 2)
  })

  // Degenerate local minimum - cameras collapse to same position
  // A 0.3px shift in one image point causes error to go from 132 to 0.84
  it('Minimal 2 Image 2 Axis Degenerate.json', async () => {
    runFixtureTest('Minimal 2 Image 2 Axis Degenerate.json', 2)
  })
})
