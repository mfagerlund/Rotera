// Constraint timeline component with hover feedback

import React from 'react'
import { Constraint } from '../types/project'

interface ConstraintTimelineProps {
  constraints: Constraint[]
  hoveredConstraintId: string | null
  worldPointNames: Record<string, string>
  onHover: (constraintId: string | null) => void
  onEdit: (constraint: Constraint) => void
  onDelete: (constraintId: string) => void
  onToggle: (constraintId: string) => void
}

export const ConstraintTimeline: React.FC<ConstraintTimelineProps> = ({
  constraints,
  hoveredConstraintId,
  worldPointNames,
  onHover,
  onEdit,
  onDelete,
  onToggle
}) => {
  const getPointName = (pointId: string) => worldPointNames[pointId] || pointId

  const getConstraintDisplayName = (constraint: Constraint) => {
    switch (constraint.type) {
      case 'distance':
        return `Distance: ${getPointName(constraint.pointA)} ↔ ${getPointName(constraint.pointB)}`
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
        return `Fixed Point: ${getPointName(constraint.point_id)}`
      case 'horizontal':
        return `Horizontal Alignment`
      case 'vertical':
        return `Vertical Alignment`
      default:
        return `${constraint.type.charAt(0).toUpperCase()}${constraint.type.slice(1)} Constraint`
    }
  }

  const getConstraintSummary = (constraint: Constraint) => {
    switch (constraint.type) {
      case 'distance':
        return `${constraint.distance}m between points`
      case 'angle':
        return `${constraint.angle_degrees || constraint.angle}° angle constraint`
      case 'perpendicular':
        return `Perpendicular line relationship`
      case 'parallel':
        return `Parallel line relationship`
      case 'collinear':
        return `Points on same line`
      case 'rectangle':
        return `4-corner rectangle shape`
      case 'circle':
        return `Points on circle boundary`
      case 'fixed':
        return `Fixed position constraint`
      case 'horizontal':
        return `Horizontal alignment constraint`
      case 'vertical':
        return `Vertical alignment constraint`
      default:
        return 'Geometric constraint'
    }
  }

  const getConstraintIcon = (type: string) => {
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

  return (
    <div className="constraint-timeline">
      <div className="timeline-header">
        <h3>Constraint History</h3>
        <span className="constraint-count">{constraints.length} constraints</span>
      </div>

      <div className="timeline-items">
        {constraints.length > 0 ? (
          constraints.map((constraint, index) => (
            <ConstraintTimelineItem
              key={constraint.id}
              constraint={constraint}
              index={index}
              isHovered={hoveredConstraintId === constraint.id}
              displayName={getConstraintDisplayName(constraint)}
              summary={getConstraintSummary(constraint)}
              icon={getConstraintIcon(constraint.type)}
              onEdit={() => onEdit(constraint)}
              onDelete={() => onDelete(constraint.id)}
              onToggle={() => onToggle(constraint.id)}
              onMouseEnter={() => onHover(constraint.id)}
              onMouseLeave={() => onHover(null)}
            />
          ))
        ) : (
          <div className="timeline-empty">
            <div className="empty-icon">📐</div>
            <div className="empty-text">No constraints yet</div>
            <div className="empty-hint">Start by selecting points and choosing a constraint type</div>
          </div>
        )}
      </div>
    </div>
  )
}

interface ConstraintTimelineItemProps {
  constraint: Constraint
  index: number
  isHovered: boolean
  displayName: string
  summary: string
  icon: string
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

const ConstraintTimelineItem: React.FC<ConstraintTimelineItemProps> = ({
  constraint,
  index,
  isHovered,
  displayName,
  summary,
  icon,
  onEdit,
  onDelete,
  onToggle,
  onMouseEnter,
  onMouseLeave
}) => {
  const [showActions, setShowActions] = React.useState(false)

  return (
    <div
      className={`timeline-item ${constraint.enabled ? 'enabled' : 'disabled'} ${isHovered ? 'hovered' : ''}`}
      onMouseEnter={() => {
        setShowActions(true)
        onMouseEnter()
      }}
      onMouseLeave={() => {
        setShowActions(false)
        onMouseLeave()
      }}
    >
      <div className="timeline-item-icon">
        <span>{icon}</span>
      </div>

      <div className="timeline-item-content">
        <div className="timeline-item-title">
          {displayName}
        </div>
        <div className="timeline-item-details">
          {summary}
        </div>
      </div>

      <div className={`timeline-item-actions ${showActions ? 'visible' : ''}`}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          className={`btn-toggle ${constraint.enabled ? 'enabled' : 'disabled'}`}
          title={constraint.enabled ? "Disable constraint" : "Enable constraint"}
        >
          {constraint.enabled ? '👁️' : '🚫'}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          className="btn-edit"
          title="Edit constraint"
        >
          ✏️
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (confirm('Delete this constraint?')) {
              onDelete()
            }
          }}
          className="btn-delete"
          title="Delete constraint"
        >
          🗑️
        </button>
      </div>
    </div>
  )
}

export default ConstraintTimeline