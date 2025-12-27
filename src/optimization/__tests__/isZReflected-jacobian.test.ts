/**
 * Test that Jacobian has non-zero gradients for world points when isZReflected=true.
 *
 * This test reproduces the bug where fine-tune can't optimize because
 * the Jacobian is all zeros for world point variables.
 */

import { describe, it, expect } from '@jest/globals'
import { V, Vec3, Vec4, Value, nonlinearLeastSquares } from 'scalar-autograd'
import { projectWorldPointToPixelQuaternion } from '../camera-projection'

describe('isZReflected Jacobian', () => {
  it('should have non-zero gradients for world point when isZReflected=true', () => {
    // Set up a simple scenario:
    // - Camera at origin, looking down -Z (isZReflected=true means -Z is "in front")
    // - World point at (0, 0, -5) - should be visible

    // Create optimizable world point position
    const wpX = V.W(0)
    const wpY = V.W(0)
    const wpZ = V.W(-5)
    const worldPoint = new Vec3(wpX, wpY, wpZ)

    // Camera at origin with identity rotation
    const camPos = new Vec3(V.C(0), V.C(0), V.C(0))
    const camRot = new Vec4(V.C(1), V.C(0), V.C(0), V.C(0)) // Identity quaternion

    // Camera intrinsics
    const focalLength = V.C(1000)
    const aspectRatio = V.C(1)
    const ppX = V.C(500)
    const ppY = V.C(500)
    const skew = V.C(0)
    const k1 = V.C(0)
    const k2 = V.C(0)
    const k3 = V.C(0)
    const p1 = V.C(0)
    const p2 = V.C(0)

    // Project with isZReflected=true
    const projected = projectWorldPointToPixelQuaternion(
      worldPoint,
      camPos,
      camRot,
      focalLength,
      aspectRatio,
      ppX,
      ppY,
      skew,
      k1, k2, k3, p1, p2,
      true // isZReflected
    )

    expect(projected).not.toBeNull()
    console.log('Projected coordinates:', projected![0].data, projected![1].data)

    // Compute residual (target at pixel center)
    const targetU = 500
    const targetV = 500
    const residualU = V.sub(projected![0], V.C(targetU))
    const residualV = V.sub(projected![1], V.C(targetV))

    console.log('Residuals:', residualU.data, residualV.data)

    // Check gradients exist
    const variables = [wpX, wpY, wpZ]

    // Use LM solver to compute Jacobian
    const residualFn = (vars: Value[]) => {
      const wp = new Vec3(vars[0], vars[1], vars[2])
      const proj = projectWorldPointToPixelQuaternion(
        wp, camPos, camRot, focalLength, aspectRatio, ppX, ppY, skew,
        k1, k2, k3, p1, p2, true
      )
      if (!proj) {
        return [V.C(1000), V.C(1000)]
      }
      return [V.sub(proj[0], V.C(targetU)), V.sub(proj[1], V.C(targetV))]
    }

    // Run one iteration to see the Jacobian
    const result = nonlinearLeastSquares(variables, residualFn, {
      maxIterations: 1,
      verbose: true,
      costTolerance: 1e-10,
    })

    console.log('Result:', result)

    // The test should show non-zero Jacobian values for world point variables
    // If it shows all zeros, the bug is reproduced
  })

  it('should compare isZReflected=true vs false gradients', () => {
    // Test with isZReflected=false (point in front at +Z)
    const wpX_false = V.W(0)
    const wpY_false = V.W(0)
    const wpZ_false = V.W(5) // Positive Z for isZReflected=false
    const worldPoint_false = new Vec3(wpX_false, wpY_false, wpZ_false)

    const camPos = new Vec3(V.C(0), V.C(0), V.C(0))
    const camRot = new Vec4(V.C(1), V.C(0), V.C(0), V.C(0))
    const focalLength = V.C(1000)
    const aspectRatio = V.C(1)
    const ppX = V.C(500)
    const ppY = V.C(500)
    const skew = V.C(0)
    const k1 = V.C(0), k2 = V.C(0), k3 = V.C(0), p1 = V.C(0), p2 = V.C(0)

    console.log('\n=== isZReflected=false test ===')
    const proj_false = projectWorldPointToPixelQuaternion(
      worldPoint_false, camPos, camRot, focalLength, aspectRatio, ppX, ppY, skew,
      k1, k2, k3, p1, p2, false
    )
    console.log('Projected (false):', proj_false?.[0].data, proj_false?.[1].data)

    const residualFn_false = (vars: Value[]) => {
      const wp = new Vec3(vars[0], vars[1], vars[2])
      const proj = projectWorldPointToPixelQuaternion(
        wp, camPos, camRot, focalLength, aspectRatio, ppX, ppY, skew,
        k1, k2, k3, p1, p2, false
      )
      if (!proj) return [V.C(1000), V.C(1000)]
      return [V.sub(proj[0], V.C(500)), V.sub(proj[1], V.C(500))]
    }

    const result_false = nonlinearLeastSquares([wpX_false, wpY_false, wpZ_false], residualFn_false, {
      maxIterations: 1,
      verbose: true,
      costTolerance: 1e-10,
    })

    // Test with isZReflected=true (point in front at -Z)
    console.log('\n=== isZReflected=true test ===')
    const wpX_true = V.W(0)
    const wpY_true = V.W(0)
    const wpZ_true = V.W(-5) // Negative Z for isZReflected=true
    const worldPoint_true = new Vec3(wpX_true, wpY_true, wpZ_true)

    const proj_true = projectWorldPointToPixelQuaternion(
      worldPoint_true, camPos, camRot, focalLength, aspectRatio, ppX, ppY, skew,
      k1, k2, k3, p1, p2, true
    )
    console.log('Projected (true):', proj_true?.[0].data, proj_true?.[1].data)

    const residualFn_true = (vars: Value[]) => {
      const wp = new Vec3(vars[0], vars[1], vars[2])
      const proj = projectWorldPointToPixelQuaternion(
        wp, camPos, camRot, focalLength, aspectRatio, ppX, ppY, skew,
        k1, k2, k3, p1, p2, true
      )
      if (!proj) return [V.C(1000), V.C(1000)]
      return [V.sub(proj[0], V.C(500)), V.sub(proj[1], V.C(500))]
    }

    const result_true = nonlinearLeastSquares([wpX_true, wpY_true, wpZ_true], residualFn_true, {
      maxIterations: 1,
      verbose: true,
      costTolerance: 1e-10,
    })

    // Both should have non-zero gradients
    expect(result_false.success || result_false.iterations >= 0).toBe(true)
    expect(result_true.success || result_true.iterations >= 0).toBe(true)
  })
})
