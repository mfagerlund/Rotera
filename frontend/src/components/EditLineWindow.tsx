import React, { useState, useEffect, useCallback } from 'react'
import FloatingWindow from './FloatingWindow'
import { Line } from '../types/project'

interface EditLineWindowProps {
  line: Line | null
  isOpen: boolean
  onClose: () => void
  onSave: (updatedLine: Line) => void
  onDelete?: (lineId: string) => void
}

interface LineEditState {
  name: string
  color: string
  isVisible: boolean
  type: 'segment' | 'infinite'
  isConstruction: boolean
}

const PRESET_COLORS = [
  '#0696d7', // Primary blue
  '#5cb85c', // Green
  '#ff8c00', // Orange
  '#d9534f', // Red
  '#9b59b6', // Purple
  '#e67e22', // Dark orange
  '#1abc9c', // Teal
  '#f39c12', // Yellow
  '#34495e', // Dark blue-gray
  '#95a5a6'  // Gray
]

export const EditLineWindow: React.FC<EditLineWindowProps> = ({
  line,
  isOpen,
  onClose,
  onSave,
  onDelete
}) => {
  const [editState, setEditState] = useState<LineEditState>({
    name: '',
    color: '#0696d7',
    isVisible: true,
    type: 'segment',
    isConstruction: false
  })
  const [hasChanges, setHasChanges] = useState(false)

  // Initialize edit state when line changes
  useEffect(() => {
    if (line) {
      setEditState({
        name: line.name,
        color: line.color,
        isVisible: line.isVisible,
        type: line.type,
        isConstruction: line.isConstruction || false
      })
      setHasChanges(false)
    }
  }, [line])

  // Track changes
  useEffect(() => {
    if (!line) return

    const hasAnyChanges =
      editState.name !== line.name ||
      editState.color !== line.color ||
      editState.isVisible !== line.isVisible ||
      editState.type !== line.type ||
      editState.isConstruction !== (line.isConstruction || false)

    setHasChanges(hasAnyChanges)
  }, [editState, line])

  const handleFieldChange = useCallback((field: keyof LineEditState, value: any) => {
    setEditState(prev => ({ ...prev, [field]: value }))
  }, [])

  const handleSave = useCallback(() => {
    if (!line || !hasChanges) return

    const updatedLine: Line = {
      ...line,
      name: editState.name,
      color: editState.color,
      isVisible: editState.isVisible,
      type: editState.type,
      isConstruction: editState.isConstruction
    }

    onSave(updatedLine)
    onClose()
  }, [line, editState, hasChanges, onSave, onClose])

  const handleCancel = useCallback(() => {
    if (line) {
      // Revert to original state
      setEditState({
        name: line.name,
        color: line.color,
        isVisible: line.isVisible,
        type: line.type,
        isConstruction: line.isConstruction || false
      })
      setHasChanges(false)
    }
    onClose()
  }, [line, onClose])

  const handleDelete = useCallback(() => {
    if (!line || !onDelete) return

    if (confirm(`Are you sure you want to delete line "${line.name}"?\n\nThis action cannot be undone.`)) {
      onDelete(line.id)
      onClose()
    }
  }, [line, onDelete, onClose])

  if (!line) {
    // Show debug info when line is null
    console.log('🔥 EDIT LINE WINDOW: Line is null/undefined')
    return (
      <FloatingWindow
        title="DEBUG: No Line Found"
        isOpen={isOpen}
        onClose={() => {}}
        width={380}
        height={200}
        className="edit-line-window"
      >
        <div style={{
          padding: '20px',
          textAlign: 'center'
        }}>
          No line data available for editing.
        </div>
      </FloatingWindow>
    )
  }

  // DEBUG OUTPUT FOR EDIT LINE WINDOW
  console.log('🔥 EDIT LINE WINDOW DEBUG:')
  console.log('  - line:', line)
  console.log('  - isOpen:', isOpen)
  console.log('  - hasChanges:', hasChanges)

  return (
    <FloatingWindow
      title={`Edit Line: ${line.name}`}
      isOpen={isOpen}
      onClose={handleCancel}
      onOk={handleSave}
      onCancel={handleCancel}
      width={380}
      height={480}
      storageKey="edit-line"
      okDisabled={!hasChanges}
      okText="Apply"
      className="edit-line-window"
    >
      <div className="edit-line-content">
        {/* Basic Properties */}
        <div className="property-section">
          <h4>Properties</h4>

          <div className="property-field">
            <label>Name</label>
            <input
              type="text"
              value={editState.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              placeholder="Enter line name"
              maxLength={20}
            />
          </div>

          <div className="property-field">
            <label>Type</label>
            <select
              value={editState.type}
              onChange={(e) => handleFieldChange('type', e.target.value as 'segment' | 'infinite')}
            >
              <option value="segment">Line Segment</option>
              <option value="infinite">Infinite Line</option>
            </select>
          </div>

          <div className="property-field checkbox-field">
            <label>
              <input
                type="checkbox"
                checked={editState.isVisible}
                onChange={(e) => handleFieldChange('isVisible', e.target.checked)}
              />
              Visible in views
            </label>
          </div>

          <div className="property-field checkbox-field">
            <label>
              <input
                type="checkbox"
                checked={editState.isConstruction}
                onChange={(e) => handleFieldChange('isConstruction', e.target.checked)}
              />
              Construction geometry
            </label>
          </div>
        </div>

        {/* Color Selection */}
        <div className="property-section">
          <h4>Appearance</h4>

          <div className="property-field">
            <label>Color</label>
            <div className="color-selection">
              <div className="color-presets">
                {PRESET_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={`color-preset ${editState.color === color ? 'selected' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => handleFieldChange('color', color)}
                    title={`Select ${color}`}
                  />
                ))}
              </div>
              <div className="custom-color">
                <input
                  type="color"
                  value={editState.color}
                  onChange={(e) => handleFieldChange('color', e.target.value)}
                />
                <span className="color-value">{editState.color}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Line Information */}
        <div className="property-section">
          <h4>Information</h4>

          <div className="info-field">
            <label>Points</label>
            <span>{line.pointA} → {line.pointB}</span>
          </div>

          <div className="info-field">
            <label>Created</label>
            <span>{line.createdAt ? new Date(line.createdAt).toLocaleDateString() : 'Unknown'}</span>
          </div>

          <div className="info-field">
            <label>ID</label>
            <span className="line-id">{line.id}</span>
          </div>
        </div>

        {/* Actions */}
        {onDelete && (
          <div className="property-section">
            <div className="danger-zone">
              <h4>Danger Zone</h4>
              <button
                type="button"
                className="btn-danger"
                onClick={handleDelete}
              >
                Delete Line
              </button>
              <p className="danger-warning">
                This will permanently delete the line and cannot be undone.
              </p>
            </div>
          </div>
        )}

        {/* Preview */}
        <div className="property-section">
          <h4>Preview</h4>
          <div className="line-preview">
            <div
              className="preview-line"
              style={{
                backgroundColor: editState.color,
                opacity: editState.isVisible ? 1 : 0.3,
                borderStyle: editState.isConstruction ? 'dashed' : 'solid'
              }}
            />
            <span className="preview-label">
              {editState.name} ({editState.type})
              {!editState.isVisible && ' (Hidden)'}
              {editState.isConstruction && ' (Construction)'}
            </span>
          </div>
        </div>
      </div>
    </FloatingWindow>
  )
}

export default EditLineWindow