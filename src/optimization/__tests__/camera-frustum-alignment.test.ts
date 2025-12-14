/**
 * Test to debug camera frustum image alignment when viewing from camera
 *
 * The issue: after Z-reflection fix, points/lines align but the camera frustum
 * image texture does not align with them.
 */

import { describe, it, expect } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import { Viewpoint } from '../../entities/viewpoint'

const outputFile = path.join(__dirname, 'camera-frustum-debug.txt')
const output: string[] = []
function log(...args: unknown[]) {
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
  output.push(msg)
  fs.writeFileSync(outputFile, output.join('\n'))
}

// Quaternion rotation: v' = q * v * q^-1
function rotateByQuaternion(point: [number, number, number], q: [number, number, number, number]): [number, number, number] {
  const [qw, qx, qy, qz] = q
  const [x, y, z] = point

  const tx = 2 * (qy * z - qz * y)
  const ty = 2 * (qz * x - qx * z)
  const tz = 2 * (qx * y - qy * x)

  return [
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx)
  ]
}

function addVec3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

// Simulate the projection from useProjection.ts
function projectPoint(
  worldPoint: [number, number, number],
  cameraPosition: [number, number, number],
  cameraQuaternion: [number, number, number, number],
  focalLength: number,
  principalPoint: [number, number],
  aspectRatio: number,
  isZReflected: boolean,
  canvasSize: [number, number]
): { x: number; y: number; depth: number } | null {
  const [x, y, z] = worldPoint
  const [camPosX, camPosY, camPosZ] = cameraPosition

  // Step 1: Translate to camera-relative coordinates
  const px = x - camPosX
  const py = y - camPosY
  const pz = z - camPosZ

  // Step 2: Rotate into camera frame
  const [camX, camY, camZ] = rotateByQuaternion([px, py, pz], cameraQuaternion)

  // Step 3: Perspective projection
  const isInFront = isZReflected ? (camZ < -0.01) : (camZ > 0.01)
  if (!isInFront) {
    return null // Behind camera
  }

  const [cx, cy] = principalPoint
  const fx = focalLength
  const fy = fx * aspectRatio

  const screenX = fx * (camX / camZ) + cx
  const screenY = cy - fy * (camY / camZ)

  return { x: screenX, y: screenY, depth: camZ }
}

// Simulate the frustum corner computation from cameraRenderer.ts
function computeFrustumCornerWorld(
  viewpoint: {
    position: [number, number, number]
    rotation: [number, number, number, number]
    focalLength: number
    aspectRatio: number
    principalPointX: number
    principalPointY: number
    imageWidth: number
    imageHeight: number
    isZReflected: boolean
  },
  pixelCorner: [number, number],
  frustumDepth: number
): [number, number, number] {
  const { position, rotation, focalLength, aspectRatio, principalPointX, principalPointY, isZReflected } = viewpoint

  const fx = focalLength
  const fy = fx * (aspectRatio ?? 1)
  const cx = principalPointX
  const cy = principalPointY

  // When isZReflected=true, "in front" means negative Z in camera space
  const zPlane = isZReflected ? -frustumDepth : frustumDepth

  // Camera space corner at zPlane
  const [pixX, pixY] = pixelCorner
  const camCorner: [number, number, number] = [
    (pixX - cx) / fx * zPlane,
    -(pixY - cy) / fy * zPlane,
    zPlane
  ]

  // Compute inverse rotation - just use conjugate of stored rotation
  // No Rz_180 correction needed: frustum and projection both use the stored quaternion
  const rotInverse: [number, number, number, number] = [rotation[0], -rotation[1], -rotation[2], -rotation[3]]

  // Transform to world space
  const rotatedCorner = rotateByQuaternion(camCorner, rotInverse)
  return addVec3(position, rotatedCorner)
}

