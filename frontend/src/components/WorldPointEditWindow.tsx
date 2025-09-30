import React, { useState, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPencil, faTrash } from '@fortawesome/free-solid-svg-icons'
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
          <h4>Position (Known World Coordinates)</h4>

          <div className="form-row">
            <label>X, Y, Z</label>
            <div style={{ display: 'flex', gap: '4px', flex: 1, minWidth: 0 }}>
              <input
                type="number"
                step="0.0001"
                value={editedPoint.xyz?.[0] ?? ''}
                onChange={(e) => {
                  const newValue = e.target.value === '' ? undefined : parseFloat(e.target.value)
                  setEditedPoint(prev => ({
                    ...prev,
                    xyz: newValue !== undefined || prev.xyz?.[1] !== undefined || prev.xyz?.[2] !== undefined
                      ? [newValue, prev.xyz?.[1], prev.xyz?.[2]] as [number | undefined, number | undefined, number | undefined] as any
                      : undefined
                  }))
                  setHasChanges(true)
                }}
                className="form-input"
                placeholder="X"
                title="X coordinate (leave empty if unknown)"
                style={{ flex: 1, minWidth: 0, width: 0 }}
              />
              <input
                type="number"
                step="0.0001"
                value={editedPoint.xyz?.[1] ?? ''}
                onChange={(e) => {
                  const newValue = e.target.value === '' ? undefined : parseFloat(e.target.value)
                  setEditedPoint(prev => ({
                    ...prev,
                    xyz: prev.xyz?.[0] !== undefined || newValue !== undefined || prev.xyz?.[2] !== undefined
                      ? [prev.xyz?.[0], newValue, prev.xyz?.[2]] as [number | undefined, number | undefined, number | undefined] as any
                      : undefined
                  }))
                  setHasChanges(true)
                }}
                className="form-input"
                placeholder="Y"
                title="Y coordinate (leave empty if unknown)"
                style={{ flex: 1, minWidth: 0, width: 0 }}
              />
              <input
                type="number"
                step="0.0001"
                value={editedPoint.xyz?.[2] ?? ''}
                onChange={(e) => {
                  const newValue = e.target.value === '' ? undefined : parseFloat(e.target.value)
                  setEditedPoint(prev => ({
                    ...prev,
                    xyz: prev.xyz?.[0] !== undefined || prev.xyz?.[1] !== undefined || newValue !== undefined
                      ? [prev.xyz?.[0], prev.xyz?.[1], newValue] as [number | undefined, number | undefined, number | undefined] as any
                      : undefined
                  }))
                  setHasChanges(true)
                }}
                className="form-input"
                placeholder="Z"
                title="Z coordinate (leave empty if unknown)"
                style={{ flex: 1, minWidth: 0, width: 0 }}
              />
            </div>
          </div>
          <div className="form-hint" style={{ fontSize: '0.85em', color: '#888', marginTop: '4px' }}>
            Set known coordinates to use as constraints. Leave empty if unknown.
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
                    <div className="image-point-info">
                      <strong>Image {imagePoint.imageId}</strong>
                    </div>
                    <div className="image-point-actions">
                      <button
                        className="btn-edit"
                        onClick={() => {
                          // Navigate to image viewer with this point selected
                          console.log('Edit image point:', imagePoint)
                        }}
                        title="Edit image point"
                      >
                        <FontAwesomeIcon icon={faPencil} />
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => {
                          const newImagePoints = editedPoint.imagePoints!.filter((_, i) => i !== index)
                          setEditedPoint(prev => ({
                            ...prev,
                            imagePoints: newImagePoints
                          }))
                          setHasChanges(true)
                        }}
                        title="Delete image point"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
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