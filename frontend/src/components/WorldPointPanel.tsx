// Enhanced World Point Panel with delightful micro-interactions

import React, { useState, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowsLeftRight, faBullseye, faCamera, faDraftingCompass, faGear, faLocationDot, faPencil, faRocket, faTrash, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import { faCircle } from '@fortawesome/free-regular-svg-icons'
import { WorldPoint, Constraint } from '../types/project'
import { getConstraintPointIds } from '../types/utils'
import {
  RippleButton,
  DelightfulTooltip,
  OptimisticFeedback,
  useCelebration
} from './DelightfulComponents'
import ContextMenu, { ContextMenuItem } from './ContextMenu'

interface WorldPointPanelProps {
  worldPoints: Record<string, WorldPoint>
  constraints: Constraint[]
  selectedWorldPointIds: string[]
  hoveredWorldPointId?: string | null
  currentImageId: string | null
  placementMode: { active: boolean; worldPointId: string | null }
  onSelectWorldPoint: (id: string, ctrlKey: boolean, shiftKey: boolean) => void
  onRenameWorldPoint: (id: string, newName: string) => void
  onDeleteWorldPoint: (id: string) => void
  onEditWorldPoint?: (id: string) => void
  onHighlightWorldPoint: (id: string | null) => void
  onHoverWorldPoint?: (id: string | null) => void
  onStartPlacement: (worldPointId: string) => void
  onCancelPlacement: () => void
}

export const WorldPointPanel: React.FC<WorldPointPanelProps> = ({
  worldPoints,
  constraints,
  selectedWorldPointIds,
  hoveredWorldPointId,
  currentImageId,
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [recentlyCreated, setRecentlyCreated] = useState<Set<string>>(new Set())
  const [justPlaced, setJustPlaced] = useState<Set<string>>(new Set())

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean
    position: { x: number; y: number }
    worldPointId: string | null
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    worldPointId: null
  })
  const { triggerAchievement, triggerProgress } = useCelebration()

  // Track newly created world points for celebration
  const prevWorldPointCount = React.useRef(Object.keys(worldPoints).length)

  useEffect(() => {
    const currentCount = Object.keys(worldPoints).length
    if (currentCount > prevWorldPointCount.current) {
      // New world point created!
      const newPoints = Object.keys(worldPoints).filter(id =>
        !Object.keys(worldPoints).slice(0, prevWorldPointCount.current).includes(id)
      )

      newPoints.forEach(pointId => {
        setRecentlyCreated(prev => new Set(prev).add(pointId))

        // Celebrate milestones
        if (currentCount === 1) {
          triggerAchievement(
            "First Point Created! ",
            "Great start! Add more points to build your model.",
            ""
          )
        } else if (currentCount === 10) {
          triggerProgress(
            "10 Points Milestone! ",
            "You're building a solid foundation for your model.",
            ""
          )
        } else if (currentCount % 25 === 0) {
          triggerProgress(
            `${currentCount} Points!`,
            "Your photogrammetry model is taking shape beautifully!",
            ""
          )
        }
      })

      // Remove the celebration flag after animation
      setTimeout(() => {
        newPoints.forEach(pointId => {
          setRecentlyCreated(prev => {
            const next = new Set(prev)
            next.delete(pointId)
            return next
          })
        })
      }, 2000)
    }
    prevWorldPointCount.current = currentCount
  }, [worldPoints, triggerAchievement, triggerProgress])

  // Find constraints involving a world point
  const getConstraintsForWorldPoint = (wpId: string): Constraint[] => {
    return constraints.filter(constraint => {
      const pointIds = getConstraintPointIds(constraint)
      return pointIds.includes(wpId)
    })
  }

  // Check if world point has any broken constraints
  const hasBrokenConstraints = (wpId: string): boolean => {
    const wpConstraints = getConstraintsForWorldPoint(wpId)
    return wpConstraints.some(constraint => {
      const pointIds = getConstraintPointIds(constraint)
      return pointIds.some(id => !worldPoints[id])
    })
  }

  const startEditing = (wp: WorldPoint) => {
    setEditingId(wp.id)
    setEditingName(wp.name)
  }

  const saveEdit = () => {
    if (editingId && editingName.trim()) {
      onRenameWorldPoint(editingId, editingName.trim())

      // Celebrate meaningful renames
      if (editingName.trim().length > 5) {
        triggerAchievement(
          "Descriptive Naming! ",
          "Good organization helps with complex projects.",
          ""
        )
      }
    }
    setEditingId(null)
    setEditingName('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, worldPointId: string) => {
    e.preventDefault()
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      worldPointId
    })
  }

  const closeContextMenu = () => {
    setContextMenu(prev => ({ ...prev, isOpen: false }))
  }

  const getContextMenuItems = (worldPoint: WorldPoint): ContextMenuItem[] => {
    const items: ContextMenuItem[] = []
    const isMissingFromImage = currentImageId && !worldPoint.imagePoints.some(ip => ip.imageId === currentImageId)

    // Edit (full properties)
    if (onEditWorldPoint) {
      items.push({
        id: 'edit-properties',
        label: 'Edit Properties',
        icon: 'faGear',
        onClick: () => onEditWorldPoint(worldPoint.id)
      })
    }

    // Removed rename from context menu - use edit properties instead

    // Place on image
    if (isMissingFromImage) {
      items.push({
        id: 'place',
        label: 'Place on Image',
        icon: 'faLocationDot',
        onClick: () => onStartPlacement(worldPoint.id)
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
      icon: 'faTrash',
      onClick: () => {
        if (confirm(`Delete world point "${worldPoint.name}"?\n\nThis will also delete any constraints that reference this point.`)) {
          onDeleteWorldPoint(worldPoint.id)
        }
      }
    })

    return items
  }

  // Removed handleKeyPress - no longer needed for inline editing

  const handleDelete = (wpId: string) => {
    const wp = worldPoints[wpId]
    const involvedConstraints = getConstraintsForWorldPoint(wpId)

    let message = `Delete world point "${wp.name}"?`
    if (involvedConstraints.length > 0) {
      message += `\n\nThis will also delete ${involvedConstraints.length} constraint${involvedConstraints.length !== 1 ? 's' : ''}:`
      involvedConstraints.forEach(constraint => {
        message += `\n• ${getConstraintDisplayName(constraint)}`
      })
    }

    if (confirm(message)) {
      onDeleteWorldPoint(wpId)
    }
  }

  const handlePlacement = (wpId: string) => {
    onStartPlacement(wpId)
    setJustPlaced(prev => new Set(prev).add(wpId))

    setTimeout(() => {
      setJustPlaced(prev => {
        const next = new Set(prev)
        next.delete(wpId)
        return next
      })
    }, 1500)
  }

  // Check if world point is missing from current image
  const isWorldPointMissingFromImage = (wp: WorldPoint): boolean => {
    if (!currentImageId) return false
    return !wp.imagePoints.some(ip => ip.imageId === currentImageId)
  }

  // Group world points by presence in current image
  const presentWPs = Object.values(worldPoints).filter(wp => !isWorldPointMissingFromImage(wp))
  const missingWPs = Object.values(worldPoints).filter(wp => isWorldPointMissingFromImage(wp))

  // Find the most recently created world point that's missing from current image
  const latestMissingWP = missingWPs.length > 0 ?
    missingWPs.reduce((latest, wp) => wp.name > latest.name ? wp : latest) : null

  const worldPointsList = [...presentWPs, ...missingWPs].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="world-point-panel">
      {/* Enhanced placement mode header */}
      {placementMode.active && (
        <div className="placement-mode-header constraint-step">
          <div className="placement-info">
            <span className="placement-icon"><FontAwesomeIcon icon={faBullseye} /></span>
            <span>Click on image to place "{worldPoints[placementMode.worldPointId!]?.name}"</span>
          </div>
          <DelightfulTooltip content="Press Escape to cancel">
            <RippleButton
              onClick={onCancelPlacement}
              className="btn-cancel-placement"
              variant="secondary"
            >
              ✕
            </RippleButton>
          </DelightfulTooltip>
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
            <DelightfulTooltip content={`Place ${latestMissingWP.name} in this image`}>
              <RippleButton
                onClick={() => handlePlacement(latestMissingWP.id)}
                className="btn-quick-place"
                variant="primary"
              >
                Place Latest ({latestMissingWP.name})
              </RippleButton>
            </DelightfulTooltip>
          )}
        </div>
      )}

      <div className="world-point-list">
        {worldPointsList.length > 0 ? (
          worldPointsList.map(wp => {
            const isSelected = selectedWorldPointIds.includes(wp.id)
            const involvedConstraints = getConstraintsForWorldPoint(wp.id)
            const hasBroken = hasBrokenConstraints(wp.id)
            const isEditing = false // Removed inline editing
            const isMissingFromImage = isWorldPointMissingFromImage(wp)
            const isInPlacementMode = placementMode.worldPointId === wp.id
            const wasRecentlyCreated = recentlyCreated.has(wp.id)
            const wasJustPlaced = justPlaced.has(wp.id)
            const isGloballyHovered = hoveredWorldPointId === wp.id

            return (
              <EnhancedWorldPointItem
                key={wp.id}
                worldPoint={wp}
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
                onSelect={(ctrlKey, shiftKey) => onSelectWorldPoint(wp.id, ctrlKey, shiftKey)}
                onEdit={() => onEditWorldPoint?.(wp.id)}
                onDelete={() => handleDelete(wp.id)}
                onHighlight={onHighlightWorldPoint}
                onHover={onHoverWorldPoint}
                onStartPlacement={() => handlePlacement(wp.id)}
                onContextMenu={(e) => handleContextMenu(e, wp.id)}
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
      {contextMenu.worldPointId && (
        <ContextMenu
          isOpen={contextMenu.isOpen}
          position={contextMenu.position}
          items={getContextMenuItems(worldPoints[contextMenu.worldPointId])}
          onClose={closeContextMenu}
        />
      )}
    </div>
  )
}

interface EnhancedWorldPointItemProps {
  worldPoint: WorldPoint
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
  onHighlight: (id: string | null) => void
  onHover?: (id: string | null) => void
  onStartPlacement: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onNameChange: (name: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onKeyPress: (e: React.KeyboardEvent) => void
}

const EnhancedWorldPointItem: React.FC<EnhancedWorldPointItemProps> = ({
  worldPoint,
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
    <OptimisticFeedback trigger={wasJustPlaced}>
      <div
        className={itemClasses}
        draggable={true}
        onDragStart={(e) => {
          // Set drag data
          e.dataTransfer.setData('application/json', JSON.stringify({
            type: 'world-point',
            worldPointId: worldPoint.id,
            action: worldPoint.imagePoints.length > 0 ? 'move' : 'place'
          }))
          e.dataTransfer.effectAllowed = 'copy'

          // Visual feedback
          e.currentTarget.style.opacity = '0.5'
        }}
        onDragEnd={(e) => {
          // Reset visual feedback
          e.currentTarget.style.opacity = '1'
        }}
        onClick={(e) => {
          if (e.shiftKey) e.preventDefault()
          onSelect(e.ctrlKey || e.metaKey, e.shiftKey)
        }}
        onContextMenu={onContextMenu}
        onMouseEnter={() => {
          setShowActions(true)
          onHighlight(worldPoint.id)
          if (onHover) {
            onHover(worldPoint.id)
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
            <div className="wp-color-dot world-point-hover" style={{ backgroundColor: worldPoint.color }} title={`Point ID: ${worldPoint.id}`} />

            <div className="wp-name" title={constraintsText}>{worldPoint.name}</div>

            <div className="wp-info">
              <span className="image-count" title={`Visible in ${worldPoint.imagePoints.length} image${worldPoint.imagePoints.length !== 1 ? 's' : ''}`}>
                <span className="count-icon"><FontAwesomeIcon icon={faCamera} /></span>
                <span>{worldPoint.imagePoints.length}</span>
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
                  <div onClick={(e) => e.stopPropagation()} title="Place this point on current image">
                    <RippleButton
                      onClick={() => onStartPlacement()}
                      className="btn-place"
                      variant="tool"
                    >
                      <FontAwesomeIcon icon={faLocationDot} />
                    </RippleButton>
                  </div>
                )}

                {/* Edit button - always visible, opens properties window */}
                <div onClick={(e) => e.stopPropagation()} title="Edit world point properties">
                  <RippleButton
                    onClick={() => onEdit()}
                    className="btn-edit"
                    variant="tool"
                  >
                    <FontAwesomeIcon icon={faGear} />
                  </RippleButton>
                </div>

                {/* Constraint visibility toggle */}
                {involvedConstraints.length > 0 && (
                  <div onClick={(e) => e.stopPropagation()} title="Show involved constraints">
                    <RippleButton
                      onClick={() => setShowConstraints(!showConstraints)}
                      className="btn-constraints"
                      variant="tool"
                    >
                      <FontAwesomeIcon icon={faArrowsLeftRight} />
                    </RippleButton>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {showConstraints && involvedConstraints.length > 0 && (
          <div className="wp-constraints">
            {involvedConstraints.map(constraint => (
              <div
                key={constraint.id}
                className={`wp-constraint-item ${!constraint.enabled ? 'disabled' : ''} ${constraint.enabled ? 'constraint-completion' : ''}`}
              >
                <span className="constraint-icon">{getConstraintIcon(constraint.type)}</span>
                <span className="constraint-name">{getConstraintDisplayName(constraint)}</span>
                {!constraint.enabled && <span className="disabled-indicator">🚫</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </OptimisticFeedback>
  )
}

// Helper functions (same as original, but with enhanced UI feedback)
function getConstraintDisplayName(constraint: Constraint): string {
  switch (constraint.type) {
    case 'points_distance':
      return `Distance Constraint`
    case 'points_equal_distance':
      // Determine if it's angle or circle based on parameters
      if (constraint.parameters?.angle !== undefined || constraint.parameters?.angle_degrees !== undefined) {
        return `Angle: ${constraint.parameters?.angle_degrees || constraint.parameters?.angle || 'unspecified'}°`
      } else {
        return `Circle Constraint`
      }
    case 'lines_perpendicular':
      return `Perpendicular Lines`
    case 'lines_parallel':
      return `Parallel Lines`
    case 'points_colinear':
      return `Collinear Points`
    case 'points_coplanar':
      return `Rectangle Shape`
    case 'point_fixed_coord':
      return `Fixed Position`
    default:
      return `${constraint.type.charAt(0).toUpperCase()}${constraint.type.slice(1)} Constraint`
  }
}

function getConstraintIcon(type: string): string {
  const icons: Record<string, string> = {
    distance: '↔',
    angle: '∠',
    perpendicular: '⊥',
    parallel: '∥',
    collinear: '─',
    rectangle: '▭',
    circle: '<FontAwesomeIcon icon={faCircle} />',
    fixed: '📌',
    horizontal: '<FontAwesomeIcon icon={faArrowsLeftRight} />',
    vertical: '↕'
  }
  return icons[type] || '<FontAwesomeIcon icon={faGear} />'
}

export default WorldPointPanel