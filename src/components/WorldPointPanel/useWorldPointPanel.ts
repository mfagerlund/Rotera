import { useState, useEffect, useRef } from 'react'
import type { WorldPoint } from '../../entities/world-point'
import type { Viewpoint } from '../../entities/viewpoint'
import type { Constraint } from '../../entities/constraints/base-constraint'
import {
  isDistanceConstraint,
  isAngleConstraint,
  isCollinearPointsConstraint,
  isCoplanarPointsConstraint,
  isParallelLinesConstraint,
  isPerpendicularLinesConstraint,
  isFixedPointConstraint,
  isEqualDistancesConstraint,
  isEqualAnglesConstraint,
  isProjectionConstraint
} from '../../entities/constraints'

interface UseWorldPointPanelProps {
  worldPoints: Set<WorldPoint>
  viewpoints: Map<string, Viewpoint>
  constraints: Constraint[]
  currentViewpoint: Viewpoint | null
}

export function useWorldPointPanel({
  worldPoints,
  viewpoints,
  constraints,
  currentViewpoint
}: UseWorldPointPanelProps) {
  const [editingWorldPoint, setEditingWorldPoint] = useState<WorldPoint | null>(null)
  const [editingName, setEditingName] = useState('')
  const [recentlyCreated, setRecentlyCreated] = useState<Set<WorldPoint>>(new Set())
  const [justPlaced, setJustPlaced] = useState<Set<WorldPoint>>(new Set())
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean
    position: { x: number; y: number }
    worldPoint: WorldPoint | null
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    worldPoint: null
  })

  const prevWorldPointCount = useRef(worldPoints.size)

  // Track newly created world points
  useEffect(() => {
    const currentCount = worldPoints.size
    if (currentCount > prevWorldPointCount.current) {
      const currentPoints = Array.from(worldPoints.values())
      const prevCount = prevWorldPointCount.current
      const newPoints = currentPoints.slice(prevCount)

      newPoints.forEach(point => {
        setRecentlyCreated(prev => new Set(prev).add(point))
      })

      setTimeout(() => {
        newPoints.forEach(point => {
          setRecentlyCreated(prev => {
            const next = new Set(prev)
            next.delete(point)
            return next
          })
        })
      }, 2000)
    }
    prevWorldPointCount.current = currentCount
  }, [worldPoints])

  // Helper: Get image point count for a world point
  const getImagePointCount = (worldPoint: WorldPoint): number => {
    let count = 0
    for (const viewpoint of viewpoints.values()) {
      if (Array.from(viewpoint.imagePoints).some(ip => ip.worldPoint === worldPoint)) {
        count++
      }
    }
    return count
  }

  // Helper: Check if world point is in current image
  const isWorldPointInImage = (worldPoint: WorldPoint, viewpoint: Viewpoint): boolean => {
    return Array.from(viewpoint.imagePoints).some(ip => ip.worldPoint === worldPoint)
  }

  // Helper: Get all points from a constraint
  const getConstraintPoints = (constraint: Constraint): WorldPoint[] => {
    if (isDistanceConstraint(constraint)) {
      return [constraint.pointA, constraint.pointB]
    } else if (isAngleConstraint(constraint)) {
      return [constraint.pointA, constraint.vertex, constraint.pointC]
    } else if (isCollinearPointsConstraint(constraint) || isCoplanarPointsConstraint(constraint)) {
      return constraint.points || []
    } else if (isParallelLinesConstraint(constraint) || isPerpendicularLinesConstraint(constraint)) {
      const points: WorldPoint[] = []
      if (constraint.lineA) {
        points.push(constraint.lineA.pointA, constraint.lineA.pointB)
      }
      if (constraint.lineB) {
        points.push(constraint.lineB.pointA, constraint.lineB.pointB)
      }
      return points
    } else if (isFixedPointConstraint(constraint)) {
      return [constraint.point]
    } else if (isEqualDistancesConstraint(constraint)) {
      const points: WorldPoint[] = []
      if (constraint.distancePairs) {
        constraint.distancePairs.forEach((pair: [WorldPoint, WorldPoint]) => {
          points.push(pair[0], pair[1])
        })
      }
      return points
    } else if (isEqualAnglesConstraint(constraint)) {
      const points: WorldPoint[] = []
      if (constraint.angleTriplets) {
        constraint.angleTriplets.forEach((triplet: [WorldPoint, WorldPoint, WorldPoint]) => {
          points.push(triplet[0], triplet[1], triplet[2])
        })
      }
      return points
    } else if (isProjectionConstraint(constraint)) {
      return [constraint.worldPoint]
    }

    return []
  }

  // Find constraints involving a world point
  const getConstraintsForWorldPoint = (wp: WorldPoint): Constraint[] => {
    return constraints.filter(constraint => {
      const constraintPoints = getConstraintPoints(constraint)
      return constraintPoints.some(p => p === wp)
    })
  }

  // Check if world point has any broken constraints
  const hasBrokenConstraints = (wp: WorldPoint): boolean => {
    const wpConstraints = getConstraintsForWorldPoint(wp)
    return wpConstraints.some(constraint => {
      const constraintPoints = getConstraintPoints(constraint)
      return constraintPoints.some(p => !Array.from(worldPoints.values()).includes(p))
    })
  }

  // Check if world point is missing from current image
  const isWorldPointMissingFromImage = (wp: WorldPoint): boolean => {
    if (!currentViewpoint) return false
    return !isWorldPointInImage(wp, currentViewpoint)
  }

  // Group world points by presence in current image
  const presentWPs = Array.from(worldPoints.values()).filter(wp => !isWorldPointMissingFromImage(wp))
  const missingWPs = Array.from(worldPoints.values()).filter(wp => isWorldPointMissingFromImage(wp))

  // Find the most recently created world point that's missing from current image
  const latestMissingWP = missingWPs.length > 0 ?
    missingWPs.reduce((latest, wp) => wp.getName() > latest.getName() ? wp : latest) : null

  const worldPointsList = [...presentWPs, ...missingWPs].sort((a, b) => a.getName().localeCompare(b.getName()))

  const markAsJustPlaced = (wp: WorldPoint) => {
    setJustPlaced(prev => new Set(prev).add(wp))

    setTimeout(() => {
      setJustPlaced(prev => {
        const next = new Set(prev)
        next.delete(wp)
        return next
      })
    }, 1500)
  }

  const startEditing = (wp: WorldPoint) => {
    setEditingWorldPoint(wp)
    setEditingName(wp.getName())
  }

  const saveEdit = (onRenameWorldPoint: (worldPoint: WorldPoint, newName: string) => void) => {
    if (editingWorldPoint && editingName.trim()) {
      onRenameWorldPoint(editingWorldPoint, editingName.trim())
    }
    setEditingWorldPoint(null)
    setEditingName('')
  }

  const cancelEdit = () => {
    setEditingWorldPoint(null)
    setEditingName('')
  }

  const handleContextMenu = (e: React.MouseEvent, worldPoint: WorldPoint) => {
    e.preventDefault()
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      worldPoint
    })
  }

  const closeContextMenu = () => {
    setContextMenu(prev => ({ ...prev, isOpen: false }))
  }

  return {
    editingWorldPoint,
    editingName,
    setEditingName,
    recentlyCreated,
    justPlaced,
    contextMenu,
    worldPointsList,
    presentWPs,
    missingWPs,
    latestMissingWP,
    getImagePointCount,
    isWorldPointInImage,
    getConstraintPoints,
    getConstraintsForWorldPoint,
    hasBrokenConstraints,
    isWorldPointMissingFromImage,
    markAsJustPlaced,
    startEditing,
    saveEdit,
    cancelEdit,
    handleContextMenu,
    closeContextMenu
  }
}
