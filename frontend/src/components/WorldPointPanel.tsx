// World Point administration panel with comprehensive management

import React, { useState } from 'react'
import { WorldPoint, Constraint } from '../types/project'

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
      {/* Placement mode header */}
      {placementMode.active && (
        <div className="placement-mode-header">
          <div className="placement-info">
            <span className="placement-icon">📍</span>
            <span>Click on image to place "{worldPoints[placementMode.worldPointId!]?.name}"</span>
          </div>
          <button onClick={onCancelPlacement} className="btn-cancel-placement">
            ✕
          </button>
        </div>
      )}

      <div className="panel-header">
        <h3>World Points</h3>
        <span className="point-count">{worldPointsList.length} points</span>
      </div>

      {missingWPs.length > 0 && !placementMode.active && (
        <div className="missing-points-notice">
          <span className="notice-icon">⚠️</span>
          <span>{missingWPs.length} point{missingWPs.length !== 1 ? 's' : ''} not in this image</span>
          {latestMissingWP && (
            <button
              onClick={() => onStartPlacement(latestMissingWP.id)}
              className="btn-quick-place"
              title={`Quick place latest: ${latestMissingWP.name}`}
            >
              Place Latest ({latestMissingWP.name})
            </button>
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

            return (
              <WorldPointItem
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
                onSelect={(ctrlKey, shiftKey) => onSelectWorldPoint(wp.id, ctrlKey, shiftKey)}
                onEdit={() => startEditing(wp)}
                onDelete={() => handleDelete(wp.id)}
                onHighlight={onHighlightWorldPoint}
                onStartPlacement={() => onStartPlacement(wp.id)}
                onNameChange={setEditingName}
                onSaveEdit={saveEdit}
                onCancelEdit={cancelEdit}
                onKeyPress={handleKeyPress}
              />
            )
          })
        ) : (
          <div className="world-point-empty">
            <div className="empty-icon">📍</div>
            <div className="empty-text">No world points yet</div>
            <div className="empty-hint">Click on images to create world points</div>
          </div>
        )}
      </div>
    </div>
  )
}

interface WorldPointItemProps {
  worldPoint: WorldPoint
  isSelected: boolean
  isEditing: boolean
  editingName: string
  involvedConstraints: Constraint[]
  hasBrokenConstraints: boolean
  isMissingFromImage: boolean
  isInPlacementMode: boolean
  placementModeActive: boolean
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

const WorldPointItem: React.FC<WorldPointItemProps> = ({
  worldPoint,
  isSelected,
  isEditing,
  editingName,
  involvedConstraints,
  hasBrokenConstraints,
  isMissingFromImage,
  isInPlacementMode,
  placementModeActive,
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

  return (
    <div
      className={`world-point-item ${isSelected ? 'selected' : ''} ${hasBrokenConstraints ? 'broken' : ''} ${isMissingFromImage ? 'missing-from-image' : ''} ${isInPlacementMode ? 'in-placement-mode' : ''}`}
      onClick={(e) => {
        // Prevent text selection on shift+click
        if (e.shiftKey) {
          e.preventDefault()
        }
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
          <div className="wp-color-dot" style={{ backgroundColor: worldPoint.color }} />

          {isEditing ? (
            <input
              type="text"
              value={editingName}
              onChange={(e) => onNameChange(e.target.value)}
              onKeyDown={onKeyPress}
              onBlur={onSaveEdit}
              onClick={(e) => e.stopPropagation()}
              className="wp-name-input"
              autoFocus
            />
          ) : (
            <div className="wp-name">{worldPoint.name}</div>
          )}

          <div className="wp-info">
            <span className="image-count">
              {worldPoint.imagePoints.length} image{worldPoint.imagePoints.length !== 1 ? 's' : ''}
            </span>
            {involvedConstraints.length > 0 && (
              <span className="constraint-count">
                {involvedConstraints.length} constraint{involvedConstraints.length !== 1 ? 's' : ''}
              </span>
            )}
            {hasBrokenConstraints && (
              <span className="broken-indicator" title="Has broken constraints">⚠️</span>
            )}
            {isInPlacementMode && (
              <span className="placement-indicator" title="Click on image to place">🎯</span>
            )}
          </div>
        </div>

        <div className={`wp-item-actions ${showActions ? 'visible' : ''}`}>
          {!isEditing && !placementModeActive && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (isMissingFromImage) {
                    onStartPlacement()
                  }
                }}
                className={`btn-place ${!isMissingFromImage ? 'disabled' : ''}`}
                title={isMissingFromImage ? "Place this point on current image" : "Point already in current image"}
                disabled={!isMissingFromImage}
              >
                +
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit()
                }}
                className="btn-edit"
                title="Rename world point"
              >
                ✎
              </button>
              {involvedConstraints.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowConstraints(!showConstraints)
                  }}
                  className="btn-constraints"
                  title="Show involved constraints"
                >
                  ⟷
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className="btn-delete"
                title="Delete world point"
              >
                ×
              </button>
            </>
          )}
        </div>
      </div>

      {showConstraints && involvedConstraints.length > 0 && (
        <div className="wp-constraints">
          {involvedConstraints.map(constraint => (
            <div
              key={constraint.id}
              className={`wp-constraint-item ${!constraint.enabled ? 'disabled' : ''}`}
            >
              <span className="constraint-icon">{getConstraintIcon(constraint.type)}</span>
              <span className="constraint-name">{getConstraintDisplayName(constraint)}</span>
              {!constraint.enabled && <span className="disabled-indicator">🚫</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Helper functions
function getConstraintPointIds(constraint: Constraint): string[] {
  switch (constraint.type) {
    case 'distance':
      return [constraint.pointA, constraint.pointB]
    case 'angle':
      return [constraint.vertex, constraint.line1_end, constraint.line2_end]
    case 'perpendicular':
    case 'parallel':
      return [constraint.line1_wp_a, constraint.line1_wp_b, constraint.line2_wp_a, constraint.line2_wp_b]
    case 'collinear':
      return constraint.wp_ids || []
    case 'rectangle':
      return [constraint.cornerA, constraint.cornerB, constraint.cornerC, constraint.cornerD]
    case 'circle':
      return constraint.point_ids || []
    case 'fixed':
      return [constraint.point_id]
    default:
      return []
  }
}

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