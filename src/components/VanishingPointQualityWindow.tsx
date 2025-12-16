import React from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons'
import { Viewpoint } from '../entities/viewpoint'
import FloatingWindow from './FloatingWindow'
import { computeVanishingPoint, validateLineQuality, validateAxisLineDistribution, LineQualityIssue, collectDirectionConstrainedLines, VPLineData } from '../optimization/vanishing-points'
import { VanishingLine, VanishingLineAxis } from '../entities/vanishing-line'
import { AXIS_COLORS } from '../constants/visualLanguage'

interface VanishingPointQualityWindowProps {
  isOpen: boolean
  onClose: () => void
  currentViewpoint: Viewpoint | null
}

export const VanishingPointQualityWindow: React.FC<VanishingPointQualityWindowProps> = observer(({
  isOpen,
  onClose,
  currentViewpoint
}) => {
  if (!currentViewpoint) return null

  // Collect explicit VanishingLines
  const explicitLinesByAxis: Record<string, Array<VanishingLine>> = { x: [], y: [], z: [] }
  currentViewpoint.vanishingLines.forEach(vl => {
    explicitLinesByAxis[vl.axis].push(vl)
  })

  // Collect virtual vanishing lines from direction-constrained Lines (x, y, z directions)
  const virtualLines = collectDirectionConstrainedLines(currentViewpoint)
  const virtualLinesByAxis: Record<string, Array<VPLineData>> = { x: [], y: [], z: [] }
  virtualLines.forEach(vl => {
    virtualLinesByAxis[vl.axis].push(vl)
  })

  // Combined count for each axis (explicit + virtual)
  const allLinesByAxis: Record<string, Array<VPLineData>> = {
    x: [...explicitLinesByAxis.x, ...virtualLinesByAxis.x],
    y: [...explicitLinesByAxis.y, ...virtualLinesByAxis.y],
    z: [...explicitLinesByAxis.z, ...virtualLinesByAxis.z]
  }

  const vpQuality: Record<string, { lines: number; angle?: number; color: string }> = {
    x: { lines: allLinesByAxis.x.length, color: AXIS_COLORS.x },
    y: { lines: allLinesByAxis.y.length, color: AXIS_COLORS.y },
    z: { lines: allLinesByAxis.z.length, color: AXIS_COLORS.z }
  }

  Object.entries(allLinesByAxis).forEach(([axis, lines]) => {
    if (lines.length >= 3) {
      const vp = computeVanishingPoint(lines)
      if (vp) {
        const angularErrors: number[] = []
        lines.forEach(line => {
          const lineDir_u = line.p2.u - line.p1.u
          const lineDir_v = line.p2.v - line.p1.v
          const lineDirMag = Math.sqrt(lineDir_u * lineDir_u + lineDir_v * lineDir_v)
          if (lineDirMag < 1e-6) return

          const mid_u = (line.p1.u + line.p2.u) / 2
          const mid_v = (line.p1.v + line.p2.v) / 2
          const vpToMid_u = mid_u - vp.u
          const vpToMid_v = mid_v - vp.v
          const vpToMidMag = Math.sqrt(vpToMid_u * vpToMid_u + vpToMid_v * vpToMid_v)
          if (vpToMidMag < 1e-6) return

          const dot = Math.abs((lineDir_u * vpToMid_u + lineDir_v * vpToMid_v) / (lineDirMag * vpToMidMag))
          const angle = Math.acos(Math.max(0, Math.min(1, dot)))
          angularErrors.push(Math.min(angle, Math.PI - angle))
        })

        if (angularErrors.length > 0) {
          const rms = Math.sqrt(angularErrors.reduce((sum, e) => sum + e * e, 0) / angularErrors.length)
          vpQuality[axis].angle = (rms * 180) / Math.PI
        }
      }
    }
  })

  const allIssues: Array<{ axis: VanishingLineAxis; issues: LineQualityIssue[] }> = []

  // Validate explicit VanishingLines, but pass ALL lines (explicit + virtual) for the count
  // This ensures parallel line warnings are suppressed when 3+ total lines exist for the axis
  Object.entries(explicitLinesByAxis).forEach(([axis, explicitLines]) => {
    const axisTyped = axis as VanishingLineAxis
    const allLinesForAxis = allLinesByAxis[axis]

    explicitLines.forEach(line => {
      const issues = validateLineQuality(line, allLinesForAxis)
      if (issues.length > 0) {
        allIssues.push({ axis: axisTyped, issues })
      }
    })

    // Distribution issues should consider all lines for the axis
    const distributionIssues = validateAxisLineDistribution(allLinesForAxis)
    if (distributionIssues.length > 0) {
      allIssues.push({ axis: axisTyped, issues: distributionIssues })
    }
  })

  return (
    <FloatingWindow
      title="Vanishing Point Quality"
      isOpen={isOpen}
      onClose={onClose}
      initialPosition={{ x: window.innerWidth - 320, y: 100 }}
      width={280}
      storageKey="vp-quality"
    >
      <div style={{ padding: '10px' }}>
        {(['x', 'y', 'z'] as const).map(axis => {
          const q = vpQuality[axis]

          const axisIcon = axis === 'x' ? (
            <svg width="32" height="24" viewBox="0 0 32 24">
              <line x1="10" y1="11" x2="32" y2="4" stroke={AXIS_COLORS.x} strokeWidth="2" />
              <line x1="10" y1="13" x2="32" y2="20" stroke={AXIS_COLORS.x} strokeWidth="2" />
              <circle cx="6" cy="12" r="3" fill={AXIS_COLORS.x} />
            </svg>
          ) : axis === 'y' ? (
            <svg width="24" height="32" viewBox="0 0 24 32">
              <line x1="11" y1="10" x2="4" y2="32" stroke={AXIS_COLORS.y} strokeWidth="2" />
              <line x1="13" y1="10" x2="20" y2="32" stroke={AXIS_COLORS.y} strokeWidth="2" />
              <circle cx="12" cy="6" r="3" fill={AXIS_COLORS.y} />
            </svg>
          ) : (
            <svg width="32" height="24" viewBox="0 0 32 24">
              <line x1="0" y1="4" x2="22" y2="11" stroke={AXIS_COLORS.z} strokeWidth="2" />
              <line x1="0" y1="20" x2="22" y2="13" stroke={AXIS_COLORS.z} strokeWidth="2" />
              <circle cx="26" cy="12" r="3" fill={AXIS_COLORS.z} />
            </svg>
          )

          return (
            <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '13px' }}>
              <span style={{
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {axisIcon}
              </span>
              <span style={{ flex: 1, color: '#ccc' }}>
                {q.lines === 0 && <span style={{ color: '#888' }}>No lines</span>}
                {q.lines === 1 && <span style={{ color: '#888' }}>1 line (need 2+)</span>}
                {q.lines === 2 && <span style={{ color: '#ccc' }}>2 lines <FontAwesomeIcon icon={faCheck} style={{ color: '#4CAF50' }} /></span>}
                {q.lines >= 3 && q.angle !== undefined && (
                  <span style={{ color: '#ccc' }}>
                    {q.lines} lines - {q.angle.toFixed(2)}°{' '}
                    {q.angle < 1 ? (
                      <><FontAwesomeIcon icon={faCheck} style={{ color: '#4CAF50' }} /> excellent</>
                    ) : q.angle < 5 ? (
                      <><FontAwesomeIcon icon={faCheck} style={{ color: '#4CAF50' }} /> good</>
                    ) : (
                      <><FontAwesomeIcon icon={faExclamationTriangle} style={{ color: '#FFC107' }} /> poor accuracy</>
                    )}
                  </span>
                )}
              </span>
            </div>
          )
        })}
        {allIssues.length > 0 && (
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #555' }}>
            <div style={{ fontSize: '12px', color: '#ccc', marginBottom: '8px', fontWeight: 'bold' }}>
              Quality Warnings
            </div>
            {allIssues.map((item, idx) => {
              const axisColors = AXIS_COLORS
              return item.issues.map((issue, issueIdx) => (
                <div
                  key={`${idx}-${issueIdx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '6px',
                    marginBottom: '6px',
                    fontSize: '11px',
                    padding: '4px',
                    backgroundColor: issue.type === 'error' ? 'rgba(255, 82, 82, 0.1)' : 'rgba(255, 193, 7, 0.1)',
                    borderRadius: '4px'
                  }}
                >
                  <span style={{
                    color: issue.type === 'error' ? '#FF5252' : '#FFC107',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    flexShrink: 0
                  }}>
                    !
                  </span>
                  <span style={{ color: '#ccc', flex: 1 }}>
                    <span style={{ color: axisColors[item.axis], fontWeight: 'bold' }}>
                      {item.axis.toUpperCase()}:
                    </span>{' '}
                    {issue.message}
                  </span>
                </div>
              ))
            })}
          </div>
        )}
      </div>
    </FloatingWindow>
  )
})
