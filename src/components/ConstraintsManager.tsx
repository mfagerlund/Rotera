// Constraints Management Popup

import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPencil, faTrash } from '@fortawesome/free-solid-svg-icons'
import FloatingWindow from './FloatingWindow'
import type { Constraint } from '../entities/constraints'
import { getConstraintDisplayName } from '../utils/constraintDisplay'
import {
  DistanceConstraint,
  AngleConstraint,
  ParallelLinesConstraint,
  PerpendicularLinesConstraint,
  FixedPointConstraint,
  CollinearPointsConstraint,
  EqualDistancesConstraint,
  EqualAnglesConstraint
} from '../entities/constraints'
import { CoplanarPointsConstraint } from '../entities/constraints/coplanar-points-constraint'
import { WorldPoint } from '../entities/world-point'
import { Line } from '../entities/line'
import { useConfirm } from './ConfirmDialog'

interface ConstraintsPopupProps {
  isOpen: boolean
  onClose: () => void
  constraints: Constraint[]
  allWorldPoints: WorldPoint[]
  allLines: Line[]
  selectedConstraints?: Constraint[]
  onEditConstraint?: (constraint: Constraint) => void
  onDeleteConstraint?: (constraint: Constraint) => void
  onDeleteAllConstraints?: () => void
  onSelectConstraint?: (constraint: Constraint) => void
}

export const ConstraintsManager: React.FC<ConstraintsPopupProps> = ({
  isOpen,
  onClose,
  constraints,
  selectedConstraints = [],
  onEditConstraint,
  onDeleteConstraint,
  onDeleteAllConstraints,
  onSelectConstraint
}) => {
  const { confirm, dialog } = useConfirm()

  // Filter out CoplanarPointsConstraint - they have their own dedicated manager
  const filteredConstraints = constraints.filter(c => !(c instanceof CoplanarPointsConstraint))

  const getConstraintEntities = (constraint: Constraint): string => {
    if (constraint instanceof DistanceConstraint) {
      return `${constraint.pointA.getName()}-${constraint.pointB.getName()}`
    } else if (constraint instanceof AngleConstraint) {
      return `${constraint.pointA.getName()}-${constraint.vertex.getName()}-${constraint.pointC.getName()}`
    } else if (constraint instanceof ParallelLinesConstraint || constraint instanceof PerpendicularLinesConstraint) {
      return `${constraint.lineA.getName()}, ${constraint.lineB.getName()}`
    } else if (constraint instanceof FixedPointConstraint) {
      return constraint.point.getName()
    } else if (constraint instanceof CollinearPointsConstraint) {
      return constraint.points.map(p => p.getName()).join(', ')
    } else if (constraint instanceof EqualDistancesConstraint) {
      return `${constraint.distancePairs.length} pairs`
    } else if (constraint instanceof EqualAnglesConstraint) {
      return `${constraint.angleTriplets.length} angles`
    }
    return '-'
  }

  const getConstraintValue = (constraint: Constraint): string => {
    if (constraint instanceof DistanceConstraint) {
      return `${constraint.targetDistance.toFixed(2)}m`
    } else if (constraint instanceof AngleConstraint) {
      return `${constraint.targetAngle.toFixed(1)}deg`
    } else if (constraint instanceof FixedPointConstraint) {
      return `[${constraint.targetXyz.map(v => v.toFixed(1)).join(',')}]`
    }
    return '-'
  }

  const handleDelete = async (constraint: Constraint) => {
    if (await confirm(`Delete ${getConstraintDisplayName(constraint.getConstraintType())} constraint?`)) {
      onDeleteConstraint?.(constraint)
    }
  }

  const handleDeleteAll = async () => {
    if (await confirm(`Delete all ${filteredConstraints.length} constraints?`)) {
      // Only delete non-coplanar constraints
      filteredConstraints.forEach(c => onDeleteConstraint?.(c))
    }
  }

  const isSelected = (constraint: Constraint) => selectedConstraints.includes(constraint)

  return (
    <>
      {dialog}
      <FloatingWindow
        title={`Constraints (${filteredConstraints.length})`}
        isOpen={isOpen}
        onClose={onClose}
        width={520}
        maxHeight={400}
        storageKey="constraints-popup"
        showOkCancel={false}
        onDelete={filteredConstraints.length > 0 && onDeleteConstraint ? handleDeleteAll : undefined}
      >
        <div className="lines-manager">
          {filteredConstraints.length === 0 ? (
            <div className="lines-manager__empty">No constraints created yet</div>
          ) : (
            <table className="lines-manager__table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Entities</th>
                  <th>Value</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredConstraints.map((constraint, index) => {
                  return (
                    <tr
                      key={index}
                      className={isSelected(constraint) ? 'selected' : ''}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectConstraint?.(constraint)
                      }}
                    >
                      <td>{getConstraintDisplayName(constraint.getConstraintType())}</td>
                      <td className="points-cell">{getConstraintEntities(constraint)}</td>
                      <td className="length-cell">{getConstraintValue(constraint)}</td>
                      <td className="actions-cell">
                        {onEditConstraint && (
                          <button
                            className="btn-icon"
                            onClick={(e) => {
                              e.stopPropagation()
                              onEditConstraint(constraint)
                            }}
                            title="Edit"
                          >
                            <FontAwesomeIcon icon={faPencil} />
                          </button>
                        )}
                        {onDeleteConstraint && (
                          <button
                            className="btn-icon btn-danger-icon"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(constraint)
                            }}
                            title="Delete"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </FloatingWindow>
    </>
  )
}

export default ConstraintsManager
