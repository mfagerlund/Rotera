// Enhanced World Point Panel with delightful micro-interactions

import React, { useState, useEffect } from 'react'
import { WorldPoint, Constraint } from '../types/project'
import { getConstraintPointIds } from '../types/utils'
import {
  RippleButton,
  DelightfulTooltip,
  OptimisticFeedback,
  useCelebration
} from './DelightfulComponents'

interface WorldPointPanelProps {
  worldPoints: Record<string, WorldPoint>
  constraints: Constraint[]
  selectedWorldPointIds: string[]
  currentImageId: string | null
  placementMode: { active: boolean; worldPointId: string | null }
  onSelectWorldPoint: (id: string, ctrlKey: boolean, shiftKey: boolean) => void
  onRenameWorldPoint: (id: string, newName: string) => void
  onDeleteWorldPoint: (id: string) => void
  onHighlightWorldPoint: (id: string | null) => void
  onStartPlacement: (worldPointId: string) => void
  onCancelPlacement: () => void
}

export const WorldPointPanel: React.FC<WorldPointPanelProps> = ({
  worldPoints,
  constraints,
  selectedWorldPointIds,
  currentImageId,
  placementMode,
  onSelectWorldPoint,
  onRenameWorldPoint,
  onDeleteWorldPoint,
  onHighlightWorldPoint,
  onStartPlacement,
  onCancelPlacement
}) => {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [recentlyCreated, setRecentlyCreated] = useState<Set<string>>(new Set())
  const [justPlaced, setJustPlaced] = useState<Set<string>>(new Set())
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
            "First Point Created! 🎯",
            "Great start! Add more points to build your model.",
            "🎯"
          )
        } else if (currentCount === 10) {
          triggerProgress(
            "10 Points Milestone! 🚀",
            "You're building a solid foundation for your model.",
            "🚀"
          )
        } else if (currentCount % 25 === 0) {
          triggerProgress(
            `${currentCount} Points! 🎉`,
            "Your photogrammetry model is taking shape beautifully!",
            "🎉"
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
          "Descriptive Naming! 📝",
          "Good organization helps with complex projects.",
          "📝"
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveEdit()
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }

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
            <span className="placement-icon">🎯</span>
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
          <span className="notice-icon">⚠️</span>
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
            const isEditing = editingId === wp.id
            const isMissingFromImage = isWorldPointMissingFromImage(wp)
            const isInPlacementMode = placementMode.worldPointId === wp.id
            const wasRecentlyCreated = recentlyCreated.has(wp.id)
            const wasJustPlaced = justPlaced.has(wp.id)

            return (
              <EnhancedWorldPointItem
                key={wp.id}
                worldPoint={wp}
                isSelected={isSelected}
                isEditing={isEditing}
                editingName={editingName}
                involvedConstraints={involvedConstraints}
                hasBrokenConstraints={hasBroken}
                isMissingFromImage={isMissingFromImage}
                isInPlacementMode={isInPlacementMode}
                placementModeActive={placementMode.active}
                wasRecentlyCreated={wasRecentlyCreated}
                wasJustPlaced={wasJustPlaced}
                onSelect={(ctrlKey, shiftKey) => onSelectWorldPoint(wp.id, ctrlKey, shiftKey)}
                onEdit={() => startEditing(wp)}
                onDelete={() => handleDelete(wp.id)}
                onHighlight={onHighlightWorldPoint}
                onStartPlacement={() => handlePlacement(wp.id)}
                onNameChange={setEditingName}
                onSaveEdit={saveEdit}
                onCancelEdit={cancelEdit}
                onKeyPress={handleKeyPress}
              />
            )
          })
        ) : (
          <div className="world-point-empty">
            <div className="empty-icon">🎯</div>
            <div className="empty-text">No world points yet</div>
            <div className="empty-hint">Click on images to create world points and start building your 3D model</div>
            <div className="empty-tips">
              <div>💡 Pro tip: Create points on distinct features</div>
              <div>📐 Points help align multiple images</div>
              <div>🎯 More points = better accuracy</div>
            </div>
          </div>
        )}
      </div>
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
  onSelect: (ctrlKey: boolean, shiftKey: boolean) => void
  onEdit: () => void
  onDelete: () => void
  onHighlight: (id: string | null) => void
  onStartPlacement: () => void
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
  onSelect,
  onEdit,
  onDelete,
  onHighlight,
  onStartPlacement,
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
    wasJustPlaced ? 'optimistic-feedback' : ''
  ].filter(Boolean).join(' ')

  const constraintsText = involvedConstraints.length > 0
    ? `Used in ${involvedConstraints.length} constraint${involvedConstraints.length !== 1 ? 's' : ''}`
    : 'No constraints yet'

  return (
    <OptimisticFeedback trigger={wasJustPlaced}>
      <div
        className={itemClasses}
        onClick={(e) => {
          if (e.shiftKey) e.preventDefault()
          onSelect(e.ctrlKey || e.metaKey, e.shiftKey)
        }}
        onMouseEnter={() => {
          setShowActions(true)
          onHighlight(worldPoint.id)
        }}
        onMouseLeave={() => {
          setShowActions(false)
          onHighlight(null)
        }}
      >
        <div className="wp-item-main">
          <div className="wp-item-content">
            <DelightfulTooltip content={`Point ID: ${worldPoint.id}`}>
              <div className="wp-color-dot world-point-hover" style={{ backgroundColor: worldPoint.color }} />
            </DelightfulTooltip>

            {isEditing ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => onNameChange(e.target.value)}
                onKeyDown={onKeyPress}
                onBlur={onSaveEdit}
                onClick={(e) => e.stopPropagation()}
                className="wp-name-input delightful-focus"
                autoFocus
                placeholder="Enter descriptive name..."
              />
            ) : (
              <DelightfulTooltip content={constraintsText}>
                <div className="wp-name">{worldPoint.name}</div>
              </DelightfulTooltip>
            )}

            <div className="wp-info">
              <DelightfulTooltip content={`Visible in ${worldPoint.imagePoints.length} image${worldPoint.imagePoints.length !== 1 ? 's' : ''}`}>
                <span className="image-count">
                  <span className="count-icon">📷</span>
                  <span>{worldPoint.imagePoints.length}</span>
                </span>
              </DelightfulTooltip>

              {involvedConstraints.length > 0 && (
                <DelightfulTooltip content={constraintsText}>
                  <span className="constraint-count">
                    <span className="count-icon">⚙</span>
                    <span>{involvedConstraints.length}</span>
                  </span>
                </DelightfulTooltip>
              )}

              {hasBrokenConstraints && (
                <DelightfulTooltip content="Some constraints are broken - check connections">
                  <span className="broken-indicator" title="Has broken constraints">⚠️</span>
                </DelightfulTooltip>
              )}

              {isInPlacementMode && (
                <DelightfulTooltip content="Click on image to place this point">
                  <span className="placement-indicator">🎯</span>
                </DelightfulTooltip>
              )}
            </div>
          </div>

          <div className={`wp-item-actions ${showActions ? 'visible' : ''}`}>
            {!isEditing && !placementModeActive && (
              <>
                <DelightfulTooltip content={isMissingFromImage ? "Place this point on current image" : "Point already in current image"}>
                  <RippleButton
                    onClick={() => {
                      if (isMissingFromImage) onStartPlacement()
                    }}
                    className={`btn-place ${!isMissingFromImage ? 'disabled' : ''}`}
                    disabled={!isMissingFromImage}
                    variant="tool"
                  >
                    +
                  </RippleButton>
                </DelightfulTooltip>

                <DelightfulTooltip content="Rename world point">
                  <RippleButton
                    onClick={() => onEdit()}
                    className="btn-edit"
                    variant="tool"
                  >
                    ✎
                  </RippleButton>
                </DelightfulTooltip>

                {involvedConstraints.length > 0 && (
                  <DelightfulTooltip content="Show involved constraints">
                    <RippleButton
                      onClick={() => setShowConstraints(!showConstraints)}
                      className="btn-constraints"
                      variant="tool"
                    >
                      ⟷
                    </RippleButton>
                  </DelightfulTooltip>
                )}

                <DelightfulTooltip content="Delete world point">
                  <RippleButton
                    onClick={() => onDelete()}
                    className="btn-delete"
                    variant="tool"
                  >
                    ×
                  </RippleButton>
                </DelightfulTooltip>
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
    case 'distance':
      return `Distance Constraint`
    case 'angle':
      return `Angle: ${constraint.angle_degrees || constraint.angle}°`
    case 'perpendicular':
      return `Perpendicular Lines`
    case 'parallel':
      return `Parallel Lines`
    case 'collinear':
      return `Collinear Points`
    case 'rectangle':
      return `Rectangle Shape`
    case 'circle':
      return `Circle Constraint`
    case 'fixed':
      return `Fixed Position`
    case 'horizontal':
      return `Horizontal Alignment`
    case 'vertical':
      return `Vertical Alignment`
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
    circle: '○',
    fixed: '📌',
    horizontal: '⟷',
    vertical: '↕'
  }
  return icons[type] || '⚙'
}

export default WorldPointPanel