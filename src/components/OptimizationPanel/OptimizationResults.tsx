import React from 'react'
import { observer } from 'mobx-react-lite'
import { Project } from '../../entities/project'
import { WorldPoint } from '../../entities/world-point'
import { Line } from '../../entities/line'
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
  if (value === 0 || Math.abs(value) < 1e-10) {
    return '0.000';
  }
  return value.toFixed(3);
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
                            {formatNumber(img.error)} px
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#856404', fontStyle: 'italic' }}>
                  💡 Outliers are marked with red circle + X on the images. Consider re-clicking these points.
                </p>
              </div>
            );
          })()}

          {/* Entity-level optimization information - show even if not converged */}
          {(results.converged || results.medianReprojectionError !== undefined) && (
            <div className="entity-optimization-info">
              {/* World Points */}
              <div className="entity-section">
                <h5>World Points ({Array.from(project.worldPoints.values()).length})</h5>
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
              </div>

              {/* Lines */}
              {Array.from(project.lines.values()).length > 0 && (
                <div className="entity-section">
                  <h5>Lines ({Array.from(project.lines.values()).length})</h5>
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
                </div>
              )}

              {/* Coplanar Constraints */}
              {(() => {
                const coplanarConstraints = Array.from(project.constraints).filter(
                  c => c instanceof CoplanarPointsConstraint
                ) as CoplanarPointsConstraint[]
                return coplanarConstraints.length > 0 && (
                  <div className="entity-section">
                    <h5>Coplanar Constraints ({coplanarConstraints.length})</h5>
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
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}
    </>
  )
})
