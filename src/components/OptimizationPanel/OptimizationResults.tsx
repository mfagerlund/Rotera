import React, { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { Project } from '../../entities/project'
import { WorldPoint } from '../../entities/world-point'
import { Line } from '../../entities/line'
import { Viewpoint } from '../../entities/viewpoint'
import { ImagePoint } from '../../entities/imagePoint'
import { CoplanarPointsConstraint } from '../../entities/constraints/coplanar-points-constraint'
import { OutlierInfo, SolveQuality } from '../../optimization/optimize-project'
import { getEntityKey } from '../../utils/entityKeys'
import { formatXyz } from '../../utils/formatters'

/** Result structure passed from useOptimizationPanel. Quality comes from optimizer's getSolveQuality. */
interface OptimizationResultData {
  converged: boolean
  error: string | null
  totalError: number
  pointAccuracy: number
  iterations: number
  outliers: OutlierInfo[]
  medianReprojectionError?: number
  quality: SolveQuality
  elapsedMs?: number
}

interface OptimizationResultsProps {
  project: Project
  pnpResults: {camera: string, before: number, after: number, iterations: number}[]
  results: OptimizationResultData | null
  onSelectWorldPoint?: (worldPoint: WorldPoint) => void
  onSelectLine?: (line: Line) => void
  onSelectCoplanarConstraint?: (constraint: CoplanarPointsConstraint) => void
  onHoverWorldPoint?: (worldPoint: WorldPoint | null) => void
  onHoverLine?: (line: Line | null) => void
  onHoverCoplanarConstraint?: (constraint: CoplanarPointsConstraint | null) => void
  isWorldPointSelected?: (worldPoint: WorldPoint) => boolean
  isLineSelected?: (line: Line) => boolean
  isCoplanarConstraintSelected?: (constraint: CoplanarPointsConstraint) => boolean
}

function formatNumber(value: number): string {
  return value.toFixed(2);
}

function formatPixelError(value: number): string {
  return value.toFixed(2) + ' px';
}

interface CollapsibleSectionProps {
  title: string
  count: number
  defaultExpanded?: boolean
  children: React.ReactNode
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, count, defaultExpanded = true, children }) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="entity-section">
      <h5
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
      >
        <span style={{
          display: 'inline-block',
          width: '12px',
          transition: 'transform 0.2s',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)'
        }}>▶</span>
        {title} ({count})
      </h5>
      {expanded && children}
    </div>
  )
}

