// Enhanced constraint timeline with visual language integration

import React from 'react'
import { EnhancedConstraint } from '../types/geometry'
import { VisualLanguageManager } from '../utils/visualLanguage'
import { useEnhancedProject } from '../hooks/useEnhancedProject'

interface EnhancedConstraintTimelineProps {
  constraints: EnhancedConstraint[]
  hoveredConstraintId?: string | null
  onHover: (constraintId: string | null) => void
  onEdit: (constraint: EnhancedConstraint) => void
  onDelete: (constraintId: string) => void
  onToggle: (constraintId: string) => void
  visualManager: VisualLanguageManager
}

export const EnhancedConstraintTimeline: React.FC<EnhancedConstraintTimelineProps> = ({
  constraints,
  hoveredConstraintId,
  onHover,
  onEdit,
  onDelete,
  onToggle,
  visualManager
}) => {
  if (constraints.length === 0) {
    return (
      <div className="constraint-timeline">
        <div className="timeline-header">
          <h3>Constraints</h3>
          <span className="constraint-count">0</span>
        </div>
        <div className="timeline-empty">
          <div className="empty-icon">⚙️</div>
          <div className="empty-text">No constraints yet</div>
          <div className="empty-hint">
            Select entities and use the constraint toolbar to create relationships
          </div>
        </div>
      </div>
    )
  }

  // Group constraints by category
  const constraintsByCategory = constraints.reduce((groups, constraint) => {
    const definition = visualManager.getConstraintTypeDefinition?.(constraint.type)
    const category = definition?.category || 'uncategorized'

    if (!groups[category]) {
      groups[category] = []
    }
    groups[category].push(constraint)

    return groups
  }, {} as Record<string, EnhancedConstraint[]>)

  const renderConstraintItem = (constraint: EnhancedConstraint) => {
    const isHovered = hoveredConstraintId === constraint.id
    const glyph = visualManager.getConstraintGlyph(constraint.type)
    const constraintClasses = visualManager.getConstraintClasses(
      constraint.status,
      [
        'timeline-item',
        constraint.enabled ? '' : 'disabled',
        isHovered ? 'hovered' : ''
      ]
    )

    const style = visualManager.getConstraintStyle(constraint.status)

    return (
      <div
        key={constraint.id}
        className={constraintClasses}
        style={style}
        onMouseEnter={() => onHover(constraint.id)}
        onMouseLeave={() => onHover(null)}
        onClick={() => onEdit(constraint)}
      >
        <div className="timeline-item-icon">
          <div className="constraint-glyph">
            <span className="glyph-icon">{glyph}</span>
          </div>
        </div>

        <div className="timeline-item-content">
          <div className="timeline-item-title">
            {constraint.name || constraint.type}
          </div>
          <div className="timeline-item-details">
            {getConstraintDescription(constraint, visualManager)}
          </div>
        </div>

        <div className={`timeline-item-actions ${isHovered ? 'visible' : ''}`}>
          <button
            className={`btn-toggle ${constraint.enabled ? 'enabled' : 'disabled'}`}
            onClick={(e) => {
              e.stopPropagation()
              onToggle(constraint.id)
            }}
            title={constraint.enabled ? 'Disable constraint' : 'Enable constraint'}
          >
            {constraint.enabled ? '👁️' : '👁️‍🗨️'}
          </button>

          <button
            className="btn-edit"
            onClick={(e) => {
              e.stopPropagation()
              onEdit(constraint)
            }}
            title="Edit constraint"
          >
            ✏️
          </button>

          <button
            className="btn-delete"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(constraint.id)
            }}
            title="Delete constraint"
          >
            🗑️
          </button>
        </div>
      </div>
    )
  }

  const renderCategory = (category: string, categoryConstraints: EnhancedConstraint[]) => {
    const categoryNames: Record<string, string> = {
      positioning: 'Positioning',
      dimensioning: 'Dimensioning',
      geometric: 'Geometric',
      advanced: 'Advanced',
      uncategorized: 'Other'
    }

    const enabledCount = categoryConstraints.filter(c => c.enabled).length
    const satisfiedCount = categoryConstraints.filter(c => c.status === 'satisfied').length

    return (
      <div key={category} className="constraint-category">
        <div className="category-header">
          <h4>{categoryNames[category] || category}</h4>
          <div className="category-stats">
            <span className="count-total">{categoryConstraints.length}</span>
            <span className="count-enabled">
              {enabledCount}/{categoryConstraints.length} enabled
            </span>
            <span className="count-satisfied">
              {satisfiedCount}/{enabledCount} satisfied
            </span>
          </div>
        </div>
        <div className="category-items">
          {categoryConstraints.map(renderConstraintItem)}
        </div>
      </div>
    )
  }

  return (
    <div className="constraint-timeline enhanced">
      <div className="timeline-header">
        <h3>Constraints</h3>
        <div className="timeline-stats">
          <span className="constraint-count">{constraints.length}</span>
          <div className="status-summary">
            {Object.entries(getStatusCounts(constraints)).map(([status, count]) => (
              <span
                key={status}
                className={`status-count ${status}`}
                style={{ color: visualManager.getConstraintColor(status as any) }}
              >
                {count}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="timeline-content">
        {Object.entries(constraintsByCategory).map(([category, categoryConstraints]) =>
          renderCategory(category, categoryConstraints)
        )}
      </div>
    </div>
  )
}

// Helper functions
function getConstraintDescription(constraint: EnhancedConstraint, visualManager: VisualLanguageManager): string {
  const paramValues = Object.entries(constraint.parameters)
    .filter(([_, param]) => param.value !== undefined && param.value !== null && param.value !== '')
    .map(([key, param]) => `${param.name}: ${param.value}${param.unit || ''}`)
    .join(', ')

  const entityCounts = [
    constraint.entities.points.length > 0 ? `${constraint.entities.points.length} points` : '',
    constraint.entities.lines.length > 0 ? `${constraint.entities.lines.length} lines` : '',
    constraint.entities.planes.length > 0 ? `${constraint.entities.planes.length} planes` : '',
    constraint.entities.circles.length > 0 ? `${constraint.entities.circles.length} circles` : ''
  ].filter(Boolean).join(', ')

  const parts = [entityCounts, paramValues].filter(Boolean)
  return parts.join(' • ')
}

function getStatusCounts(constraints: EnhancedConstraint[]): Record<string, number> {
  return constraints.reduce((counts, constraint) => {
    counts[constraint.status] = (counts[constraint.status] || 0) + 1
    return counts
  }, {} as Record<string, number>)
}

export default EnhancedConstraintTimeline