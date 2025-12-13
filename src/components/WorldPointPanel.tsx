// Enhanced World Point Panel with delightful micro-interactions

import React, { useState, useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowsLeftRight, faBullseye, faCamera, faDraftingCompass, faGear, faLocationDot, faPencil, faRocket, faTrash, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import { faCircle } from '@fortawesome/free-regular-svg-icons'
// Entity imports
import type { WorldPoint } from '../entities/world-point'
import type { Viewpoint } from '../entities/viewpoint'
import type { Constraint } from '../entities/constraints/base-constraint'
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
} from '../entities/constraints'
import ContextMenu, { ContextMenuItem } from './ContextMenu'
import { useConfirm } from './ConfirmDialog'
import { getEntityKey } from '../utils/entityKeys'
import { setDraggingWorldPoint, clearDraggingWorldPoint } from '../utils/dragContext'
import { getConstraintDisplayName } from '../utils/constraintDisplay'

interface WorldPointPanelProps {
  worldPoints: Map<string, WorldPoint>
  viewpoints: Map<string, Viewpoint>
  constraints: Constraint[]
  selectedWorldPoints: WorldPoint[]
  hoveredWorldPoint?: WorldPoint | null
  currentViewpoint: Viewpoint | null
  placementMode: { active: boolean; worldPoint: WorldPoint | null }
  onSelectWorldPoint: (worldPoint: WorldPoint, ctrlKey: boolean, shiftKey: boolean) => void
  onRenameWorldPoint: (worldPoint: WorldPoint, newName: string) => void
  onDeleteWorldPoint: (worldPoint: WorldPoint) => void
  onEditWorldPoint?: (worldPoint: WorldPoint) => void
  onHighlightWorldPoint: (worldPoint: WorldPoint | null) => void
  onHoverWorldPoint?: (worldPoint: WorldPoint | null) => void
  onStartPlacement: (worldPoint: WorldPoint) => void
  onCancelPlacement: () => void
}

