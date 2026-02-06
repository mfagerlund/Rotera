import React, { useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTimes, faDownload } from '@fortawesome/free-solid-svg-icons'
import { MARKER_DEFINITIONS } from '../calibration/marker-registry'
import { generateCalibrationSheet, downloadCalibrationSheet } from '../calibration/generate-sheet'

function svgForPreview(svg: string): string {
  return svg.replace(/width="[^"]*"/, 'width="100%"').replace(/height="[^"]*"/, 'height="100%"')
}

interface CalibrationSheetDialogProps {
  isVisible: boolean
  onClose: () => void
}

export const CalibrationSheetDialog: React.FC<CalibrationSheetDialogProps> = ({
  isVisible,
  onClose,
}) => {
  const sheetPreviews = useMemo(() => {
    if (!isVisible) return []
    return MARKER_DEFINITIONS.map(def => ({
      def,
      svg: generateCalibrationSheet(def.id),
    }))
  }, [isVisible])

  if (!isVisible) return null

  return (
    <div className="about-modal__overlay" onClick={onClose}>
      <div
        className="about-modal"
        style={{ maxWidth: '720px' }}
        onClick={e => e.stopPropagation()}
      >
        <button className="about-modal__close" onClick={onClose}>
          <FontAwesomeIcon icon={faTimes} />
        </button>
        <div style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 8px 0' }}>Calibration Sheets</h3>
          <p style={{ color: '#aaa', fontSize: '13px', margin: '0 0 16px 0' }}>
            Print a sheet at 100% scale, place it next to your object, and photograph it.
            Rotera will auto-detect the marker and establish scale + orientation.
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px',
          }}>
            {sheetPreviews.map(({ def, svg }) => (
              <div
                key={def.id}
                style={{
                  border: '1px solid #444',
                  borderRadius: '8px',
                  padding: '12px',
                  backgroundColor: '#1e1e1e',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#00e5ff')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#444')}
                onClick={() => downloadCalibrationSheet(def.id)}
              >
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  padding: '4px',
                  marginBottom: '8px',
                  aspectRatio: '210 / 297',
                  overflow: 'hidden',
                }}>
                  <div
                    dangerouslySetInnerHTML={{ __html: svgForPreview(svg) }}
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>
                      Marker #{def.id} — {def.label}
                    </div>
                    <div style={{ color: '#888', fontSize: '12px' }}>
                      {def.edgeSizeMeters <= 0.05 ? 'Small objects' :
                       def.edgeSizeMeters <= 0.10 ? 'Medium objects' : 'Large objects'}
                    </div>
                  </div>
                  <FontAwesomeIcon icon={faDownload} style={{ color: '#00e5ff', fontSize: '16px' }} />
                </div>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: '16px',
            padding: '10px 12px',
            backgroundColor: 'rgba(243, 156, 18, 0.1)',
            border: '1px solid rgba(243, 156, 18, 0.3)',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#f39c12',
          }}>
            Print at <strong>100% scale</strong> (no &quot;fit to page&quot;). Use the verification ruler on each sheet to confirm the printed size is correct.
          </div>
        </div>
      </div>
    </div>
  )
}