describe('Camera Frustum Alignment', () => {
  it('should project frustum corners to correct pixel positions when viewing from same camera', () => {
    // Load a real fixture with solved camera
    const fixturePath = path.join(__dirname, 'fixtures', 'WhyNegativeYInVP.json')
    if (!fs.existsSync(fixturePath)) {
      log('Fixture not found, skipping')
      return
    }

    const data = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'))
    const vpData = data.viewpoints[0]

    // Simulate a solved viewpoint with isZReflected=true
    const viewpoint = {
      position: vpData.position as [number, number, number],
      rotation: vpData.rotation as [number, number, number, number],
      focalLength: vpData.focalLength,
      aspectRatio: vpData.aspectRatio ?? 1,
      principalPointX: vpData.principalPointX,
      principalPointY: vpData.principalPointY,
      imageWidth: vpData.imageWidth,
      imageHeight: vpData.imageHeight,
      isZReflected: vpData.isZReflected ?? false
    }

    log('\n=== Camera Frustum Alignment Test ===')
    log('Camera:', vpData.name)
    log('Position:', viewpoint.position)
    log('Rotation:', viewpoint.rotation)
    log('isZReflected:', viewpoint.isZReflected)
    log('Image size:', viewpoint.imageWidth, 'x', viewpoint.imageHeight)
    log('Focal length:', viewpoint.focalLength)
    log('Principal point:', viewpoint.principalPointX, viewpoint.principalPointY)

    // Canvas matches image size for this test
    const canvasWidth = viewpoint.imageWidth
    const canvasHeight = viewpoint.imageHeight
    const principalPoint: [number, number] = [viewpoint.principalPointX, viewpoint.principalPointY]

    const frustumDepth = 1.0 // Arbitrary depth for frustum visualization

    // Test all 4 corners
    const pixelCorners: Array<{ name: string; pixel: [number, number] }> = [
      { name: 'top-left', pixel: [0, 0] },
      { name: 'top-right', pixel: [viewpoint.imageWidth, 0] },
      { name: 'bottom-right', pixel: [viewpoint.imageWidth, viewpoint.imageHeight] },
      { name: 'bottom-left', pixel: [0, viewpoint.imageHeight] }
    ]

    log('\n--- Frustum Corner Projection Test ---')
    log('Expected: each corner projects back to its original pixel position')

    for (const { name, pixel } of pixelCorners) {
      // Step 1: Compute frustum corner in world space
      const worldCorner = computeFrustumCornerWorld(viewpoint, pixel, frustumDepth)

      // Step 2: Project that world corner using same camera parameters
      const projected = projectPoint(
        worldCorner,
        viewpoint.position,
        viewpoint.rotation,
        viewpoint.focalLength,
        principalPoint,
        viewpoint.aspectRatio,
        viewpoint.isZReflected,
        [canvasWidth, canvasHeight]
      )

      log(`\n${name} corner:`)
      log(`  Expected pixel: (${pixel[0]}, ${pixel[1]})`)
      log(`  World coord: (${worldCorner[0].toFixed(3)}, ${worldCorner[1].toFixed(3)}, ${worldCorner[2].toFixed(3)})`)

      if (projected) {
        log(`  Projected: (${projected.x.toFixed(2)}, ${projected.y.toFixed(2)})`)
        log(`  Depth (camZ): ${projected.depth.toFixed(3)}`)
        log(`  Error: (${(projected.x - pixel[0]).toFixed(2)}, ${(projected.y - pixel[1]).toFixed(2)})`)

        // Verify the projection matches the original pixel
        expect(Math.abs(projected.x - pixel[0])).toBeLessThan(1)
        expect(Math.abs(projected.y - pixel[1])).toBeLessThan(1)
      } else {
        log(`  Projected: BEHIND CAMERA!`)
        expect(projected).not.toBeNull()
      }
    }

    log('\n=== Test Complete ===')
  })

  it('should test with a synthetic camera to isolate the math', () => {
    // Create a simple camera at origin looking down +Z
    // With isZReflected=false first
    log('\n=== Synthetic Camera Test ===')

    const imageWidth = 800
    const imageHeight = 600
    const focalLength = 500
    const aspectRatio = 1

    // Camera at origin, identity rotation (looking down +Z in right-handed system)
    const cameraPosition: [number, number, number] = [0, 0, 0]
    const cameraRotation: [number, number, number, number] = [1, 0, 0, 0] // Identity quaternion

    const viewpoint = {
      position: cameraPosition,
      rotation: cameraRotation,
      focalLength,
      aspectRatio,
      principalPointX: imageWidth / 2,
      principalPointY: imageHeight / 2,
      imageWidth,
      imageHeight,
      isZReflected: false
    }

    log('Test 1: isZReflected=false (original)')
    testFrustumAlignment(viewpoint)

    // Now simulate what happens after Z-reflection transform
    // Q' = Q * Rz_180 = [1,0,0,0] * [0,0,0,1] = [0,0,0,1] * [1,0,0,0] wait...
    // Actually Q * [0,0,0,1]:
    // [w,x,y,z] * [0,0,0,1] = [-z, y, -x, w]
    // [1,0,0,0] * [0,0,0,1] = [0, 0, 0, 1]

    log('\nTest 2: isZReflected=true (after transform)')
    const viewpointReflected = {
      ...viewpoint,
      rotation: [0, 0, 0, 1] as [number, number, number, number], // Identity * Rz_180
      isZReflected: true
    }
    testFrustumAlignment(viewpointReflected)
  })
})

