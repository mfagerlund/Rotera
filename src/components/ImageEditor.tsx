import React, { useState, useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrash } from '@fortawesome/free-solid-svg-icons'
import FloatingWindow from './FloatingWindow'
import type { Viewpoint } from '../entities/viewpoint'
import { useConfirm } from './ConfirmDialog'
import { projectToPixel } from '../utils/projection'
import { computeVanishingPoint, collectDirectionConstrainedLines, VPLineData } from '../optimization/vanishing-points'
import { VanishingLineAxis } from '../entities/vanishing-line'

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
      let dx: number | null = null
      let dy: number | null = null

      // Prefer stored residuals from the latest solve
      if (ip.lastResiduals.length >= 2) {
        dx = ip.lastResiduals[0]
        dy = ip.lastResiduals[1]
      } else {
        // Fallback: reproject with current pose/point to estimate loss on the fly
        const wp = ip.worldPoint
        const optimizationInfo = wp.getOptimizationInfo()
        const xyz = optimizationInfo.optimizedXyz ?? wp.getEffectiveXyz()
        if (xyz && xyz[0] !== null && xyz[1] !== null && xyz[2] !== null) {
          try {
            const proj = projectToPixel([xyz[0], xyz[1], xyz[2]], viewpoint)

            if (proj) {
              dx = proj.u - ip.u
              dy = proj.v - ip.v
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

  // Compute vanishing points for display
  const computeVanishingPoints = () => {
    const allLinesByAxis: Record<VanishingLineAxis, VPLineData[]> = { x: [], y: [], z: [] }

    // Collect explicit vanishing lines
    Array.from(viewpoint.vanishingLines).forEach(vl => {
      allLinesByAxis[vl.axis].push(vl)
    })

    // Collect virtual lines from direction-constrained world lines
    const virtualLines = collectDirectionConstrainedLines(viewpoint)
    virtualLines.forEach(vl => {
      allLinesByAxis[vl.axis].push(vl)
    })

    const vps: Record<VanishingLineAxis, { u: number; v: number } | null> = { x: null, y: null, z: null }
    const axes: VanishingLineAxis[] = ['x', 'y', 'z']

    axes.forEach(axis => {
      const lines = allLinesByAxis[axis]
      if (lines.length >= 2) {
        const vp = computeVanishingPoint(lines)
        if (vp) {
          vps[axis] = vp
        }
      }
    })

    return vps
  }

  const vanishingPoints = computeVanishingPoints()
  const hasVanishingPoints = vanishingPoints.x || vanishingPoints.y || vanishingPoints.z

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

          {/* Name and Preview */}
          <div className="edit-section" style={{ paddingBottom: '8px' }}>
            <div className="form-row" style={{ marginBottom: '8px' }}>
              <label>Name</label>
              <input
                type="text"
                value={editedName}
                onChange={(e) => handleNameChange(e.target.value)}
                className="form-input"
                placeholder="Viewpoint name"
              />
            </div>
            <div className="image-preview" style={{
              width: '100%',
              maxHeight: '100px',
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
                  maxHeight: '100px',
                  objectFit: 'contain'
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '11px', color: '#666' }}>
              <span>{imageWidth} × {imageHeight} px</span>
              <span>
                RMS: {solveLoss.rms !== null ? `${solveLoss.rms.toFixed(2)} px` : 'N/A'}
                {solveLoss.count > 0 ? ` (${solveLoss.count} pts)` : ''}
              </span>
            </div>
          </div>

          {/* Camera */}
          <div className="edit-section" style={{ paddingBottom: '8px' }}>
            <h4 style={{ marginBottom: '6px' }}>Camera</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: '11px' }}>
              <div>
                <span style={{ color: '#888' }}>Position: </span>
                <span style={{ fontFamily: 'monospace' }}>
                  ({viewpoint.position[0].toFixed(2)}, {viewpoint.position[1].toFixed(2)}, {viewpoint.position[2].toFixed(2)})
                </span>
              </div>
              <div>
                <span style={{ color: '#888' }}>Focal: </span>
                <span style={{ fontFamily: 'monospace' }}>{viewpoint.focalLength.toFixed(1)} px</span>
              </div>
              <div>
                <span style={{ color: '#888' }}>Rotation: </span>
                <span style={{ fontFamily: 'monospace' }}>
                  {(() => {
                    const [roll, pitch, yaw] = viewpoint.getRotationEuler()
                    const toDeg = (rad: number) => (rad * 180 / Math.PI).toFixed(1)
                    return `(${toDeg(roll)}°, ${toDeg(pitch)}°, ${toDeg(yaw)}°)`
                  })()}
                </span>
              </div>
              <div>
                <span style={{ color: '#888' }}>PP: </span>
                <span style={{ fontFamily: 'monospace' }}>
                  ({viewpoint.principalPointX.toFixed(1)}, {viewpoint.principalPointY.toFixed(1)})
                </span>
              </div>
            </div>
            <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px' }}>
                <input
                  type="checkbox"
                  checked={viewpoint.enabledInSolve}
                  onChange={(e) => {
                    viewpoint.enabledInSolve = e.target.checked
                    setHasChanges(true)
                  }}
                  style={{ width: '14px', height: '14px' }}
                />
                <span>Include in solve</span>
                <span style={{ color: viewpoint.enabledInSolve ? '#27ae60' : '#e74c3c', marginLeft: '8px' }}>
                  ({viewpoint.enabledInSolve ? 'enabled' : 'disabled'})
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px' }}>
                <input
                  type="checkbox"
                  checked={viewpoint.isPossiblyCropped}
                  onChange={(e) => {
                    viewpoint.isPossiblyCropped = e.target.checked
                    setHasChanges(true)
                  }}
                  style={{ width: '14px', height: '14px' }}
                />
                <span>Image may be cropped</span>
                <span style={{ color: '#888', marginLeft: '8px' }}>
                  ({viewpoint.isPossiblyCropped ? 'PP optimizable' : 'PP fixed'})
                </span>
              </label>
            </div>
          </div>

          {/* Vanishing Points */}
          {hasVanishingPoints && (
            <div className="edit-section" style={{ paddingBottom: '8px' }}>
              <h4 style={{ marginBottom: '6px' }}>Vanishing Points</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', fontSize: '11px' }}>
                {vanishingPoints.x && (
                  <span>
                    <span style={{ color: '#ff4444', fontWeight: 'bold' }}>X</span>
                    <span style={{ fontFamily: 'monospace', marginLeft: '4px' }}>
                      ({vanishingPoints.x.u.toFixed(1)}, {vanishingPoints.x.v.toFixed(1)})
                    </span>
                  </span>
                )}
                {vanishingPoints.y && (
                  <span>
                    <span style={{ color: '#44ff44', fontWeight: 'bold' }}>Y</span>
                    <span style={{ fontFamily: 'monospace', marginLeft: '4px' }}>
                      ({vanishingPoints.y.u.toFixed(1)}, {vanishingPoints.y.v.toFixed(1)})
                    </span>
                  </span>
                )}
                {vanishingPoints.z && (
                  <span>
                    <span style={{ color: '#4444ff', fontWeight: 'bold' }}>Z</span>
                    <span style={{ fontFamily: 'monospace', marginLeft: '4px' }}>
                      ({vanishingPoints.z.u.toFixed(1)}, {vanishingPoints.z.v.toFixed(1)})
                    </span>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </FloatingWindow>
    </>
  )
})

export default ImageEditor
