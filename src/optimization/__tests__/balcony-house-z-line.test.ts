import { describe, it, expect } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import { loadProjectFromJson } from '../../store/project-serialization'
import { optimizeProject, clearOptimizationLogs, optimizationLogs } from '../optimize-project'

const debugLog: string[] = []

function loadFixture(filename: string) {
  const fixturePath = path.join(__dirname, 'fixtures', filename)
  const jsonContent = fs.readFileSync(fixturePath, 'utf-8')
  return loadProjectFromJson(jsonContent)
}

describe('Balcony House Z-Line optimization', () => {
  it('Y-axis baseline - should work', () => {
    const project = loadFixture('balcony-house-y-line.json')

    const result = optimizeProject(project, {
      tolerance: 1e-6,
      maxIterations: 500,
      verbose: false,
    })

    debugLog.push(`\n=== Y-AXIS BASELINE ===`)
    debugLog.push(`Result: converged=${result.converged}, iter=${result.iterations}, median=${result.medianReprojectionError?.toFixed(2)}px`)
    optimizationLogs.forEach(log => debugLog.push(log))

    debugLog.push('\nCamera positions:')
    for (const vp of project.viewpoints) {
      debugLog.push(`  ${vp.name}: pos=[${vp.position.map(x => x.toFixed(2)).join(', ')}] f=${vp.focalLength.toFixed(0)}`)
    }

    fs.writeFileSync(path.join(__dirname, 'z-line-debug.txt'), debugLog.join('\n'))

    // The optimization should produce good results (convergence may be false due to max iterations)
    // What matters is the actual quality of the solution
    expect(result.medianReprojectionError).toBeDefined()
    expect(result.medianReprojectionError!).toBeGreaterThan(0)
    expect(result.medianReprojectionError!).toBeLessThan(2)
  })

  it('should solve Z-axis line constraint', () => {
    // The Z-axis fixture has the line going from O to WP6, so WP6 gets inferred [0, 0, null].
    // Other points like WP3 have no inferred coordinates, making them less constrained
    // than the Y-axis case (where WP3 is ON the axis line and gets 2 inferred coords).
    //
    // Stage1 now uses regularization to prevent unconstrained points from diverging.
    // This keeps points near their triangulated initial positions while still allowing
    // the optimizer to find a good solution.

    const project = loadFixture('balcony-house-z-line.json')

    // Verify the fixture has what we expect
    const lines = Array.from(project.lines)
    expect(lines.length).toBe(1)
    expect(lines[0].direction).toBe('z')
    expect(lines[0].targetLength).toBe(15)

    // Run optimization with fixed intrinsics
    const result = optimizeProject(project, {
      tolerance: 1e-6,
      maxIterations: 500,
      verbose: false,
      optimizeCameraIntrinsics: false,
    })

    debugLog.push(`\n=== Z-AXIS TEST ===`)

    // Print BEFORE optimization positions (from init)
    debugLog.push('\nWorld point positions BEFORE optimization:')
    for (const wp of project.worldPoints) {
      const pos = wp.optimizedXyz
      debugLog.push(`  ${wp.name}: [${pos ? pos.map(x => x.toFixed(2)).join(', ') : 'none'}]`)
    }
    debugLog.push('\nCamera positions BEFORE optimization:')
    for (const vp of project.viewpoints) {
      debugLog.push(`  ${vp.name}: pos=[${vp.position.map(x => x.toFixed(2)).join(', ')}] f=${vp.focalLength.toFixed(0)}`)
    }

    debugLog.push(`\nResult: converged=${result.converged}, iter=${result.iterations}, median=${result.medianReprojectionError?.toFixed(2)}px`)

    // Print optimization logs
    debugLog.push('\nOptimization logs:')
    optimizationLogs.forEach(log => debugLog.push(log))

    // Print world point positions
    debugLog.push('\nWorld point positions after optimization:')
    for (const wp of project.worldPoints) {
      const pos = wp.optimizedXyz
      const locked = wp.lockedXyz
      const inferred = wp.inferredXyz
      debugLog.push(`  ${wp.name}: opt=[${pos ? pos.map(x => x.toFixed(2)).join(', ') : 'none'}] locked=${JSON.stringify(locked)} inferred=${JSON.stringify(inferred)}`)
    }

    // Print camera positions
    debugLog.push('\nCamera positions:')
    for (const vp of project.viewpoints) {
      debugLog.push(`  ${vp.name}: pos=[${vp.position.map(x => x.toFixed(2)).join(', ')}] f=${vp.focalLength.toFixed(0)}`)
    }

    // Print line info
    const line = lines[0]
    const actualLength = line.length()
    debugLog.push(`\nLine: direction=${line.direction}, target=${line.targetLength}, actual=${actualLength?.toFixed(3)}`)

    // Check the line direction constraint is satisfied
    // For Z-axis: X and Y should be equal between the two points
    const pointA = line.pointA
    const pointB = line.pointB
    if (pointA.optimizedXyz && pointB.optimizedXyz) {
      const dx = Math.abs(pointB.optimizedXyz[0] - pointA.optimizedXyz[0])
      const dy = Math.abs(pointB.optimizedXyz[1] - pointA.optimizedXyz[1])
      const dz = Math.abs(pointB.optimizedXyz[2] - pointA.optimizedXyz[2])
      debugLog.push(`Line direction: dx=${dx.toFixed(4)}, dy=${dy.toFixed(4)}, dz=${dz.toFixed(4)}`)
    }

    // Write debug log to file
    fs.writeFileSync(path.join(__dirname, 'z-line-debug.txt'), debugLog.join('\n'))

    // All world points should have positions
    const pointsWithPositions = Array.from(project.worldPoints).filter(wp => wp.optimizedXyz !== undefined && wp.optimizedXyz !== null)
    expect(pointsWithPositions.length).toBe(project.worldPoints.size)

    // Verify the line constraint is satisfied (Z-axis alignment)
    if (pointA.optimizedXyz && pointB.optimizedXyz) {
      // For Z-axis line, X and Y should be close to equal (allowing some tolerance)
      const lineDx = Math.abs(pointB.optimizedXyz[0] - pointA.optimizedXyz[0])
      const lineDy = Math.abs(pointB.optimizedXyz[1] - pointA.optimizedXyz[1])
      expect(lineDx).toBeLessThan(0.1)
      expect(lineDy).toBeLessThan(0.1)
    }

    // The Z-axis fixture has fewer constraints than Y-axis (WP3 is not on the axis line)
    // With only one axis constraint, there's an unresolved rotational DoF, making this
    // an inherently under-constrained problem. Regularization prevents divergence but
    // can't fully determine the scene orientation.
    // Y-axis achieves ~0.1px because WP3 on the line gives 2 extra constraints.
    // Z-axis is harder - we target <10px which indicates a stable (non-diverged) solution.
    expect(result.medianReprojectionError).toBeDefined()
    expect(result.medianReprojectionError!).toBeGreaterThan(0)
    expect(result.medianReprojectionError!).toBeLessThan(10) // Under-constrained: stable but not precise
  })
})
