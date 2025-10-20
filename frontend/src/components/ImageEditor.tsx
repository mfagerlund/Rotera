import React, { useState, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrash } from '@fortawesome/free-solid-svg-icons'
import FloatingWindow from './FloatingWindow'
import type { Viewpoint } from '../entities/viewpoint'
import { useConfirm } from './ConfirmDialog'

interface ImageEditorProps {
  isOpen: boolean
  onClose: () => void
  viewpoint: Viewpoint
  onUpdateViewpoint: (updatedViewpoint: Viewpoint) => void
  onDeleteViewpoint?: (viewpoint: Viewpoint) => void
}

export const ImageEditor: React.FC<ImageEditorProps> = ({
  isOpen,
  onClose,
  viewpoint,
  onUpdateViewpoint,
  onDeleteViewpoint
}) => {
  const { confirm, dialog } = useConfirm()
  const [editedName, setEditedName] = useState(viewpoint.getName())
  const [hasChanges, setHasChanges] = useState(false)

  // Reset form when viewpoint changes
  useEffect(() => {
    setEditedName(viewpoint.getName())
    setHasChanges(false)
  }, [viewpoint])

  const handleNameChange = (value: string) => {
    setEditedName(value)
    setHasChanges(true)
  }

  const handleSave = () => {
    const updatedViewpoint = viewpoint.clone(viewpoint.getId(), editedName)
    onUpdateViewpoint(updatedViewpoint)
    setHasChanges(false)
    onClose()
  }

  const handleCancel = async () => {
    if (hasChanges) {
      if (await confirm('You have unsaved changes. Are you sure you want to cancel?')) {
        setEditedName(viewpoint.getName())
        setHasChanges(false)
        onClose()
      }
    } else {
      onClose()
    }
  }

  const handleDelete = async () => {
    if (await confirm(`Are you sure you want to delete viewpoint "${viewpoint.getName()}"?`)) {
      onDeleteViewpoint?.(viewpoint)
      onClose()
    }
  }

  const [imageWidth, imageHeight] = [viewpoint.imageWidth, viewpoint.imageHeight]

  return (
    <>
      {dialog}
      <FloatingWindow
        title={`Edit Viewpoint: ${viewpoint.getName()}`}
        isOpen={isOpen}
        onClose={handleCancel}
        width={450}
        height={500}
        storageKey="image-edit"
        showOkCancel={true}
        onOk={handleSave}
        onCancel={handleCancel}
        onDelete={onDeleteViewpoint ? handleDelete : undefined}
        okText="Save"
        cancelText="Cancel"
        okDisabled={!hasChanges}
      >
        <div className="image-edit-content">

          {/* Basic Properties */}
          <div className="edit-section">
            <h4>Basic Properties</h4>

            <div className="form-row">
              <label>Name</label>
              <input
                type="text"
                value={editedName}
                onChange={(e) => handleNameChange(e.target.value)}
                className="form-input"
                placeholder="Viewpoint name"
              />
            </div>
          </div>

          {/* Image Preview */}
          <div className="edit-section">
            <h4>Preview</h4>
            <div className="image-preview" style={{
              width: '100%',
              maxHeight: '200px',
              overflow: 'hidden',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: '#f0f0f0',
              borderRadius: '4px'
            }}>
              <img
                src={viewpoint.url}
                alt={viewpoint.getName()}
                style={{
                  maxWidth: '100%',
                  maxHeight: '200px',
                  objectFit: 'contain'
                }}
              />
            </div>
          </div>

          {/* Image Information */}
          <div className="edit-section">
            <h4>Information</h4>

            <div className="status-grid">
              <div className="status-item">
                <label>Dimensions</label>
                <span>{imageWidth} × {imageHeight} px</span>
              </div>

              <div className="status-item">
                <label>Viewpoint ID</label>
                <span title={viewpoint.getId()}>{viewpoint.getId()}</span>
              </div>
            </div>
          </div>
        </div>
      </FloatingWindow>
    </>
  )
}

export default ImageEditor
