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

  const result = optimizeProject(project, {
    maxIterations: 500,
    verbose: false
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

  it('No Vanisining Lines Now With VL.json', () => {
    runFixtureTest('No Vanisining Lines Now With VL.json', 2)
  })

  it('VL And non VL.json', () => {
    runFixtureTest('VL And non VL.json', 2)
  })

  // Fixed by inference-branching: tries all ± sign combinations
  it('Six Points and VL.json', () => {
    runFixtureTest('Six Points and VL.json', 2)
  })

  // Multi-camera Essential Matrix case with sign ambiguity
  it('Fixture With 2 Images - branching.json', () => {
    runFixtureTest('Fixture With 2 Images - branching.json', 2)
  })

  // Multi-camera with X, Y, and Z direction lines
  it('Balcony House X,Y and Z Lines.json', () => {
    runFixtureTest('Balcony House X,Y and Z Lines.json', 2)
  })

  // Single Z-aligned line - fixed by using perpendicular camera offset
  it('Balcony House Z Line.json', () => {
    runFixtureTest('Balcony House Z Line.json', 2)
  })
})
