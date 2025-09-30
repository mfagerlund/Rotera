// Modal component for editing existing constraints

import React, { useState, useEffect } from 'react'
import { Constraint, WorldPoint } from '../types/project'
import { useConfirm } from './ConfirmDialog'

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
  const { confirm, dialog } = useConfirm()

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

  const handleDelete = async () => {
    if (constraint && await confirm(`Delete ${getConstraintDisplayName(constraint)} constraint?`)) {
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
      case 'points_equal_distance': return 'Circle' // Combined angle/circle constraint type
      case 'point_fixed_coord': return 'Fixed Position'
      case 'lines_parallel': return 'Parallel'
      case 'lines_perpendicular': return 'Perpendicular'
      case 'points_coplanar': return 'Rectangle'
      case 'points_colinear': return 'Collinear'
      // NOTE: line_axis_aligned constraint has been moved to Line entity properties
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
                  <label htmlFor="distance-pointA">Point A</label>
                  <select
                    id="distance-pointA"
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
                  <label htmlFor="distance-pointB">Point B</label>
                  <select
                    id="distance-pointB"
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
                <label htmlFor="distance-value">Distance (meters)</label>
                <input
                  id="distance-value"
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
                  <label htmlFor="angle-vertex">Vertex</label>
                  <select
                    id="angle-vertex"
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
                  <label htmlFor="angle-line1-end">Line 1 End</label>
                  <select
                    id="angle-line1-end"
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
                  <label htmlFor="angle-line2-end">Line 2 End</label>
                  <select
                    id="angle-line2-end"
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
                <label htmlFor="angle-value">Angle (degrees)</label>
                <input
                  id="angle-value"
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
                <label htmlFor="fixed-point">Fixed Point</label>
                <select
                  id="fixed-point"
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
                  <label htmlFor="fixed-x">X (m)</label>
                  <input
                    id="fixed-x"
                    type="number"
                    step="0.001"
                    value={localParams.x || ''}
                    onChange={(e) => handleParamChange('x', parseFloat(e.target.value))}
                    onKeyDown={handleKeyDown}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="fixed-y">Y (m)</label>
                  <input
                    id="fixed-y"
                    type="number"
                    step="0.001"
                    value={localParams.y || ''}
                    onChange={(e) => handleParamChange('y', parseFloat(e.target.value))}
                    onKeyDown={handleKeyDown}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="fixed-z">Z (m)</label>
                  <input
                    id="fixed-z"
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
                  <label htmlFor="line1-pointA">Point A</label>
                  <select
                    id="line1-pointA"
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
                  <label htmlFor="line1-pointB">Point B</label>
                  <select
                    id="line1-pointB"
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
                  <label htmlFor="line2-pointA">Point A</label>
                  <select
                    id="line2-pointA"
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
                  <label htmlFor="line2-pointB">Point B</label>
                  <select
                    id="line2-pointB"
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
                    <label htmlFor={`rect-${corner}`}>Corner {index + 1}</label>
                    <select
                      id={`rect-${corner}`}
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
                <label htmlFor="rect-aspect-ratio">Ratio</label>
                <input
                  id="rect-aspect-ratio"
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
    <>
      {dialog}
      <div className="constraint-editor-overlay" onClick={onCancel}>
        <div className="constraint-editor-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit {getConstraintDisplayName(constraint)} Constraint</h3>
          <div className="modal-controls">
            <label className="enable-toggle" htmlFor="constraint-enabled">
              <input
                id="constraint-enabled"
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
    </>
  )
}

export default ConstraintEditor