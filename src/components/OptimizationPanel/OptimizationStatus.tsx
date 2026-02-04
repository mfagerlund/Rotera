import React from 'react'
import { OptimizationReadiness, OptimizationIssue } from '../../optimization/optimization-readiness'

interface OptimizationStatusProps {
  stats: OptimizationReadiness
  isOptimizing: boolean
  statusMessage: string | null
  bestError: number | null
  candidateProgress: { current: number; total: number } | null
}

export const OptimizationStatus: React.FC<OptimizationStatusProps> = ({
  stats,
  isOptimizing,
  statusMessage,
  bestError,
  candidateProgress
}) => {
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
        <span>Pts:{stats.pointCount} ({stats.unlockedPointCount} unlocked)</span>
        {stats.viewpointCount > 0 && <><span style={{ margin: '0 4px', opacity: 0.5 }}>|</span><span>VPs:{stats.viewpointCount}</span></>}
        <span style={{ margin: '0 4px', opacity: 0.5 }}>|</span>
        <span>
          Constraints:{stats.constraintDOF}
          {stats.lineConstraintCount > 0 && ` (${stats.lineConstraintCount} lines)`}
        </span>
        <span style={{ margin: '0 4px', opacity: 0.5 }}>|</span>
        <span>DOF:{stats.netDOF}</span>
      </div>

      {/* Progress Status Display */}
      {isOptimizing && statusMessage && (
        <div style={{
          padding: '12px 16px',
          margin: '8px 0',
          backgroundColor: '#e3f2fd',
          border: '1px solid #2196f3',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <div style={{
            width: '20px',
            height: '20px',
            border: '3px solid #2196f3',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'bold', color: '#1565c0', fontSize: '14px' }}>
              Optimizing...
            </div>
            <div style={{ color: '#1976d2', fontSize: '12px' }}>
              {statusMessage}
            </div>
          </div>
          {bestError !== null && (
            <div style={{
              textAlign: 'right',
              padding: '4px 12px',
              backgroundColor: '#bbdefb',
              borderRadius: '4px',
            }}>
              <div style={{ fontSize: '10px', color: '#1565c0', textTransform: 'uppercase' }}>
                Best{candidateProgress && ` (${candidateProgress.current}/${candidateProgress.total})`}
              </div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0d47a1' }}>
                {bestError.toFixed(2)}
              </div>
            </div>
          )}
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {!stats.canOptimize && !isOptimizing && stats.issues.filter((i: OptimizationIssue) => i.type === 'error').length > 0 && (
        <div className="optimization-requirements">
          <h4>Requirements:</h4>
          <ul>
            {stats.issues.filter((i: OptimizationIssue) => i.type === 'error').map((issue: OptimizationIssue) => (
              <li key={issue.code} className="requirement-missing">{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      {stats.issues.filter((i: OptimizationIssue) => i.type === 'warning').length > 0 && (
        <div className="optimization-warnings" style={{
          padding: '8px 12px',
          margin: '8px 0',
          backgroundColor: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          {stats.issues.filter((i: OptimizationIssue) => i.type === 'warning').map((issue: OptimizationIssue) => (
            <div key={issue.code} style={{ color: '#856404' }}>
              <strong>Warning:</strong> {issue.message}
            </div>
          ))}
        </div>
      )}

      {stats.issues.filter((i: OptimizationIssue) => i.type === 'info').length > 0 && (
        <div className="optimization-info" style={{
          padding: '6px 12px',
          margin: '8px 0',
          backgroundColor: '#e3f2fd',
          border: '1px solid #90caf9',
          borderRadius: '4px',
          fontSize: '11px'
        }}>
          {stats.issues.filter((i: OptimizationIssue) => i.type === 'info').map((issue: OptimizationIssue) => (
            <div key={issue.code} style={{ color: '#1565c0' }}>
              <strong>Note:</strong> {issue.message}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
