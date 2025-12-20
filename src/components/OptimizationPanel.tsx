// Optimization panel - works with ENTITIES only
// NO DTOs

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBolt, faGear, faStop, faClipboard } from '@fortawesome/free-solid-svg-icons'
import { Project } from '../entities/project'
import FloatingWindow, { HeaderButton } from './FloatingWindow'
import { useOptimization } from '../hooks/useOptimization'
import { defaultOptimizationSettings } from '../services/optimization'
import { getEntityKey } from '../utils/entityKeys'
import { initializeCameraWithPnP } from '../optimization/pnp'
import { Viewpoint } from '../entities/viewpoint'
import { WorldPoint } from '../entities/world-point'
import { Line } from '../entities/line'
import { CoplanarPointsConstraint } from '../entities/constraints/coplanar-points-constraint'
import { projectWorldPointToPixelQuaternion } from '../optimization/camera-projection'
import { V, Vec3, Vec4 } from 'scalar-autograd'
import { optimizationLogs, OutlierInfo } from '../optimization/optimize-project'
import { ProjectDB } from '../services/project-db'
import { checkOptimizationReadiness } from '../optimization/optimization-readiness'
import { formatXyz } from '../utils/formatters'

interface OptimizationPanelProps {
  isOpen: boolean
  onClose: () => void
  project: Project
  onOptimizationComplete: (success: boolean, message: string) => void
  onSelectWorldPoint?: (worldPoint: WorldPoint) => void
  onSelectLine?: (line: Line) => void
  onSelectCoplanarConstraint?: (constraint: CoplanarPointsConstraint) => void
  onHoverWorldPoint?: (worldPoint: WorldPoint | null) => void
  onHoverLine?: (line: Line | null) => void
  onHoverCoplanarConstraint?: (constraint: CoplanarPointsConstraint | null) => void
  isWorldPointSelected?: (worldPoint: WorldPoint) => boolean
  isLineSelected?: (line: Line) => boolean
  isCoplanarConstraintSelected?: (constraint: CoplanarPointsConstraint) => boolean
  hoveredWorldPoint?: WorldPoint | null
  hoveredCoplanarConstraint?: CoplanarPointsConstraint | null
  /** If true, automatically start optimization when panel opens */
  autoStart?: boolean
  /** Counter that triggers optimization when incremented (used by toolbar button) */
  optimizeTrigger?: number
  /** Called when optimization starts (before any changes) */
  onOptimizationStart?: () => void
}

function computeCameraReprojectionError(vp: Viewpoint): number {
  let totalError = 0
  let count = 0

  for (const ip of vp.imagePoints) {
    const wp = ip.worldPoint
    if (!wp.getOptimizationInfo().optimizedXyz) continue

    try {
      const optimizedXyz = wp.getOptimizationInfo().optimizedXyz!
      const worldPoint = new Vec3(
        V.C(optimizedXyz[0]),
        V.C(optimizedXyz[1]),
        V.C(optimizedXyz[2])
      )

      const cameraPosition = new Vec3(
        V.C(vp.position[0]),
        V.C(vp.position[1]),
        V.C(vp.position[2])
      )

      const cameraRotation = new Vec4(
        V.C(vp.rotation[0]),
        V.C(vp.rotation[1]),
        V.C(vp.rotation[2]),
        V.C(vp.rotation[3])
      )

      const projected = projectWorldPointToPixelQuaternion(
        worldPoint,
        cameraPosition,
        cameraRotation,
        V.C(vp.focalLength ?? 1000),
        V.C(vp.aspectRatio ?? 1.0),
        V.C(vp.principalPointX ?? 500),
        V.C(vp.principalPointY ?? 500),
        V.C(vp.skewCoefficient ?? 0),
        V.C(vp.radialDistortion[0] ?? 0),
        V.C(vp.radialDistortion[1] ?? 0),
        V.C(vp.radialDistortion[2] ?? 0),
        V.C(vp.tangentialDistortion[0] ?? 0),
        V.C(vp.tangentialDistortion[1] ?? 0)
      )

      if (projected) {
        const dx = projected[0].data - ip.u
        const dy = projected[1].data - ip.v
        totalError += Math.sqrt(dx * dx + dy * dy)
        count++
      }
    } catch (e) {
      console.warn('Error computing reprojection:', e)
    }
  }

  return count > 0 ? totalError / count : 0
}

