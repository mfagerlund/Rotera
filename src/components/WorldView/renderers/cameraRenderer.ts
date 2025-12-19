import type { Project } from '../../../entities/project'
import type { Viewpoint } from '../../../entities/viewpoint/Viewpoint'
import type { ProjectedPoint } from '../types'
import { getCachedImage, loadImage } from '../utils/imageCache'

function rotatePoint(point: [number, number, number], rotation: [number, number, number, number]): [number, number, number] {
  const [qw, qx, qy, qz] = rotation
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

function drawTexturedQuad(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  corners: { tl: ProjectedPoint; tr: ProjectedPoint; br: ProjectedPoint; bl: ProjectedPoint },
  opacity: number
) {
  ctx.save()
  ctx.globalAlpha = opacity

  // Calculate bounding box of the quad
  const minX = Math.min(corners.tl.x, corners.tr.x, corners.br.x, corners.bl.x)
  const maxX = Math.max(corners.tl.x, corners.tr.x, corners.br.x, corners.bl.x)
  const minY = Math.min(corners.tl.y, corners.tr.y, corners.br.y, corners.bl.y)
  const maxY = Math.max(corners.tl.y, corners.tr.y, corners.br.y, corners.bl.y)

  const width = maxX - minX
  const height = maxY - minY

  // Skip only if truly degenerate
  if (width < 1 || height < 1) {
    ctx.restore()
    return
  }

  // Create clipping path for the quad
  ctx.beginPath()
  ctx.moveTo(corners.tl.x, corners.tl.y)
  ctx.lineTo(corners.tr.x, corners.tr.y)
  ctx.lineTo(corners.br.x, corners.br.y)
  ctx.lineTo(corners.bl.x, corners.bl.y)
  ctx.closePath()
  ctx.clip()

  // Use affine transformation approximation for perspective
  // Calculate transformation matrix from image corners to quad corners
  const imgW = img.width
  const imgH = img.height

  // Use simple bilinear mapping by drawing with transform
  // Map the center and scale/skew to approximate the perspective
  const centerX = (corners.tl.x + corners.tr.x + corners.br.x + corners.bl.x) / 4
  const centerY = (corners.tl.y + corners.tr.y + corners.br.y + corners.bl.y) / 4

  // Calculate average width and height of the quad
  const topWidth = Math.sqrt((corners.tr.x - corners.tl.x) ** 2 + (corners.tr.y - corners.tl.y) ** 2)
  const bottomWidth = Math.sqrt((corners.br.x - corners.bl.x) ** 2 + (corners.br.y - corners.bl.y) ** 2)
  const leftHeight = Math.sqrt((corners.bl.x - corners.tl.x) ** 2 + (corners.bl.y - corners.tl.y) ** 2)
  const rightHeight = Math.sqrt((corners.br.x - corners.tr.x) ** 2 + (corners.br.y - corners.tr.y) ** 2)

  const avgWidth = (topWidth + bottomWidth) / 2
  const avgHeight = (leftHeight + rightHeight) / 2

  // Calculate rotation angle from the top edge
  const angle = Math.atan2(corners.tr.y - corners.tl.y, corners.tr.x - corners.tl.x)

  ctx.translate(centerX, centerY)
  ctx.rotate(angle)
  ctx.drawImage(img, -avgWidth / 2, -avgHeight / 2, avgWidth, avgHeight)

  ctx.restore()
}

export function renderCameras(
  ctx: CanvasRenderingContext2D,
  project: Project,
  selectedSet: Set<any>,
  hoveredViewpoint: Viewpoint | null,
  project3DTo2D: (point: [number, number, number]) => ProjectedPoint,
  onImageLoaded?: () => void
) {
  // Estimate scene size from world points and camera positions to scale frusta
  let sceneSize = 1
  const xs: number[] = []
  const ys: number[] = []
  const zs: number[] = []
  for (const wp of project.worldPoints) {
    const coords = wp.optimizedXyz ?? wp.getEffectiveXyz()
    if (!coords) continue
    const [x, y, z] = coords
    if (x !== null && y !== null && z !== null) {
      xs.push(x); ys.push(y); zs.push(z)
    }
  }
  for (const vp of project.viewpoints) {
    const [x, y, z] = vp.position
    xs.push(x); ys.push(y); zs.push(z)
  }
  if (xs.length > 0) {
    const spanX = Math.max(...xs) - Math.min(...xs)
    const spanY = Math.max(...ys) - Math.min(...ys)
    const spanZ = Math.max(...zs) - Math.min(...zs)
    sceneSize = Math.max(spanX, spanY, spanZ, 1)
  }
  const frustumDepth = Math.max(sceneSize * 0.25, 0.5) // 25% of scene size, min 0.5

  project.viewpoints.forEach((viewpoint) => {
    const isSelected = selectedSet.has(viewpoint)
    const isHovered = hoveredViewpoint === viewpoint

    const pos = viewpoint.position
    // Stored quaternions rotate world → camera, but to place the frustum in world space
    // we need the inverse (camera → world) rotation.
    const rot = viewpoint.rotation
    let rotInverse: [number, number, number, number] = [rot[0], -rot[1], -rot[2], -rot[3]]

    // Frustum extends along positive Z in camera space
    const zPlane = frustumDepth

    // Build image plane corners in camera space using intrinsics.
    const fx = viewpoint.focalLength
    const fy = fx * (viewpoint.aspectRatio ?? 1)
    const cx = viewpoint.principalPointX
    const cy = viewpoint.principalPointY

    const pixelCorners: [number, number][] = [
      [0, 0], // top-left pixel
      [viewpoint.imageWidth, 0], // top-right
      [viewpoint.imageWidth, viewpoint.imageHeight], // bottom-right
      [0, viewpoint.imageHeight] // bottom-left
    ]

    const [tlCamX, tlCamY] = pixelCorners[0]
    const [trCamX, trCamY] = pixelCorners[1]
    const [brCamX, brCamY] = pixelCorners[2]
    const [blCamX, blCamY] = pixelCorners[3]

    const topLeft: [number, number, number] = [ (tlCamX - cx) / fx * zPlane, -(tlCamY - cy) / fy * zPlane, zPlane ]
    const topRight: [number, number, number] = [ (trCamX - cx) / fx * zPlane, -(trCamY - cy) / fy * zPlane, zPlane ]
    const bottomRight: [number, number, number] = [ (brCamX - cx) / fx * zPlane, -(brCamY - cy) / fy * zPlane, zPlane ]
    const bottomLeft: [number, number, number] = [ (blCamX - cx) / fx * zPlane, -(blCamY - cy) / fy * zPlane, zPlane ]

    // Transform to world space
    const apex = pos
    const tlWorld = addVec3(pos, rotatePoint(topLeft, rotInverse))
    const trWorld = addVec3(pos, rotatePoint(topRight, rotInverse))
    const blWorld = addVec3(pos, rotatePoint(bottomLeft, rotInverse))
    const brWorld = addVec3(pos, rotatePoint(bottomRight, rotInverse))

    // Project to 2D
    const apexProj = project3DTo2D(apex)
    const tlProj = project3DTo2D(tlWorld)
    const trProj = project3DTo2D(trWorld)
    const blProj = project3DTo2D(blWorld)
    const brProj = project3DTo2D(brWorld)

    // Draw image texture inside frustum if available
    const cachedImg = getCachedImage(viewpoint.url)
    if (cachedImg) {
      drawTexturedQuad(ctx, cachedImg, {
        tl: tlProj,
        tr: trProj,
        br: brProj,
        bl: blProj
      }, 0.4)
    } else {
      // Start loading the image
      loadImage(viewpoint.url).then((img) => {
        if (img && onImageLoaded) {
          onImageLoaded()
        }
      })

      // Draw a semi-transparent placeholder
      ctx.save()
      ctx.globalAlpha = 0.2
      ctx.fillStyle = viewpoint.color || '#00BCD4'
      ctx.beginPath()
      ctx.moveTo(tlProj.x, tlProj.y)
      ctx.lineTo(trProj.x, trProj.y)
      ctx.lineTo(brProj.x, brProj.y)
      ctx.lineTo(blProj.x, blProj.y)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    // Draw frustum edges
    const color = isSelected ? '#FFC107' : (isHovered ? '#FFE082' : (viewpoint.color || '#00BCD4'))
    const lineWidth = isSelected ? 2.5 : (isHovered ? 2 : 1.5)

    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth

    // Draw edges from apex to corners
    ctx.beginPath()
    ctx.moveTo(apexProj.x, apexProj.y)
    ctx.lineTo(tlProj.x, tlProj.y)
    ctx.lineTo(trProj.x, trProj.y)
    ctx.lineTo(brProj.x, brProj.y)
    ctx.lineTo(blProj.x, blProj.y)
    ctx.closePath()
    ctx.stroke()

    // Draw camera position dot
    ctx.beginPath()
    ctx.arc(apexProj.x, apexProj.y, 4, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1
    ctx.stroke()

    // Draw label
    if (isHovered || isSelected) {
      ctx.fillStyle = '#000'
      ctx.font = '11px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(viewpoint.name, apexProj.x, apexProj.y - 10)
    }

  })
}
