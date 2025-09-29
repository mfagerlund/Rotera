// Context-aware constraint property panel

import React, { useEffect } from 'react'
import { Line } from '../types/project'

interface ConstraintPropertyPanelProps {
  activeConstraintType: string | null
  selectedPoints: string[]
  selectedLines: Line[]
  parameters: Record<string, any>
  isComplete: boolean
  worldPointNames: Record<string, string>
  onParameterChange: (key: string, value: any) => void
  onApply: () => void
  onCancel: () => void
}

export const ConstraintPropertyPanel: React.FC<ConstraintPropertyPanelProps> = ({
  activeConstraintType,
  selectedPoints,
  selectedLines,
  parameters,
  isComplete,
  worldPointNames,
  onParameterChange,
  onApply,
  onCancel
}) => {
  const getPointName = (pointId: string) => worldPointNames[pointId] || pointId

  // Handle ESC key to cancel constraint creation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && activeConstraintType) {
        onCancel()
      }
    }

    if (activeConstraintType) {
      document.addEventListener('keydown', handleKeyDown)
      return () => {
        document.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [activeConstraintType, onCancel])

  if (!activeConstraintType) {
    return null
  }

  const getConstraintDisplayName = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1)
  }

  return (
    <div className="property-panel">
      <div className="property-panel-header">
        <h3>{getConstraintDisplayName(activeConstraintType)} Properties</h3>
        <button
          className="btn-clear-constraint"
          onClick={onCancel}
          title="Cancel constraint creation"
        >
          ✕
        </button>
      </div>

      <div className="property-panel-content">
        <ConstraintParameterForm
          type={activeConstraintType}
          selectedPoints={selectedPoints}
          selectedLines={selectedLines}
          parameters={parameters}
          getPointName={getPointName}
          onParameterChange={onParameterChange}
          onApply={onApply}
          isComplete={isComplete}
        />
      </div>
    </div>
  )
}

interface ConstraintParameterFormProps {
  type: string
  selectedPoints: string[]
  selectedLines: Line[]
  parameters: Record<string, any>
  getPointName: (pointId: string) => string
  onParameterChange: (key: string, value: any) => void
  onApply: () => void
  isComplete: boolean
}

