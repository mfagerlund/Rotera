// Context-sensitive constraint toolbar - Fusion 360 style

import React from 'react'
import { AvailableConstraint, Line } from '../types/project'

interface ConstraintToolbarProps {
  selectedPoints: string[]
  selectedLines: Line[]
  availableConstraints: AvailableConstraint[]
  selectionSummary: string
  onConstraintClick: (type: string, selectedPoints: string[], selectedLines: Line[]) => void
}

export const ConstraintToolbar: React.FC<ConstraintToolbarProps> = ({
  selectedPoints,
  selectedLines,
  availableConstraints,
  selectionSummary,
  onConstraintClick
}) => {
  const handleConstraintClick = (constraintType: string, enabled: boolean) => {
    if (enabled) {
      onConstraintClick(constraintType, selectedPoints, selectedLines)
    }
  }

  return (
    <div className="constraint-toolbar">
      <div className="toolbar-section">
        <span className="toolbar-label">Constraints:</span>
        <div className="constraint-buttons">
          {availableConstraints.length > 0 ? (
            availableConstraints.map(constraint => (
              <ConstraintButton
                key={constraint.type}
                type={constraint.type}
                icon={constraint.icon}
                tooltip={constraint.tooltip}
                enabled={constraint.enabled}
                onClick={() => handleConstraintClick(constraint.type, constraint.enabled)}
              />
            ))
          ) : (
            <span className="no-constraints-message">
              Select points or lines to see available constraints
            </span>
          )}
        </div>
      </div>

      <div className="toolbar-section">
        <span className="selection-info">
          {selectionSummary}
        </span>
      </div>
    </div>
  )
}

interface ConstraintButtonProps {
  type: string
  icon: string
  tooltip: string
  enabled: boolean
  onClick: () => void
}

const ConstraintButton: React.FC<ConstraintButtonProps> = ({
  type,
  icon,
  tooltip,
  enabled,
  onClick
}) => {
  return (
    <button
      className={`constraint-btn ${enabled ? 'enabled' : 'disabled'}`}
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      title={tooltip}
    >
      <span className="constraint-icon">{icon}</span>
      <span className="constraint-label">{type}</span>
    </button>
  )
}

export default ConstraintToolbar