export const OptimizationPanel: React.FC<OptimizationPanelProps> = observer(({
  isOpen,
  onClose,
  project,
  onOptimizationComplete,
  onSelectWorldPoint,
  onSelectLine,
  onSelectCoplanarConstraint,
  onHoverWorldPoint,
  onHoverLine,
  onHoverCoplanarConstraint,
  isWorldPointSelected,
  isLineSelected,
  isCoplanarConstraintSelected,
  hoveredWorldPoint,
  hoveredCoplanarConstraint,
  autoStart = false,
  optimizeTrigger,
  onOptimizationStart
}) => {
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [settings, setSettings] = useState(defaultOptimizationSettings)
  const [results, setResults] = useState<any>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [pnpResults, setPnpResults] = useState<{camera: string, before: number, after: number, iterations: number}[]>([])
  const [isInitializingCameras, setIsInitializingCameras] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  // Track if we've auto-started for this open session
  const hasAutoStartedRef = useRef(false)

  const clientSolver = useOptimization()
  const { cancel: cancelOptimization } = clientSolver

  // Get optimization readiness from shared function
  // Note: No useMemo - let MobX observer track observable access for reactivity
  const stats = checkOptimizationReadiness(project)

  const canOptimize = useCallback(() => {
    if (isOptimizing) return false
    return stats.canOptimize
  }, [stats, isOptimizing])

  // Reset auto-start tracking when panel closes
  useEffect(() => {
    if (!isOpen) {
      hasAutoStartedRef.current = false
    }
  }, [isOpen])

  const handleOptimize = useCallback(async () => {
    if (!canOptimize()) return

    // Notify parent before any changes (so it can capture dirty state)
    onOptimizationStart?.()

    // Use flushSync to force React to synchronously update the DOM
    flushSync(() => {
      setIsOptimizing(true)
      setResults(null)
      setPnpResults([])
      setStatusMessage('Initializing cameras and world points...')
    })

    // Wait for browser to paint the updated UI before the blocking solver call
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve()
        })
      })
    })

    const startTime = performance.now()

    try {

      const solverResult = await clientSolver.optimize(
        project,
        {
          maxIterations: settings.maxIterations,
          tolerance: settings.tolerance,
          damping: settings.damping,
          verbose: settings.verbose
        }
      )

      const solveTimeMs = performance.now() - startTime

      setStatusMessage('Processing results...')

      const result = {
        converged: solverResult.converged,
        error: solverResult.error,
        totalError: solverResult.residual,
        pointAccuracy: solverResult.residual / Math.max(1, project.worldPoints.size),
        iterations: solverResult.iterations,
        outliers: solverResult.outliers || [],
        medianReprojectionError: solverResult.medianReprojectionError
      }

      setResults(result)
      setStatusMessage(null)

      // Save optimization result to database if project is saved
      if (project._dbId) {
        try {
          await ProjectDB.saveOptimizationResult(project._dbId, {
            error: solverResult.residual,
            converged: solverResult.converged,
            solveTimeMs,
            errorMessage: solverResult.error ?? undefined,
            optimizedAt: new Date(),
          })
        } catch (dbError) {
          console.warn('Failed to save optimization result to DB:', dbError)
        }
      }

      if (result.converged) {
        onOptimizationComplete(true, 'Optimization converged successfully')
      } else {
        onOptimizationComplete(false, 'Optimization failed to converge')
      }

    } catch (error) {
      console.error('Optimization failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Optimization failed'
      const solveTimeMs = performance.now() - startTime

      setResults({
        converged: false,
        error: errorMessage,
        totalError: Infinity,
        pointAccuracy: 0,
        iterations: 0,
        outliers: []
      })
      setStatusMessage(null)

      // Save error result to database if project is saved
      if (project._dbId) {
        try {
          await ProjectDB.saveOptimizationResult(project._dbId, {
            error: null,
            converged: false,
            solveTimeMs,
            errorMessage,
            optimizedAt: new Date(),
          })
        } catch (dbError) {
          console.warn('Failed to save optimization result to DB:', dbError)
        }
      }

      onOptimizationComplete(false, errorMessage)
    } finally {
      setIsOptimizing(false)
      setStatusMessage(null)
    }
  }, [canOptimize, project, settings, clientSolver, onOptimizationComplete, onOptimizationStart])

  const handleStop = useCallback(() => {
    cancelOptimization()
    setIsOptimizing(false)
    setStatusMessage(null)
  }, [cancelOptimization])

  // Auto-start optimization when panel opens (if autoStart is true)
  useEffect(() => {
    if (isOpen && autoStart && !hasAutoStartedRef.current && stats.canOptimize && !isOptimizing) {
      hasAutoStartedRef.current = true
      // Small delay to ensure UI is rendered first
      const timer = setTimeout(() => {
        handleOptimize()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isOpen, autoStart, stats.canOptimize, isOptimizing, handleOptimize])

  // Track previous optimizeTrigger value
  const prevOptimizeTriggerRef = useRef(optimizeTrigger)

  // Trigger optimization when optimizeTrigger changes (toolbar button clicked)
  useEffect(() => {
    if (optimizeTrigger !== undefined &&
        optimizeTrigger !== prevOptimizeTriggerRef.current &&
        isOpen &&
        stats.canOptimize &&
        !isOptimizing) {
      prevOptimizeTriggerRef.current = optimizeTrigger
      handleOptimize()
    }
    prevOptimizeTriggerRef.current = optimizeTrigger
  }, [optimizeTrigger, isOpen, stats.canOptimize, isOptimizing, handleOptimize])

  const handleInitializeCameras = useCallback(async () => {
    if (isOptimizing || isInitializingCameras) return

    setIsInitializingCameras(true)
    setPnpResults([])

    try {
      const viewpointArray = Array.from(project.viewpoints.values())
      const worldPointArray = Array.from(project.worldPoints.values())

      const camerasToInitialize = viewpointArray.filter(vp => {
        const hasImagePoints = vp.imagePoints.size > 0
        const hasTriangulatedPoints = Array.from(vp.imagePoints).some(ip =>
          ip.worldPoint.getOptimizationInfo().optimizedXyz !== null
        )
        return hasImagePoints && hasTriangulatedPoints
      })

      if (camerasToInitialize.length === 0) {
        onOptimizationComplete(false, 'No cameras to initialize. Need cameras with image points linked to triangulated world points.')
        return
      }

      const newResults: {camera: string, before: number, after: number, iterations: number}[] = []

      for (const vp of camerasToInitialize) {
        const vpConcrete = vp as Viewpoint

        const beforeError = computeCameraReprojectionError(vpConcrete)

        const success = initializeCameraWithPnP(vpConcrete, new Set(worldPointArray))

        if (success) {
          const afterError = computeCameraReprojectionError(vpConcrete)
          newResults.push({
            camera: vpConcrete.name,
            before: beforeError,
            after: afterError,
            iterations: 0
          })
        }
      }

      setPnpResults(newResults)

      if (newResults.length > 0) {
        onOptimizationComplete(true, `Initialized ${newResults.length} camera(s) using PnP`)
      } else {
        onOptimizationComplete(false, 'PnP initialization failed for all cameras')
      }

    } catch (error) {
      console.error('Camera initialization failed:', error)
      onOptimizationComplete(false, error instanceof Error ? error.message : 'Camera initialization failed')
    } finally {
      setIsInitializingCameras(false)
    }
  }, [project, isOptimizing, isInitializingCameras, onOptimizationComplete])

  const handleSettingChange = useCallback((key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  const resetToDefaults = useCallback(() => {
    setSettings(defaultOptimizationSettings)
  }, [])

  function formatNumber(value: number): string {
    if (value === 0 || Math.abs(value) < 1e-10) {
      return '0.000';
    }
    return value.toFixed(3);
  }

  // Quality indicator based on total error (sum of squared residuals)
  function getQualityInfo(totalError: number | undefined): { label: string; color: string; bgColor: string; icon: string } {
    if (totalError === undefined) {
      return { label: 'Unknown', color: '#666', bgColor: '#f0f0f0', icon: '?' };
    }
    if (totalError < 1) {
      return { label: 'Excellent', color: '#155724', bgColor: '#d4edda', icon: '★★★' };
    }
    if (totalError < 5) {
      return { label: 'Good', color: '#856404', bgColor: '#fff3cd', icon: '★★' };
    }
    return { label: 'Poor', color: '#721c24', bgColor: '#f8d7da', icon: '★' };
  }

  const headerButtons: HeaderButton[] = useMemo(() => [
    {
      icon: <FontAwesomeIcon icon={faBolt} />,
      label: 'Optimize',
      onClick: handleOptimize,
      disabled: !canOptimize() || isOptimizing,
      title: 'Run bundle adjustment optimization',
      className: 'btn-optimize'
    },
    {
      icon: <FontAwesomeIcon icon={faStop} />,
      onClick: handleStop,
      disabled: !isOptimizing,
      title: 'Stop optimization (may take a moment to respond)'
    },
    {
      icon: <FontAwesomeIcon icon={faGear} />,
      onClick: () => setShowAdvanced(!showAdvanced),
      disabled: isOptimizing,
      title: 'Toggle settings'
    },
    {
      icon: <FontAwesomeIcon icon={faClipboard} />,
      onClick: () => {
        const logText = optimizationLogs.join('\n')
        navigator.clipboard.writeText(logText)
      },
      disabled: isOptimizing,
      title: 'Copy optimization logs to clipboard'
    }
  ], [handleOptimize, canOptimize, isOptimizing, handleStop, showAdvanced])

  return (
    <FloatingWindow
      title="Bundle Adjustment Optimization"
      isOpen={isOpen}
      onClose={onClose}
      width={530}
      maxHeight={600}
      storageKey="optimization-panel"
      showOkCancel={false}
      headerButtons={headerButtons}
    >
    <div className="optimization-panel">
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
          <div>
            <div style={{ fontWeight: 'bold', color: '#1565c0', fontSize: '14px' }}>
              Optimizing...
            </div>
            <div style={{ color: '#1976d2', fontSize: '12px' }}>
              {statusMessage}
            </div>
          </div>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {!canOptimize() && !isOptimizing && stats.issues.filter(i => i.type === 'error').length > 0 && (
        <div className="optimization-requirements">
          <h4>Requirements:</h4>
          <ul>
            {stats.issues.filter(i => i.type === 'error').map(issue => (
              <li key={issue.code} className="requirement-missing">{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      {stats.issues.filter(i => i.type === 'warning').length > 0 && (
        <div className="optimization-warnings" style={{
          padding: '8px 12px',
          margin: '8px 0',
          backgroundColor: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          {stats.issues.filter(i => i.type === 'warning').map(issue => (
            <div key={issue.code} style={{ color: '#856404' }}>
              <strong>Warning:</strong> {issue.message}
            </div>
          ))}
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
          {results.totalError !== undefined && (() => {
            const quality = getQualityInfo(results.totalError);
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
                }}>{quality.icon}</span>
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
                  {results.totalError < 1 && '<1'}
                  {results.totalError >= 1 && results.totalError < 5 && '1-5'}
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
    </div>
    </FloatingWindow>
  )
})

export default OptimizationPanel
