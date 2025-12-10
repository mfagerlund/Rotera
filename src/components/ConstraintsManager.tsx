// Constraints Management Popup

import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPencil, faTrash } from '@fortawesome/free-solid-svg-icons'
import FloatingWindow from './FloatingWindow'
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

  const getConstraintDisplayName = (type: string) => {
    const names: Record<string, string> = {
      'distance': 'Distance',
      'angle': 'Angle',
      'parallel_lines': 'Parallel',
      'perpendicular_lines': 'Perpendicular',
      'fixed_point': 'Fixed Point',
      'collinear_points': 'Collinear',
      'coplanar_points': 'Coplanar',
      'equal_distances': 'Equal Dist',
      'equal_angles': 'Equal Angles'
    }
    return names[type] || type
  }

  const getConstraintEntities = (constraint: Constraint): string => {
    if (constraint instanceof DistanceConstraint) {
      return `${constraint.pointA.getName()}-${constraint.pointB.getName()}`
    } else if (constraint instanceof AngleConstraint) {
      return `${constraint.pointA.getName()}-${constraint.vertex.getName()}-${constraint.pointC.getName()}`
    } else if (constraint instanceof ParallelLinesConstraint || constraint instanceof PerpendicularLinesConstraint) {
      return `${constraint.lineA.getName()}, ${constraint.lineB.getName()}`
    } else if (constraint instanceof FixedPointConstraint) {
      return constraint.point.getName()
    } else if (constraint instanceof CollinearPointsConstraint || constraint instanceof CoplanarPointsConstraint) {
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

  const getStatusInfo = (constraint: Constraint): { status: string; color: string } => {
    if (!constraint.isEnabled) {
      return { status: 'off', color: '#666' }
    }
    const evaluation = constraint.evaluate()
    if (evaluation.satisfied) {
      return { status: 'ok', color: '#5cb85c' }
    }
    return { status: 'err', color: '#d9534f' }
  }

  const handleDelete = async (constraint: Constraint) => {
    if (await confirm(`Delete ${getConstraintDisplayName(constraint.getConstraintType())} constraint?`)) {
      onDeleteConstraint?.(constraint)
    }
  }

  const handleDeleteAll = async () => {
    if (await confirm(`Delete all ${constraints.length} constraints?`)) {
      onDeleteAllConstraints?.()
    }
  }

  const isSelected = (constraint: Constraint) => selectedConstraints.includes(constraint)

  return (
    <>
      {dialog}
      <FloatingWindow
        title={`Constraints (${constraints.length})`}
        isOpen={isOpen}
        onClose={onClose}
        width={520}
        maxHeight={400}
        storageKey="constraints-popup"
        showOkCancel={false}
        onDelete={constraints.length > 0 && onDeleteAllConstraints ? handleDeleteAll : undefined}
      >
        <div className="lines-manager">
          {constraints.length === 0 ? (
            <div className="lines-manager__empty">No constraints created yet</div>
          ) : (
            <table className="lines-manager__table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Entities</th>
                  <th>Value</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {constraints.map((constraint, index) => {
                  const { status, color } = getStatusInfo(constraint)
                  return (
                    <tr
                      key={index}
                      className={isSelected(constraint) ? 'selected' : ''}
                      onClick={() => onSelectConstraint?.(constraint)}
                    >
                      <td>
                        <span
                          className="color-dot"
                          style={{ backgroundColor: color }}
                        />
                        {getConstraintDisplayName(constraint.getConstraintType())}
                      </td>
                      <td className="points-cell">{getConstraintEntities(constraint)}</td>
                      <td className="length-cell">{getConstraintValue(constraint)}</td>
                      <td className="residual-cell" style={{ color }}>{status}</td>
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
