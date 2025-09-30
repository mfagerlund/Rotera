import React, { useState, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrash } from '@fortawesome/free-solid-svg-icons'
import FloatingWindow from './FloatingWindow'
import { ProjectImage } from '../types/project'
import { useConfirm } from './ConfirmDialog'

// RENAME_TO: ImageEditor
interface ImageEditWindowProps {
  isOpen: boolean
  onClose: () => void
  image: ProjectImage
  onUpdateImage: (updatedImage: ProjectImage) => void
  onDeleteImage?: (imageId: string) => void
}

// RENAME_TO: ImageEditor
export const ImageEditWindow: React.FC<ImageEditWindowProps> = ({
  isOpen,
  onClose,
  image,
  onUpdateImage,
  onDeleteImage
}) => {
  const { confirm, dialog } = useConfirm()
  const [editedImage, setEditedImage] = useState<ProjectImage>(image)
  const [hasChanges, setHasChanges] = useState(false)

  // Reset form when image changes
  useEffect(() => {
    setEditedImage(image)
    setHasChanges(false)
  }, [image])

  const handleInputChange = (field: keyof ProjectImage, value: any) => {
    setEditedImage(prev => ({
      ...prev,
      [field]: value
    }))
    setHasChanges(true)
  }

  const handleSave = () => {
    onUpdateImage(editedImage)
    setHasChanges(false)
    onClose()
  }

  const handleCancel = async () => {
    if (hasChanges) {
      if (await confirm('You have unsaved changes. Are you sure you want to cancel?')) {
        setEditedImage(image)
        setHasChanges(false)
        onClose()
      }
    } else {
      onClose()
    }
  }

  const handleDelete = async () => {
    if (await confirm(`Are you sure you want to delete image "${image.name}"?`)) {
      onDeleteImage?.(image.id)
      onClose()
    }
  }

  return (
    <>
      {dialog}
      <FloatingWindow
        title={`Edit Image: ${image.name}`}
        isOpen={isOpen}
        onClose={handleCancel}
        width={450}
        height={500}
        storageKey="image-edit"
        showOkCancel={true}
        onOk={handleSave}
        onCancel={handleCancel}
        onDelete={onDeleteImage ? handleDelete : undefined}
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
                value={editedImage.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="form-input"
                placeholder="Image name"
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
                src={editedImage.blob}
                alt={editedImage.name}
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
                <span>{editedImage.width} × {editedImage.height} px</span>
              </div>

              <div className="status-item">
                <label>Image ID</label>
                <span title={editedImage.id}>{editedImage.id}</span>
              </div>
            </div>
          </div>
        </div>
      </FloatingWindow>
    </>
  )
}

export default ImageEditWindow
