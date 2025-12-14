// Vanishing lines overlay for image thumbnails

import React from 'react'
import { observer } from 'mobx-react-lite'
import type { Viewpoint } from '../../entities/viewpoint'
import type { ImageBounds } from './hooks/useImageBounds'
import type { VanishingLine } from '../../entities/vanishing-line'

interface VanishingLinesOverlayProps {
  image: Viewpoint
  imgRef: React.RefObject<HTMLImageElement>
  imgBounds: ImageBounds
}

export const VanishingLinesOverlay: React.FC<VanishingLinesOverlayProps> = observer(({
  image,
  imgRef,
  imgBounds
}) => {
  if (imgBounds.width === 0 || imgBounds.height === 0) return null

  const vanishingLines = Array.from(image.vanishingLines)
  if (vanishingLines.length === 0) return null

  const imgElement = imgRef.current
  const imgWidth = imgElement?.naturalWidth || image.imageWidth
  const imgHeight = imgElement?.naturalHeight || image.imageHeight

  const toThumbnailCoords = (u: number, v: number) => ({
    x: imgBounds.offsetX + (u / imgWidth) * imgBounds.width,
    y: imgBounds.offsetY + (v / imgHeight) * imgBounds.height
  })

  return (
    <svg className="vanishing-lines-overlay">
      {vanishingLines.map((vl: VanishingLine) => {
        const p1 = toThumbnailCoords(vl.p1.u, vl.p1.v)
        const p2 = toThumbnailCoords(vl.p2.u, vl.p2.v)

        return (
          <line
            key={vl.id}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={vl.getColor()}
            strokeWidth={1}
            strokeOpacity={0.8}
            strokeDasharray="4,2,1,2"
          />
        )
      })}
    </svg>
  )
})
