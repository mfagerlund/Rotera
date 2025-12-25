import { loadProjectFromJson } from '../../store/project-serialization'
import { checkOptimizationReadiness } from '../optimization-readiness'
import { canInitializeWithVanishingPoints } from '../vanishing-points'
import { collectDirectionConstrainedLines } from '../vanishing-points/detection'
import { optimizeProject } from '../optimize-project'
import fixtureData from './fixtures/Calibration/Hej Hej - Line Directions.json'

const fixtureJson = JSON.stringify(fixtureData)

describe('Optimization readiness with direction-constrained lines', () => {
  it('should recognize direction-constrained lines as valid for VP initialization', () => {
    const project = loadProjectFromJson(fixtureJson)

    // Check what the readiness says
    const readiness = checkOptimizationReadiness(project)

    console.log('Readiness:', {
      canOptimize: readiness.canOptimize,
      canInitialize: readiness.canInitialize,
      issues: readiness.issues
    })

    // Should be able to optimize
    expect(readiness.canOptimize).toBe(true)
    expect(readiness.issues.filter(i => i.type === 'error')).toHaveLength(0)
  })

  it('should collect virtual VP lines from direction-constrained Lines', () => {
    const project = loadProjectFromJson(fixtureJson)
    const viewpoints = Array.from(project.viewpoints)

    for (const vp of viewpoints) {
      const virtualLines = collectDirectionConstrainedLines(vp)
      console.log(`Viewpoint "${vp.name}":`, virtualLines.map(l => l.axis))

      // Group by axis
      const byAxis: Record<string, number> = { x: 0, y: 0, z: 0 }
      virtualLines.forEach(l => byAxis[l.axis]++)
      console.log(`  Axis counts:`, byAxis)
    }
  })

  it('should recognize VP init is possible for camera with 2 axes and 1 locked point + scale', () => {
    const project = loadProjectFromJson(fixtureJson)
    const viewpoints = Array.from(project.viewpoints)
    const worldPoints = project.worldPoints

    // Check hasScaleReference
    const lines = Array.from(project.lines)
    const hasScale = lines.some(l => l.hasFixedLength())
    console.log('Has scale reference:', hasScale)

    // Check locked points
    const lockedPoints = Array.from(worldPoints).filter(wp => wp.isFullyConstrained())
    console.log('Locked points:', lockedPoints.map(p => p.name))

    for (const vp of viewpoints) {
      const canInit = canInitializeWithVanishingPoints(vp, worldPoints, { allowSinglePoint: hasScale })
      console.log(`Viewpoint "${vp.name}" canInitializeWithVanishingPoints:`, canInit)
    }

    // At least one viewpoint should be able to init with VP
    const anyCanInit = viewpoints.some(vp =>
      canInitializeWithVanishingPoints(vp, worldPoints, { allowSinglePoint: hasScale })
    )
    expect(anyCanInit).toBe(true)
  })

  it('should simulate optimization flow', () => {
    const project = loadProjectFromJson(fixtureJson)
    const viewpointArray = Array.from(project.viewpoints)
    const worldPointArray = Array.from(project.worldPoints)
    const worldPointSet = project.worldPoints

    // Simulate what the orchestrator does - RESET ALL CAMERAS like the real code does
    for (const vp of viewpointArray) {
      vp.position = [0, 0, 0]
      vp.rotation = [1, 0, 0, 0]
    }

    const uninitializedCameras = viewpointArray.filter(vp => {
      return vp.position[0] === 0 && vp.position[1] === 0 && vp.position[2] === 0;
    });
    console.log('Uninitialized cameras:', uninitializedCameras.map(v => v.name))

    const lockedPoints = worldPointArray.filter(wp => wp.isFullyConstrained());
    console.log('Locked points:', lockedPoints.map(p => p.name))

    const canAnyUninitCameraUseVPStrict = uninitializedCameras.some(vp =>
      canInitializeWithVanishingPoints(vp, worldPointSet, { allowSinglePoint: false })
    );
    console.log('canAnyUninitCameraUseVPStrict:', canAnyUninitCameraUseVPStrict)

    const canAnyUninitCameraUseVPRelaxed = uninitializedCameras.some(vp =>
      canInitializeWithVanishingPoints(vp, worldPointSet, { allowSinglePoint: true })
    );
    console.log('canAnyUninitCameraUseVPRelaxed:', canAnyUninitCameraUseVPRelaxed)

    // Check each camera individually
    for (const vp of uninitializedCameras) {
      console.log(`Camera ${vp.name}:`)
      console.log(`  position: [${vp.position.join(', ')}]`)
      const virtualLines = collectDirectionConstrainedLines(vp)
      const byAxis: Record<string, number> = { x: 0, y: 0, z: 0 }
      virtualLines.forEach(l => byAxis[l.axis]++)
      console.log(`  virtual lines by axis:`, byAxis)
      console.log(`  canInitStrict:`, canInitializeWithVanishingPoints(vp, worldPointSet, { allowSinglePoint: false }))
      console.log(`  canInitRelaxed:`, canInitializeWithVanishingPoints(vp, worldPointSet, { allowSinglePoint: true }))
    }

    expect(canAnyUninitCameraUseVPRelaxed).toBe(true)
  })

  it('should actually optimize the project', async () => {
    const project = loadProjectFromJson(fixtureJson)

    // Clear optimizedXyz to force re-initialization
    for (const wp of project.worldPoints) {
      wp.optimizedXyz = undefined
    }

    // Debug: Check what the caller will compute
    const viewpointArray = Array.from(project.viewpoints)
    const worldPointSet = project.worldPoints

    // Simulate reset
    for (const vp of viewpointArray) {
      vp.position = [0, 0, 0]
      vp.rotation = [1, 0, 0, 0]
    }

    const canAnyUninitCameraUseVPStrict = viewpointArray.some(vp =>
      canInitializeWithVanishingPoints(vp, worldPointSet, { allowSinglePoint: false })
    );
    const canAnyUninitCameraUseVPRelaxed = viewpointArray.some(vp =>
      canInitializeWithVanishingPoints(vp, worldPointSet, { allowSinglePoint: true })
    );

    console.log('Before optimization:')
    console.log('  canAnyUseVPStrict:', canAnyUninitCameraUseVPStrict)
    console.log('  canAnyUseVPRelaxed:', canAnyUninitCameraUseVPRelaxed)

    // Check each camera
    for (const vp of viewpointArray) {
      const virtualLines = collectDirectionConstrainedLines(vp)
      const byAxis: Record<string, number> = { x: 0, y: 0, z: 0 }
      virtualLines.forEach(l => byAxis[l.axis]++)
      console.log(`  Camera ${vp.name}:`)
      console.log(`    virtual lines by axis:`, byAxis)
      console.log(`    canInit(strict):`, canInitializeWithVanishingPoints(vp, worldPointSet, { allowSinglePoint: false }))
      console.log(`    canInit(relaxed):`, canInitializeWithVanishingPoints(vp, worldPointSet, { allowSinglePoint: true }))
    }

    // Now reload and try optimization (fresh project)
    const freshProject = loadProjectFromJson(fixtureJson)
    for (const wp of freshProject.worldPoints) {
      wp.optimizedXyz = undefined
    }

    try {
      const result = await optimizeProject(freshProject, {
        maxIterations: 100,
        tolerance: 1e-6,
      })

      // Check camera positions
      for (const vp of freshProject.viewpoints) {
        console.log(`Camera ${vp.name}: pos=[${vp.position.map(x => x.toFixed(2)).join(', ')}]`)
      }

      // Check point positions
      for (const wp of freshProject.worldPoints) {
        if (wp.optimizedXyz) {
          console.log(`Point ${wp.name}: [${wp.optimizedXyz.map(x => x.toFixed(2)).join(', ')}]`)
        } else {
          console.log(`Point ${wp.name}: not initialized`)
        }
      }

      console.log('Optimization result:', {
        converged: result.converged,
        residual: result.residual,
        iterations: result.iterations,
        error: result.error,
      })

      // For now, just check that it ran without error
      expect(result.residual).toBeLessThan(Infinity)
    } catch (e) {
      console.error('Optimization failed:', e)
      throw e
    }
  })
})
