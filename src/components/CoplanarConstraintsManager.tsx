// Coplanar Constraints Management Popup

import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPencil, faTrash } from '@fortawesome/free-solid-svg-icons'
import FloatingWindow from './FloatingWindow'
import { CoplanarPointsConstraint } from '../entities/constraints/coplanar-points-constraint'
import { useConfirm } from './ConfirmDialog'

interface CoplanarConstraintsManagerProps {
  isOpen: boolean
  onClose: () => void
  constraints: CoplanarPointsConstraint[]
  selectedConstraints?: CoplanarPointsConstraint[]
  onEditConstraint?: (constraint: CoplanarPointsConstraint) => void
  onDeleteConstraint?: (constraint: CoplanarPointsConstraint) => void
  onDeleteAllConstraints?: () => void
  onSelectConstraint?: (constraint: CoplanarPointsConstraint) => void
}

export const CoplanarConstraintsManager: React.FC<CoplanarConstraintsManagerProps> = ({
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

  const formatResidual = (constraint: CoplanarPointsConstraint): string => {
    const info = constraint.getOptimizationInfo()
    if (info.residuals.length === 0) return '-'
    return info.rmsResidual.toFixed(4)
  }

  const handleDelete = async (constraint: CoplanarPointsConstraint) => {
    if (await confirm(`Delete coplanar constraint "${constraint.getName()}"?`)) {
      onDeleteConstraint?.(constraint)
    }
  }

  const handleDeleteAll = async () => {
    if (await confirm(`Delete all ${constraints.length} coplanar constraints?`)) {
      onDeleteAllConstraints?.()
    }
  }

  const isSelected = (constraint: CoplanarPointsConstraint) => selectedConstraints.includes(constraint)

  return (
    <>
      {dialog}
      <FloatingWindow
        title={`Coplanar Constraints (${constraints.length})`}
        isOpen={isOpen}
        onClose={onClose}
        width={450}
        maxHeight={400}
        storageKey="coplanar-constraints-popup"
        showOkCancel={false}
        onDelete={constraints.length > 0 && onDeleteAllConstraints ? handleDeleteAll : undefined}
      >
        <div className="lines-manager">
          {constraints.length === 0 ? (
            <div className="lines-manager__empty">No coplanar constraints created yet</div>
          ) : (
            <table className="lines-manager__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Points</th>
                  <th>Residual</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {constraints.map((constraint, index) => {
                  return (
                    <tr
                      key={index}
                      className={isSelected(constraint) ? 'selected' : ''}
                      onClick={() => onSelectConstraint?.(constraint)}
                    >
                      <td>{constraint.getName()}</td>
                      <td className="dir-cell">{constraint.points.length}</td>
                      <td className="residual-cell">{formatResidual(constraint)}</td>
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

export default CoplanarConstraintsManager
