import { describe, test, expect } from '@jest/globals'
import { Project } from '../../entities/project'
import { WorldPoint } from '../../entities/world-point'
import { Line } from '../../entities/line'
import { optimizeProject } from '../optimize-project'

describe('Vertical Direction Constraint', () => {
  test('vertical line should align along Y axis', () => {
    const project = Project.create('Test')

    // Two points: WP1 at origin, WP2 should move along Y
    const wp1 = WorldPoint.create('WP1', {
      lockedXyz: [0, 0, 0],
      optimizedXyz: [0, 0, 0]
    })

    const wp2 = WorldPoint.create('WP2', {
      lockedXyz: [null, null, null],
      optimizedXyz: [5, 5, 5]  // Start at wrong position
    })

    project.addWorldPoint(wp1)
    project.addWorldPoint(wp2)

    // Create vertical line with length
    const line = Line.create('TestLine', wp1, wp2, {
      direction: 'vertical',
      targetLength: 10
    })
    project.addLine(line)

    console.log('BEFORE optimization:')
    console.log(`  WP1: [${wp1.optimizedXyz}]`)
    console.log(`  WP2: [${wp2.optimizedXyz}]`)
    console.log(`  Line direction: ${line.direction}`)

    // Run optimization
    optimizeProject(project, {
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false,
      verbose: false
    })

    console.log('\\nAFTER optimization:')
    console.log(`  WP1: [${wp1.optimizedXyz}]`)
    console.log(`  WP2: [${wp2.optimizedXyz?.map(v => v.toFixed(3))}]`)

    // Check results
    const [x2, y2, z2] = wp2.optimizedXyz!

    console.log('\\nExpected: WP2 should be at [0, 10, 0] (only Y changed)')
    console.log(`Actual: WP2 is at [${x2.toFixed(3)}, ${y2.toFixed(3)}, ${z2.toFixed(3)}]`)

    // WP2 should be directly above WP1
    expect(Math.abs(x2 - 0)).toBeLessThan(0.1)  // X should be ~0
    expect(Math.abs(z2 - 0)).toBeLessThan(0.1)  // Z should be ~0
    expect(Math.abs(y2 - 10)).toBeLessThan(0.5) // Y should be ~10
  })

  test('x-aligned line should align along X axis', () => {
    const project = Project.create('Test')

    const wp1 = WorldPoint.create('WP1', {
      lockedXyz: [0, 0, 0],
      optimizedXyz: [0, 0, 0]
    })

    const wp2 = WorldPoint.create('WP2', {
      lockedXyz: [null, null, null],
      optimizedXyz: [5, 5, 5]
    })

    project.addWorldPoint(wp1)
    project.addWorldPoint(wp2)

    const line = Line.create('TestLine', wp1, wp2, {
      direction: 'x-aligned',
      targetLength: 10
    })
    project.addLine(line)

    console.log('\\n\\nX-ALIGNED TEST:')
    console.log('BEFORE:', wp2.optimizedXyz)

    optimizeProject(project, {
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false,
      verbose: false
    })

    console.log('AFTER:', wp2.optimizedXyz?.map(v => v.toFixed(3)))

    const [x2, y2, z2] = wp2.optimizedXyz!

    console.log('Expected: WP2 should be at [10, 0, 0] (only X changed)')

    expect(Math.abs(y2 - 0)).toBeLessThan(0.1)  // Y should be ~0
    expect(Math.abs(z2 - 0)).toBeLessThan(0.1)  // Z should be ~0
    expect(Math.abs(x2 - 10)).toBeLessThan(0.5) // X should be ~10
  })
})