export const WorldPointPanel: React.FC<WorldPointPanelProps> = observer(({
  worldPoints,
  viewpoints,
  constraints,
  selectedWorldPoints,
  hoveredWorldPoint,
  currentViewpoint,
  placementMode,
  onSelectWorldPoint,
  onRenameWorldPoint,
  onDeleteWorldPoint,
  onEditWorldPoint,
  onHighlightWorldPoint,
  onHoverWorldPoint,
  onStartPlacement,
  onCancelPlacement
}) => {
  const { confirm, dialog } = useConfirm()
  const [editingWorldPoint, setEditingWorldPoint] = useState<WorldPoint | null>(null)
  const [editingName, setEditingName] = useState('')
  const [recentlyCreated, setRecentlyCreated] = useState<Set<WorldPoint>>(new Set())
  const [justPlaced, setJustPlaced] = useState<Set<WorldPoint>>(new Set())

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean
    position: { x: number; y: number }
    worldPoint: WorldPoint | null
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    worldPoint: null
  })
  // Track newly created world points
  const prevWorldPointCount = React.useRef(worldPoints.size)

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

  // Helper: Get all points from a constraint
  const getConstraintPoints = (constraint: Constraint): WorldPoint[] => {
    // Use type guards instead of 'as any' casts
    if (isDistanceConstraint(constraint)) {
      return [constraint.pointA, constraint.pointB]
    } else if (isAngleConstraint(constraint)) {
      return [constraint.pointA, constraint.vertex, constraint.pointC]
    } else if (isCollinearPointsConstraint(constraint) || isCoplanarPointsConstraint(constraint)) {
      return constraint.points || []
    } else if (isParallelLinesConstraint(constraint) || isPerpendicularLinesConstraint(constraint)) {
      // Lines have pointA and pointB
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

  const startEditing = (wp: WorldPoint) => {
    setEditingWorldPoint(wp)
    setEditingName(wp.getName())
  }

  const saveEdit = () => {
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

  // Context menu handlers
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

  const getContextMenuItems = (worldPoint: WorldPoint): ContextMenuItem[] => {
    const items: ContextMenuItem[] = []
    const isMissingFromImage = currentViewpoint && !isWorldPointInImage(worldPoint, currentViewpoint)

    // Edit (full properties)
    if (onEditWorldPoint) {
      items.push({
        id: 'edit-properties',
        label: 'Edit Properties',
        icon: faGear,
        onClick: () => onEditWorldPoint(worldPoint)
      })
    }

    // Removed rename from context menu - use edit properties instead

    // Place on image
    if (isMissingFromImage) {
      items.push({
        id: 'place',
        label: 'Place on Image',
        icon: faLocationDot,
        onClick: () => onStartPlacement(worldPoint)
      })
    }

    // Separator before danger actions
    if (items.length > 0) {
      items.push({
        id: 'separator',
        label: '',
        separator: true,
        onClick: () => {}
      })
    }

    // Delete
    items.push({
      id: 'delete',
      label: 'Delete',
      icon: faTrash,
      onClick: async () => {
        if (await confirm(`Delete world point "${worldPoint.getName()}"?\n\nThis will also delete any constraints that reference this point.`)) {
          onDeleteWorldPoint(worldPoint)
        }
      }
    })

    return items
  }

  // Removed handleKeyPress - no longer needed for inline editing

  const handleDelete = async (wp: WorldPoint) => {
    const involvedConstraints = getConstraintsForWorldPoint(wp)

    let message = `Delete world point "${wp.getName()}"?`
    if (involvedConstraints.length > 0) {
      message += `\n\nThis will also delete ${involvedConstraints.length} constraint${involvedConstraints.length !== 1 ? 's' : ''}:`
      involvedConstraints.forEach(constraint => {
        message += `\n• ${getConstraintDisplayName(constraint)}`
      })
    }

    if (await confirm(message)) {
      onDeleteWorldPoint(wp)
    }
  }

  const handlePlacement = (wp: WorldPoint) => {
    onStartPlacement(wp)
    setJustPlaced(prev => new Set(prev).add(wp))

    setTimeout(() => {
      setJustPlaced(prev => {
        const next = new Set(prev)
        next.delete(wp)
        return next
      })
    }, 1500)
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

  return (
    <>
      {dialog}
      <div className="world-point-panel">
      {/* Enhanced placement mode header */}
      {placementMode.active && (
        <div className="placement-mode-header constraint-step">
          <div className="placement-info">
            <span className="placement-icon"><FontAwesomeIcon icon={faBullseye} /></span>
            <span>Click on image to place "{placementMode.worldPoint?.getName()}"</span>
          </div>
          <button
            onClick={onCancelPlacement}
            className="btn-cancel-placement"
            title="Press Escape to cancel"
          >
            ✕
          </button>
        </div>
      )}

      <div className="panel-header">
        <h3>World Points</h3>
        <div className="point-count status-indicator connected">
          {worldPointsList.length} points
        </div>
      </div>

      {/* Enhanced missing points notice */}
      {missingWPs.length > 0 && !placementMode.active && (
        <div className="missing-points-notice help-hint">
          <span className="notice-icon"><FontAwesomeIcon icon={faTriangleExclamation} /></span>
          <span>{missingWPs.length} point{missingWPs.length !== 1 ? 's' : ''} not in this image</span>
          {latestMissingWP && (
            <button
              onClick={() => handlePlacement(latestMissingWP)}
              className="btn-quick-place"
              title={`Place ${latestMissingWP.getName()} in this image`}
            >
              Place Latest ({latestMissingWP.getName()})
            </button>
          )}
        </div>
      )}

      <div className="world-point-list">
        {worldPointsList.length > 0 ? (
          worldPointsList.map(wp => {
            const isSelected = selectedWorldPoints.some(swp => swp === wp)
            const involvedConstraints = getConstraintsForWorldPoint(wp)
            const hasBroken = hasBrokenConstraints(wp)
            const isEditing = false // Removed inline editing
            const isMissingFromImage = isWorldPointMissingFromImage(wp)
            const isInPlacementMode = placementMode.worldPoint === wp
            const wasRecentlyCreated = recentlyCreated.has(wp)
            const wasJustPlaced = justPlaced.has(wp)
            const isGloballyHovered = hoveredWorldPoint === wp

            return (
              <EnhancedWorldPointItem
                key={getEntityKey(wp)}
                worldPoint={wp}
                imagePointCount={getImagePointCount(wp)}
                isSelected={isSelected}
                isEditing={isEditing}
                editingName=""
                involvedConstraints={involvedConstraints}
                hasBrokenConstraints={hasBroken}
                isMissingFromImage={isMissingFromImage}
                isInPlacementMode={isInPlacementMode}
                placementModeActive={placementMode.active}
                wasRecentlyCreated={wasRecentlyCreated}
                wasJustPlaced={wasJustPlaced}
                isGloballyHovered={isGloballyHovered}
                onSelect={(ctrlKey, shiftKey) => onSelectWorldPoint(wp, ctrlKey, shiftKey)}
                onEdit={() => onEditWorldPoint?.(wp)}
                onDelete={() => handleDelete(wp)}
                onHighlight={onHighlightWorldPoint}
                onHover={onHoverWorldPoint}
                onStartPlacement={() => handlePlacement(wp)}
                onContextMenu={(e) => handleContextMenu(e, wp)}
                onNameChange={() => {}}
                onSaveEdit={() => {}}
                onCancelEdit={() => {}}
                onKeyPress={() => {}}
              />
            )
          })
        ) : (
          <div className="world-point-empty">
            <div className="empty-icon"><FontAwesomeIcon icon={faBullseye} /></div>
            <div className="empty-text">No world points yet</div>
            <div className="empty-hint">Click on images to create world points and start building your 3D model</div>
            <div className="empty-tips">
              <div><span>💡</span> Pro tip: Create points on distinct features</div>
              <div><FontAwesomeIcon icon={faDraftingCompass} /> Points help align multiple images</div>
              <div><FontAwesomeIcon icon={faBullseye} /> More points = better accuracy</div>
            </div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu.worldPoint && (
        <ContextMenu
          isOpen={contextMenu.isOpen}
          position={contextMenu.position}
          items={getContextMenuItems(contextMenu.worldPoint)}
          onClose={closeContextMenu}
        />
      )}
    </div>
    </>
  )
})

interface EnhancedWorldPointItemProps {
  worldPoint: WorldPoint
  imagePointCount: number
  isSelected: boolean
  isEditing: boolean
  editingName: string
  involvedConstraints: Constraint[]
  hasBrokenConstraints: boolean
  isMissingFromImage: boolean
  isInPlacementMode: boolean
  placementModeActive: boolean
  wasRecentlyCreated: boolean
  wasJustPlaced: boolean
  isGloballyHovered: boolean
  onSelect: (ctrlKey: boolean, shiftKey: boolean) => void
  onEdit: () => void
  onDelete: () => void
  onHighlight: (worldPoint: WorldPoint | null) => void
  onHover?: (worldPoint: WorldPoint | null) => void
  onStartPlacement: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onNameChange: (name: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onKeyPress: (e: React.KeyboardEvent) => void
}

const EnhancedWorldPointItem: React.FC<EnhancedWorldPointItemProps> = ({
  worldPoint,
  imagePointCount,
  isSelected,
  isEditing,
  editingName,
  involvedConstraints,
  hasBrokenConstraints,
  isMissingFromImage,
  isInPlacementMode,
  placementModeActive,
  wasRecentlyCreated,
  wasJustPlaced,
  isGloballyHovered,
  onSelect,
  onEdit,
  onDelete,
  onHighlight,
  onHover,
  onStartPlacement,
  onContextMenu,
  onNameChange,
  onSaveEdit,
  onCancelEdit,
  onKeyPress
}) => {
  const [showActions, setShowActions] = useState(false)
  const [showConstraints, setShowConstraints] = useState(false)

  const itemClasses = [
    'world-point-item',
    isSelected ? 'selected' : '',
    hasBrokenConstraints ? 'broken' : '',
    isMissingFromImage ? 'missing-from-image' : '',
    isInPlacementMode ? 'in-placement-mode' : '',
    wasRecentlyCreated ? 'just-created' : '',
    wasJustPlaced ? 'optimistic-feedback' : '',
    isGloballyHovered ? 'globally-hovered' : ''
  ].filter(Boolean).join(' ')

  const constraintsText = involvedConstraints.length > 0
    ? `Used in ${involvedConstraints.length} constraint${involvedConstraints.length !== 1 ? 's' : ''}`
    : 'No constraints yet'

  return (
    <div
      className={itemClasses}
      draggable={true}
        onDragStart={(e) => {
          const action = imagePointCount > 0 ? 'move' : 'place'
          e.dataTransfer.setData('application/json', JSON.stringify({
            type: 'world-point',
            worldPointName: worldPoint.getName(),
            action
          }))
          e.dataTransfer.effectAllowed = 'copy'
          e.currentTarget.style.opacity = '0.5'
          setDraggingWorldPoint(worldPoint, action)
        }}
        onDragEnd={(e) => {
          e.currentTarget.style.opacity = '1'
          clearDraggingWorldPoint()
        }}
        onClick={(e) => {
          if (e.shiftKey) e.preventDefault()
          onSelect(e.ctrlKey || e.metaKey, e.shiftKey)
        }}
        onContextMenu={onContextMenu}
        onMouseEnter={() => {
          setShowActions(true)
          onHighlight(worldPoint)
          if (onHover) {
            onHover(worldPoint)
          }
        }}
        onMouseLeave={() => {
          setShowActions(false)
          onHighlight(null)
          if (onHover) {
            onHover(null)
          }
        }}
      >
        <div className="wp-item-main">
          <div className="wp-item-content">
            <div className="wp-color-dot world-point-hover" style={{ backgroundColor: worldPoint.color }} title={`Point: ${worldPoint.getName()}`} />

            <div className="wp-name" title={constraintsText}>{worldPoint.getName()}</div>

            <div className="wp-info">
              <span className="image-count" title={`Visible in ${imagePointCount} image${imagePointCount !== 1 ? 's' : ''}`}>
                <span className="count-icon"><FontAwesomeIcon icon={faCamera} /></span>
                <span>{imagePointCount}</span>
              </span>

              {involvedConstraints.length > 0 && (
                <span className="constraint-count" title={constraintsText}>
                  <span className="count-icon"><FontAwesomeIcon icon={faGear} /></span>
                  <span>{involvedConstraints.length}</span>
                </span>
              )}

              {hasBrokenConstraints && (
                <span className="broken-indicator" title="Some constraints are broken - check connections"><FontAwesomeIcon icon={faTriangleExclamation} /></span>
              )}

              {isInPlacementMode && (
                <span className="placement-indicator" title="Click on image to place this point"><FontAwesomeIcon icon={faBullseye} /></span>
              )}
            </div>
          </div>

          <div className="wp-item-actions visible">
            {!isEditing && !placementModeActive && (
              <>
                {/* Quick placement button for missing points */}
                {isMissingFromImage && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onStartPlacement()
                    }}
                    className="btn-place"
                    title="Place this point on current image"
                  >
                    <FontAwesomeIcon icon={faLocationDot} />
                  </button>
                )}

                {/* Edit button - always visible, opens properties window */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit()
                  }}
                  className="btn-edit"
                  title="Edit world point properties"
                >
                  <FontAwesomeIcon icon={faGear} />
                </button>

                {/* Constraint visibility toggle */}
                {involvedConstraints.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowConstraints(!showConstraints)
                    }}
                    className="btn-constraints"
                    title="Show involved constraints"
                  >
                    <FontAwesomeIcon icon={faArrowsLeftRight} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {showConstraints && involvedConstraints.length > 0 && (
          <div className="wp-constraints">
            {involvedConstraints.map(constraint => {
              const constraintType = constraint.getConstraintType()
              return (
                <div
                  key={getEntityKey(constraint)}
                  className={`wp-constraint-item constraint-completion`}
                >
                  <span className="constraint-icon">{getConstraintIcon(constraintType)}</span>
                  <span className="constraint-name">{getConstraintDisplayName(constraint)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
  )
}

// Helper functions (same as original, but with enhanced UI feedback)
function getConstraintIcon(type: string): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    distance: '↔',
    angle: '∠',
    perpendicular: '⊥',
    parallel: '∥',
    collinear: '─',
    rectangle: '▭',
    circle: <FontAwesomeIcon icon={faCircle} />,
    fixed: '📌',
    horizontal: <FontAwesomeIcon icon={faArrowsLeftRight} />,
    vertical: '↕'
  }
  return icons[type] || <FontAwesomeIcon icon={faGear} />
}

export default WorldPointPanel