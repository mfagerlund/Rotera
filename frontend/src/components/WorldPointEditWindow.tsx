import React, { useState, useEffect } from 'react'
import FloatingWindow from './FloatingWindow'
import { WorldPoint } from '../types/project'

interface WorldPointEditWindowProps {
  isOpen: boolean
  onClose: () => void
  worldPoint: WorldPoint
  onUpdateWorldPoint: (updatedPoint: WorldPoint) => void
  onDeleteWorldPoint?: (pointId: string) => void
}

export const WorldPointEditWindow: React.FC<WorldPointEditWindowProps> = ({
  isOpen,
  onClose,
  worldPoint,
  onUpdateWorldPoint,
  onDeleteWorldPoint
}) => {
  const [editedPoint, setEditedPoint] = useState<WorldPoint>(worldPoint)
  const [hasChanges, setHasChanges] = useState(false)

  // Reset form when worldPoint changes
  useEffect(() => {
    setEditedPoint(worldPoint)
    setHasChanges(false)
  }, [worldPoint])

  const handleInputChange = (field: keyof WorldPoint, value: any) => {
    setEditedPoint(prev => ({
      ...prev,
      [field]: value
    }))
    setHasChanges(true)
  }

  const handleNestedChange = (field: string, subfield: string, value: any) => {
    setEditedPoint(prev => ({
      ...prev,
      [field]: {
        ...prev[field as keyof WorldPoint] as any,
        [subfield]: value
      }
    }))
    setHasChanges(true)
  }

  const handleSave = () => {
    onUpdateWorldPoint(editedPoint)
    setHasChanges(false)
    onClose()
  }

  const handleCancel = () => {
    if (hasChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to cancel?')) {
        setEditedPoint(worldPoint)
        setHasChanges(false)
        onClose()
      }
    } else {
      onClose()
    }
  }

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete world point "${worldPoint.name}"?`)) {
      onDeleteWorldPoint?.(worldPoint.id)
      onClose()
    }
  }

  const formatCoordinate = (value: number): string => {
    return value.toFixed(4)
  }

  return (
    <FloatingWindow
      title={`Edit World Point: ${worldPoint.name}`}
      isOpen={isOpen}
      onClose={handleCancel}
      width={400}
      height={500}
      storageKey="world-point-edit"
      showOkCancel={true}
      onOk={handleSave}
      onCancel={handleCancel}
      okText="Save"
      cancelText="Cancel"
      okDisabled={!hasChanges}
    >
      <div className="world-point-edit-content">

        {/* Basic Properties */}
        <div className="edit-section">
          <h4>Basic Properties</h4>

          <div className="form-row">
            <label>Name</label>
            <input
              type="text"
              value={editedPoint.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className="form-input"
              placeholder="Point name"
            />
          </div>

          <div className="form-row">
            <label>Color</label>
            <input
              type="color"
              value={editedPoint.color || '#0696d7'}
              onChange={(e) => handleInputChange('color', e.target.value)}
              className="form-input color-input"
            />
          </div>
        </div>

        {/* World Coordinates */}
        <div className="edit-section">
          <h4>World Coordinates</h4>

          <div className="form-row">
            <label>X</label>
            <input
              type="number"
              step="0.0001"
              value={editedPoint.xyz?.[0] || 0}
              onChange={(e) => {
                const newValue = parseFloat(e.target.value) || 0
                setEditedPoint(prev => ({
                  ...prev,
                  xyz: [newValue, prev.xyz?.[1] || 0, prev.xyz?.[2] || 0]
                }))
                setHasChanges(true)
              }}
              className="form-input"
            />
          </div>

          <div className="form-row">
            <label>Y</label>
            <input
              type="number"
              step="0.0001"
              value={editedPoint.xyz?.[1] || 0}
              onChange={(e) => {
                const newValue = parseFloat(e.target.value) || 0
                setEditedPoint(prev => ({
                  ...prev,
                  xyz: [prev.xyz?.[0] || 0, newValue, prev.xyz?.[2] || 0]
                }))
                setHasChanges(true)
              }}
              className="form-input"
            />
          </div>

          <div className="form-row">
            <label>Z</label>
            <input
              type="number"
              step="0.0001"
              value={editedPoint.xyz?.[2] || 0}
              onChange={(e) => {
                const newValue = parseFloat(e.target.value) || 0
                setEditedPoint(prev => ({
                  ...prev,
                  xyz: [prev.xyz?.[0] || 0, prev.xyz?.[1] || 0, newValue]
                }))
                setHasChanges(true)
              }}
              className="form-input"
            />
          </div>
        </div>

        {/* Image Points */}
        <div className="edit-section">
          <h4>Image Points ({editedPoint.imagePoints?.length || 0})</h4>
          {editedPoint.imagePoints && editedPoint.imagePoints.length > 0 ? (
            <div className="image-points-list">
              {editedPoint.imagePoints.map((imagePoint, index) => (
                <div key={index} className="image-point-item">
                  <div className="image-point-header">
                    <strong>Image {imagePoint.imageId}</strong>
                  </div>
                  <div className="image-point-coords">
                    <span>u: {formatCoordinate(imagePoint.u)}</span>
                    <span>v: {formatCoordinate(imagePoint.v)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-image-points">
              No image points placed yet
            </div>
          )}
        </div>

        {/* Status Information */}
        <div className="edit-section">
          <h4>Status</h4>

          <div className="status-grid">
            <div className="status-item">
              <label>Created</label>
              <span>{editedPoint.createdAt ? new Date(editedPoint.createdAt).toLocaleString() : 'Unknown'}</span>
            </div>

            <div className="status-item">
              <label>Visible</label>
              <span>{editedPoint.isVisible ? 'Yes' : 'No'}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        {onDeleteWorldPoint && (
          <div className="edit-section">
            <div className="danger-zone">
              <h4>Danger Zone</h4>
              <button
                className="btn-danger"
                onClick={handleDelete}
              >
                Delete World Point
              </button>
            </div>
          </div>
        )}
      </div>
    </FloatingWindow>
  )
}

export default WorldPointEditWindow