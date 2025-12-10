import React, { useState, useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrash } from '@fortawesome/free-solid-svg-icons'
import FloatingWindow from './FloatingWindow'
import type { Viewpoint } from '../entities/viewpoint'
import { useConfirm } from './ConfirmDialog'
import { V, Vec3, Vec4 } from 'scalar-autograd'
import { projectWorldPointToPixelQuaternion } from '../optimization/camera-projection'

interface ImageEditorProps {
  isOpen: boolean
  onClose: () => void
  viewpoint: Viewpoint
  onUpdateViewpoint: (updatedViewpoint: Viewpoint) => void
  onDeleteViewpoint?: (viewpoint: Viewpoint) => void
}

export const ImageEditor: React.FC<ImageEditorProps> = observer(({
  isOpen,
  onClose,
  viewpoint,
  onUpdateViewpoint,
  onDeleteViewpoint
}) => {
  const { confirm, dialog } = useConfirm()
  const [editedName, setEditedName] = useState(viewpoint.getName())
  const [hasChanges, setHasChanges] = useState(false)

  const computeSolveLoss = () => {
    let squaredSum = 0
    let count = 0

    for (const ip of viewpoint.imagePoints) {
      if (!ip.isVisible) continue

      let dx: number | null = null
      let dy: number | null = null

      // Prefer stored residuals from the latest solve
      if (ip.lastResiduals.length >= 2) {
        dx = ip.lastResiduals[0]
        dy = ip.lastResiduals[1]
      } else {
        // Fallback: reproject with current pose/point to estimate loss on the fly
        const wp = ip.worldPoint as any
        const xyz = wp.optimizedXyz ?? wp.getEffectiveXyz?.()
        if (xyz && xyz[0] !== null && xyz[1] !== null && xyz[2] !== null) {
          try {
            const worldVec = new Vec3(V.C(xyz[0]), V.C(xyz[1]), V.C(xyz[2]))
            const camPos = new Vec3(
              V.C(viewpoint.position[0]),
              V.C(viewpoint.position[1]),
              V.C(viewpoint.position[2])
            )
            const camRot = new Vec4(
              V.C(viewpoint.rotation[0]),
              V.C(viewpoint.rotation[1]),
              V.C(viewpoint.rotation[2]),
              V.C(viewpoint.rotation[3])
            )

            const proj = projectWorldPointToPixelQuaternion(
              worldVec,
              camPos,
              camRot,
              V.C(viewpoint.focalLength),
              V.C(viewpoint.aspectRatio),
              V.C(viewpoint.principalPointX),
              V.C(viewpoint.principalPointY),
              V.C(viewpoint.skewCoefficient),
              V.C(viewpoint.radialDistortion[0]),
              V.C(viewpoint.radialDistortion[1]),
              V.C(viewpoint.radialDistortion[2]),
              V.C(viewpoint.tangentialDistortion[0]),
              V.C(viewpoint.tangentialDistortion[1])
            )

            if (proj) {
              dx = proj[0].data - ip.u
              dy = proj[1].data - ip.v
            }
          } catch (err) {
            // Ignore projection failures in the editor summary
          }
        }
      }

      if (dx !== null && dy !== null) {
        squaredSum += dx * dx + dy * dy
        count += 1
      }
    }

    return {
      rms: count > 0 ? Math.sqrt(squaredSum / count) : null,
      count
    }
  }
  const solveLoss = computeSolveLoss()

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
    viewpoint.name = editedName
    onUpdateViewpoint(viewpoint)
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
                <label>Viewpoint Name</label>
                <span title={viewpoint.getName()}>{viewpoint.getName()}</span>
              </div>

              <div className="status-item">
                <label>Solve Loss</label>
                <span>
                  {solveLoss.rms !== null
                    ? `${solveLoss.rms.toFixed(2)} px`
                    : 'N/A'}
                  {solveLoss.count > 0 ? ` (${solveLoss.count} pts)` : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Camera Pose */}
          <div className="edit-section">
            <h4>Camera Pose</h4>

            <div className="status-grid">
              <div className="status-item">
                <label>Position</label>
                <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                  X: {viewpoint.position[0].toFixed(3)}, Y: {viewpoint.position[1].toFixed(3)}, Z: {viewpoint.position[2].toFixed(3)}
                </span>
              </div>

              <div className="status-item">
                <label>Orientation</label>
                <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                  {(() => {
                    const [roll, pitch, yaw] = viewpoint.getRotationEuler()
                    const toDeg = (rad: number) => (rad * 180 / Math.PI).toFixed(1)
                    return `Roll: ${toDeg(roll)}°, Pitch: ${toDeg(pitch)}°, Yaw: ${toDeg(yaw)}°`
                  })()}
                </span>
              </div>
            </div>
          </div>

          {/* Camera Intrinsics */}
          <div className="edit-section">
            <h4>Camera Intrinsics</h4>

            <div className="status-grid">
              <div className="status-item">
                <label>Focal Length</label>
                <span>{viewpoint.focalLength.toFixed(1)} px</span>
              </div>

              <div className="status-item">
                <label>Principal Point</label>
                <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                  ({viewpoint.principalPointX.toFixed(1)}, {viewpoint.principalPointY.toFixed(1)})
                </span>
              </div>
            </div>

            <div className="form-row" style={{ marginTop: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={viewpoint.isPossiblyCropped}
                  onChange={(e) => {
                    viewpoint.isPossiblyCropped = e.target.checked
                    setHasChanges(true)
                  }}
                />
                <span>Image may be cropped</span>
              </label>
              <span style={{ fontSize: '11px', color: '#888', marginLeft: '24px' }}>
                {viewpoint.isPossiblyCropped
                  ? 'Principal point can be optimized'
                  : 'Principal point locked to image center'}
              </span>
            </div>
          </div>
        </div>
      </FloatingWindow>
    </>
  )
})

export default ImageEditor
