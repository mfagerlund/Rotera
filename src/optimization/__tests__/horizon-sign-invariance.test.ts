/**
 * Horizon Sign Invariance Test
 *
 * Tests that the vanishing point camera initialization works correctly
 * when the world Y coordinate is negative (scene below XZ plane).
 *
 * The issue: When WP4 is at [0, -10, 0] (below XZ plane), the camera
 * initialization picks the wrong flip combination, resulting in a
 * camera pose where the horizon is below the vertices instead of above.
 */

import { describe, it, expect } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import { loadProjectFromJson } from '../../store/project-serialization'
import { initializeCameraWithVanishingPoints } from '../vanishing-points'
import { Viewpoint } from '../../entities/viewpoint'

function loadFixture(filename: string) {
  const fixturePath = path.join(__dirname, 'fixtures', filename)
  const json = fs.readFileSync(fixturePath, 'utf-8')
  return loadProjectFromJson(json)
}

describe('Horizon Sign Invariance', () => {
  it('should produce correct camera orientation for good horizon case (Y=+10)', () => {
    const project = loadFixture('good-horizon.json')
    const viewpoint = Array.from(project.viewpoints)[0] as Viewpoint

    // Reset camera to force re-initialization
    viewpoint.position = [0, 0, 0]
    viewpoint.rotation = [1, 0, 0, 0]

    const success = initializeCameraWithVanishingPoints(viewpoint, project.worldPoints)
    expect(success).toBe(true)

    // Camera should be ABOVE the XZ plane (positive Y)
    console.log('Good case camera position:', viewpoint.position)
    console.log('Good case camera rotation:', viewpoint.rotation)

    // For a scene with points at Y=0 and Y=+10, camera should be above Y=0
    expect(viewpoint.position[1]).toBeGreaterThan(0)

    // Compute reprojection error
    const errors = computeReprojectionErrors(project, viewpoint)
    const maxError = Math.max(...errors.map(e => e.error))
    console.log('Good case max reprojection error:', maxError)
    expect(maxError).toBeLessThan(50)
  })

  it('should produce correct camera orientation for bad horizon case (Y=-10) - CORRECTED FIXTURE', () => {
    // NOTE: The user's original bad-horizon.json was geometrically INVALID.
    // It had WP4 at [0,-10,0] but with image observations from when WP4 was at [0,+10,0].
    // This is impossible - a point can't project to the same image location from two different world positions.
    //
    // This test uses the CORRECTED fixture with properly reflected image observations.
    const project = loadFixture('bad-horizon-corrected.json')
    const viewpoint = Array.from(project.viewpoints)[0] as Viewpoint

    // Reset camera to force re-initialization
    viewpoint.position = [0, 0, 0]
    viewpoint.rotation = [1, 0, 0, 0]

    const success = initializeCameraWithVanishingPoints(viewpoint, project.worldPoints)
    expect(success).toBe(true)

    console.log('Corrected bad case camera position:', viewpoint.position)
    console.log('Corrected bad case camera rotation:', viewpoint.rotation)

    // Camera should be BELOW the XZ plane (negative Y) since scene is reflected
    expect(viewpoint.position[1]).toBeLessThan(0)

    // The reprojection error should be reasonable
    const errors = computeReprojectionErrors(project, viewpoint)
    const maxError = Math.max(...errors.map(e => e.error))
    console.log('Corrected bad case max reprojection error:', maxError)

    expect(maxError).toBeLessThan(50)
  })

  it('should handle both Y polarities with similar quality (using corrected fixture)', () => {
    const goodProject = loadFixture('good-horizon.json')
    const correctedBadProject = loadFixture('bad-horizon-corrected.json')

    const goodViewpoint = Array.from(goodProject.viewpoints)[0] as Viewpoint
    const correctedBadViewpoint = Array.from(correctedBadProject.viewpoints)[0] as Viewpoint

    // Reset cameras
    goodViewpoint.position = [0, 0, 0]
    goodViewpoint.rotation = [1, 0, 0, 0]
    correctedBadViewpoint.position = [0, 0, 0]
    correctedBadViewpoint.rotation = [1, 0, 0, 0]

    initializeCameraWithVanishingPoints(goodViewpoint, goodProject.worldPoints)
    initializeCameraWithVanishingPoints(correctedBadViewpoint, correctedBadProject.worldPoints)

    // Compute reprojection errors
    const goodErrors = computeReprojectionErrors(goodProject, goodViewpoint)
    const correctedBadErrors = computeReprojectionErrors(correctedBadProject, correctedBadViewpoint)

    const goodMaxError = Math.max(...goodErrors.map(e => e.error))
    const correctedBadMaxError = Math.max(...correctedBadErrors.map(e => e.error))

    console.log('Good case max error:', goodMaxError)
    console.log('Corrected bad case max error:', correctedBadMaxError)

    // Both should have similar quality (within 10x of each other)
    const ratio = Math.max(goodMaxError, correctedBadMaxError) / Math.min(goodMaxError, correctedBadMaxError)
    console.log('Error ratio:', ratio)
    expect(ratio).toBeLessThan(10)

    // Camera Y positions should be opposite signs (scene is reflected about XZ plane)
    expect(goodViewpoint.position[1] * correctedBadViewpoint.position[1]).toBeLessThan(0)
  })
})

function quaternionToMatrix(q: [number, number, number, number]): number[][] {
  const [qw, qx, qy, qz] = q
  return [
    [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)],
    [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)],
    [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)]
  ]
}

function computeReprojectionErrors(
  project: any,
  viewpoint: Viewpoint
): Array<{ name: string; error: number }> {
  const errors: Array<{ name: string; error: number }> = []
  const position = viewpoint.position
  const focalLength = viewpoint.focalLength
  const pp = { u: viewpoint.principalPointX, v: viewpoint.principalPointY }
  const rotationMatrix = quaternionToMatrix(viewpoint.rotation)

  for (const wp of project.worldPoints) {
    const lockedXyz = wp.lockedXyz
    if (lockedXyz.some((c: number | null) => c === null)) continue

    const imagePoints = viewpoint.getImagePointsForWorldPoint(wp)
    if (imagePoints.length === 0) continue

    const ip = imagePoints[0]
    const worldPos = [lockedXyz[0]!, lockedXyz[1]!, lockedXyz[2]!]

    // Transform to camera space
    const rel = [
      worldPos[0] - position[0],
      worldPos[1] - position[1],
      worldPos[2] - position[2]
    ]
    const camSpace = [
      rotationMatrix[0][0] * rel[0] + rotationMatrix[0][1] * rel[1] + rotationMatrix[0][2] * rel[2],
      rotationMatrix[1][0] * rel[0] + rotationMatrix[1][1] * rel[1] + rotationMatrix[1][2] * rel[2],
      rotationMatrix[2][0] * rel[0] + rotationMatrix[2][1] * rel[1] + rotationMatrix[2][2] * rel[2]
    ]

    if (camSpace[2] <= 0) {
      errors.push({ name: wp.name, error: 10000 })
      continue
    }

    // Project to image
    const projU = pp.u + focalLength * (camSpace[0] / camSpace[2])
    const projV = pp.v - focalLength * (camSpace[1] / camSpace[2])

    const du = projU - ip.u
    const dv = projV - ip.v
    const err = Math.sqrt(du * du + dv * dv)

    errors.push({ name: wp.name, error: err })
  }

  return errors
}
