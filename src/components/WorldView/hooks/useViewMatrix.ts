// View matrix state management hook

import { useState, useCallback, useRef } from 'react'
import type { ViewMatrix } from '../types'
import type { Project } from '../../../entities/project'
import type { Viewpoint } from '../../../entities/viewpoint'

// Convert quaternion [w, x, y, z] to Euler angles (roll, pitch, yaw) in radians
// This matches how the camera UI displays orientation
function quaternionToEuler(q: [number, number, number, number]): { roll: number; pitch: number; yaw: number } {
  const [w, x, y, z] = q

  // Roll (rotation around forward axis)
  const sinr_cosp = 2 * (w * x + y * z)
  const cosr_cosp = 1 - 2 * (x * x + y * y)
  const roll = Math.atan2(sinr_cosp, cosr_cosp)

  // Pitch (rotation around right axis)
  const sinp = 2 * (w * y - z * x)
  let pitch: number
  if (Math.abs(sinp) >= 1) {
    pitch = Math.sign(sinp) * Math.PI / 2
  } else {
    pitch = Math.asin(sinp)
  }

  // Yaw (rotation around up axis)
  const siny_cosp = 2 * (w * z + x * y)
  const cosy_cosp = 1 - 2 * (y * y + z * z)
  const yaw = Math.atan2(siny_cosp, cosy_cosp)

  return { roll, pitch, yaw }
}

// Convert quaternion to rotation matrix
function quaternionToMatrix(q: [number, number, number, number]): number[][] {
  const [w, x, y, z] = q
  return [
    [1 - 2*(y*y + z*z), 2*(x*y - w*z), 2*(x*z + w*y)],
    [2*(x*y + w*z), 1 - 2*(x*x + z*z), 2*(y*z - w*x)],
    [2*(x*z - w*y), 2*(y*z + w*x), 1 - 2*(x*x + y*y)]
  ]
}

// Extract rotation.x, rotation.y, rotation.z from a rotation matrix
// The projection applies: first rotate around X by rotation.x, then around Y by rotation.y, then Z
// So the combined matrix is R_z * R_y * R_x
function matrixToViewRotation(m: number[][]): { x: number; y: number; z: number } {
  // Extract euler angles matching the projection order
  // Using standard aerospace/intrinsic XYZ decomposition
  const y = Math.asin(Math.max(-1, Math.min(1, m[0][2]))) // rotation.y (pitch)

  let x: number, z: number
  if (Math.abs(m[0][2]) < 0.9999) {
    x = Math.atan2(-m[1][2], m[2][2]) // rotation.x (roll)
    z = Math.atan2(-m[0][1], m[0][0]) // rotation.z (yaw)
  } else {
    // Gimbal lock
    x = Math.atan2(m[2][1], m[1][1])
    z = 0
  }

  return { x, y, z }
}

// Convert camera quaternion to view euler angles
export function quaternionToViewRotation(q: [number, number, number, number]): { x: number; y: number; z: number } {
  // The camera quaternion rotates from world to camera space.
  // For our view rotation we want the same world→camera orientation expressed as Euler angles.
  const m = quaternionToMatrix(q)
  return matrixToViewRotation(m)
}

