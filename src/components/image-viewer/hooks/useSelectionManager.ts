import { useCallback } from 'react'
import { WorldPoint } from '../../../entities/world-point'
import { Line } from '../../../entities/line'
import { VanishingLine } from '../../../entities/vanishing-line'
import { Viewpoint } from '../../../entities/viewpoint'
import { ImageCoords, CanvasOffset } from '../types'
import { VisibilitySettings, LockSettings } from '../../../types/visibility'
import { ToolContext } from '../../../types/tool-context'

export interface UseSelectionManagerParams {
  image: Viewpoint
  worldPoints: Map<string, WorldPoint>
  lineEntities: Map<string, Line>
  scale: number
  offset: CanvasOffset
  visibility: VisibilitySettings
  locking: LockSettings
  toolContext: ToolContext
}

export interface UseSelectionManagerReturn {
  findNearbyPoint: (canvasX: number, canvasY: number, threshold?: number) => WorldPoint | undefined
  findNearbyLine: (canvasX: number, canvasY: number, threshold?: number) => Line | null
  findNearbyVanishingLine: (canvasX: number, canvasY: number, threshold?: number) => VanishingLine | null
  findNearbyVanishingLinePart: (canvasX: number, canvasY: number, endpointThreshold?: number, lineThreshold?: number) => { line: VanishingLine; part: 'p1' | 'p2' | 'whole' } | null
  isEntityTypeInteractive: (entityType: keyof VisibilitySettings) => boolean
}

export function useSelectionManager({
  image,
  worldPoints,
  lineEntities,
  scale,
  offset,
  visibility,
  locking,
  toolContext
}: UseSelectionManagerParams): UseSelectionManagerReturn {

  const isEntityTypeInteractive = useCallback((entityType: keyof VisibilitySettings): boolean => {
    if (toolContext.allowedEntityTypes !== null) {
      if (!toolContext.allowedEntityTypes.has(entityType)) {
        return false
      }
    }

    if (!visibility[entityType]) {
      return false
    }

    const lockKey = entityType as keyof LockSettings
    if (lockKey in locking && locking[lockKey]) {
      return false
    }

    return true
  }, [toolContext, visibility, locking])

  const findNearbyPoint = useCallback((canvasX: number, canvasY: number, threshold: number = 15) => {
    if (!isEntityTypeInteractive('worldPoints')) {
      return undefined
    }

    return Array.from(worldPoints.values()).find(wp => {
      const imagePoint = image.getImagePointsForWorldPoint(wp)[0]
      if (!imagePoint) return false

      const pointCanvasX = imagePoint.u * scale + offset.x
      const pointCanvasY = imagePoint.v * scale + offset.y

      const distance = Math.sqrt(
        Math.pow(pointCanvasX - canvasX, 2) + Math.pow(pointCanvasY - canvasY, 2)
      )

      return distance <= threshold
    })
  }, [isEntityTypeInteractive, image, offset.x, offset.y, scale, worldPoints])

  const findNearbyLine = useCallback((canvasX: number, canvasY: number, threshold: number = 10): Line | null => {
    if (!isEntityTypeInteractive('lines')) {
      return null
    }

    for (const [lineId, lineEntity] of Array.from(lineEntities.entries())) {
      const pointA = lineEntity.pointA
      const pointB = lineEntity.pointB

      const ipA = image.getImagePointsForWorldPoint(pointA)[0]
      const ipB = image.getImagePointsForWorldPoint(pointB)[0]
      if (!ipA || !ipB) continue

      const x1 = ipA.u * scale + offset.x
      const y1 = ipA.v * scale + offset.y
      const x2 = ipB.u * scale + offset.x
      const y2 = ipB.v * scale + offset.y

      const A = canvasX - x1
      const B = canvasY - y1
      const C = x2 - x1
      const D = y2 - y1

      const dot = A * C + B * D
      const lenSq = C * C + D * D

      if (lenSq === 0) {
        const distance = Math.sqrt(A * A + B * B)
        if (distance <= threshold) return lineEntity
        continue
      }

      let param = dot / lenSq
      param = Math.max(0, Math.min(1, param))

      const closestX = x1 + param * C
      const closestY = y1 + param * D

      const distance = Math.sqrt(
        Math.pow(canvasX - closestX, 2) + Math.pow(canvasY - closestY, 2)
      )

      if (distance <= threshold) return lineEntity
    }
    return null
  }, [isEntityTypeInteractive, image, lineEntities, offset.x, offset.y, scale])

  const findNearbyVanishingLinePart = useCallback((canvasX: number, canvasY: number, endpointThreshold: number = 15, lineThreshold: number = 10): { line: VanishingLine; part: 'p1' | 'p2' | 'whole' } | null => {
    if (!isEntityTypeInteractive('vanishingLines')) {
      return null
    }

    if (!image.vanishingLines) return null

    for (const vanishingLine of image.vanishingLines) {
      const x1 = vanishingLine.p1.u * scale + offset.x
      const y1 = vanishingLine.p1.v * scale + offset.y
      const x2 = vanishingLine.p2.u * scale + offset.x
      const y2 = vanishingLine.p2.v * scale + offset.y

      const dist1 = Math.sqrt((canvasX - x1) ** 2 + (canvasY - y1) ** 2)
      if (dist1 <= endpointThreshold) {
        return { line: vanishingLine, part: 'p1' }
      }

      const dist2 = Math.sqrt((canvasX - x2) ** 2 + (canvasY - y2) ** 2)
      if (dist2 <= endpointThreshold) {
        return { line: vanishingLine, part: 'p2' }
      }

      const A = canvasX - x1
      const B = canvasY - y1
      const C = x2 - x1
      const D = y2 - y1

      const dot = A * C + B * D
      const lenSq = C * C + D * D

      if (lenSq === 0) continue

      let param = dot / lenSq
      param = Math.max(0, Math.min(1, param))

      const closestX = x1 + param * C
      const closestY = y1 + param * D

      const distance = Math.sqrt((canvasX - closestX) ** 2 + (canvasY - closestY) ** 2)

      if (distance <= lineThreshold) {
        return { line: vanishingLine, part: 'whole' }
      }
    }

    return null
  }, [isEntityTypeInteractive, image, offset.x, offset.y, scale])

  const findNearbyVanishingLine = useCallback((canvasX: number, canvasY: number, threshold: number = 10): VanishingLine | null => {
    const result = findNearbyVanishingLinePart(canvasX, canvasY, threshold, threshold)
    return result ? result.line : null
  }, [findNearbyVanishingLinePart])

  return {
    findNearbyPoint,
    findNearbyLine,
    findNearbyVanishingLine,
    findNearbyVanishingLinePart,
    isEntityTypeInteractive
  }
}