function testFrustumAlignment(viewpoint: {
  position: [number, number, number]
  rotation: [number, number, number, number]
  focalLength: number
  aspectRatio: number
  principalPointX: number
  principalPointY: number
  imageWidth: number
  imageHeight: number
  isZReflected: boolean
}) {
  const canvasWidth = viewpoint.imageWidth
  const canvasHeight = viewpoint.imageHeight
  const principalPoint: [number, number] = [viewpoint.principalPointX, viewpoint.principalPointY]
  const frustumDepth = 1.0

  log(`  Camera position: ${JSON.stringify(viewpoint.position)}`)
  log(`  Camera rotation: ${JSON.stringify(viewpoint.rotation)}`)
  log(`  isZReflected: ${viewpoint.isZReflected}`)

  const pixelCorners: Array<{ name: string; pixel: [number, number] }> = [
    { name: 'top-left', pixel: [0, 0] },
    { name: 'top-right', pixel: [viewpoint.imageWidth, 0] },
    { name: 'bottom-right', pixel: [viewpoint.imageWidth, viewpoint.imageHeight] },
    { name: 'bottom-left', pixel: [0, viewpoint.imageHeight] }
  ]

  let allPassed = true
  for (const { name, pixel } of pixelCorners) {
    const worldCorner = computeFrustumCornerWorld(viewpoint, pixel, frustumDepth)
    log(`  ${name}:`)
    log(`    Pixel: (${pixel[0]}, ${pixel[1]})`)
    log(`    World corner: (${worldCorner[0].toFixed(3)}, ${worldCorner[1].toFixed(3)}, ${worldCorner[2].toFixed(3)})`)

    // Detailed projection trace
    const [x, y, z] = worldCorner
    const [camPosX, camPosY, camPosZ] = viewpoint.position
    const px = x - camPosX
    const py = y - camPosY
    const pz = z - camPosZ
    log(`    Camera-relative: (${px.toFixed(3)}, ${py.toFixed(3)}, ${pz.toFixed(3)})`)

    const [camX, camY, camZ] = rotateByQuaternion([px, py, pz], viewpoint.rotation)
    log(`    After rotation: (${camX.toFixed(3)}, ${camY.toFixed(3)}, ${camZ.toFixed(3)})`)

    const isInFront = viewpoint.isZReflected ? (camZ < -0.01) : (camZ > 0.01)
    log(`    isInFront check: camZ=${camZ.toFixed(3)}, isZReflected=${viewpoint.isZReflected}, result=${isInFront}`)

    const projected = projectPoint(
      worldCorner,
      viewpoint.position,
      viewpoint.rotation,
      viewpoint.focalLength,
      principalPoint,
      viewpoint.aspectRatio,
      viewpoint.isZReflected,
      [canvasWidth, canvasHeight]
    )

    if (projected) {
      const errorX = Math.abs(projected.x - pixel[0])
      const errorY = Math.abs(projected.y - pixel[1])
      const pass = errorX < 1 && errorY < 1
      log(`    Projected: (${projected.x.toFixed(1)}, ${projected.y.toFixed(1)}) - ${pass ? 'PASS' : 'FAIL'}`)
      if (!pass) allPassed = false
    } else {
      log(`    Projected: BEHIND CAMERA - FAIL`)
      allPassed = false
    }
  }

  expect(allPassed).toBe(true)
}
