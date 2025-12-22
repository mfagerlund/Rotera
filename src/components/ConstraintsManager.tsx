// Constraints Management Popup

import React from 'react'
import { observer } from 'mobx-react-lite'
import FloatingWindow from './FloatingWindow'
import { EntityTable, EntityTableColumn } from './EntityTable'
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

export const ConstraintsManager: React.FC<ConstraintsPopupProps> = observer(({
  isOpen,
  onClose,
  constraints,
  selectedConstraints = [],
  onEditConstraint,
  onDeleteConstraint,
  onSelectConstraint
}) => {
  const { confirm, dialog } = useConfirm()

  // Filter out CoplanarPointsConstraint - they have their own dedicated manager
  const filteredConstraints = constraints.filter(c => !(c instanceof CoplanarPointsConstraint))

  const handleDelete = async (constraint: Constraint) => {
    if (await confirm(`Delete ${getConstraintDisplayName(constraint.getConstraintType())} constraint?`)) {
      onDeleteConstraint?.(constraint)
    }
  }

  const handleDeleteAll = async () => {
    if (await confirm(`Delete all ${filteredConstraints.length} constraints?`)) {
      filteredConstraints.forEach(c => onDeleteConstraint?.(c))
    }
  }

  const columns: EntityTableColumn<Constraint>[] = [
    {
      header: 'Type',
      render: (c) => getConstraintDisplayName(c.getConstraintType())
    },
    {
      header: 'Entities',
      render: (c) => getConstraintEntities(c),
      className: 'points-cell'
    },
    {
      header: 'Value',
      render: (c) => getConstraintValue(c),
      className: 'length-cell'
    }
  ]

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
          <EntityTable
            items={filteredConstraints}
            columns={columns}
            emptyMessage="No constraints created yet"
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

export default ConstraintsManager
