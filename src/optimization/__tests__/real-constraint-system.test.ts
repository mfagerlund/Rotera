/**
 * Test using the ACTUAL ConstraintSystem class with real entities
 * to see if gradient flow is broken there.
 */

import { describe, it, expect } from '@jest/globals'
import { WorldPoint } from '../../entities/world-point'
import { Viewpoint } from '../../entities/viewpoint'
import { ImagePoint } from '../../entities/imagePoint'
import { ConstraintSystem } from '../constraint-system'

describe('Real ConstraintSystem Gradient Flow', () => {
  it('should have non-zero gradients with isZReflected=true and locked cameras', () => {
    // Create world points
    const worldPoints: WorldPoint[] = []
    for (let i = 0; i < 3; i++) {
      const wp = WorldPoint.create(`Point${i}`, {
        lockedXyz: [null, null, null],  // All axes free
        optimizedXyz: [0.1 * (i - 1), 0, -5 - i * 0.1]  // Points at negative Z
      })
      worldPoints.push(wp)
    }

    // Create cameras (locked, with isZReflected=true)
    const viewpoints: Viewpoint[] = []
    const camPositions: [number, number, number][] = [
      [0, 0, 0],
      [2, 0, 0],
      [1, 2, 0]
    ]
    const camRotations: [number, number, number, number][] = [
      [1, 0, 0, 0],
      [0.9239, 0, 0.3827, 0],
      [0.9239, -0.3827, 0, 0]
    ]

    for (let i = 0; i < 3; i++) {
      const vp = Viewpoint.create(
        `Camera${i}`,
        `camera${i}.jpg`,
        `file:///camera${i}.jpg`,
        1000, 1000,  // Image dimensions
        {
          focalLength: 1000,
          principalPointX: 500,
          principalPointY: 500,
          position: camPositions[i],
          rotation: camRotations[i],
          isPoseLocked: false  // Camera is UNLOCKED (like fine-tune default)
        }
      )
      vp.isZReflected = true  // Set isZReflected AFTER creation
      viewpoints.push(vp)
    }

    // Create image points (observations)
    const imagePoints: ImagePoint[] = []
    for (let wpIdx = 0; wpIdx < worldPoints.length; wpIdx++) {
      const wp = worldPoints[wpIdx]
      const camIndices = [wpIdx % 3, (wpIdx + 1) % 3]

      for (const camIdx of camIndices) {
        const vp = viewpoints[camIdx]

        // Place observation at some offset from center
        const u = 500 + 10 * (wpIdx + 1)
        const v = 500 + 10 * (wpIdx + 1)

        const ip = ImagePoint.create(wp, vp, u, v)
        imagePoints.push(ip)
        wp.addImagePoint(ip)
        vp.addImagePoint(ip)
      }
    }

    console.log(`Created ${worldPoints.length} points, ${viewpoints.length} cameras, ${imagePoints.length} observations`)

    // Create constraint system with useIsZReflected=true (like fine-tune)
    const system = new ConstraintSystem({
      tolerance: 1e-8,
      maxIterations: 5,
      damping: 0.01,
      verbose: true,
      optimizeCameraIntrinsics: false,
      regularizationWeight: 0,
      useIsZReflected: true  // Key setting!
    })

    // Add entities to system
    worldPoints.forEach(wp => system.addPoint(wp))
    viewpoints.forEach(vp => system.addCamera(vp))
    imagePoints.forEach(ip => system.addImagePoint(ip))

    // Solve
    const result = system.solve()

    console.log('Solve result:', result)

    // Check if points moved
    let totalMovement = 0
    for (let i = 0; i < worldPoints.length; i++) {
      const wp = worldPoints[i]
      if (wp.optimizedXyz) {
        const dx = wp.optimizedXyz[0] - 0.1 * (i - 1)
        const dy = wp.optimizedXyz[1] - 0
        const dz = wp.optimizedXyz[2] - (-5 - i * 0.1)
        totalMovement += Math.abs(dx) + Math.abs(dy) + Math.abs(dz)
        console.log(`Point ${i}: movement = [${dx.toFixed(4)}, ${dy.toFixed(4)}, ${dz.toFixed(4)}]`)
      }
    }

    console.log(`Total movement: ${totalMovement}`)

    // If gradients are working, points should move to minimize reprojection error
    // With 5 iterations, they should have moved significantly
    expect(totalMovement).toBeGreaterThan(0.0001)
  })
})
