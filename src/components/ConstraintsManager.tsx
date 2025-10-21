// Constraints Management Popup

import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBullseye, faDraftingCompass, faWrench } from '@fortawesome/free-solid-svg-icons'
import EntityListPopup, { EntityListItem } from './EntityListPopup'
import type { Constraint } from '../entities/constraints'
import {
  DistanceConstraint,
  AngleConstraint,
  ParallelLinesConstraint,
  PerpendicularLinesConstraint,
  FixedPointConstraint,
  CollinearPointsConstraint,
  CoplanarPointsConstraint,
  EqualDistancesConstraint,
  EqualAnglesConstraint
} from '../entities/constraints'
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

    // Different constraint types have different properties - check the type
    if (constraint instanceof DistanceConstraint) {
      entities.push(getPointName(constraint.pointA), getPointName(constraint.pointB))
    } else if (constraint instanceof AngleConstraint) {
      entities.push(getPointName(constraint.pointA), getPointName(constraint.vertex), getPointName(constraint.pointC))
    } else if (constraint instanceof ParallelLinesConstraint) {
      entities.push(getLineName(constraint.lineA), getLineName(constraint.lineB))
    } else if (constraint instanceof PerpendicularLinesConstraint) {
      entities.push(getLineName(constraint.lineA), getLineName(constraint.lineB))
    } else if (constraint instanceof FixedPointConstraint) {
      entities.push(getPointName(constraint.point))
    } else if (constraint instanceof CollinearPointsConstraint) {
      entities.push(...constraint.points.map(p => getPointName(p)))
    } else if (constraint instanceof CoplanarPointsConstraint) {
      entities.push(...constraint.points.map(p => getPointName(p)))
    } else if (constraint instanceof EqualDistancesConstraint) {
      // Flatten all point pairs into a list of unique points
      const allPoints = new Set<WorldPoint>()
      constraint.distancePairs.forEach(pair => {
        allPoints.add(pair[0])
        allPoints.add(pair[1])
      })
      entities.push(...Array.from(allPoints).map(p => getPointName(p)))
    } else if (constraint instanceof EqualAnglesConstraint) {
      // Flatten all angle triplets into a list of unique points
      const allPoints = new Set<WorldPoint>()
      constraint.angleTriplets.forEach(triplet => {
        allPoints.add(triplet[0])
        allPoints.add(triplet[1])
        allPoints.add(triplet[2])
      })
      entities.push(...Array.from(allPoints).map(p => getPointName(p)))
    }

    return entities
  }

  const getConstraintDetails = (constraint: Constraint): string[] => {
    const details: string[] = []

    // Add constraint type info
    details.push(`Type: ${getConstraintDisplayName(constraint.getConstraintType())}`)

    // Add status based on evaluation
    const evaluation = constraint.evaluate()
    const status = constraint.isEnabled
      ? (evaluation.satisfied ? 'satisfied' : 'violated')
      : 'disabled'
    details.push(`Status: ${status}`)

    // Add enabled/disabled info
    details.push(constraint.isEnabled ? 'Enabled' : 'Disabled')

    // Add specific parameters based on constraint type
    if (constraint instanceof DistanceConstraint) {
      details.push(`Target Distance: ${constraint.targetDistance.toFixed(3)}`)
      details.push(`Tolerance: ${constraint.tolerance.toFixed(6)}`)
      if (evaluation.value !== 0) {
        details.push(`Current Distance: ${evaluation.value.toFixed(3)}`)
      }
    } else if (constraint instanceof AngleConstraint) {
      details.push(`Target Angle: ${constraint.targetAngle.toFixed(2)}°`)
      details.push(`Tolerance: ${constraint.tolerance.toFixed(6)}`)
      if (evaluation.value !== 0) {
        details.push(`Current Angle: ${evaluation.value.toFixed(2)}°`)
      }
    } else if (constraint instanceof FixedPointConstraint) {
      details.push(`Target XYZ: [${constraint.targetXyz.map(v => v.toFixed(3)).join(', ')}]`)
      details.push(`Tolerance: ${constraint.tolerance.toFixed(6)}`)
      if (evaluation.value !== Infinity) {
        details.push(`Distance from Target: ${evaluation.value.toFixed(6)}`)
      }
    } else if (constraint instanceof ParallelLinesConstraint || constraint instanceof PerpendicularLinesConstraint) {
      const c = constraint as ParallelLinesConstraint | PerpendicularLinesConstraint
      details.push(`Tolerance: ${c.tolerance.toFixed(6)}`)
      if (evaluation.value !== 90) {
        details.push(`Angle: ${evaluation.value.toFixed(2)}°`)
      }
    } else if (constraint instanceof CollinearPointsConstraint || constraint instanceof CoplanarPointsConstraint) {
      const c = constraint as CollinearPointsConstraint | CoplanarPointsConstraint
      details.push(`Tolerance: ${c.tolerance.toFixed(6)}`)
      if (evaluation.value !== 1) {
        details.push(`Deviation: ${evaluation.value.toFixed(6)}`)
      }
    } else if (constraint instanceof EqualDistancesConstraint) {
      details.push(`Distance Pairs: ${constraint.distancePairs.length}`)
      details.push(`Tolerance: ${constraint.tolerance.toFixed(6)}`)
      if (evaluation.value !== Infinity) {
        details.push(`Std Deviation: ${evaluation.value.toFixed(6)}`)
      }
    } else if (constraint instanceof EqualAnglesConstraint) {
      details.push(`Angle Triplets: ${constraint.angleTriplets.length}`)
      details.push(`Tolerance: ${constraint.tolerance.toFixed(6)}`)
      if (evaluation.value !== Infinity) {
        details.push(`Std Deviation: ${evaluation.value.toFixed(6)}°`)
      }
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
  const constraintEntities: EntityListItem<Constraint>[] = constraints.map(constraint => {
    const entities = getConstraintEntities(constraint)
    const entityKey = getEntityKey(constraint)
    const evaluation = constraint.evaluate()
    const status = constraint.isEnabled
      ? (evaluation.satisfied ? 'satisfied' : 'violated')
      : 'disabled'

    constraintMap.set(entityKey, constraint) // Map entityKey to constraint for lookups
    return {
      id: entityKey, // Use getEntityKey(), NOT dto.id!
      name: getConstraintDisplayName(constraint.getConstraintType()),
      displayInfo: entities.length > 0 ? entities.join(', ') : 'No entities',
      additionalInfo: getConstraintDetails(constraint),
      color: getStatusColor(status),
      isVisible: constraint.isEnabled,
      isActive: selectedSet.has(constraint),
      entity: constraint  // Pass the actual Constraint object
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
      onEdit={onEditConstraint}
      onDelete={onDeleteConstraint}
      onToggleVisibility={onToggleConstraint}
      onSelect={onSelectConstraint}
      renderEntityDetails={(entityItem) => {
        const constraint = entityItem.entity
        if (!constraint) return null

        const evaluation = constraint.evaluate()
        const status = constraint.isEnabled
          ? (evaluation.satisfied ? 'satisfied' : 'violated')
          : 'disabled'

        // Build parameter list based on constraint type
        const parameters: Record<string, any> = {}

        if (constraint instanceof DistanceConstraint) {
          parameters.targetDistance = constraint.targetDistance.toFixed(3)
          parameters.tolerance = constraint.tolerance.toFixed(6)
          parameters.currentDistance = evaluation.value.toFixed(3)
        } else if (constraint instanceof AngleConstraint) {
          parameters.targetAngle = `${constraint.targetAngle.toFixed(2)}°`
          parameters.tolerance = constraint.tolerance.toFixed(6)
          parameters.currentAngle = `${evaluation.value.toFixed(2)}°`
        } else if (constraint instanceof FixedPointConstraint) {
          parameters.targetXYZ = `[${constraint.targetXyz.map(v => v.toFixed(3)).join(', ')}]`
          parameters.tolerance = constraint.tolerance.toFixed(6)
          parameters.distanceFromTarget = evaluation.value.toFixed(6)
        } else if (constraint instanceof ParallelLinesConstraint || constraint instanceof PerpendicularLinesConstraint) {
          const c = constraint as ParallelLinesConstraint | PerpendicularLinesConstraint
          parameters.tolerance = c.tolerance.toFixed(6)
          parameters.angle = `${evaluation.value.toFixed(2)}°`
        } else if (constraint instanceof CollinearPointsConstraint || constraint instanceof CoplanarPointsConstraint) {
          const c = constraint as CollinearPointsConstraint | CoplanarPointsConstraint
          parameters.tolerance = c.tolerance.toFixed(6)
          parameters.deviation = evaluation.value.toFixed(6)
        } else if (constraint instanceof EqualDistancesConstraint) {
          parameters.distancePairs = constraint.distancePairs.length
          parameters.tolerance = constraint.tolerance.toFixed(6)
          if (evaluation.value !== Infinity) {
            parameters.stdDeviation = evaluation.value.toFixed(6)
          }
        } else if (constraint instanceof EqualAnglesConstraint) {
          parameters.angleTriplets = constraint.angleTriplets.length
          parameters.tolerance = constraint.tolerance.toFixed(6)
          if (evaluation.value !== Infinity) {
            parameters.stdDeviation = `${evaluation.value.toFixed(6)}°`
          }
        }

        return (
          <div className="constraint-details">
            <div className="constraint-status">
              <span
                className={`status-badge status-${status}`}
                style={{ backgroundColor: getStatusColor(status) }}
              >
                {status}
              </span>
              {!evaluation.satisfied && constraint.isEnabled && (
                <span className="residual-value">
                  Not satisfied
                </span>
              )}
            </div>

            {Object.keys(parameters).length > 0 && (
              <div className="constraint-parameters">
                {Object.entries(parameters).map(([key, value]) => (
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

        // TODO: Add isDriving property to Constraint class if needed
        // For now, we'll just show the focus button
        return (
          <>
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