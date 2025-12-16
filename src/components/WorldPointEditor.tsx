import React, { useState, useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { WorldPoint } from '../entities/world-point'
import { Viewpoint } from '../entities/viewpoint'
import FloatingWindow from './FloatingWindow'
import { useConfirm } from './ConfirmDialog'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleDot, faTrash } from '@fortawesome/free-solid-svg-icons'

type ProjectImage = Viewpoint

interface WorldPointEditorProps {
  isOpen: boolean
  onClose: () => void
  worldPoint: WorldPoint
  onUpdateWorldPoint: (updatedPoint: WorldPoint) => void
  onDeleteWorldPoint?: (worldPoint: WorldPoint) => void
  onDeleteImagePoint?: (imagePoint: any) => void
  images: Map<string, ProjectImage>
}

export const WorldPointEditor: React.FC<WorldPointEditorProps> = observer(({
  isOpen,
  onClose,
  worldPoint,
  onUpdateWorldPoint,
  onDeleteWorldPoint,
  onDeleteImagePoint,
  images
}) => {
  const { confirm, dialog } = useConfirm()
  const [editedName, setEditedName] = useState(worldPoint.name)
  const [editedColor, setEditedColor] = useState(worldPoint.color)
  const [hasChanges, setHasChanges] = useState(false)

  // Locked coordinates (editable, nullable)
  const [lockedX, setLockedX] = useState<string>(
    worldPoint.lockedXyz[0] !== null ? worldPoint.lockedXyz[0].toString() : ''
  )
  const [lockedY, setLockedY] = useState<string>(
    worldPoint.lockedXyz[1] !== null ? worldPoint.lockedXyz[1].toString() : ''
  )
  const [lockedZ, setLockedZ] = useState<string>(
    worldPoint.lockedXyz[2] !== null ? worldPoint.lockedXyz[2].toString() : ''
  )

  // Reset form when worldPoint changes
  useEffect(() => {
    setEditedName(worldPoint.name)
    setEditedColor(worldPoint.color)
    setLockedX(worldPoint.lockedXyz[0] !== null ? worldPoint.lockedXyz[0].toString() : '')
    setLockedY(worldPoint.lockedXyz[1] !== null ? worldPoint.lockedXyz[1].toString() : '')
    setLockedZ(worldPoint.lockedXyz[2] !== null ? worldPoint.lockedXyz[2].toString() : '')
    setHasChanges(false)
  }, [worldPoint])

  const handleChange = () => {
    setHasChanges(true)
  }

  const handleSave = () => {
    // Update the world point directly (MobX will detect changes)
    worldPoint.name = editedName
    worldPoint.color = editedColor

    // Update locked coordinates (convert empty strings to null)
    worldPoint.lockedXyz = [
      lockedX.trim() !== '' ? parseFloat(lockedX) : null,
      lockedY.trim() !== '' ? parseFloat(lockedY) : null,
      lockedZ.trim() !== '' ? parseFloat(lockedZ) : null
    ]

    onUpdateWorldPoint(worldPoint)
    setHasChanges(false)
    onClose()
  }

  const handleCancel = async () => {
    if (hasChanges) {
      if (await confirm('You have unsaved changes. Are you sure you want to cancel?')) {
        // Reset to original values
        setEditedName(worldPoint.name)
        setEditedColor(worldPoint.color)
        setLockedX(worldPoint.lockedXyz[0] !== null ? worldPoint.lockedXyz[0].toString() : '')
        setLockedY(worldPoint.lockedXyz[1] !== null ? worldPoint.lockedXyz[1].toString() : '')
        setLockedZ(worldPoint.lockedXyz[2] !== null ? worldPoint.lockedXyz[2].toString() : '')
        setHasChanges(false)
        onClose()
      }
    } else {
      onClose()
    }
  }

  const handleDelete = async () => {
    if (await confirm(`Are you sure you want to delete world point "${worldPoint.name}"?`)) {
      onDeleteWorldPoint?.(worldPoint)
      onClose()
    }
  }

  const handleDeleteImagePoint = async (imagePoint: typeof worldPoint.imagePoints extends Set<infer T> ? T : never) => {
    if (await confirm(`Remove image point from "${(imagePoint.viewpoint as Viewpoint).name}"?`)) {
      // Remove from WorldPoint
      worldPoint.removeImagePoint(imagePoint)

      // Remove from Viewpoint
      const viewpoint = imagePoint.viewpoint as Viewpoint
      viewpoint.removeImagePoint(imagePoint)

      // Remove from Project (if callback provided)
      if (onDeleteImagePoint) {
        onDeleteImagePoint(imagePoint)
      }

      handleChange()
    }
  }

  if (!isOpen) return null

  // Get image points for this world point
  const imagePointsList = Array.from(worldPoint.imagePoints)

  return (
    <>
      {dialog}
      <FloatingWindow
        title={`Edit World Point: ${worldPoint.name}`}
        isOpen={isOpen}
        onClose={handleCancel}
        width={450}
        maxHeight={700}
        storageKey="world-point-edit"
        showOkCancel={true}
        onOk={handleSave}
        onCancel={handleCancel}
        onDelete={onDeleteWorldPoint ? handleDelete : undefined}
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
                onChange={(e) => { setEditedName(e.target.value); handleChange(); }}
                className="form-input"
                placeholder="Point name"
                maxLength={20}
              />
            </div>

            <div className="form-row">
              <label>Color</label>
              <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                <input
                  type="color"
                  value={editedColor}
                  onChange={(e) => { setEditedColor(e.target.value); handleChange(); }}
                  className="color-input"
                />
                <input
                  type="text"
                  value={editedColor}
                  onChange={(e) => { setEditedColor(e.target.value); handleChange(); }}
                  className="form-input"
                  style={{ flex: 1 }}
                />
              </div>
            </div>
          </div>

          {/* 3D Coordinates */}
          <div className="edit-section">
            <h4>3D Coordinates</h4>

            {/* Constraint Status Indicator */}
            <div className="form-row" style={{ marginBottom: '12px' }}>
              <label>Status</label>
              <div style={{ flex: 1 }}>
                {(() => {
                  const status = worldPoint.getConstraintStatus()
                  const statusConfig = {
                    locked: { color: '#2E7D32', label: 'Fully Locked', icon: '🔒' },
                    inferred: { color: '#2E7D32', label: 'Fully Inferred', icon: '🔍' },
                    partial: { color: '#FF9800', label: 'Partially Constrained', icon: '⚡' },
                    free: { color: '#D32F2F', label: 'Free', icon: '○' }
                  }[status]

                  const effective = worldPoint.getEffectiveXyz()
                  const constrainedAxes = [
                    effective[0] !== null ? 'X' : null,
                    effective[1] !== null ? 'Y' : null,
                    effective[2] !== null ? 'Z' : null
                  ].filter(Boolean).join(', ')

                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        background: statusConfig.color + '33',
                        border: `1px solid ${statusConfig.color}`,
                        color: statusConfig.color,
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        {statusConfig.icon} {statusConfig.label}
                      </span>
                      {status === 'partial' && (
                        <span style={{ fontSize: '11px', color: '#999' }}>
                          ({constrainedAxes})
                        </span>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>

            <div className="form-row">
              <label>Locked</label>
              <div style={{ display: 'flex', gap: '4px', flex: 1, maxWidth: '300px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
                  <span style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>X</span>
                  <input
                    type="number"
                    value={lockedX}
                    onChange={(e) => { setLockedX(e.target.value); handleChange(); }}
                    placeholder="free"
                    step="0.001"
                    className="form-input no-spinners"
                    style={{ fontSize: '12px', padding: '4px', width: '100%', height: '26px' }}
                  />
                  {lockedX && (
                    <button
                      type="button"
                      onClick={() => { setLockedX(''); handleChange(); }}
                      title="Clear X"
                      className="coord-clear-btn"
                    >×</button>
                  )}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
                  <span style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>Y</span>
                  <input
                    type="number"
                    value={lockedY}
                    onChange={(e) => { setLockedY(e.target.value); handleChange(); }}
                    placeholder="free"
                    step="0.001"
                    className="form-input no-spinners"
                    style={{ fontSize: '12px', padding: '4px', width: '100%', height: '26px' }}
                  />
                  {lockedY && (
                    <button
                      type="button"
                      onClick={() => { setLockedY(''); handleChange(); }}
                      title="Clear Y"
                      className="coord-clear-btn"
                    >×</button>
                  )}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
                  <span style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>Z</span>
                  <input
                    type="number"
                    value={lockedZ}
                    onChange={(e) => { setLockedZ(e.target.value); handleChange(); }}
                    placeholder="free"
                    step="0.001"
                    className="form-input no-spinners"
                    style={{ fontSize: '12px', padding: '4px', width: '100%', height: '26px' }}
                  />
                  {lockedZ && (
                    <button
                      type="button"
                      onClick={() => { setLockedZ(''); handleChange(); }}
                      title="Clear Z"
                      className="coord-clear-btn"
                    >×</button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLockedX('0')
                    setLockedY('0')
                    setLockedZ('0')
                    handleChange()
                  }}
                  title="Set to origin (0, 0, 0)"
                  style={{
                    padding: '4px 8px',
                    fontSize: '10px',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    background: '#2a2a2a',
                    color: '#999',
                    cursor: 'pointer',
                    height: '26px',
                    minWidth: '26px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#3a3a3a'
                    e.currentTarget.style.color = '#fff'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#2a2a2a'
                    e.currentTarget.style.color = '#999'
                  }}
                >
                  <FontAwesomeIcon icon={faCircleDot} />
                </button>
              </div>
            </div>

            {/* Inferred Coordinates (Read-only) */}
            {worldPoint.inferredXyz.some(v => v !== null) && (
              <div className="form-row">
                <label>Inferred</label>
                <div style={{
                  flex: 1,
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: '#9c9',
                  padding: '4px',
                  display: 'flex',
                  gap: '8px',
                  fontWeight: 'bold',
                  textShadow: '0 0 3px rgba(0,0,0,0.8)'
                }}>
                  <span>X: {worldPoint.inferredXyz[0] !== null ? worldPoint.inferredXyz[0].toFixed(3) : 'free'}</span>
                  <span>Y: {worldPoint.inferredXyz[1] !== null ? worldPoint.inferredXyz[1].toFixed(3) : 'free'}</span>
                  <span>Z: {worldPoint.inferredXyz[2] !== null ? worldPoint.inferredXyz[2].toFixed(3) : 'free'}</span>
                </div>
              </div>
            )}

            {/* Optimized Coordinates (Read-only) */}
            {worldPoint.optimizedXyz && (
              <div className="form-row">
                <label>Optimized</label>
                <div style={{
                  flex: 1,
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: '#aaa',
                  padding: '4px'
                }}>
                  X: {worldPoint.optimizedXyz[0].toFixed(3)},
                  Y: {worldPoint.optimizedXyz[1].toFixed(3)},
                  Z: {worldPoint.optimizedXyz[2].toFixed(3)}
                </div>
              </div>
            )}
          </div>

          {/* Image Points */}
          <div className="edit-section">
            <h4>Image Points ({imagePointsList.length})</h4>

            <div style={{
              maxHeight: '200px',
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 'var(--border-radius)'
            }}>
              {imagePointsList.length === 0 ? (
                <div style={{ color: '#888', fontStyle: 'italic', fontSize: '12px', padding: '8px' }}>
                  No image points
                </div>
              ) : (
                <table style={{
                  width: '100%',
                  fontSize: '11px',
                  borderCollapse: 'collapse'
                }}>
                  <thead style={{
                    position: 'sticky',
                    top: 0,
                    background: '#2a2a2a',
                    borderBottom: '1px solid var(--border)'
                  }}>
                    <tr>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600' }}>Image</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600' }}>U</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600' }}>V</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600' }}>Repr. U</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600' }}>Repr. V</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600' }}>Error</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '600', width: '40px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {imagePointsList.map((ip, idx) => {
                      const viewpoint = ip.viewpoint as Viewpoint
                      const hasReprojection = ip.reprojectedU !== undefined && ip.reprojectedV !== undefined
                      const errorU = hasReprojection ? ip.reprojectedU! - ip.u : 0
                      const errorV = hasReprojection ? ip.reprojectedV! - ip.v : 0
                      const totalError = hasReprojection ? Math.sqrt(errorU * errorU + errorV * errorV) : 0

                      return (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: idx < imagePointsList.length - 1 ? '1px solid #333' : 'none'
                          }}
                        >
                          <td style={{ padding: '4px 8px', color: '#ccc' }}>{viewpoint.name}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                            {ip.u.toFixed(1)}
                          </td>
                          <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                            {ip.v.toFixed(1)}
                          </td>
                          <td style={{
                            padding: '4px 8px',
                            textAlign: 'right',
                            fontFamily: 'monospace',
                            color: hasReprojection ? '#9c9' : '#666'
                          }}>
                            {hasReprojection ? ip.reprojectedU!.toFixed(1) : '-'}
                          </td>
                          <td style={{
                            padding: '4px 8px',
                            textAlign: 'right',
                            fontFamily: 'monospace',
                            color: hasReprojection ? '#9c9' : '#666'
                          }}>
                            {hasReprojection ? ip.reprojectedV!.toFixed(1) : '-'}
                          </td>
                          <td style={{
                            padding: '4px 8px',
                            textAlign: 'right',
                            fontFamily: 'monospace',
                            color: hasReprojection
                              ? (totalError > 10 ? '#f66' : totalError > 5 ? '#fa3' : '#9c9')
                              : '#666'
                          }}>
                            {hasReprojection ? totalError.toFixed(1) : '-'}
                          </td>
                          <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                            <button
                              onClick={() => handleDeleteImagePoint(ip)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#888',
                                cursor: 'pointer',
                                padding: '2px 4px',
                                fontSize: '11px'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = '#f66' }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = '#888' }}
                              title="Remove image point"
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </FloatingWindow>
    </>
  )
})

export default WorldPointEditor