export const OptimizationResults: React.FC<OptimizationResultsProps> = observer(({
  project,
  pnpResults,
  results,
  onSelectWorldPoint,
  onSelectLine,
  onSelectCoplanarConstraint,
  onHoverWorldPoint,
  onHoverLine,
  onHoverCoplanarConstraint,
  isWorldPointSelected,
  isLineSelected,
  isCoplanarConstraintSelected
}) => {
  // Compute per-viewpoint errors
  const getViewpointErrors = (vp: Viewpoint) => {
    const imagePointErrors: Array<{imagePoint: ImagePoint, worldPointName: string, error: number, residuals: number[]}> = []
    let totalSquaredError = 0
    let count = 0

    for (const ip of vp.imagePoints) {
      const ipConcrete = ip as ImagePoint
      if (ipConcrete.lastResiduals && ipConcrete.lastResiduals.length >= 2) {
        const error = Math.sqrt(ipConcrete.lastResiduals[0] ** 2 + ipConcrete.lastResiduals[1] ** 2)
        imagePointErrors.push({
          imagePoint: ipConcrete,
          worldPointName: ipConcrete.worldPoint.getName(),
          error,
          residuals: ipConcrete.lastResiduals
        })
        totalSquaredError += error ** 2
        count++
      }
    }

    const rmsError = count > 0 ? Math.sqrt(totalSquaredError / count) : 0
    // Sort by error descending so worst errors are at top
    imagePointErrors.sort((a, b) => b.error - a.error)

    return { imagePointErrors, rmsError, count }
  }

  return (
    <>
      {pnpResults.length > 0 && (
        <div className="optimization-results success">
          <div className="results-header">
            <span className="results-status">
              Camera Initialization Results
            </span>
          </div>
          <div className="results-details">
            {pnpResults.map((result, idx) => (
              <div key={idx} className="result-item" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontWeight: 'bold' }}>{result.camera}:</span>
                <span style={{ marginLeft: '10px' }}>Before: {result.before.toFixed(2)} px</span>
                <span style={{ marginLeft: '10px' }}>After: {result.after.toFixed(2)} px</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {results && (
        <div className={`optimization-results ${results.converged ? 'success' : 'error'}`}>
          <div className="results-header">
            <span className="results-status">
              {results.converged ? '✅ Optimization converged' : `⚠️ ${results.error || 'Did not converge'}`}
            </span>
          </div>
          {/* Quality Indicator Badge - show even if not converged so user can assess quality */}
          {results.quality && (() => {
            const quality = results.quality;
            return (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                margin: '8px 0',
                backgroundColor: quality.bgColor,
                border: `2px solid ${quality.color}`,
                borderRadius: '6px',
              }}>
                <span style={{
                  fontSize: '20px',
                  lineHeight: 1,
                  color: quality.color,
                  textShadow: `0 0 2px ${quality.bgColor}, 0 0 1px rgba(0,0,0,0.3)`,
                }}>{quality.starDisplay}</span>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontWeight: 'bold',
                    color: quality.color,
                    fontSize: '14px',
                  }}>
                    {quality.label} Quality
                    {!results.converged && <span style={{ fontWeight: 'normal', opacity: 0.8 }}> (not converged)</span>}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: quality.color,
                    opacity: 0.8,
                  }}>
                    Total error: {formatNumber(results.totalError)}
                  </div>
                </div>
                <div style={{
                  fontSize: '11px',
                  color: '#666',
                  textAlign: 'right',
                }}>
                  {results.totalError < 2.5 && '<2.5'}
                  {results.totalError >= 2.5 && results.totalError < 5 && '2.5-5'}
                  {results.totalError >= 5 && '>5'}
                </div>
              </div>
            );
          })()}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
            <span>Error:{formatNumber(results.totalError)}</span>
            <span style={{ margin: '0 4px', opacity: 0.5 }}>|</span>
            <span>Accuracy:{formatNumber(results.pointAccuracy)}</span>
            <span style={{ margin: '0 4px', opacity: 0.5 }}>|</span>
            <span>Iterations:{results.iterations}</span>
            {results.elapsedMs !== undefined && (
              <>
                <span style={{ margin: '0 4px', opacity: 0.5 }}>|</span>
                <span>Time:{Math.round(results.elapsedMs)}ms</span>
              </>
            )}
          </div>

          {/* Outlier Detection */}
          {results && results.outliers && results.outliers.length > 0 && (() => {
            // Group outliers by WorldPoint using entity key (not name) to handle duplicate names
            const byWorldPoint = new Map<string, { worldPoint: WorldPoint, images: Array<{viewpoint: string, error: number}> }>();
            results.outliers.forEach((outlier: OutlierInfo) => {
              const wpKey = getEntityKey(outlier.imagePoint.worldPoint);
              if (!byWorldPoint.has(wpKey)) {
                byWorldPoint.set(wpKey, { worldPoint: outlier.imagePoint.worldPoint, images: [] });
              }
              byWorldPoint.get(wpKey)!.images.push({
                viewpoint: outlier.viewpointName,
                error: outlier.error
              });
            });

            return (
              <div className="outliers-section" style={{
                marginTop: '12px',
                padding: '12px',
                backgroundColor: '#fff3cd',
                border: '2px solid #ffc107',
                borderRadius: '4px'
              }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#856404', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ⚠️ Outliers Detected ({results.outliers.length} image points)
                </h4>
                <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#856404' }}>
                  These image points have large reprojection errors and may be incorrect manual clicks:
                </p>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {Array.from(byWorldPoint.entries()).map(([wpKey, { worldPoint, images }]) => (
                    <div key={wpKey} style={{
                      padding: '8px',
                      margin: '6px 0',
                      backgroundColor: '#fff',
                      border: '1px solid #ffc107',
                      borderRadius: '4px'
                    }}>
                      <div style={{
                        fontWeight: 'bold',
                        color: '#333',
                        marginBottom: '4px',
                        fontSize: '13px'
                      }}>
                        {worldPoint.getName()} <span style={{ color: '#666', fontWeight: 'normal', fontSize: '11px' }}>({images.length} image{images.length > 1 ? 's' : ''})</span>
                      </div>
                      {images.map((img, idx) => (
                        <div key={idx} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '3px 0 3px 12px',
                          fontSize: '12px',
                          color: '#555'
                        }}>
                          <span style={{ color: '#555' }}>📷 {img.viewpoint}</span>
                          <span style={{ color: '#dc3545', fontWeight: 'bold', marginLeft: '12px' }}>
                            {formatPixelError(img.error)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#856404', fontStyle: 'italic' }}>
                  Outliers are marked with red circle + X on the images. Consider re-clicking these points.
                </p>
              </div>
            );
          })()}

          {/* Entity-level optimization information - show even if not converged */}
          {(results.converged || results.medianReprojectionError !== undefined) && (
            <div className="entity-optimization-info">
              {/* Viewpoints - Per-camera error breakdown */}
              {Array.from(project.viewpoints.values()).length > 0 && (
                <CollapsibleSection
                  title="Viewpoints"
                  count={Array.from(project.viewpoints.values()).length}
                  defaultExpanded={true}
                >
                  {Array.from(project.viewpoints.values()).map(vp => {
                    const { imagePointErrors, rmsError, count } = getViewpointErrors(vp)
                    const hasErrors = imagePointErrors.length > 0

                    return (
                      <div key={getEntityKey(vp)} style={{ marginBottom: '12px' }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 8px',
                          backgroundColor: 'var(--bg-secondary)',
                          borderRadius: '4px',
                          marginBottom: '4px'
                        }}>
                          <span style={{ fontWeight: 'bold' }}>📷 {vp.getName()}</span>
                          <span style={{
                            fontSize: '12px',
                            color: rmsError > 5 ? '#dc3545' : rmsError > 2 ? '#ffc107' : '#28a745'
                          }}>
                            RMS: {formatPixelError(rmsError)} ({count} pts)
                          </span>
                        </div>
                        {hasErrors && (
                          <table className="entity-table" style={{ fontSize: '11px' }}>
                            <thead>
                              <tr>
                                <th>Point</th>
                                <th>Error (px)</th>
                                <th>du</th>
                                <th>dv</th>
                              </tr>
                            </thead>
                            <tbody>
                              {imagePointErrors.slice(0, 10).map(({ imagePoint, worldPointName, error, residuals }) => {
                                const isSelected = isWorldPointSelected?.(imagePoint.worldPoint) ?? false
                                return (
                                <tr
                                  key={getEntityKey(imagePoint)}
                                  className={`${isSelected ? 'selected' : ''} ${error > 5 ? 'error-highlight' : ''}`}
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => onSelectWorldPoint?.(imagePoint.worldPoint)}
                                  onMouseEnter={() => onHoverWorldPoint?.(imagePoint.worldPoint)}
                                  onMouseLeave={() => onHoverWorldPoint?.(null)}
                                >
                                  <td>{worldPointName}</td>
                                  <td style={{
                                    color: error > 5 ? '#dc3545' : error > 2 ? '#856404' : 'inherit',
                                    fontWeight: error > 5 ? 'bold' : 'normal'
                                  }}>
                                    {formatPixelError(error)}
                                  </td>
                                  <td>{formatNumber(residuals[0])}</td>
                                  <td>{formatNumber(residuals[1])}</td>
                                </tr>
                                )
                              })}
                              {imagePointErrors.length > 10 && (
                                <tr>
                                  <td colSpan={4} style={{ textAlign: 'center', fontStyle: 'italic', color: '#666' }}>
                                    ... and {imagePointErrors.length - 10} more
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )
                  })}
                </CollapsibleSection>
              )}

              {/* World Points */}
              <CollapsibleSection
                title="World Points"
                count={Array.from(project.worldPoints.values()).filter(p => p.getOptimizationInfo().optimizedXyz !== undefined).length}
                defaultExpanded={false}
              >
                <table className="entity-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Coords</th>
                      <th>Position</th>
                      <th>RMS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(project.worldPoints.values())
                      .filter(p => p.getOptimizationInfo().optimizedXyz !== undefined)
                      .map(point => {
                        const info = point.getOptimizationInfo()
                        const isSelected = isWorldPointSelected?.(point) ?? false
                        return (
                          <tr
                            key={getEntityKey(point)}
                            className={isSelected ? 'selected' : ''}
                            onClick={() => onSelectWorldPoint?.(point)}
                            onMouseEnter={() => onHoverWorldPoint?.(point)}
                            onMouseLeave={() => onHoverWorldPoint?.(null)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td>{point.getName()}</td>
                            <td>{formatXyz(point.getEffectiveXyz())}</td>
                            <td>{formatXyz(info.optimizedXyz)}</td>
                            <td>{formatNumber(info.rmsResidual)}</td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </CollapsibleSection>

              {/* Lines */}
              {Array.from(project.lines.values()).length > 0 && (
                <CollapsibleSection
                  title="Lines"
                  count={Array.from(project.lines.values()).length}
                  defaultExpanded={false}
                >
                  <table className="entity-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Length</th>
                        <th>Target</th>
                        <th>Dir</th>
                        <th>RMS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(project.lines.values()).map(line => {
                        const info = line.getOptimizationInfo()
                        const isSelected = isLineSelected?.(line) ?? false
                        return (
                          <tr
                            key={getEntityKey(line)}
                            className={isSelected ? 'selected' : ''}
                            onClick={() => onSelectLine?.(line)}
                            onMouseEnter={() => onHoverLine?.(line)}
                            onMouseLeave={() => onHoverLine?.(null)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td>{line.getName()}</td>
                            <td>{info.length !== undefined && info.length !== null ? formatNumber(info.length) : '-'}</td>
                            <td>{info.targetLength !== undefined ? formatNumber(info.targetLength) : '-'}</td>
                            <td>{info.direction && info.direction !== 'free' ? info.direction : '-'}</td>
                            <td>{formatNumber(info.rmsResidual)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </CollapsibleSection>
              )}

              {/* Coplanar Constraints */}
              {(() => {
                const coplanarConstraints = Array.from(project.constraints).filter(
                  c => c instanceof CoplanarPointsConstraint
                ) as CoplanarPointsConstraint[]
                return coplanarConstraints.length > 0 && (
                  <CollapsibleSection
                    title="Coplanar Constraints"
                    count={coplanarConstraints.length}
                    defaultExpanded={false}
                  >
                    <table className="entity-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Points</th>
                          <th>RMS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {coplanarConstraints.map(constraint => {
                          const info = constraint.getOptimizationInfo()
                          const isSelected = isCoplanarConstraintSelected?.(constraint) ?? false
                          return (
                            <tr
                              key={getEntityKey(constraint)}
                              className={isSelected ? 'selected' : ''}
                              onClick={() => onSelectCoplanarConstraint?.(constraint)}
                              onMouseEnter={() => onHoverCoplanarConstraint?.(constraint)}
                              onMouseLeave={() => onHoverCoplanarConstraint?.(null)}
                              style={{ cursor: 'pointer' }}
                            >
                              <td>{constraint.getName()}</td>
                              <td>{constraint.points.length}</td>
                              <td>{formatNumber(info.rmsResidual)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </CollapsibleSection>
                )
              })()}
            </div>
          )}
        </div>
      )}
    </>
  )
})
