// Optimization control panel component

import React, { useState, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBullseye, faGear, faStop } from '@fortawesome/free-solid-svg-icons'
import { Project, WorldPoint, Constraint } from '../types/project'
import { OptimizationService, OptimizationProgress, defaultOptimizationSettings, validateOptimizationRequest } from '../services/optimization'
import { errorToMessage } from '../types/utils'
import { useOptimization } from '../hooks/useOptimization'
import { WorldPoint as WorldPointEntity } from '../entities/world-point/WorldPoint'
import { Line as LineEntity } from '../entities/line/Line'
import { Camera as CameraEntity } from '../entities/camera'
import { Constraint as ConstraintEntity } from '../entities/constraints/base-constraint'
import { ProjectionConstraint } from '../entities/constraints/projection-constraint'
import { convertAllConstraints } from '../utils/constraint-entity-converter'

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
  const [results, setResults] = useState<any>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const clientSolver = useOptimization()

  // NO BACKEND OPTIMIZATION - always use client-side solver

  // Build optimization problem and get actual statistics
  const getOptimizationStats = useCallback(() => {
    try {
      console.log('Project data:', {
        worldPoints: Object.keys(project.worldPoints || {}).length,
        lines: Object.keys(project.lines || {}).length,
        cameras: Array.isArray(project.cameras) ? project.cameras.length : Object.keys(project.cameras || {}).length,
        images: Array.isArray(project.images) ? project.images.length : Object.keys(project.images || {}).length,
        constraints: (project.constraints || []).length
      })

      // Mock repositories
      class SimpleCameraRepo {
        getImagesByCamera() { return []; }
        entityExists() { return true; }
      }
      class SimpleConstraintRepo {
        getPoint() { return undefined; }
        getLine() { return undefined; }
        getPlane() { return undefined; }
        entityExists() { return true; }
        pointExists() { return true; }
        lineExists() { return true; }
        planeExists() { return true; }
      }
      const cameraRepo = new SimpleCameraRepo()
      const constraintRepo = new SimpleConstraintRepo()

      // Create point entities (include points without xyz - they'll be triangulated)
      const pointEntities: WorldPointEntity[] = []
      let pointIndex = 0
      Object.values(project.worldPoints).forEach(wp => {
        // In photogrammetry, points may not have initial xyz (triangulated from observations)
        // Provide reasonable initial guess if undefined
        const initialXyz = wp.xyz || [
          (pointIndex % 3) * 2 - 2, // x: -2, 0, 2
          Math.floor(pointIndex / 3) * 2 - 2, // y: -2, 0, 2
          5 + (pointIndex % 3) * 5 // z: 5, 10, 15
        ] as [number, number, number]

        const entity = WorldPointEntity.create(wp.id, wp.name, {
          xyz: initialXyz,
          color: wp.color,
          isVisible: wp.isVisible,
          isLocked: wp.isLocked
        })
        pointEntities.push(entity)
        pointIndex++
      })

      // Create line entities
      const lineEntities: LineEntity[] = []
      Object.values(project.lines || {}).forEach(line => {
        const pointA = pointEntities.find(p => p.getId() === line.pointA)
        const pointB = pointEntities.find(p => p.getId() === line.pointB)
        if (pointA && pointB) {
          const entity = LineEntity.create(
            line.id,
            line.name || 'Line',
            pointA,
            pointB,
            {
              ...(line.constraints?.direction && line.constraints?.tolerance ? {
                constraints: {
                  direction: line.constraints.direction,
                  targetLength: line.constraints.targetLength,
                  tolerance: line.constraints.tolerance
                }
              } : {}),
              color: line.color,
              isConstruction: line.isConstruction
            }
          )
          lineEntities.push(entity)
        }
      })

      // Create camera entities
      const cameraEntities: CameraEntity[] = []
      const cameras = Array.isArray(project.cameras)
        ? project.cameras
        : Object.values(project.cameras || {})

      console.log('Camera data:', cameras)

      cameras.forEach((cam, idx) => {
        console.log(`Processing camera ${idx}:`, cam, {
          hasFocalLength: !!cam?.focalLength,
          hasImageWidth: !!cam?.imageWidth,
          hasImageHeight: !!cam?.imageHeight,
          hasIntrinsics: !!cam?.intrinsics
        })
        if (cam && (cam.focalLength || cam.intrinsics?.fx) && (cam.imageWidth || cam.intrinsics) && (cam.imageHeight || cam.intrinsics)) {
          const cameraEntity = CameraEntity.create(
            cam.id,
            cam.name || `Camera_${cam.id.substring(0, 8)}`,
            cam.focalLength,
            cam.imageWidth,
            cam.imageHeight,
            cameraRepo,
            {
              position: cam.position || [0, 0, 0],
              rotationEuler: cam.rotation || [0, 0, 0],
              principalPointX: cam.principalPointX || (cam.imageWidth / 2),
              principalPointY: cam.principalPointY || (cam.imageHeight / 2),
              aspectRatio: cam.aspectRatio || 1.0,
              skewCoefficient: cam.skewCoefficient || 0,
              radialDistortion: cam.radialDistortion || [0, 0, 0],
              tangentialDistortion: cam.tangentialDistortion || [0, 0],
              isPoseLocked: false,
            }
          )
          cameraEntities.push(cameraEntity)
        }
      })

      // Create explicit constraints
      const constraintEntities = convertAllConstraints(
        project.constraints || [],
        pointEntities,
        lineEntities
      )

      // Create projection constraints
      const projectionConstraints: ProjectionConstraint[] = []
      const images = Array.isArray(project.images)
        ? project.images
        : Object.values(project.images || {})

      console.log('Image data:', images)

      images.forEach((image, idx) => {
        console.log(`Processing image ${idx}:`, image)
        if (!image.cameraId || !image.imagePoints) return
        const observations = Array.isArray(image.imagePoints)
          ? image.imagePoints
          : Object.values(image.imagePoints)

        observations.forEach((obs: any) => {
          if (obs.worldPointId && typeof obs.u === 'number' && typeof obs.v === 'number') {
            const constraintId = `proj_${image.id}_${obs.worldPointId}`
            const projConstraint = ProjectionConstraint.create(
              constraintId,
              `Proj_${image.name}_${obs.worldPointId.substring(0, 8)}`,
              obs.worldPointId,
              image.cameraId,
              obs.u,
              obs.v,
              constraintRepo,
              { tolerance: 1.0, isDriving: true }
            )
            projectionConstraints.push(projConstraint)
          }
        })
      })

      const allConstraints = [...constraintEntities, ...projectionConstraints]

      // Calculate degrees of freedom
      // Each unlocked point: 3 DOF
      // Each unlocked camera: 6 DOF (3 position + 3 rotation)
      // Each constraint: reduces DOF
      const unlockedPoints = pointEntities.filter(p => !p.isLocked()).length
      const unlockedCameras = cameraEntities.length // Assuming not locked based on isPoseLocked
      const totalDOF = (unlockedPoints * 3) + (unlockedCameras * 6)
      const constraintDOF = allConstraints.length // Each constraint typically has 1-2 residuals
      const netDOF = Math.max(0, totalDOF - constraintDOF)

      return {
        pointCount: pointEntities.length,
        unlockedPointCount: unlockedPoints,
        lineCount: lineEntities.length,
        cameraCount: cameraEntities.length,
        constraintCount: allConstraints.length,
        explicitConstraintCount: constraintEntities.length,
        projectionConstraintCount: projectionConstraints.length,
        totalDOF,
        constraintDOF,
        netDOF,
        canOptimize: allConstraints.length > 0 && (unlockedPoints > 0 || unlockedCameras > 0)
      }
    } catch (error) {
      console.error('Error calculating optimization stats:', error)
      return {
        pointCount: 0,
        unlockedPointCount: 0,
        lineCount: 0,
        cameraCount: 0,
        constraintCount: 0,
        explicitConstraintCount: 0,
        projectionConstraintCount: 0,
        totalDOF: 0,
        constraintDOF: 0,
        netDOF: 0,
        canOptimize: false
      }
    }
  }, [project.worldPoints, project.lines, project.cameras, project.images, project.constraints])

  // Memoize stats to avoid recalculating on every render
  const stats = React.useMemo(() => {
    console.log('RAW PROJECT DATA:', {
      hasWorldPoints: !!project.worldPoints,
      worldPointCount: Object.keys(project.worldPoints || {}).length,
      hasLines: !!project.lines,
      lineCount: Object.keys(project.lines || {}).length,
      hasCameras: !!project.cameras,
      camerasIsArray: Array.isArray(project.cameras),
      cameraCount: Array.isArray(project.cameras) ? project.cameras.length : Object.keys(project.cameras || {}).length,
      hasImages: !!project.images,
      imagesIsArray: Array.isArray(project.images),
      imageCount: Array.isArray(project.images) ? project.images.length : Object.keys(project.images || {}).length,
    })
    const result = getOptimizationStats()
    console.log('Optimization stats:', result)
    return result
  }, [getOptimizationStats])

  const canOptimize = useCallback(() => {
    if (isOptimizing) return false
    return stats.canOptimize
  }, [stats, isOptimizing])

  const handleOptimize = useCallback(async () => {
    if (!canOptimize()) return

    setIsOptimizing(true)
    setProgress(null)
    setResults(null)
    onOptimizationStart()

    try {
      let result: any

      // CLIENT-SIDE OPTIMIZATION (always - no backend)
      console.log('Running client-side optimization...')

      // Convert project data to entity instances
      const pointEntities: WorldPointEntity[] = []
      const lineEntities: LineEntity[] = []

        // Create WorldPoint entities from project data (include both locked and unlocked)
        Object.values(project.worldPoints).forEach(wp => {
          if (wp.xyz) {
            const entity = WorldPointEntity.create(wp.id, wp.name, {
              xyz: wp.xyz as [number, number, number],
              color: wp.color,
              isVisible: wp.isVisible,
              isLocked: wp.isLocked
            })
            pointEntities.push(entity)
          }
        })

        console.log(`Created ${pointEntities.length} point entities`)

        // Create Line entities from project data
        Object.values(project.lines || {}).forEach(line => {
          const pointA = pointEntities.find(p => p.getId() === line.pointA)
          const pointB = pointEntities.find(p => p.getId() === line.pointB)

          if (pointA && pointB) {
            const entity = LineEntity.create(
              line.id,
              line.name || 'Line',
              pointA,
              pointB,
              {
                // Use line constraints from project if fully specified
                ...(line.constraints?.direction && line.constraints?.tolerance ? {
                  constraints: {
                    direction: line.constraints.direction,
                    targetLength: line.constraints.targetLength,
                    tolerance: line.constraints.tolerance
                  }
                } : {}),
                color: line.color,
                isConstruction: line.isConstruction
              }
            )
            lineEntities.push(entity)
          }
        })

        console.log(`Created ${lineEntities.length} line entities`)

        // Create Camera entities from project data
        const cameraEntities: CameraEntity[] = []

        // Simple mock repository for Camera entity creation
        class SimpleCameraRepo {
          getImagesByCamera() { return []; }
          entityExists() { return true; }
        }
        const cameraRepo = new SimpleCameraRepo()

        // Handle both Record<string, Camera> and Camera[] formats
        const cameras = Array.isArray(project.cameras)
          ? project.cameras
          : Object.values(project.cameras || {})

        cameras.forEach(cam => {
          if (cam.focalLength && cam.imageWidth && cam.imageHeight) {
            const cameraEntity = CameraEntity.create(
              cam.id,
              cam.name || `Camera_${cam.id.substring(0, 8)}`,
              cam.focalLength,
              cam.imageWidth,
              cam.imageHeight,
              cameraRepo,
              {
                position: cam.position || [0, 0, 0],
                rotationEuler: cam.rotation || [0, 0, 0], // Auto-converts Euler to quaternion
                principalPointX: cam.principalPointX || (cam.imageWidth / 2),
                principalPointY: cam.principalPointY || (cam.imageHeight / 2),
                aspectRatio: cam.aspectRatio || 1.0,
                skewCoefficient: cam.skewCoefficient || 0,
                radialDistortion: cam.radialDistortion || [0, 0, 0],
                tangentialDistortion: cam.tangentialDistortion || [0, 0],
                isPoseLocked: false, // Allow camera optimization
              }
            )
            cameraEntities.push(cameraEntity)
          }
        })

        console.log(`Created ${cameraEntities.length} camera entities`)

        // Convert explicit constraints to entities
        const constraintEntities = convertAllConstraints(
          project.constraints || [],
          pointEntities,
          lineEntities
        )

        console.log(`Created ${constraintEntities.length} constraint entities`)

        // Create ProjectionConstraints from image observations
        // Simple mock repository for constraint creation
        class SimpleConstraintRepo {
          getPoint() { return undefined; }
          getLine() { return undefined; }
          getPlane() { return undefined; }
          entityExists() { return true; }
          pointExists() { return true; }
          lineExists() { return true; }
          planeExists() { return true; }
        }
        const constraintRepo = new SimpleConstraintRepo()

        const projectionConstraints: ProjectionConstraint[] = []
        let observationCount = 0

        // Handle both Record<string, Image> and Image[] formats
        const images = Array.isArray(project.images)
          ? project.images
          : Object.values(project.images || {})

        images.forEach(image => {
          if (!image.cameraId || !image.imagePoints) return

          // imagePoints can be array or Record
          const observations = Array.isArray(image.imagePoints)
            ? image.imagePoints
            : Object.values(image.imagePoints)

          observations.forEach((obs: any) => {
            if (obs.worldPointId && typeof obs.u === 'number' && typeof obs.v === 'number') {
              const constraintId = `proj_${image.id}_${obs.worldPointId}`
              const projConstraint = ProjectionConstraint.create(
                constraintId,
                `Proj_${image.name}_${obs.worldPointId.substring(0, 8)}`,
                obs.worldPointId,
                image.cameraId,
                obs.u,
                obs.v,
                constraintRepo,
                {
                  tolerance: 1.0, // 1 pixel tolerance
                  isDriving: true,
                }
              )
              projectionConstraints.push(projConstraint)
              observationCount++
            }
          })
        })

        console.log(`Created ${projectionConstraints.length} projection constraints from ${observationCount} observations`)

        // Combine all constraints
        const allConstraints = [...constraintEntities, ...projectionConstraints]

        const solverResult = await clientSolver.optimize(
          pointEntities,
          lineEntities,
          cameraEntities, // Pass cameras to solver
          allConstraints, // Include projection constraints
          {
            maxIterations: settings.maxIterations,
            tolerance: settings.tolerance,
            damping: settings.damping,
            verbose: settings.verbose
          }
        )

        console.log('Client-side optimization result:', solverResult)

        // Convert result to expected format
        result = {
          converged: solverResult.converged,
          totalError: solverResult.residual,
          pointAccuracy: solverResult.residual / Math.max(1, pointEntities.length),
          iterations: solverResult.iterations
        }

        // Update project with optimized coordinates
        const updatedWorldPoints = { ...project.worldPoints }
        pointEntities.forEach(entity => {
          const coords = entity.getDefinedCoordinates()
          if (coords) {
            updatedWorldPoints[entity.getId()] = {
              ...updatedWorldPoints[entity.getId()],
              xyz: coords
            }
          }
        })

        // Update cameras with optimized poses
        // Ensure cameras is always a Record for Project type compatibility
        let camerasRecord: Record<string, any> = {}
        if (Array.isArray(project.cameras)) {
          // Convert array to Record
          project.cameras.forEach(cam => {
            camerasRecord[cam.id] = cam
          })
        } else {
          camerasRecord = { ...project.cameras }
        }

        cameraEntities.forEach(cameraEntity => {
          const cameraId = cameraEntity.getId()
          const position = cameraEntity.position
          const rotationEuler = cameraEntity.getRotationEuler() // Convert quaternion back to Euler for storage

          if (camerasRecord[cameraId]) {
            // Update camera data - preserve existing structure
            const existingCamera = camerasRecord[cameraId]
            camerasRecord[cameraId] = {
              ...existingCamera,
              // Update pose data (handle both flat and nested formats)
              ...(existingCamera.position !== undefined
                ? { position, rotation: rotationEuler }
                : {
                    extrinsics: {
                      ...existingCamera.extrinsics,
                      translation: position,
                      rotation: rotationEuler
                    }
                  }
              )
            }
          }
        })

        const updatedCameras = camerasRecord

        // Update constraints with residuals from solver
        const updatedConstraints = (project.constraints || []).map(constraint => {
          const residualInfo = clientSolver.constraintResiduals.find(
            r => r.constraintId === constraint.id
          )

          if (residualInfo) {
            return {
              ...constraint,
              residual: residualInfo.residual,
              status: residualInfo.satisfied ? 'satisfied' as const : 'violated' as const
            }
          }
          return constraint
        })

        // Update project
        const updatedProject = {
          ...project,
          worldPoints: updatedWorldPoints,
          cameras: updatedCameras,
          constraints: updatedConstraints,
          optimization: {
            ...project.optimization,
            lastRun: new Date().toISOString(),
            status: solverResult.converged ? 'converged' as const : 'failed' as const,
            residuals: solverResult.residual,
            iterations: solverResult.iterations
          },
          updatedAt: new Date().toISOString()
        }

        onProjectUpdate(updatedProject)

      setResults(result)

      if (result.converged) {
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
    canOptimize, project, settings,
    clientSolver, onOptimizationStart, onOptimizationComplete, onProjectUpdate
  ])

  const handleStop = useCallback(() => {
    // No backend - just stop
    setIsOptimizing(false)
    setProgress(null)
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
        {stats.cameraCount > 0 && (
          <div className="stat-item">
            <span className="stat-label">Cameras:</span>
            <span className="stat-value">{stats.cameraCount}</span>
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
            {stats.unlockedPointCount === 0 && stats.cameraCount === 0 && (
              <li className="requirement-missing">At least 1 unlocked point or camera</li>
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