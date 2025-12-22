// Coplanar Constraints Management Popup

import React from 'react'
import { observer } from 'mobx-react-lite'
import FloatingWindow from './FloatingWindow'
import { EntityTable, EntityTableColumn } from './EntityTable'
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

const formatResidual = (constraint: CoplanarPointsConstraint): string => {
  const info = constraint.getOptimizationInfo()
  if (info.residuals.length === 0) return '-'
  return info.rmsResidual.toFixed(4)
}

export const CoplanarConstraintsManager: React.FC<CoplanarConstraintsManagerProps> = observer(({
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

  const columns: EntityTableColumn<CoplanarPointsConstraint>[] = [
    {
      header: 'Name',
      render: (c) => c.getName()
    },
    {
      header: 'Points',
      render: (c) => c.points.length,
      className: 'dir-cell'
    },
    {
      header: 'Residual',
      render: (c) => formatResidual(c),
      className: 'residual-cell'
    }
  ]

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
          <EntityTable
            items={constraints}
            columns={columns}
            emptyMessage="No coplanar constraints created yet"
            selectedItems={selectedConstraints}
            onSelect={onSelectConstraint}
            onEdit={onEditConstraint}
            onDelete={onDeleteConstraint ? handleDelete : undefined}
            getKey={(_, index) => index}
          />
        </div>
      </FloatingWindow>
    </>
  )
})

export default CoplanarConstraintsManager
