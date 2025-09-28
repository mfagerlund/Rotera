// Optimization control panel component

import React, { useState, useCallback } from 'react'
import { Project, WorldPoint, Constraint } from '../types/project'
import { OptimizationService, OptimizationProgress, defaultOptimizationSettings, validateOptimizationRequest } from '../services/optimization'
import { errorToMessage } from '../types/utils'

interface OptimizationPanelProps {
  project: Project
  onProjectUpdate: (project: Project) => void
  onOptimizationStart: () => void
  onOptimizationComplete: (success: boolean, message: string) => void
}

export const OptimizationPanel: React.FC<OptimizationPanelProps> = ({
  project,
  onProjectUpdate,
  onOptimizationStart,
  onOptimizationComplete
}) => {
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [progress, setProgress] = useState<OptimizationProgress | null>(null)
  const [settings, setSettings] = useState(defaultOptimizationSettings)
  const [useBackend, setUseBackend] = useState(true)
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null)
  const [results, setResults] = useState<any>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const optimizationService = React.useMemo(() => new OptimizationService(), [])

  // Check backend availability
  React.useEffect(() => {
    optimizationService.checkConnection().then(setBackendAvailable)
  }, [optimizationService])

  const getOptimizablePoints = useCallback(() => {
    return Object.values(project.worldPoints)
      .filter(wp => wp.xyz && !wp.isLocked)
  }, [project.worldPoints])

  const getConstraintCount = useCallback(() => {
    return project.constraints?.length || 0
  }, [project.constraints])

  const canOptimize = useCallback(() => {
    const optimizablePoints = getOptimizablePoints()
    const constraintCount = getConstraintCount()

    if (optimizablePoints.length < 2) return false
    if (constraintCount === 0) return false
    if (isOptimizing) return false

    return true
  }, [getOptimizablePoints, getConstraintCount, isOptimizing])

  const handleOptimize = useCallback(async () => {
    if (!canOptimize()) return

    setIsOptimizing(true)
    setProgress(null)
    setResults(null)
    onOptimizationStart()

    try {
      const onProgressUpdate = (progressData: OptimizationProgress) => {
        setProgress(progressData)
      }

      // Use optimizeBundle instead of optimize
      const options = {
        maxIterations: settings.maxIterations,
        convergenceThreshold: settings.tolerance,
        useRobustKernel: false,
        simulationMode: !useBackend || !backendAvailable
      }

      const result = await optimizationService.optimizeBundle(project, options, onProgressUpdate)

      setResults(result)

      if (result.converged) {
        // Update project with optimized coordinates
        const updatedProject = {
          ...project,
          optimization: {
            ...project.optimization,
            lastRun: new Date().toISOString(),
            status: result.converged ? 'converged' as const : 'failed' as const,
            residuals: result.totalError
          },
          updatedAt: new Date().toISOString()
        }

        onProjectUpdate(updatedProject)
        onOptimizationComplete(true, 'Optimization converged successfully')
      } else {
        onOptimizationComplete(false, 'Optimization failed to converge')
      }

    } catch (error) {
      console.error('Optimization failed:', error)
      onOptimizationComplete(false, errorToMessage(error))
    } finally {
      setIsOptimizing(false)
      setProgress(null)
    }
  }, [
    canOptimize, project, settings, useBackend, backendAvailable,
    optimizationService, onOptimizationStart, onOptimizationComplete, onProjectUpdate
  ])

  const handleStop = useCallback(() => {
    optimizationService.abort()
    setIsOptimizing(false)
    setProgress(null)
  }, [optimizationService])

  const handleSettingChange = useCallback((key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  const resetToDefaults = useCallback(() => {
    setSettings(defaultOptimizationSettings)
  }, [])

  const optimizablePoints = getOptimizablePoints()
  const constraintCount = getConstraintCount()

  return (
    <div className="optimization-panel">
      <div className="panel-header">
        <h3>Bundle Adjustment</h3>
        <div className="backend-status">
          {backendAvailable === null && <span className="status-checking">Checking backend...</span>}
          {backendAvailable === true && <span className="status-available">Backend available</span>}
          {backendAvailable === false && <span className="status-unavailable">Backend offline</span>}
        </div>
      </div>

      <div className="optimization-stats">
        <div className="stat-item">
          <span className="stat-label">Optimizable Points:</span>
          <span className="stat-value">{optimizablePoints.length}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Constraints:</span>
          <span className="stat-value">{constraintCount}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Degrees of Freedom:</span>
          <span className="stat-value">{Math.max(0, optimizablePoints.length * 3 - constraintCount)}</span>
        </div>
      </div>

      {!canOptimize() && !isOptimizing && (
        <div className="optimization-requirements">
          <h4>Requirements:</h4>
          <ul>
            {optimizablePoints.length < 2 && (
              <li className="requirement-missing">At least 2 unlocked world points with 3D coordinates</li>
            )}
            {constraintCount === 0 && (
              <li className="requirement-missing">At least 1 constraint</li>
            )}
          </ul>
        </div>
      )}

      <div className="optimization-method">
        <label className="method-toggle">
          <input
            type="checkbox"
            checked={useBackend}
            onChange={(e) => setUseBackend(e.target.checked)}
            disabled={!backendAvailable}
          />
          <span>Use backend optimization {!backendAvailable && '(unavailable)'}</span>
        </label>
        {!useBackend && (
          <div className="simulation-note">
            Will use simulation mode for testing
          </div>
        )}
      </div>

      <div className="optimization-controls">
        {!isOptimizing ? (
          <>
            <button
              className="btn-optimize"
              onClick={handleOptimize}
              disabled={!canOptimize()}
            >
              🎯 Optimize
            </button>
            <button
              className="btn-settings"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              ⚙️ Settings
            </button>
          </>
        ) : (
          <button
            className="btn-stop"
            onClick={handleStop}
          >
            ⏹️ Stop
          </button>
        )}
      </div>

      {isOptimizing && progress && (
        <div className="optimization-progress">
          <div className="progress-header">
            <span className="progress-message">{progress.message}</span>
            <span className="progress-percentage">{Math.round(progress.progress * 100)}%</span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progress.progress * 100}%` }}
            />
          </div>
          <div className="progress-details">
            <span>Iteration: {progress.iteration}</span>
            <span>Residual: {progress.error.toExponential(3)}</span>
          </div>
        </div>
      )}

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
                <span>Converged:</span>
                <span>{results.converged ? 'Yes' : 'No'}</span>
              </div>
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

      {project.optimization?.lastRun && (
        <div className="last-optimization">
          <h4>Last Optimization</h4>
          <div className="last-opt-details">
            <div className="detail-item">
              <span>Run at:</span>
              <span>{new Date(project.optimization.lastRun).toLocaleString()}</span>
            </div>
            <div className="detail-item">
              <span>Iterations:</span>
              <span>{project.optimization.iterations}</span>
            </div>
            <div className="detail-item">
              <span>Converged:</span>
              <span>{project.optimization?.status === 'converged' ? 'Yes' : 'No'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default OptimizationPanel