// Enhanced constraint timeline with visual language integration

import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEye, faGear, faPencil, faTrash } from '@fortawesome/free-solid-svg-icons'
import { EnhancedConstraint } from '../types/geometry'
import { VisualLanguageManager } from '../utils/visualLanguage'
import { useEnhancedProject } from '../hooks/useEnhancedProject'

interface ConstraintTimelineProps {
  constraints: EnhancedConstraint[]
  hoveredConstraintId?: string | null
  onHover: (constraintId: string | null) => void
  onEdit: (constraint: EnhancedConstraint) => void
  onDelete: (constraintId: string) => void
  onToggle: (constraintId: string) => void
  visualManager: VisualLanguageManager
}

// Helper function to categorize constraint types
const getCategoryForConstraintType = (type: string): string => {
  switch (type) {
    case 'points_distance':
    case 'points_equal':
    case 'points_coincident':
      return 'points_distance'
    case 'lines_parallel':
    case 'lines_perpendicular':
      return 'alignment'
    case 'point_fixed_coord':
    case 'point_locked':
      return 'positioning'
    case 'points_equal_distance':
      return 'angular'
    case 'points_coplanar':
      return 'geometry'
    default:
      return 'uncategorized'
  }
}

export const ConstraintTimeline: React.FC<ConstraintTimelineProps> = ({
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
          <div className="empty-icon"><FontAwesomeIcon icon={faGear} /></div>
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
    // Fallback category mapping since getConstraintTypeDefinition doesn't exist
    const category = getCategoryForConstraintType(constraint.type)

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
            {constraint.enabled ? '<FontAwesomeIcon icon={faEye} />' : '<FontAwesomeIcon icon={faEye} />‍🗨️'}
          </button>

          <button
            className="btn-edit"
            onClick={(e) => {
              e.stopPropagation()
              onEdit(constraint)
            }}
            title="Edit constraint"
          >
            <FontAwesomeIcon icon={faPencil} />
          </button>

          <button
            className="btn-delete"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(constraint.id)
            }}
            title="Delete constraint"
          >
            <FontAwesomeIcon icon={faTrash} />
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
    (constraint.entities?.points || []).length > 0 ? `${(constraint.entities?.points || []).length} points` : '',
    (constraint.entities?.lines || []).length > 0 ? `${(constraint.entities?.lines || []).length} lines` : '',
    (constraint.entities?.planes || []).length > 0 ? `${(constraint.entities?.planes || []).length} planes` : '',
    (constraint.entities?.circles || []).length > 0 ? `${(constraint.entities?.circles || []).length} circles` : ''
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

export default ConstraintTimeline