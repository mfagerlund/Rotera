// Hook for calculating image bounds with object-fit: contain

import React, { useState, useEffect } from 'react'
import type { Viewpoint } from '../../../entities/viewpoint'

export interface ImageBounds {
  width: number
  height: number
  offsetX: number
  offsetY: number
}

export function useImageBounds(
  imgRef: React.RefObject<HTMLImageElement>,
  image: Viewpoint,
  thumbnailHeight: number
): { imgBounds: ImageBounds } {
  const [imgBounds, setImgBounds] = useState<ImageBounds>({ width: 0, height: 0, offsetX: 0, offsetY: 0 })

  useEffect(() => {
    const updateBounds = () => {
      if (!imgRef.current) return

      const parent = imgRef.current.parentElement
      if (!parent) return

      const parentRect = parent.getBoundingClientRect()

      // For object-fit: contain, we need to calculate the actual rendered image size
      const imgElement = imgRef.current
      const containerWidth = parentRect.width
      const containerHeight = parentRect.height

      // Use naturalWidth/naturalHeight if available, otherwise fall back to entity dimensions
      const imageNaturalWidth = imgElement.naturalWidth || image.imageWidth
      const imageNaturalHeight = imgElement.naturalHeight || image.imageHeight

      // Skip if image hasn't loaded yet
      if (imageNaturalWidth === 0 || imageNaturalHeight === 0) return

      // Calculate the scale factor for object-fit: contain
      const scaleX = containerWidth / imageNaturalWidth
      const scaleY = containerHeight / imageNaturalHeight
      const scale = Math.min(scaleX, scaleY)

      // Actual rendered dimensions
      const renderedWidth = imageNaturalWidth * scale
      const renderedHeight = imageNaturalHeight * scale

      // Centering offsets
      const offsetX = (containerWidth - renderedWidth) / 2
      const offsetY = (containerHeight - renderedHeight) / 2

      setImgBounds({
        width: renderedWidth,
        height: renderedHeight,
        offsetX,
        offsetY
      })
    }

    // Initial update
    const timer = setTimeout(updateBounds, 0)

    const imgElement = imgRef.current
    if (imgElement) {
      imgElement.addEventListener('load', updateBounds)
      // If image is already complete, update immediately
      if (imgElement.complete) {
        updateBounds()
      }
    }

    const observer = new ResizeObserver(updateBounds)
    if (imgRef.current) {
      observer.observe(imgRef.current)
    }

    return () => {
      clearTimeout(timer)
      observer.disconnect()
      if (imgElement) {
        imgElement.removeEventListener('load', updateBounds)
      }
    }
  }, [thumbnailHeight, image, image.imageWidth, image.imageHeight, image.imagePoints.size, imgRef])

  return { imgBounds }
}
