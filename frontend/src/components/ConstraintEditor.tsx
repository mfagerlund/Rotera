// Modal component for editing existing constraints

import React, { useState, useEffect } from 'react'
import { Constraint, WorldPoint } from '../types/project'

interface ConstraintEditorProps {
  constraint: Constraint | null
  worldPoints: Record<string, WorldPoint>
  isOpen: boolean
  onSave: (updates: Partial<Constraint>) => void
  onCancel: () => void
  onDelete: () => void
}

export const ConstraintEditor: React.FC<ConstraintEditorProps> = ({
  constraint,
  worldPoints,
  isOpen,
  onSave,
  onCancel,
  onDelete
}) => {
  const [localParams, setLocalParams] = useState<Record<string, any>>({})
  const [isDirty, setIsDirty] = useState(false)

  // Initialize local params when constraint changes
  useEffect(() => {
    if (constraint) {
      setLocalParams({ ...constraint })
      setIsDirty(false)
    }
  }, [constraint])

  const handleParamChange = (key: string, value: any) => {
    setLocalParams(prev => ({ ...prev, [key]: value }))
    setIsDirty(true)
  }

  const handleSave = () => {
    if (constraint && isDirty) {
      const updates = { ...localParams }
      delete updates.id // Don't update ID
      onSave(updates)
    }
    setIsDirty(false)
  }

  const handleDelete = () => {
    if (constraint && confirm(`Delete ${getConstraintDisplayName(constraint)} constraint?`)) {
      onDelete()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isDirty) {
      handleSave()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  if (!isOpen || !constraint) return null

  const getConstraintDisplayName = (c: Constraint) => {
    switch (c.type) {
      case 'points_distance': return 'Distance'
      case 'points_equal_distance': return 'Angle' // TODO: Map angle to appropriate constraint
      case 'point_fixed_coord': return 'Fixed Position'
      case 'lines_parallel': return 'Parallel'
      case 'lines_perpendicular': return 'Perpendicular'
      case 'points_coplanar': return 'Rectangle' // TODO: Map rectangle to appropriate constraint
      case 'points_colinear': return 'Collinear'
      case 'points_equal_distance': return 'Circle' // TODO: Map circle to appropriate constraint
      case 'line_axis_aligned': return 'Horizontal' // TODO: Horizontal/Vertical might need different types
      case 'line_axis_aligned': return 'Vertical' // TODO: Need different type for vertical
      default: return c.type
    }
  }

  const getPointName = (pointId: string) => worldPoints[pointId]?.name || pointId

  const renderConstraintForm = () => {
    switch (constraint.type) {
      case 'points_distance':
        return (
          <div className="constraint-edit-form">
            <div className="form-section">
              <h4>Points</h4>
              <div className="point-assignment">
                <div className="point-field">
                  <label>Point A</label>
                  <select
                    value={localParams.pointA || ''}
                    onChange={(e) => handleParamChange('pointA', e.target.value)}
                  >
                    <option value="">Select point...</option>
                    {Object.values(worldPoints).map(wp => (
                      <option key={wp.id} value={wp.id}>{wp.name}</option>
                    ))}
                  </select>
                </div>
                <div className="point-field">
                  <label>Point B</label>
                  <select
                    value={localParams.pointB || ''}
                    onChange={(e) => handleParamChange('pointB', e.target.value)}
                  >
                    <option value="">Select point...</option>
                    {Object.values(worldPoints).map(wp => (
                      <option key={wp.id} value={wp.id}>{wp.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="form-section">
              <h4>Distance</h4>
              <div className="form-field">
                <label>Distance (meters)</label>
                <input
                  type="number"
                  step="0.001"
                  value={localParams.distance || ''}
                  onChange={(e) => handleParamChange('points_distance', parseFloat(e.target.value))}
                  onKeyDown={handleKeyDown}
                />
              </div>
            </div>
          </div>
        )

      case 'points_equal_distance': // TODO: Map angle to appropriate constraint
        return (
          <div className="constraint-edit-form">
            <div className="form-section">
              <h4>Points</h4>
              <div className="point-assignment">
                <div className="point-field">
                  <label>Vertex</label>
                  <select
                    value={localParams.vertex || ''}
                    onChange={(e) => handleParamChange('vertex', e.target.value)}
                  >
                    <option value="">Select vertex point...</option>
                    {Object.values(worldPoints).map(wp => (
                      <option key={wp.id} value={wp.id}>{wp.name}</option>
                    ))}
                  </select>
                </div>
                <div className="point-field">
                  <label>Line 1 End</label>
                  <select
                    value={localParams.line1_end || ''}
                    onChange={(e) => handleParamChange('line1_end', e.target.value)}
                  >
                    <option value="">Select point...</option>
                    {Object.values(worldPoints).map(wp => (
                      <option key={wp.id} value={wp.id}>{wp.name}</option>
                    ))}
                  </select>
                </div>
                <div className="point-field">
                  <label>Line 2 End</label>
                  <select
                    value={localParams.line2_end || ''}
                    onChange={(e) => handleParamChange('line2_end', e.target.value)}
                  >
                    <option value="">Select point...</option>
                    {Object.values(worldPoints).map(wp => (
                      <option key={wp.id} value={wp.id}>{wp.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="form-section">
              <h4>Angle</h4>
              <div className="form-field">
                <label>Angle (degrees)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="360"
                  value={localParams.angle_degrees || localParams.angle || ''}
                  onChange={(e) => handleParamChange('angle_degrees', parseFloat(e.target.value))}
                  onKeyDown={handleKeyDown}
                />
              </div>
            </div>
          </div>
        )

      case 'point_fixed_coord':
        return (
          <div className="constraint-edit-form">
            <div className="form-section">
              <h4>Point</h4>
              <div className="point-field">
                <label>Fixed Point</label>
                <select
                  value={localParams.point_id || ''}
                  onChange={(e) => handleParamChange('point_id', e.target.value)}
                >
                  <option value="">Select point...</option>
                  {Object.values(worldPoints).map(wp => (
                    <option key={wp.id} value={wp.id}>{wp.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-section">
              <h4>Position</h4>
              <div className="coordinate-inputs">
                <div className="form-field">
                  <label>X (m)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={localParams.x || ''}
                    onChange={(e) => handleParamChange('x', parseFloat(e.target.value))}
                    onKeyDown={handleKeyDown}
                  />
                </div>
                <div className="form-field">
                  <label>Y (m)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={localParams.y || ''}
                    onChange={(e) => handleParamChange('y', parseFloat(e.target.value))}
                    onKeyDown={handleKeyDown}
                  />
                </div>
                <div className="form-field">
                  <label>Z (m)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={localParams.z || ''}
                    onChange={(e) => handleParamChange('z', parseFloat(e.target.value))}
                    onKeyDown={handleKeyDown}
                  />
                </div>
              </div>
            </div>
          </div>
        )

      case 'lines_parallel':
      case 'lines_perpendicular':
        return (
          <div className="constraint-edit-form">
            <div className="form-section">
              <h4>Line 1</h4>
              <div className="line-points">
                <div className="point-field">
                  <label>Point A</label>
                  <select
                    value={localParams.line1_wp_a || ''}
                    onChange={(e) => handleParamChange('line1_wp_a', e.target.value)}
                  >
                    <option value="">Select point...</option>
                    {Object.values(worldPoints).map(wp => (
                      <option key={wp.id} value={wp.id}>{wp.name}</option>
                    ))}
                  </select>
                </div>
                <div className="point-field">
                  <label>Point B</label>
                  <select
                    value={localParams.line1_wp_b || ''}
                    onChange={(e) => handleParamChange('line1_wp_b', e.target.value)}
                  >
                    <option value="">Select point...</option>
                    {Object.values(worldPoints).map(wp => (
                      <option key={wp.id} value={wp.id}>{wp.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="form-section">
              <h4>Line 2</h4>
              <div className="line-points">
                <div className="point-field">
                  <label>Point A</label>
                  <select
                    value={localParams.line2_wp_a || ''}
                    onChange={(e) => handleParamChange('line2_wp_a', e.target.value)}
                  >
                    <option value="">Select point...</option>
                    {Object.values(worldPoints).map(wp => (
                      <option key={wp.id} value={wp.id}>{wp.name}</option>
                    ))}
                  </select>
                </div>
                <div className="point-field">
                  <label>Point B</label>
                  <select
                    value={localParams.line2_wp_b || ''}
                    onChange={(e) => handleParamChange('line2_wp_b', e.target.value)}
                  >
                    <option value="">Select point...</option>
                    {Object.values(worldPoints).map(wp => (
                      <option key={wp.id} value={wp.id}>{wp.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )

      case 'points_coplanar': // TODO: Map rectangle to appropriate constraint
        return (
          <div className="constraint-edit-form">
            <div className="form-section">
              <h4>Corners</h4>
              <div className="corner-assignment">
                {['cornerA', 'cornerB', 'cornerC', 'cornerD'].map((corner, index) => (
                  <div key={corner} className="point-field">
                    <label>Corner {index + 1}</label>
                    <select
                      value={localParams[corner] || ''}
                      onChange={(e) => handleParamChange(corner, e.target.value)}
                    >
                      <option value="">Select corner...</option>
                      {Object.values(worldPoints).map(wp => (
                        <option key={wp.id} value={wp.id}>{wp.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
            <div className="form-section">
              <h4>Aspect Ratio (Optional)</h4>
              <div className="form-field">
                <label>Ratio</label>
                <input
                  type="number"
                  step="0.1"
                  value={localParams.aspectRatio || ''}
                  onChange={(e) => handleParamChange('aspectRatio', parseFloat(e.target.value) || undefined)}
                  placeholder="Leave blank for free rectangle"
                  onKeyDown={handleKeyDown}
                />
              </div>
            </div>
          </div>
        )

      default:
        return (
          <div className="constraint-edit-form">
            <div className="unsupported-constraint">
              <p>Editing for {constraint.type} constraints is not yet implemented.</p>
              <p>You can enable/disable or delete this constraint.</p>
            </div>
          </div>
        )
    }
  }

  return (
    <div className="constraint-editor-overlay" onClick={onCancel}>
      <div className="constraint-editor-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit {getConstraintDisplayName(constraint)} Constraint</h3>
          <div className="modal-controls">
            <label className="enable-toggle">
              <input
                type="checkbox"
                checked={localParams.enabled || false}
                onChange={(e) => handleParamChange('enabled', e.target.checked)}
              />
              <span>Enabled</span>
            </label>
            <button className="btn-close" onClick={onCancel}>✕</button>
          </div>
        </div>

        <div className="modal-content">
          {renderConstraintForm()}
        </div>

        <div className="modal-actions">
          <div className="action-group left">
            <button
              className="btn-delete"
              onClick={handleDelete}
            >
              Delete Constraint
            </button>
          </div>
          <div className="action-group right">
            <button
              className="btn-secondary"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={!isDirty}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConstraintEditor