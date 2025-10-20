// Optimization panel - works with ENTITIES only
// NO DTOs

import React, { useState, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBullseye, faGear, faStop } from '@fortawesome/free-solid-svg-icons'
import { Project } from '../entities/project'
import { useOptimization } from '../hooks/useOptimization'
import { defaultOptimizationSettings } from '../services/optimization'
import { getEntityKey } from '../utils/entityKeys'

interface OptimizationPanelProps {
  project: Project
  onOptimizationComplete: (success: boolean, message: string) => void
}

export const OptimizationPanel: React.FC<OptimizationPanelProps> = ({
  project,
  onOptimizationComplete
}) => {
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [settings, setSettings] = useState(defaultOptimizationSettings)
  const [results, setResults] = useState<any>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const clientSolver = useOptimization()

  // Get optimization stats from actual entities
  const stats = React.useMemo(() => {
    const pointArray = Array.from(project.worldPoints.values())
    const lineArray = Array.from(project.lines.values())
    const viewpointArray = Array.from(project.viewpoints.values())

    const unlockedPoints = pointArray.filter(p => !p.isLocked())
    const totalDOF = (unlockedPoints.length * 3) + (viewpointArray.length * 6)
    const constraintDOF = project.constraints.size
    const netDOF = Math.max(0, totalDOF - constraintDOF)

    // Count projection constraints
    const projectionCount = Array.from(project.constraints).filter(
      c => c.getConstraintType() === 'projection_point_camera'
    ).length

    return {
      pointCount: pointArray.length,
      unlockedPointCount: unlockedPoints.length,
      lineCount: lineArray.length,
      viewpointCount: viewpointArray.length,
      constraintCount: project.constraints.size,
      projectionConstraintCount: projectionCount,
      totalDOF,
      constraintDOF,
      netDOF,
      canOptimize: project.constraints.size > 0 && (unlockedPoints.length > 0 || viewpointArray.length > 0)
    }
  }, [project])

  const canOptimize = useCallback(() => {
    if (isOptimizing) return false
    return stats.canOptimize
  }, [stats, isOptimizing])

  const handleOptimize = useCallback(async () => {
    if (!canOptimize()) return

    setIsOptimizing(true)
    setResults(null)

    try {
      console.log('Running optimization with entities...')

      // Extract entity arrays
      const pointEntities = Array.from(project.worldPoints.values())
      const lineEntities = Array.from(project.lines.values())
      const viewpointEntities = Array.from(project.viewpoints.values())

      // Run optimization
      const solverResult = await clientSolver.optimize(
        pointEntities,
        lineEntities,
        viewpointEntities,
        Array.from(project.constraints),
        {
          maxIterations: settings.maxIterations,
          tolerance: settings.tolerance,
          damping: settings.damping,
          verbose: settings.verbose
        }
      )

      console.log('Optimization result:', solverResult)

      // Entities are updated in-place, no need to copy back
      // Just notify that optimization completed

      const result = {
        converged: solverResult.converged,
        totalError: solverResult.residual,
        pointAccuracy: solverResult.residual / Math.max(1, pointEntities.length),
        iterations: solverResult.iterations
      }

      setResults(result)

      if (result.converged) {
        onOptimizationComplete(true, 'Optimization converged successfully')
      } else {
        onOptimizationComplete(false, 'Optimization failed to converge')
      }

    } catch (error) {
      console.error('Optimization failed:', error)
      onOptimizationComplete(false, error instanceof Error ? error.message : 'Optimization failed')
    } finally {
      setIsOptimizing(false)
    }
  }, [canOptimize, project, settings, clientSolver, onOptimizationComplete])

  const handleStop = useCallback(() => {
    setIsOptimizing(false)
  }, [])

  const handleSettingChange = useCallback((key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  const resetToDefaults = useCallback(() => {
    setSettings(defaultOptimizationSettings)
  }, [])

  return (
    <div className="optimization-panel">
      <div className="panel-header">
        <h3>Bundle Adjustment</h3>
      </div>

      <div className="optimization-stats">
        <div className="stat-item">
          <span className="stat-label">Points:</span>
          <span className="stat-value">{stats.pointCount} ({stats.unlockedPointCount} unlocked)</span>
        </div>
        {stats.viewpointCount > 0 && (
          <div className="stat-item">
            <span className="stat-label">Viewpoints:</span>
            <span className="stat-value">{stats.viewpointCount}</span>
          </div>
        )}
        <div className="stat-item">
          <span className="stat-label">Constraints:</span>
          <span className="stat-value">
            {stats.constraintCount}
            {stats.projectionConstraintCount > 0 && ` (${stats.projectionConstraintCount} observations)`}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Degrees of Freedom:</span>
          <span className="stat-value">{stats.netDOF} (vars: {stats.totalDOF}, constraints: {stats.constraintDOF})</span>
        </div>
      </div>

      {!canOptimize() && !isOptimizing && (
        <div className="optimization-requirements">
          <h4>Requirements:</h4>
          <ul>
            {stats.unlockedPointCount === 0 && stats.viewpointCount === 0 && (
              <li className="requirement-missing">At least 1 unlocked point or viewpoint</li>
            )}
            {stats.constraintCount === 0 && (
              <li className="requirement-missing">At least 1 constraint or image observation</li>
            )}
          </ul>
        </div>
      )}

      <div className="optimization-controls">
        {!isOptimizing ? (
          <>
            <button
              className="btn-optimize"
              onClick={handleOptimize}
              disabled={!canOptimize()}
            >
              <FontAwesomeIcon icon={faBullseye} /> Optimize
            </button>
            <button
              className="btn-settings"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <FontAwesomeIcon icon={faGear} /> Settings
            </button>
          </>
        ) : (
          <button
            className="btn-stop"
            onClick={handleStop}
          >
            <FontAwesomeIcon icon={faStop} /> Stop
          </button>
        )}
      </div>

      {results && (
        <div className={`optimization-results ${results.converged ? 'success' : 'error'}`}>
          <div className="results-header">
            <span className="results-status">
              {results.converged ? '✅' : '❌'} {results.converged ? 'Optimization converged' : 'Optimization failed to converge'}
            </span>
          </div>
          {results.converged && (
            <div className="results-details">
              <div className="result-item">
                <span>Total Error:</span>
                <span>{results.totalError.toExponential(3)}</span>
              </div>
              <div className="result-item">
                <span>Point Accuracy:</span>
                <span>{results.pointAccuracy.toExponential(3)}</span>
              </div>
              <div className="result-item">
                <span>Iterations:</span>
                <span>{results.iterations}</span>
              </div>
            </div>
          )}

          {/* Entity-level optimization information */}
          {results.converged && (
            <div className="entity-optimization-info">
              <h4>Entity Optimization Results</h4>

              {/* World Points */}
              <div className="entity-section">
                <h5>World Points ({Array.from(project.worldPoints.values()).length})</h5>
                <div className="entity-list">
                  {Array.from(project.worldPoints.values())
                    .filter(p => p.getOptimizationInfo().optimizedXyz !== undefined)
                    .map(point => {
                      const info = point.getOptimizationInfo()
                      return (
                        <div key={getEntityKey(point)} className="entity-item">
                          <div className="entity-name">{point.getName()}</div>
                          <div className="entity-data">
                            <div className="data-row">
                              <span className="data-label">Position:</span>
                              <span className="data-value">
                                [{info.lockedXyz?.map(v => v?.toFixed(3)).join(', ')}]
                              </span>
                            </div>
                            <div className="data-row">
                              <span className="data-label">RMS Residual:</span>
                              <span className="data-value">{info.rmsResidual.toExponential(2)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>

              {/* Lines */}
              {Array.from(project.lines.values()).length > 0 && (
                <div className="entity-section">
                  <h5>Lines ({Array.from(project.lines.values()).length})</h5>
                  <div className="entity-list">
                    {Array.from(project.lines.values()).map(line => {
                      const info = line.getOptimizationInfo()
                      return (
                        <div key={getEntityKey(line)} className="entity-item">
                          <div className="entity-name">{line.getName()}</div>
                          <div className="entity-data">
                            <div className="data-row">
                              <span className="data-label">Length:</span>
                              <span className="data-value">{info.length?.toFixed(3) || 'N/A'}</span>
                            </div>
                            {info.targetLength && (
                              <div className="data-row">
                                <span className="data-label">Target:</span>
                                <span className="data-value">{info.targetLength.toFixed(3)}</span>
                              </div>
                            )}
                            {info.lengthError !== null && (
                              <div className="data-row">
                                <span className="data-label">Error:</span>
                                <span className="data-value">{info.lengthError.toExponential(2)}</span>
                              </div>
                            )}
                            {info.direction && info.direction !== 'free' && (
                              <div className="data-row">
                                <span className="data-label">Direction:</span>
                                <span className="data-value">{info.direction}</span>
                              </div>
                            )}
                            <div className="data-row">
                              <span className="data-label">RMS Residual:</span>
                              <span className="data-value">{info.rmsResidual.toExponential(2)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showAdvanced && (
        <div className="optimization-settings">
          <h4>Advanced Settings</h4>
          <div className="setting-row">
            <label>
              <span>Max Iterations:</span>
              <input
                type="number"
                min="1"
                max="1000"
                value={settings.maxIterations}
                onChange={(e) => handleSettingChange('maxIterations', parseInt(e.target.value))}
              />
            </label>
          </div>
          <div className="setting-row">
            <label>
              <span>Tolerance:</span>
              <input
                type="number"
                step="1e-9"
                min="1e-12"
                max="1e-3"
                value={settings.tolerance}
                onChange={(e) => handleSettingChange('tolerance', parseFloat(e.target.value))}
              />
            </label>
          </div>
          <div className="setting-row">
            <label>
              <span>Damping Factor:</span>
              <input
                type="number"
                step="0.01"
                min="0.001"
                max="1"
                value={settings.damping}
                onChange={(e) => handleSettingChange('damping', parseFloat(e.target.value))}
              />
            </label>
          </div>
          <div className="setting-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.verbose}
                onChange={(e) => handleSettingChange('verbose', e.target.checked)}
              />
              <span>Verbose Output</span>
            </label>
          </div>
          <div className="settings-actions">
            <button className="btn-reset" onClick={resetToDefaults}>
              Reset to Defaults
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default OptimizationPanel
