// Constraints Management Popup

import React from 'react'
import EntityListPopup, { EntityListItem } from './EntityListPopup'
import { Constraint } from '../types/project'

interface ConstraintsPopupProps {
  isOpen: boolean
  onClose: () => void
  constraints: Constraint[]
  worldPointNames: Record<string, string>
  lineNames: Record<string, string>
  selectedConstraints?: string[]
  onEditConstraint?: (constraintId: string) => void
  onDeleteConstraint?: (constraintId: string) => void
  onToggleConstraint?: (constraintId: string) => void
  onSelectConstraint?: (constraintId: string) => void
}

export const ConstraintsPopup: React.FC<ConstraintsPopupProps> = ({
  isOpen,
  onClose,
  constraints,
  worldPointNames,
  lineNames,
  selectedConstraints = [],
  onEditConstraint,
  onDeleteConstraint,
  onToggleConstraint,
  onSelectConstraint
}) => {
  const getPointName = (pointId: string) => worldPointNames[pointId] || pointId
  const getLineName = (lineId: string) => lineNames[lineId] || lineId

  const getConstraintDisplayName = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const getConstraintEntities = (constraint: Constraint): string[] => {
    const entities: string[] = []

    if (constraint.entities.points) {
      entities.push(...constraint.entities.points.map(pointId => getPointName(pointId)))
    }

    if (constraint.entities.lines) {
      entities.push(...constraint.entities.lines.map(lineId => getLineName(lineId)))
    }

    return entities
  }

  const getConstraintDetails = (constraint: Constraint): string[] => {
    const details: string[] = []

    // Add constraint type info
    details.push(`Type: ${getConstraintDisplayName(constraint.type)}`)

    // Add status
    details.push(`Status: ${constraint.status}`)

    // Add driving/construction info
    details.push(constraint.isDriving ? 'Driving constraint' : 'Construction constraint')

    // Add weight
    details.push(`Weight: ${constraint.weight}`)

    // Add residual if available
    if (constraint.residual !== undefined) {
      details.push(`Residual: ${constraint.residual.toFixed(6)}`)
    }

    // Add specific parameters
    if (constraint.parameters) {
      Object.entries(constraint.parameters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          details.push(`${key}: ${value}`)
        }
      })
    }

    return details
  }

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'satisfied': return '#5cb85c'
      case 'warning': return '#ff8c00'
      case 'violated': return '#d9534f'
      default: return '#999999'
    }
  }

  // Convert constraints to EntityListItem format
  const constraintEntities: EntityListItem[] = constraints.map(constraint => {
    const entities = getConstraintEntities(constraint)
    return {
      id: constraint.id,
      name: getConstraintDisplayName(constraint.type),
      displayInfo: entities.length > 0 ? entities.join(', ') : 'No entities',
      additionalInfo: getConstraintDetails(constraint),
      color: getStatusColor(constraint.status),
      isVisible: constraint.enabled,
      isActive: selectedConstraints.includes(constraint.id)
    }
  })

  return (
    <EntityListPopup
      title="Constraints"
      isOpen={isOpen}
      onClose={onClose}
      entities={constraintEntities}
      emptyMessage="No constraints created yet"
      storageKey="constraints-popup"
      width={550}
      height={500}
      onEdit={onEditConstraint}
      onDelete={onDeleteConstraint}
      onToggleVisibility={onToggleConstraint}
      onSelect={onSelectConstraint}
      renderEntityDetails={(entity) => {
        const constraint = constraints.find(c => c.id === entity.id)
        if (!constraint) return null

        return (
          <div className="constraint-details">
            <div className="constraint-status">
              <span
                className={`status-badge status-${constraint.status}`}
                style={{ backgroundColor: getStatusColor(constraint.status) }}
              >
                {constraint.status}
              </span>
              {constraint.residual !== undefined && (
                <span className="residual-value">
                  Residual: {constraint.residual.toFixed(6)}
                </span>
              )}
            </div>

            {constraint.parameters && Object.keys(constraint.parameters).length > 0 && (
              <div className="constraint-parameters">
                {Object.entries(constraint.parameters).map(([key, value]) => (
                  <div key={key} className="parameter-item">
                    <span className="parameter-name">{key}:</span>
                    <span className="parameter-value">{String(value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      }}
      renderCustomActions={(entity) => {
        const constraint = constraints.find(c => c.id === entity.id)
        if (!constraint) return null

        return (
          <>
            <button
              className={`btn-toggle-driving ${constraint.isDriving ? 'driving' : 'construction'}`}
              onClick={(e) => {
                e.stopPropagation()
                // TODO: Toggle driving/construction mode
                console.log('Toggle driving mode for constraint:', entity.id)
              }}
              title={constraint.isDriving ? 'Switch to construction' : 'Switch to driving'}
            >
              {constraint.isDriving ? '🔧' : '📐'}
            </button>
            <button
              className="btn-focus"
              onClick={(e) => {
                e.stopPropagation()
                // TODO: Focus on constraint entities
                console.log('Focus on constraint entities:', entity.id)
              }}
              title="Focus on constraint entities"
            >
              🎯
            </button>
          </>
        )
      }}
    />
  )
}

export default ConstraintsPopup