const ConstraintParameterForm: React.FC<ConstraintParameterFormProps> = ({
  type,
  selectedPoints,
  selectedLines,
  parameters,
  getPointName,
  onParameterChange,
  onApply,
  isComplete
}) => {
  const getPointNames = (pointIds: string[]) => pointIds.map(getPointName)

  switch (type) {
    case 'points_distance':
      return (
        <div className="parameter-form">
          <div className="selected-points-preview">
            <span>Between: {getPointNames(selectedPoints.slice(0, 2)).join(' ↔ ')}</span>
          </div>
          <div className="form-field">
            <label>Distance (m)</label>
            <input
              type="number"
              step="0.001"
              value={parameters.distance || ''}
              onChange={(e) => onParameterChange('points_distance', parseFloat(e.target.value))}
              placeholder="Enter distance..."
              autoFocus
            />
          </div>
          <div className="form-actions">
            <button
              className="btn-primary"
              onClick={onApply}
              disabled={!isComplete}
            >
              Apply Distance
            </button>
          </div>
        </div>
      )

    case 'points_equal_distance': {
      // Determine if this is angle or circle constraint based on selection
      const isAngleConstraint = selectedPoints.length === 3 || selectedLines.length >= 2

      return (
        <div className="parameter-form">
          <div className="selected-points-preview">
            {isAngleConstraint ? (
              selectedPoints.length >= 3 ? (
                <span>Angle: {getPointNames(selectedPoints.slice(0, 3)).join(' - ')}</span>
              ) : (
                <span>Lines: {selectedLines.map(line =>
                  `${getPointName(line.pointA)}-${getPointName(line.pointB)}`
                ).join(' and ')}</span>
              )
            ) : (
              <span>Points: {getPointNames(selectedPoints).join(', ')}</span>
            )}
          </div>

          {isAngleConstraint ? (
            <div className="form-field">
              <label>Angle (degrees)</label>
              <input
                type="number"
                step="0.1"
                value={parameters.angle || ''}
                onChange={(e) => onParameterChange('points_equal_distance', parseFloat(e.target.value))}
                placeholder="Enter angle..."
                autoFocus
              />
            </div>
          ) : (
            <div className="constraint-description">
              Make the selected points lie on the same circle
            </div>
          )}

          <div className="form-actions">
            <button
              className="btn-primary"
              onClick={onApply}
              disabled={!isComplete}
            >
              {isAngleConstraint ? 'Apply Angle' : 'Apply Circle'}
            </button>
          </div>
        </div>
      )
    }

    case 'lines_parallel':
    case 'lines_perpendicular':
      return (
        <div className="parameter-form">
          <div className="selected-lines-preview">
            <span>
              Lines: {selectedLines.map(line =>
                `${getPointName(line.pointA)}-${getPointName(line.pointB)}`
              ).join(' and ')}
            </span>
          </div>
          <div className="constraint-description">
            Make the selected lines {type === 'lines_parallel' ? 'lines_parallel' : 'lines_perpendicular'}
          </div>
          <div className="form-actions">
            <button
              className="btn-primary"
              onClick={onApply}
            >
              Apply {type === 'lines_parallel' ? 'Parallel' : 'Perpendicular'}
            </button>
          </div>
        </div>
      )

    case 'points_coplanar':
      return (
        <div className="parameter-form">
          <div className="selected-points-preview">
            <span>Corners: {getPointNames(selectedPoints.slice(0, 4)).join(', ')}</span>
          </div>
          <div className="form-field">
            <label>Aspect Ratio (optional)</label>
            <input
              type="number"
              step="0.1"
              value={parameters.aspectRatio || ''}
              onChange={(e) => onParameterChange('aspectRatio', parseFloat(e.target.value) || undefined)}
              placeholder="Leave blank for free rectangle"
            />
          </div>
          <div className="form-actions">
            <button
              className="btn-primary"
              onClick={onApply}
            >
              Apply Rectangle
            </button>
          </div>
        </div>
      )

    case 'point_fixed_coord':
      return (
        <div className="parameter-form">
          <div className="selected-points-preview">
            <span>Fix: {getPointNames(selectedPoints.slice(0, 1))[0]}</span>
          </div>
          <div className="coordinate-inputs">
            <div className="form-field">
              <label>X (m)</label>
              <input
                type="number"
                step="0.001"
                value={parameters.x !== undefined ? parameters.x : ''}
                onChange={(e) => onParameterChange('x', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                placeholder="X coordinate"
              />
            </div>
            <div className="form-field">
              <label>Y (m)</label>
              <input
                type="number"
                step="0.001"
                value={parameters.y !== undefined ? parameters.y : ''}
                onChange={(e) => onParameterChange('y', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                placeholder="Y coordinate"
              />
            </div>
            <div className="form-field">
              <label>Z (m)</label>
              <input
                type="number"
                step="0.001"
                value={parameters.z !== undefined ? parameters.z : ''}
                onChange={(e) => onParameterChange('z', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                placeholder="Z coordinate"
              />
            </div>
          </div>
          <div className="form-actions">
            <button
              className="btn-primary"
              onClick={onApply}
              disabled={!isComplete}
            >
              Fix Position
            </button>
          </div>
        </div>
      )

    case 'points_colinear':
      return (
        <div className="parameter-form">
          <div className="selected-points-preview">
            <span>Points: {getPointNames(selectedPoints).join(', ')}</span>
          </div>
          <div className="constraint-description">
            Make the selected points lie on the same line
          </div>
          <div className="form-actions">
            <button
              className="btn-primary"
              onClick={onApply}
            >
              Apply Collinear
            </button>
          </div>
        </div>
      )



    default:
      return (
        <div className="parameter-form">
          <div className="constraint-description">
            Apply {type} constraint to selected elements
          </div>
          <div className="form-actions">
            <button
              className="btn-primary"
              onClick={onApply}
            >
              Apply {type}
            </button>
          </div>
        </div>
      )
  }
}

export default ConstraintPropertyPanel