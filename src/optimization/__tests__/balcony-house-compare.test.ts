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

// Write to a file since console.log doesn't show in Jest
const outputLines: string[] = []
function log(msg: string) {
  outputLines.push(msg)
}

function writeOutputFile() {
  const outputPath = path.join(__dirname, 'fixtures', 'comparison-output.txt')
  fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf-8')
}

describe.skip('Balcony House X vs Z Line comparison', () => {
  beforeEach(() => {
    clearOptimizationLogs();
  });

  it('should compare X-line and Z-line initialization and solving', () => {
    log('\n========================================')
    log('X-LINE TEST')
    log('========================================\n')

    const xProject = loadFixture('balcony-house-x-line.json')
    const xLine = Array.from(xProject.lines)[0]
    log(`X-line: direction=${xLine.direction}, targetLength=${xLine.targetLength}`)
    log(`X-line connects: ${xLine.pointA.name} to ${xLine.pointB.name}`)

    const xResult = optimizeProject(xProject, {
      tolerance: 1e-6,
      maxIterations: 500,
      verbose: true,
    })

    log('\n--- X-LINE OPTIMIZATION LOGS ---')
    optimizationLogs.forEach(l => log(l))
    log(`\n[X Line] Median error: ${xResult.medianReprojectionError?.toFixed(2)}px`)
    log(`[X Line] Converged: ${xResult.converged}, Iterations: ${xResult.iterations}`)

    const xCameras = Array.from(xProject.viewpoints)
    log('\n[X Line] Final camera poses:')
    xCameras.forEach((cam, i) => {
      log(`  Camera ${i+1} (${cam.name}):`)
      log(`    Position: [${cam.position.map(x => x.toFixed(2)).join(', ')}]`)
      log(`    Rotation: [${cam.rotation.map(x => x.toFixed(4)).join(', ')}]`)
      log(`    Focal: ${cam.focalLength.toFixed(1)}`)
    })

    clearOptimizationLogs()

    log('\n\n========================================')
    log('Z-LINE TEST')
    log('========================================\n')

    const zProject = loadFixture('balcony-house-z-line.json')
    const zLine = Array.from(zProject.lines)[0]
    log(`Z-line: direction=${zLine.direction}, targetLength=${zLine.targetLength}`)
    log(`Z-line connects: ${zLine.pointA.name} to ${zLine.pointB.name}`)

    const zResult = optimizeProject(zProject, {
      tolerance: 1e-6,
      maxIterations: 500,
      verbose: true,
    })

    log('\n--- Z-LINE OPTIMIZATION LOGS ---')
    optimizationLogs.forEach(l => log(l))
    log(`\n[Z Line] Median error: ${zResult.medianReprojectionError?.toFixed(2)}px`)
    log(`[Z Line] Converged: ${zResult.converged}, Iterations: ${zResult.iterations}`)

    const zCameras = Array.from(zProject.viewpoints)
    log('\n[Z Line] Final camera poses:')
    zCameras.forEach((cam, i) => {
      log(`  Camera ${i+1} (${cam.name}):`)
      log(`    Position: [${cam.position.map(x => x.toFixed(2)).join(', ')}]`)
      log(`    Rotation: [${cam.rotation.map(x => x.toFixed(4)).join(', ')}]`)
      log(`    Focal: ${cam.focalLength.toFixed(1)}`)
    })

    log('\n========================================')
    log('COMPARISON SUMMARY')
    log('========================================')
    log(`X-line error: ${xResult.medianReprojectionError?.toFixed(2)}px (${xResult.medianReprojectionError! < 3 ? 'PASS' : 'FAIL'})`)
    log(`Z-line error: ${zResult.medianReprojectionError?.toFixed(2)}px (${zResult.medianReprojectionError! < 3 ? 'PASS' : 'FAIL'})`)
    log(`\nDifference: ${Math.abs(xResult.medianReprojectionError! - zResult.medianReprojectionError!).toFixed(2)}px`)

    writeOutputFile()

    // Don't assert - just log for analysis
    expect(xResult.medianReprojectionError).toBeDefined()
    expect(zResult.medianReprojectionError).toBeDefined()
  })
})