export function useViewMatrix() {
  const [viewMatrix, setViewMatrix] = useState<ViewMatrix>({
    scale: 100,
    rotation: { x: 0, y: 0, z: 0 },
    translation: { x: 0, y: 0, z: 0 }
  })

  const animationRef = useRef<number | null>(null)
  const viewMatrixRef = useRef(viewMatrix)
  viewMatrixRef.current = viewMatrix

  // Animate to a target view matrix
  const animateTo = useCallback((target: ViewMatrix, duration: number = 400) => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }

    const startTime = performance.now()
    const start = { ...viewMatrixRef.current }
    const startRotation = { ...start.rotation }
    const startTranslation = { ...start.translation }

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const t = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - t, 3)

      setViewMatrix({
        scale: start.scale + (target.scale - start.scale) * eased,
        rotation: {
          x: startRotation.x + (target.rotation.x - startRotation.x) * eased,
          y: startRotation.y + (target.rotation.y - startRotation.y) * eased,
          z: startRotation.z + (target.rotation.z - startRotation.z) * eased
        },
        translation: {
          x: startTranslation.x + (target.translation.x - startTranslation.x) * eased,
          y: startTranslation.y + (target.translation.y - startTranslation.y) * eased,
          z: startTranslation.z + (target.translation.z - startTranslation.z) * eased
        },
        cameraPosition: target.cameraPosition,
        cameraQuaternion: target.cameraQuaternion,
        focalLength: target.focalLength,
        principalPoint: target.principalPoint,
        aspectRatio: target.aspectRatio,
        skew: target.skew
      })

      if (t < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        animationRef.current = null
      }
    }

    animationRef.current = requestAnimationFrame(animate)
  }, [])

  const resetView = useCallback(() => {
    animateTo({
      scale: 100,
      rotation: { x: 0, y: 0, z: 0 },
      translation: { x: 0, y: 0, z: 0 },
      cameraPosition: undefined,
      cameraQuaternion: undefined,
      focalLength: undefined,
      principalPoint: undefined,
      aspectRatio: undefined,
      skew: undefined
    })
  }, [animateTo])

  const resetRotation = useCallback(() => {
    const current = viewMatrixRef.current
    animateTo({
      ...current,
      rotation: { x: 0, y: 0, z: 0 },
      cameraPosition: undefined,
      cameraQuaternion: undefined,
      focalLength: undefined,
      principalPoint: undefined,
      aspectRatio: undefined,
      skew: undefined
    })
  }, [animateTo])

  const resetPan = useCallback(() => {
    const current = viewMatrixRef.current
    animateTo({
      ...current,
      translation: { x: 0, y: 0, z: 0 },
      cameraPosition: undefined,
      cameraQuaternion: undefined,
      focalLength: undefined,
      principalPoint: undefined,
      aspectRatio: undefined,
      skew: undefined
    })
  }, [animateTo])

  const zoomFitToProject = useCallback((project: Project, canvasWidth: number, canvasHeight: number) => {
    // Collect all 3D coordinates to fit
    const coords3D: [number, number, number][] = []

    for (const point of project.worldPoints.values()) {
      const coords = point.optimizedXyz ?? point.getEffectiveXyz()
      if (!coords) continue
      const [x, y, z] = coords
      if (x !== null && y !== null && z !== null) {
        coords3D.push([x, y, z])
      }
    }

    for (const vp of project.viewpoints.values()) {
      if (vp.position) {
        coords3D.push(vp.position)
      }
    }

    if (coords3D.length === 0) {
      const current = viewMatrixRef.current
      animateTo({
        ...current,
        scale: 100,
        translation: { x: 0, y: 0, z: 0 },
        cameraPosition: undefined,
        cameraQuaternion: undefined,
        focalLength: undefined,
        principalPoint: undefined
      })
      return
    }

    const current = viewMatrixRef.current
    const { rotation } = current
    const cos = Math.cos
    const sin = Math.sin

    // Project all points with current rotation to find 2D bounds
    let minScreenX = Infinity, maxScreenX = -Infinity
    let minScreenY = Infinity, maxScreenY = -Infinity

    for (const [x, y, z] of coords3D) {
      // Apply rotation (same as useProjection)
      const rotY1 = y * cos(rotation.x) - z * sin(rotation.x)
      const rotZ1 = y * sin(rotation.x) + z * cos(rotation.x)
      const rotX2 = x * cos(rotation.y) + rotZ1 * sin(rotation.y)
      const rotY2 = rotY1

      // These are the rotated coordinates before scale and translation
      minScreenX = Math.min(minScreenX, rotX2)
      maxScreenX = Math.max(maxScreenX, rotX2)
      minScreenY = Math.min(minScreenY, rotY2)
      maxScreenY = Math.max(maxScreenY, rotY2)
    }

    // Calculate size in rotated space
    const sizeX = Math.max(maxScreenX - minScreenX, 0.1)
    const sizeY = Math.max(maxScreenY - minScreenY, 0.1)

    // Calculate center in rotated space
    const centerRotX = (minScreenX + maxScreenX) / 2
    const centerRotY = (minScreenY + maxScreenY) / 2

    // Calculate scale to fit in canvas with margin
    const margin = 0.8
    const scaleX = (canvasWidth * margin) / sizeX
    const scaleY = (canvasHeight * margin) / sizeY
    const scale = Math.max(10, Math.min(1000, Math.min(scaleX, scaleY)))

    animateTo({
      ...current,
      scale,
      translation: {
        x: -centerRotX * scale,
        y: centerRotY * scale,
        z: 0
      },
      cameraPosition: undefined,
      cameraQuaternion: undefined,
      focalLength: undefined,
      principalPoint: undefined,
      aspectRatio: undefined,
      skew: undefined
    })
  }, [animateTo])

  const lookFromCamera = useCallback((viewpoint: Viewpoint, canvasWidth: number, canvasHeight: number) => {
    // Scale focal length to fit canvas while preserving FOV
    const imageWidth = viewpoint.imageWidth
    const imageHeight = viewpoint.imageHeight
    const scaleToFitWidth = canvasWidth / imageWidth
    const scaleToFitHeight = canvasHeight / imageHeight
    const fitScale = Math.min(scaleToFitWidth, scaleToFitHeight)
    const focalLength = viewpoint.focalLength * fitScale

    // When fitting the image onto the canvas, account for letterboxing so the principal point lands correctly.
    const scaledWidth = imageWidth * fitScale
    const scaledHeight = imageHeight * fitScale
    const offsetX = (canvasWidth - scaledWidth) / 2
    const offsetY = (canvasHeight - scaledHeight) / 2

    const principalPoint: [number, number] = [
      viewpoint.principalPointX * fitScale + offsetX,
      viewpoint.principalPointY * fitScale + offsetY
    ]

    console.log('=== lookFromCamera DEBUG ===')
    console.log('Camera:', viewpoint.name)
    console.log('Position:', viewpoint.position)
    console.log('Quaternion:', viewpoint.rotation)
    console.log('Focal length:', viewpoint.focalLength, '-> scaled:', focalLength)
    console.log('Image:', imageWidth, 'x', imageHeight, '-> Canvas:', canvasWidth, 'x', canvasHeight)
    console.log('=== END DEBUG ===')

    // Pass camera parameters directly - projection will use quaternion
    animateTo({
      scale: 100,
      rotation: { x: 0, y: 0, z: 0 },
      translation: { x: 0, y: 0, z: 0 },
      cameraPosition: viewpoint.position,
      cameraQuaternion: viewpoint.rotation,
      focalLength,
      principalPoint,
      aspectRatio: viewpoint.aspectRatio,
      skew: viewpoint.skewCoefficient
    })
  }, [animateTo])

  return {
    viewMatrix,
    setViewMatrix,
    resetView,
    resetRotation,
    resetPan,
    zoomFitToProject,
    lookFromCamera,
    animateTo
  }
}
