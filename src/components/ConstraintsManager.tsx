// Constraints Management Popup

import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBullseye, faDraftingCompass, faWrench } from '@fortawesome/free-solid-svg-icons'
import EntityListPopup, { EntityListItem } from './EntityListPopup'
import type { Constraint } from '../entities/constraints'
import { WorldPoint } from '../entities/world-point'
import { Line } from '../entities/line'
import { getEntityKey } from '../utils/entityKeys'

interface ConstraintsPopupProps {
  isOpen: boolean
  onClose: () => void
  constraints: Constraint[]
  allWorldPoints: WorldPoint[]
  allLines: Line[]
  selectedConstraints?: Constraint[]
  onEditConstraint?: (constraint: Constraint) => void
  onDeleteConstraint?: (constraint: Constraint) => void
  onToggleConstraint?: (constraint: Constraint) => void
  onSelectConstraint?: (constraint: Constraint) => void
}

export const ConstraintsManager: React.FC<ConstraintsPopupProps> = ({
  isOpen,
  onClose,
  constraints,
  allWorldPoints,
  allLines,
  selectedConstraints = [],
  onEditConstraint,
  onDeleteConstraint,
  onToggleConstraint,
  onSelectConstraint
}) => {
  // Use getEntityKey() for ALL entities - NO DTO IDs at runtime!
  const constraintMap = new Map<string, Constraint>()

  // Helper to get entity names for display
  const getPointName = (point: WorldPoint) => point.getName()
  const getLineName = (line: Line) => line.getName()

  const getConstraintDisplayName = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const getConstraintEntities = (constraint: Constraint): string[] => {
    const entities: string[] = []

    // Use object references, NOT IDs!
    const points = constraint.points
    const lines = constraint.lines

    if (points.length > 0) {
      entities.push(...points.map(p => getPointName(p)))
    }

    if (lines.length > 0) {
      entities.push(...lines.map(l => getLineName(l)))
    }

    return entities
  }

  const getConstraintDetails = (constraint: Constraint): string[] => {
    const details: string[] = []
    const dto = constraint.toConstraintDto()

    // Add constraint type info
    details.push(`Type: ${getConstraintDisplayName(dto.type)}`)

    // Add status
    details.push(`Status: ${dto.status}`)

    // Add driving/construction info
    details.push(dto.isDriving ? 'Driving constraint' : 'Construction constraint')

    // Add priority
    if (dto.parameters.priority !== undefined) {
      details.push(`Priority: ${dto.parameters.priority}`)
    }

    // Add error if available
    if (dto.error !== undefined) {
      details.push(`Error: ${dto.error.toFixed(6)}`)
    }

    // Add specific parameters
    if (dto.parameters) {
      Object.entries(dto.parameters).forEach(([key, value]) => {
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
  const selectedSet = new Set(selectedConstraints)
  const constraintEntities: EntityListItem[] = constraints.map(constraint => {
    const entities = getConstraintEntities(constraint)
    const dto = constraint.toConstraintDto()
    const entityKey = getEntityKey(constraint)
    constraintMap.set(entityKey, constraint) // Map entityKey to constraint for lookups
    return {
      id: entityKey, // Use getEntityKey(), NOT dto.id!
      name: getConstraintDisplayName(dto.type),
      displayInfo: entities.length > 0 ? entities.join(', ') : 'No entities',
      additionalInfo: getConstraintDetails(constraint),
      color: getStatusColor(dto.status),
      isVisible: dto.isEnabled,
      isActive: selectedSet.has(constraint)
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
      onEdit={onEditConstraint ? (entityId) => {
        const constraint = constraintMap.get(entityId)
        if (constraint) onEditConstraint(constraint)
      } : undefined}
      onDelete={onDeleteConstraint ? (entityId) => {
        const constraint = constraintMap.get(entityId)
        if (constraint) onDeleteConstraint(constraint)
      } : undefined}
      onToggleVisibility={onToggleConstraint ? (entityId) => {
        const constraint = constraintMap.get(entityId)
        if (constraint) onToggleConstraint(constraint)
      } : undefined}
      onSelect={onSelectConstraint ? (entityId) => {
        const constraint = constraintMap.get(entityId)
        if (constraint) onSelectConstraint(constraint)
      } : undefined}
      renderEntityDetails={(entity) => {
        const constraint = constraintMap.get(entity.id)
        if (!constraint) return null

        const dto = constraint.toConstraintDto()

        return (
          <div className="constraint-details">
            <div className="constraint-status">
              <span
                className={`status-badge status-${dto.status}`}
                style={{ backgroundColor: getStatusColor(dto.status) }}
              >
                {dto.status}
              </span>
              {dto.error !== undefined && (
                <span className="residual-value">
                  Error: {dto.error.toFixed(6)}
                </span>
              )}
            </div>

            {dto.parameters && Object.keys(dto.parameters).length > 0 && (
              <div className="constraint-parameters">
                {Object.entries(dto.parameters).map(([key, value]) => (
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
        const constraint = constraintMap.get(entity.id)
        if (!constraint) return null

        const dto = constraint.toConstraintDto()

        return (
          <>
            <button
              className={`btn-toggle-driving ${dto.isDriving ? 'driving' : 'construction'}`}
              onClick={(e) => {
                e.stopPropagation()
                // TODO: Toggle driving/construction mode
                console.log('Toggle driving mode for constraint:', entity.id)
              }}
              title={dto.isDriving ? 'Switch to construction' : 'Switch to driving'}
            >
              {dto.isDriving ? '<FontAwesomeIcon icon={faWrench} />' : '<FontAwesomeIcon icon={faDraftingCompass} />'}
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
              <FontAwesomeIcon icon={faBullseye} />
            </button>
          </>
        )
      }}
    />
  )
}

export default ConstraintsManager