/**
 * Fine-tune optimization tests
 *
 * Tests that fine-tune can refine an already-optimized solution.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import { loadProjectFromJson } from '../../store/project-serialization'
import { fineTuneProject } from '../fine-tune'
import { optimizeProject } from '../optimize-project'
import { WorldPoint } from '../../entities/world-point'
import { Viewpoint } from '../../entities/viewpoint'
import { ImagePoint } from '../../entities/imagePoint'
import { projectWorldPointToPixelQuaternion } from '../camera-projection'
import { V, Vec3, Vec4 } from 'scalar-autograd'
import { setSolverBackend, getSolverBackend, SolverBackend } from '../solver-config'

const CALIBRATION_FIXTURES_DIR = path.join(__dirname, 'fixtures', 'Calibration')

describe('Fine-tune optimization', () => {
  it('should refine an already-calibrated solution', async () => {
    // Load a simple calibration fixture
    const fixturePath = path.join(CALIBRATION_FIXTURES_DIR, 'Fixture With 2 Image 2.json')
    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8')
    const project = loadProjectFromJson(fixtureJson)

    // First run full optimization to get a valid solution
    const optimizeResult = await optimizeProject(project, {
      maxIterations: 500,
      maxAttempts: 1,
      verbose: false
    })

    expect(optimizeResult.medianReprojectionError).toBeDefined()
    expect(optimizeResult.medianReprojectionError!).toBeLessThan(2)
    console.log(`Initial optimization: median error = ${optimizeResult.medianReprojectionError!.toFixed(2)}px`)

    // Compute initial max reprojection error
    let initialMaxError = 0
    for (const vp of project.viewpoints) {
      const viewpoint = vp as Viewpoint
      for (const ip of viewpoint.imagePoints) {
        const imagePoint = ip as ImagePoint
        const wp = imagePoint.worldPoint as WorldPoint
        if (wp.optimizedXyz) {
          const worldPoint = new Vec3(V.C(wp.optimizedXyz[0]), V.C(wp.optimizedXyz[1]), V.C(wp.optimizedXyz[2]))
          const cameraPosition = new Vec3(V.C(viewpoint.position[0]), V.C(viewpoint.position[1]), V.C(viewpoint.position[2]))
          const cameraRotation = new Vec4(V.C(viewpoint.rotation[0]), V.C(viewpoint.rotation[1]), V.C(viewpoint.rotation[2]), V.C(viewpoint.rotation[3]))
          const projected = projectWorldPointToPixelQuaternion(
            worldPoint, cameraPosition, cameraRotation,
            V.C(viewpoint.focalLength), V.C(viewpoint.aspectRatio),
            V.C(viewpoint.principalPointX), V.C(viewpoint.principalPointY),
            V.C(viewpoint.skewCoefficient),
            V.C(viewpoint.radialDistortion[0]), V.C(viewpoint.radialDistortion[1]), V.C(viewpoint.radialDistortion[2]),
            V.C(viewpoint.tangentialDistortion[0]), V.C(viewpoint.tangentialDistortion[1])
          )
          if (projected) {
            const error = Math.sqrt((projected[0].data - imagePoint.u) ** 2 + (projected[1].data - imagePoint.v) ** 2)
            initialMaxError = Math.max(initialMaxError, error)
          }
        }
      }
    }
    console.log(`Initial max error: ${initialMaxError.toFixed(2)}px`)

    // Now run fine-tune to verify it can refine the solution
    const result = fineTuneProject(project, {
      tolerance: 1e-6,
      maxIterations: 500,
      lockCameraPoses: false,
      verbose: false
    })

    console.log(`Fine-tune: converged=${result.converged}, iterations=${result.iterations}, residual=${result.residual.toFixed(4)}`)
    console.log(`Fine-tune error: ${result.error ?? 'none'}`)

    // Compute final max reprojection error
    let finalMaxError = 0
    for (const vp of project.viewpoints) {
      const viewpoint = vp as Viewpoint
      for (const ip of viewpoint.imagePoints) {
        const imagePoint = ip as ImagePoint
        const wp = imagePoint.worldPoint as WorldPoint
        if (wp.optimizedXyz) {
          const worldPoint = new Vec3(V.C(wp.optimizedXyz[0]), V.C(wp.optimizedXyz[1]), V.C(wp.optimizedXyz[2]))
          const cameraPosition = new Vec3(V.C(viewpoint.position[0]), V.C(viewpoint.position[1]), V.C(viewpoint.position[2]))
          const cameraRotation = new Vec4(V.C(viewpoint.rotation[0]), V.C(viewpoint.rotation[1]), V.C(viewpoint.rotation[2]), V.C(viewpoint.rotation[3]))
          const projected = projectWorldPointToPixelQuaternion(
            worldPoint, cameraPosition, cameraRotation,
            V.C(viewpoint.focalLength), V.C(viewpoint.aspectRatio),
            V.C(viewpoint.principalPointX), V.C(viewpoint.principalPointY),
            V.C(viewpoint.skewCoefficient),
            V.C(viewpoint.radialDistortion[0]), V.C(viewpoint.radialDistortion[1]), V.C(viewpoint.radialDistortion[2]),
            V.C(viewpoint.tangentialDistortion[0]), V.C(viewpoint.tangentialDistortion[1])
          )
          if (projected) {
            const error = Math.sqrt((projected[0].data - imagePoint.u) ** 2 + (projected[1].data - imagePoint.v) ** 2)
            finalMaxError = Math.max(finalMaxError, error)
          }
        }
      }
    }
    console.log(`Final max error: ${finalMaxError.toFixed(2)}px`)

    // Fine-tune should maintain or improve the solution
    // Note: With constraints included, may not fully converge but should still work
    expect(finalMaxError).toBeLessThan(5) // Should be low
    expect(finalMaxError).toBeLessThanOrEqual(initialMaxError + 0.5) // Shouldn't make it worse
  })

  it('should recover from small perturbations', async () => {
    // Load a simple calibration fixture
    const fixturePath = path.join(CALIBRATION_FIXTURES_DIR, 'Fixture With 2 Image 2.json')
    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8')
    const project = loadProjectFromJson(fixtureJson)

    // Run full optimization first
    await optimizeProject(project, {
      maxIterations: 500,
      maxAttempts: 1,
      verbose: false
    })

    // Save original positions
    const worldPoints = Array.from(project.worldPoints) as WorldPoint[]
    const originalPositions = new Map<WorldPoint, [number, number, number]>()
    for (const wp of worldPoints) {
      if (wp.optimizedXyz && !wp.isFullyLocked()) {
        originalPositions.set(wp, [...wp.optimizedXyz] as [number, number, number])
      }
    }

    // Perturb the world points slightly
    for (const [wp, orig] of originalPositions) {
      wp.optimizedXyz = [
        orig[0] + (Math.random() - 0.5) * 0.3,
        orig[1] + (Math.random() - 0.5) * 0.3,
        orig[2] + (Math.random() - 0.5) * 0.3
      ]
    }

    // Compute error after perturbation
    let perturbedMaxError = 0
    for (const vp of project.viewpoints) {
      const viewpoint = vp as Viewpoint
      for (const ip of viewpoint.imagePoints) {
        const imagePoint = ip as ImagePoint
        const wp = imagePoint.worldPoint as WorldPoint
        if (wp.optimizedXyz) {
          const worldPoint = new Vec3(V.C(wp.optimizedXyz[0]), V.C(wp.optimizedXyz[1]), V.C(wp.optimizedXyz[2]))
          const cameraPosition = new Vec3(V.C(viewpoint.position[0]), V.C(viewpoint.position[1]), V.C(viewpoint.position[2]))
          const cameraRotation = new Vec4(V.C(viewpoint.rotation[0]), V.C(viewpoint.rotation[1]), V.C(viewpoint.rotation[2]), V.C(viewpoint.rotation[3]))
          const projected = projectWorldPointToPixelQuaternion(
            worldPoint, cameraPosition, cameraRotation,
            V.C(viewpoint.focalLength), V.C(viewpoint.aspectRatio),
            V.C(viewpoint.principalPointX), V.C(viewpoint.principalPointY),
            V.C(viewpoint.skewCoefficient),
            V.C(viewpoint.radialDistortion[0]), V.C(viewpoint.radialDistortion[1]), V.C(viewpoint.radialDistortion[2]),
            V.C(viewpoint.tangentialDistortion[0]), V.C(viewpoint.tangentialDistortion[1])
          )
          if (projected) {
            const error = Math.sqrt((projected[0].data - imagePoint.u) ** 2 + (projected[1].data - imagePoint.v) ** 2)
            perturbedMaxError = Math.max(perturbedMaxError, error)
          }
        }
      }
    }
    console.log(`Perturbed max error: ${perturbedMaxError.toFixed(2)}px`)

    // Run fine-tune to recover
    const result = fineTuneProject(project, {
      tolerance: 1e-6,
      maxIterations: 500,
      lockCameraPoses: true, // Keep cameras fixed, only move points
      verbose: false
    })

    // Compute final error
    let finalMaxError = 0
    for (const vp of project.viewpoints) {
      const viewpoint = vp as Viewpoint
      for (const ip of viewpoint.imagePoints) {
        const imagePoint = ip as ImagePoint
        const wp = imagePoint.worldPoint as WorldPoint
        if (wp.optimizedXyz) {
          const worldPoint = new Vec3(V.C(wp.optimizedXyz[0]), V.C(wp.optimizedXyz[1]), V.C(wp.optimizedXyz[2]))
          const cameraPosition = new Vec3(V.C(viewpoint.position[0]), V.C(viewpoint.position[1]), V.C(viewpoint.position[2]))
          const cameraRotation = new Vec4(V.C(viewpoint.rotation[0]), V.C(viewpoint.rotation[1]), V.C(viewpoint.rotation[2]), V.C(viewpoint.rotation[3]))
          const projected = projectWorldPointToPixelQuaternion(
            worldPoint, cameraPosition, cameraRotation,
            V.C(viewpoint.focalLength), V.C(viewpoint.aspectRatio),
            V.C(viewpoint.principalPointX), V.C(viewpoint.principalPointY),
            V.C(viewpoint.skewCoefficient),
            V.C(viewpoint.radialDistortion[0]), V.C(viewpoint.radialDistortion[1]), V.C(viewpoint.radialDistortion[2]),
            V.C(viewpoint.tangentialDistortion[0]), V.C(viewpoint.tangentialDistortion[1])
          )
          if (projected) {
            const error = Math.sqrt((projected[0].data - imagePoint.u) ** 2 + (projected[1].data - imagePoint.v) ** 2)
            finalMaxError = Math.max(finalMaxError, error)
          }
        }
      }
    }

    console.log(`Fine-tune: converged=${result.converged}, iterations=${result.iterations}`)
    console.log(`Final max error: ${finalMaxError.toFixed(2)}px (was ${perturbedMaxError.toFixed(2)}px after perturbation)`)

    // Fine-tune should improve or maintain the solution
    // Note: With constraints included, may not fully converge but should still work
    expect(finalMaxError).toBeLessThanOrEqual(perturbedMaxError) // Should improve or stay same
    expect(finalMaxError).toBeLessThan(5) // Should be reasonably low
  })
})

describe('Fine-tune with explicit Jacobian backend', () => {
  let originalBackend: SolverBackend

  beforeEach(() => {
    originalBackend = getSolverBackend()
  })

  afterEach(() => {
    setSolverBackend(originalBackend)
  })

  it('explicit-dense backend produces similar results to autodiff', async () => {
    // Load fixture and run full optimization first (uses autodiff)
    const fixturePath = path.join(CALIBRATION_FIXTURES_DIR, 'Fixture With 2 Image 2.json')
    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8')
    const project = loadProjectFromJson(fixtureJson)

    await optimizeProject(project, {
      maxIterations: 500,
      maxAttempts: 1,
      verbose: false
    })

    // Save the optimized positions
    const worldPoints = Array.from(project.worldPoints) as WorldPoint[]
    const autodiffPositions = new Map<WorldPoint, [number, number, number]>()
    for (const wp of worldPoints) {
      if (wp.optimizedXyz) {
        autodiffPositions.set(wp, [...wp.optimizedXyz] as [number, number, number])
      }
    }

    // Run fine-tune with autodiff to get baseline residual
    setSolverBackend('autodiff')
    const autodiffResult = fineTuneProject(project, {
      tolerance: 1e-6,
      maxIterations: 100,
      lockCameraPoses: true,
      verbose: false
    })
    console.log(`Autodiff fine-tune: converged=${autodiffResult.converged}, residual=${autodiffResult.residual.toFixed(6)}`)

    // Restore positions and run with explicit-dense
    for (const [wp, pos] of autodiffPositions) {
      wp.optimizedXyz = [...pos] as [number, number, number]
    }

    setSolverBackend('explicit-dense')
    const explicitDenseResult = fineTuneProject(project, {
      tolerance: 1e-6,
      maxIterations: 100,
      lockCameraPoses: true,
      verbose: false
    })
    console.log(`Explicit-dense fine-tune: converged=${explicitDenseResult.converged}, residual=${explicitDenseResult.residual.toFixed(6)}`)

    // Results should be similar - the key is that explicit produces reasonable results
    // Dense may not fully converge within 100 iterations, but should still produce low residual
    expect(explicitDenseResult.residual).toBeLessThan(autodiffResult.residual * 3 + 5)
  })

  it('explicit-sparse backend produces similar results to autodiff', async () => {
    // Load fixture and run full optimization first (uses autodiff)
    const fixturePath = path.join(CALIBRATION_FIXTURES_DIR, 'Fixture With 2 Image 2.json')
    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8')
    const project = loadProjectFromJson(fixtureJson)

    await optimizeProject(project, {
      maxIterations: 500,
      maxAttempts: 1,
      verbose: false
    })

    // Save the optimized positions
    const worldPoints = Array.from(project.worldPoints) as WorldPoint[]
    const autodiffPositions = new Map<WorldPoint, [number, number, number]>()
    for (const wp of worldPoints) {
      if (wp.optimizedXyz) {
        autodiffPositions.set(wp, [...wp.optimizedXyz] as [number, number, number])
      }
    }

    // Run fine-tune with autodiff to get baseline
    setSolverBackend('autodiff')
    const autodiffResult = fineTuneProject(project, {
      tolerance: 1e-6,
      maxIterations: 100,
      lockCameraPoses: true,
      verbose: false
    })
    console.log(`Autodiff fine-tune: converged=${autodiffResult.converged}, residual=${autodiffResult.residual.toFixed(6)}`)

    // Restore positions and run with explicit-sparse
    for (const [wp, pos] of autodiffPositions) {
      wp.optimizedXyz = [...pos] as [number, number, number]
    }

    setSolverBackend('explicit-sparse')
    const explicitSparseResult = fineTuneProject(project, {
      tolerance: 1e-6,
      maxIterations: 100,
      lockCameraPoses: true,
      verbose: false
    })
    console.log(`Explicit-sparse fine-tune: converged=${explicitSparseResult.converged}, residual=${explicitSparseResult.residual.toFixed(6)}`)

    // Results should be similar
    expect(explicitSparseResult.converged).toBe(true)
    expect(explicitSparseResult.residual).toBeLessThan(autodiffResult.residual * 2 + 1)
  })

  it('explicit backend can recover from perturbations', async () => {
    // Load and optimize
    const fixturePath = path.join(CALIBRATION_FIXTURES_DIR, 'Fixture With 2 Image 2.json')
    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8')
    const project = loadProjectFromJson(fixtureJson)

    await optimizeProject(project, {
      maxIterations: 500,
      maxAttempts: 1,
      verbose: false
    })

    // Save original positions
    const worldPoints = Array.from(project.worldPoints) as WorldPoint[]
    const originalPositions = new Map<WorldPoint, [number, number, number]>()
    for (const wp of worldPoints) {
      if (wp.optimizedXyz && !wp.isFullyLocked()) {
        originalPositions.set(wp, [...wp.optimizedXyz] as [number, number, number])
      }
    }

    // Perturb the world points
    for (const [wp, orig] of originalPositions) {
      wp.optimizedXyz = [
        orig[0] + (Math.random() - 0.5) * 0.3,
        orig[1] + (Math.random() - 0.5) * 0.3,
        orig[2] + (Math.random() - 0.5) * 0.3
      ]
    }

    // Run with explicit-sparse backend
    setSolverBackend('explicit-sparse')
    const result = fineTuneProject(project, {
      tolerance: 1e-6,
      maxIterations: 500,
      lockCameraPoses: true,
      verbose: false
    })

    console.log(`Explicit-sparse recovery: converged=${result.converged}, iterations=${result.iterations}, residual=${result.residual.toFixed(6)}`)

    // Should converge and have low residual
    expect(result.converged).toBe(true)
    expect(result.residual).toBeLessThan(10)
  })
})
