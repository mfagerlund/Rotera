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

  it.skip('No Vanisining Lines Now With VL.json', () => {
    runFixtureTest('No Vanisining Lines Now With VL.json', 2)
  })

  it('VL And non VL.json', () => {
    runFixtureTest('VL And non VL.json', 2)
  })

  // This test currently fails because the solver picks OY.Y = +10 instead of -10
  // Both are valid given constraints, but only -10 produces a good solution
  // Needs inference-branching integration to try both configurations
  it('Six Points and VL.json', () => {
    runFixtureTest('Six Points and VL.json', 2)
  })
})
