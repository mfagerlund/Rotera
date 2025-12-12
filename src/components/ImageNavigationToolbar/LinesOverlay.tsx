// Lines overlay for image thumbnails - renders lines between world points

import React from 'react'
import { observer } from 'mobx-react-lite'
import type { Viewpoint } from '../../entities/viewpoint'
import type { ImageBounds } from './hooks/useImageBounds'
import { project } from '../../store/project-store'
import { getEntityKey } from '../../utils/entityKeys'

interface LinesOverlayProps {
  image: Viewpoint
  imgRef: React.RefObject<HTMLImageElement>
  imgBounds: ImageBounds
}

export const LinesOverlay: React.FC<LinesOverlayProps> = observer(({
  image,
  imgRef,
  imgBounds
}) => {
  if (imgBounds.width === 0 || imgBounds.height === 0) return null

  const imgElement = imgRef.current
  const imgWidth = imgElement?.naturalWidth || image.imageWidth
  const imgHeight = imgElement?.naturalHeight || image.imageHeight

  const toThumbnailCoords = (u: number, v: number) => ({
    x: imgBounds.offsetX + (u / imgWidth) * imgBounds.width,
    y: imgBounds.offsetY + (v / imgHeight) * imgBounds.height
  })

  const lineElements: React.ReactNode[] = []

  for (const line of project.lines) {
    const imagePointsA = image.getImagePointsForWorldPoint(line.pointA)
    const imagePointsB = image.getImagePointsForWorldPoint(line.pointB)

    // Only draw line if both endpoints have exactly one image point in this view
    if (imagePointsA.length !== 1 || imagePointsB.length !== 1) continue

    const ipA = imagePointsA[0]
    const ipB = imagePointsB[0]

    const p1 = toThumbnailCoords(ipA.u, ipA.v)
    const p2 = toThumbnailCoords(ipB.u, ipB.v)

    lineElements.push(
      <line
        key={getEntityKey(line)}
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke={line.color}
        strokeWidth={1}
        strokeOpacity={0.7}
        strokeDasharray={line.isConstruction ? '3,2' : undefined}
      />
    )
  }

  if (lineElements.length === 0) return null

  return (
    <svg className="lines-overlay">
      {lineElements}
    </svg>
  )
})
