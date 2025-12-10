// Optimization panel - works with ENTITIES only
// NO DTOs

import React, { useState, useCallback, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBullseye, faGear, faStop, faClipboard } from '@fortawesome/free-solid-svg-icons'
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
import { optimizationLogs } from '../optimization/optimize-project'

interface OptimizationPanelProps {
  isOpen: boolean
  onClose: () => void
  project: Project
  onOptimizationComplete: (success: boolean, message: string) => void
  onSelectWorldPoint?: (worldPoint: WorldPoint) => void
  onSelectLine?: (line: Line) => void
  onHoverWorldPoint?: (worldPoint: WorldPoint | null) => void
  onHoverLine?: (line: Line | null) => void
  isWorldPointSelected?: (worldPoint: WorldPoint) => boolean
  isLineSelected?: (line: Line) => boolean
  hoveredWorldPoint?: WorldPoint | null
}

function computeCameraReprojectionError(vp: Viewpoint): number {
  let totalError = 0
  let count = 0

  for (const ip of vp.imagePoints) {
    const wp = ip.worldPoint as any
    if (!wp.optimizedXyz) continue

    try {
      const worldPoint = new Vec3(
        V.C(wp.optimizedXyz[0]),
        V.C(wp.optimizedXyz[1]),
        V.C(wp.optimizedXyz[2])
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

export const OptimizationPanel: React.FC<OptimizationPanelProps> = ({
  isOpen,
  onClose,
  project,
  onOptimizationComplete,
  onSelectWorldPoint,
  onSelectLine,
  onHoverWorldPoint,
  onHoverLine,
  isWorldPointSelected,
  isLineSelected,
  hoveredWorldPoint
}) => {
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [settings, setSettings] = useState(defaultOptimizationSettings)
  const [results, setResults] = useState<any>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [pnpResults, setPnpResults] = useState<{camera: string, before: number, after: number, iterations: number}[]>([])
  const [isInitializingCameras, setIsInitializingCameras] = useState(false)

  const clientSolver = useOptimization()

  // Get optimization stats from actual entities
  const stats = React.useMemo(() => {
    const pointArray = Array.from(project.worldPoints.values())
    const lineArray = Array.from(project.lines.values())
    const viewpointArray = Array.from(project.viewpoints.values())

    const unlockedPoints = pointArray.filter(p => !p.isLocked())
    const totalDOF = (unlockedPoints.length * 3) + (viewpointArray.length * 6)

    // Count intrinsic line constraints (direction and length)
    let lineConstraintCount = 0
    for (const line of lineArray) {
      if (line.direction !== 'free') {
        lineConstraintCount += 2
      }
      if (line.hasFixedLength()) {
        lineConstraintCount += 1
      }
    }

    const constraintDOF = project.constraints.size + lineConstraintCount
    const netDOF = Math.max(0, totalDOF - constraintDOF)

    // Count projection constraints
    const projectionCount = Array.from(project.constraints).filter(
      c => c.getConstraintType() === 'projection_point_camera'
    ).length

    // Count image observations from fully locked world points (valid for PnP)
    let pnpObservationCount = 0
    for (const vp of viewpointArray) {
      const vpConcrete = vp as Viewpoint
      for (const ip of vpConcrete.imagePoints) {
        if ((ip.worldPoint as WorldPoint).isFullyLocked()) {
          pnpObservationCount++
        }
      }
    }

    // Check camera initialization requirements
    // NOTE: We assume ALL cameras will be reset to [0,0,0] when autoInitializeCameras is true
    // So we check if there are 2+ cameras that will need initialization
    const camerasNeedingInit = viewpointArray.length

    let initializationError: string | null = null
    let canInitialize = true

    if (camerasNeedingInit >= 2) {
      const worldPointArray = pointArray as WorldPoint[]
      const lockedPoints = worldPointArray.filter(wp => wp.isFullyLocked())

      let anyCameraCanUsePnP = false
      if (lockedPoints.length >= 2) {
        // Check if at least one camera can use PnP: needs 3+ locked points visible
        for (const vp of viewpointArray) {
          const vpConcrete = vp as Viewpoint
          const vpLockedPoints = Array.from(vpConcrete.imagePoints).filter(ip =>
            (ip.worldPoint as WorldPoint).isFullyLocked()
          )

          if (vpLockedPoints.length >= 3) {
            anyCameraCanUsePnP = true
            break
          }
        }
      }

      // Check if any camera can use vanishing point initialization
      let anyCameraCanUseVanishingPoints = false
      if (!anyCameraCanUsePnP) {
        for (const vp of viewpointArray) {
          const vpConcrete = vp as Viewpoint
          if (vpConcrete.canInitializeWithVanishingPoints(new Set(worldPointArray))) {
            anyCameraCanUseVanishingPoints = true
            break
          }
        }
      }

      if (!anyCameraCanUsePnP && !anyCameraCanUseVanishingPoints) {
        // Fall back to Essential Matrix path: need at least 7 shared correspondences
        const vp1 = viewpointArray[0] as Viewpoint
        const vp2 = viewpointArray[1] as Viewpoint

        const sharedWorldPoints = new Set<WorldPoint>()
        for (const ip1 of vp1.imagePoints) {
          for (const ip2 of vp2.imagePoints) {
            if (ip1.worldPoint === ip2.worldPoint) {
              sharedWorldPoints.add(ip1.worldPoint as WorldPoint)
            }
          }
        }

        if (sharedWorldPoints.size < 7) {
          canInitialize = false
          initializationError = `Need at least 7 shared point correspondences between "${vp1.name}" and "${vp2.name}" (currently have ${sharedWorldPoints.size}). Add more image points that are visible in both cameras, OR lock at least 3 world point coordinates visible in one camera for PnP initialization, OR use vanishing point initialization (2+ axes with 2+ lines each, 2+ locked points visible).`
        }
      }
    }

    // Total effective constraints: explicit constraints + line constraints + PnP observations
    const effectiveConstraintCount = project.constraints.size + lineConstraintCount + pnpObservationCount

    return {
      pointCount: pointArray.length,
      unlockedPointCount: unlockedPoints.length,
      lineCount: lineArray.length,
      viewpointCount: viewpointArray.length,
      constraintCount: project.constraints.size,
      lineConstraintCount,
      pnpObservationCount,
      projectionConstraintCount: projectionCount,
      totalDOF,
      constraintDOF,
      netDOF,
      canOptimize: effectiveConstraintCount > 0 && (unlockedPoints.length > 0 || viewpointArray.length > 0) && canInitialize,
      canInitialize,
      initializationError
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
    setPnpResults([])

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

      if (result.converged) {
        onOptimizationComplete(true, 'Optimization converged successfully')
      } else {
        onOptimizationComplete(false, 'Optimization failed to converge')
      }

    } catch (error) {
      console.error('Optimization failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Optimization failed'
      setResults({
        converged: false,
        error: errorMessage,
        totalError: Infinity,
        pointAccuracy: 0,
        iterations: 0,
        outliers: []
      })
      onOptimizationComplete(false, errorMessage)
    } finally {
      setIsOptimizing(false)
    }
  }, [canOptimize, project, settings, clientSolver, onOptimizationComplete])

  const handleStop = useCallback(() => {
    setIsOptimizing(false)
  }, [])

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
          (ip.worldPoint as any).optimizedXyz !== null
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
    const abs = Math.abs(value);
    if (abs >= 1) {
      return value.toFixed(3);
    }
    if (abs >= 0.001) {
      return value.toFixed(6);
    }
    // For very small values, use scientific notation
    return value.toExponential(2);
  }

  const headerButtons: HeaderButton[] = useMemo(() => [
    {
      icon: <FontAwesomeIcon icon={faBullseye} />,
      label: 'Optimize',
      onClick: handleOptimize,
      disabled: !canOptimize() || isOptimizing,
      title: 'Run bundle adjustment optimization',
      className: 'btn-primary'
    },
    {
      icon: <FontAwesomeIcon icon={faStop} />,
      onClick: handleStop,
      disabled: !isOptimizing,
      title: 'Stop optimization'
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
      width={500}
      maxHeight={600}
      storageKey="optimization-panel"
      showOkCancel={false}
      headerButtons={headerButtons}
    >
    <div className="optimization-panel">
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
            {stats.constraintDOF}
            {stats.lineConstraintCount > 0 && ` (${stats.lineConstraintCount} from lines)`}
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
            {stats.constraintCount === 0 && stats.lineConstraintCount === 0 && stats.pnpObservationCount === 0 && (
              <li className="requirement-missing">At least 1 constraint or image observation</li>
            )}
            {stats.initializationError && (
              <li className="requirement-missing">{stats.initializationError}</li>
            )}
          </ul>
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
              {results.converged ? '✅ Optimization converged' : `❌ ${results.error || 'Optimization failed'}`}
            </span>
          </div>
          {results.converged && (
            <div className="results-details">
              <div className="result-item">
                <span>Total Error:</span>
                <span>{formatNumber(results.totalError)}</span>
              </div>
              <div className="result-item">
                <span>Point Accuracy:</span>
                <span>{formatNumber(results.pointAccuracy)}</span>
              </div>
              <div className="result-item">
                <span>Iterations:</span>
                <span>{results.iterations}</span>
              </div>
              {results.medianReprojectionError !== undefined && (
                <div className="result-item">
                  <span>Median Reprojection Error:</span>
                  <span>{formatNumber(results.medianReprojectionError)} px</span>
                </div>
              )}
            </div>
          )}

          {/* Outlier Detection */}
          {results && results.outliers && results.outliers.length > 0 && (() => {
            const byWorldPoint = new Map<string, Array<{viewpoint: string, error: number}>>();
            results.outliers.forEach((outlier: any) => {
              if (!byWorldPoint.has(outlier.worldPointName)) {
                byWorldPoint.set(outlier.worldPointName, []);
              }
              byWorldPoint.get(outlier.worldPointName)!.push({
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
                  {Array.from(byWorldPoint.entries()).map(([worldPoint, images]) => (
                    <div key={worldPoint} style={{
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
                        {worldPoint} <span style={{ color: '#666', fontWeight: 'normal', fontSize: '11px' }}>({images.length} image{images.length > 1 ? 's' : ''})</span>
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

          {/* Entity-level optimization information */}
          {results.converged && (
            <div className="entity-optimization-info">
              <h4>Entity Optimization Results</h4>

              {/* World Points */}
              <div className="entity-section">
                <h5>World Points ({Array.from(project.worldPoints.values()).length})</h5>
                <table className="entity-table">
                  <thead>
                    <tr>
                      <th>Name</th>
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
                        const isHovered = hoveredWorldPoint === point
                        return (
                          <tr
                            key={getEntityKey(point)}
                            onClick={() => onSelectWorldPoint?.(point)}
                            onMouseEnter={() => onHoverWorldPoint?.(point)}
                            onMouseLeave={() => onHoverWorldPoint?.(null)}
                            style={{
                              cursor: 'pointer',
                              backgroundColor: isSelected ? '#0696d7' : isHovered ? '#3a3a3a' : undefined,
                              color: isSelected ? '#fff' : undefined
                            }}
                          >
                            <td>{point.getName()}</td>
                            <td>[{info.optimizedXyz?.map(v => formatNumber(v)).join(', ')}]</td>
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
                            onClick={() => onSelectLine?.(line)}
                            onMouseEnter={() => onHoverLine?.(line)}
                            onMouseLeave={() => onHoverLine?.(null)}
                            style={{
                              cursor: 'pointer',
                              backgroundColor: isSelected ? '#0696d7' : undefined,
                              color: isSelected ? '#fff' : undefined
                            }}
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
                          return (
                            <tr key={constraint.getName()}>
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
}

export default OptimizationPanel
