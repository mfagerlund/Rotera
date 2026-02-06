import React, { useState, useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTimes, faCheck, faSpinner } from '@fortawesome/free-solid-svg-icons'
import type { Viewpoint } from '../entities/viewpoint'
import type { DetectedMarker } from '../calibration/detect-markers'
import { detectMarkersInViewpoint } from '../calibration/detect-markers'
import { applyDetectedMarker, type PlacementMode, type WorldUnit } from '../calibration/apply-marker'
import { getMarkerDefinition } from '../calibration/marker-registry'
import type { Project } from '../entities/project'

interface MarkerDetectionDialogProps {
  project: Project
  viewpoint: Viewpoint | null
  onClose: () => void
}

export const MarkerDetectionDialog: React.FC<MarkerDetectionDialogProps> = observer(({
  project,
  viewpoint,
  onClose,
}) => {
  const [detecting, setDetecting] = useState(false)
  const [markers, setMarkers] = useState<DetectedMarker[]>([])
  const [error, setError] = useState<string | null>(null)
  const [placement, setPlacement] = useState<PlacementMode>('floor')
  const [unit, setUnit] = useState<WorldUnit>('cm')
  const [applied, setApplied] = useState(false)

  useEffect(() => {
    if (!viewpoint) return
    setDetecting(true)
    setMarkers([])
    setError(null)
    setApplied(false)

    detectMarkersInViewpoint(viewpoint).then(detected => {
      setMarkers(detected)
      if (detected.length === 0) {
        setError('No calibration markers detected in this image.')
      }
    }).catch(err => {
      setError(`Detection failed: ${err instanceof Error ? err.message : String(err)}`)
    }).finally(() => {
      setDetecting(false)
    })
  }, [viewpoint])

  if (!viewpoint) return null

  const handleApply = () => {
    for (const marker of markers) {
      applyDetectedMarker(project, viewpoint, marker, placement, unit)
    }
    project.propagateInferences()
    setApplied(true)
    setTimeout(onClose, 800)
  }

  return (
    <div className="about-modal__overlay" onClick={onClose}>
      <div
        className="about-modal"
        style={{ maxWidth: '480px' }}
        onClick={e => e.stopPropagation()}
      >
        <button className="about-modal__close" onClick={onClose}>
          <FontAwesomeIcon icon={faTimes} />
        </button>
        <div style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 12px 0' }}>
            Detect Markers — {viewpoint.getName()}
          </h3>

          {detecting && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#aaa' }}>
              <FontAwesomeIcon icon={faSpinner} spin style={{ fontSize: '24px', marginBottom: '12px', display: 'block' }} />
              Scanning for ArUco markers...
            </div>
          )}

          {error && !detecting && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: 'rgba(231, 76, 60, 0.1)',
              border: '1px solid rgba(231, 76, 60, 0.3)',
              borderRadius: '6px',
              color: '#e74c3c',
              fontSize: '13px',
            }}>
              {error}
            </div>
          )}

          {markers.length > 0 && !detecting && (
            <>
              <div style={{
                padding: '10px 14px',
                backgroundColor: 'rgba(39, 174, 96, 0.1)',
                border: '1px solid rgba(39, 174, 96, 0.3)',
                borderRadius: '6px',
                marginBottom: '12px',
              }}>
                <div style={{ color: '#27ae60', fontWeight: 600, marginBottom: '4px' }}>
                  Found {markers.length} marker{markers.length > 1 ? 's' : ''}
                </div>
                {markers.map(m => {
                  const def = getMarkerDefinition(m.id)
                  const existing = findExistingMarker(project, m.id)
                  return (
                    <div key={m.id} style={{ fontSize: '13px', color: '#ccc', marginTop: '4px' }}>
                      Marker #{m.id} — {def?.label ?? 'unknown'} edge
                      {existing && (
                        <span style={{ color: '#f39c12', marginLeft: '8px' }}>
                          (will reuse existing points)
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '6px' }}>
                  Placement mode
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className={`btn-tool ${placement === 'floor' ? 'active' : ''}`}
                    style={{
                      flex: 1,
                      padding: '8px',
                      border: `1px solid ${placement === 'floor' ? '#00e5ff' : '#444'}`,
                      backgroundColor: placement === 'floor' ? 'rgba(0, 229, 255, 0.1)' : 'transparent',
                      color: placement === 'floor' ? '#00e5ff' : '#aaa',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                    onClick={() => setPlacement('floor')}
                  >
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>Floor</div>
                    <div style={{ fontSize: '11px', opacity: 0.7 }}>Sheet on table/floor (Y=0)</div>
                  </button>
                  <button
                    className={`btn-tool ${placement === 'wall' ? 'active' : ''}`}
                    style={{
                      flex: 1,
                      padding: '8px',
                      border: `1px solid ${placement === 'wall' ? '#00e5ff' : '#444'}`,
                      backgroundColor: placement === 'wall' ? 'rgba(0, 229, 255, 0.1)' : 'transparent',
                      color: placement === 'wall' ? '#00e5ff' : '#aaa',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                    onClick={() => setPlacement('wall')}
                  >
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>Wall</div>
                    <div style={{ fontSize: '11px', opacity: 0.7 }}>Sheet on vertical surface</div>
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '6px' }}>
                  World unit
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['mm', 'cm', 'm'] as WorldUnit[]).map(u => (
                    <button
                      key={u}
                      style={{
                        flex: 1,
                        padding: '8px',
                        border: `1px solid ${unit === u ? '#00e5ff' : '#444'}`,
                        backgroundColor: unit === u ? 'rgba(0, 229, 255, 0.1)' : 'transparent',
                        color: unit === u ? '#00e5ff' : '#aaa',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '13px',
                      }}
                      onClick={() => setUnit(u)}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              {!applied ? (
                <button
                  onClick={handleApply}
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: '#00e5ff',
                    color: '#000',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  Apply {markers.length} Marker{markers.length > 1 ? 's' : ''}
                </button>
              ) : (
                <div style={{ textAlign: 'center', padding: '10px', color: '#27ae60', fontWeight: 600 }}>
                  <FontAwesomeIcon icon={faCheck} style={{ marginRight: '6px' }} />
                  Applied successfully
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
})

function findExistingMarker(project: Project, markerId: number): boolean {
  const name = `Marker_${markerId}_TL`
  for (const wp of project.worldPoints) {
    if (wp.name === name) return true
  }
  return false
}
