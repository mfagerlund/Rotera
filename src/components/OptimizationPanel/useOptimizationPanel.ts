import { useState, useCallback, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Project } from '../../entities/project'
import { Viewpoint } from '../../entities/viewpoint'
import { WorldPoint } from '../../entities/world-point'
import { useOptimization } from '../../hooks/useOptimization'
import { defaultOptimizationSettings } from '../../services/optimization'
import { initializeCameraWithPnP } from '../../optimization/pnp'
import { projectWorldPointToPixelQuaternion } from '../../optimization/camera-projection'
import { V, Vec3, Vec4 } from 'scalar-autograd'
import { ProjectDB } from '../../services/project-db'
import { checkOptimizationReadiness } from '../../optimization/optimization-readiness'
import { setLogCallback, getSolveQuality, getBestResidualSoFar, getCandidateProgress } from '../../optimization/optimize-project'
import { fineTuneProject, FineTuneResult } from '../../optimization/fine-tune'
import { getSolverBackend } from '../../optimization/solver-config'

/**
 * Check if the project has stored optimization results (from lastResiduals on entities)
 * and compute a results object from them.
 */
function loadStoredResults(project: Project): any | null {
  // Check if any world points have lastResiduals populated
  const worldPointsWithResiduals = Array.from(project.worldPoints.values()).filter(
    (wp: WorldPoint) => wp.lastResiduals && wp.lastResiduals.length > 0
  )

  if (worldPointsWithResiduals.length === 0) {
    return null
  }

  // Compute total error from all entities' residuals
  let totalSquaredError = 0
  let residualCount = 0

  for (const wp of project.worldPoints.values()) {
    if (wp.lastResiduals && wp.lastResiduals.length > 0) {
      for (const r of wp.lastResiduals) {
        totalSquaredError += r * r
        residualCount++
      }
    }
  }

  for (const vp of project.viewpoints.values()) {
    if (vp.lastResiduals && vp.lastResiduals.length > 0) {
      for (const r of vp.lastResiduals) {
        totalSquaredError += r * r
        residualCount++
      }
    }
  }

  for (const ip of project.imagePoints.values()) {
    if (ip.lastResiduals && ip.lastResiduals.length > 0) {
      for (const r of ip.lastResiduals) {
        totalSquaredError += r * r
        residualCount++
      }
    }
  }

  const totalError = residualCount > 0 ? Math.sqrt(totalSquaredError) : 0
  // TODO: Store medianReprojectionError in project for accurate quality on reload
  const quality = getSolveQuality(undefined, totalError)

  return {
    converged: true, // If we have stored results, assume it was a successful run
    error: null,
    totalError,
    pointAccuracy: totalError / Math.max(1, project.worldPoints.size),
    iterations: 0, // Unknown from stored data
    outliers: [],
    medianReprojectionError: undefined,
    quality
  }
}

interface OptimizationSettings {
  maxIterations: number
  tolerance: number
  damping: number
  verbose: boolean
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
        V.C(vp.tangentialDistortion[1] ?? 0),
        vp.isZReflected
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

interface UseOptimizationPanelProps {
  project: Project
  isOpen: boolean
  autoStart: boolean
  optimizeTrigger?: number
  onOptimizationComplete: (success: boolean, message: string) => void
  onOptimizationStart?: () => void
}

export function useOptimizationPanel({
  project,
  isOpen,
  autoStart,
  optimizeTrigger,
  onOptimizationComplete,
  onOptimizationStart
}: UseOptimizationPanelProps) {
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [settings, setSettings] = useState<OptimizationSettings>(() => ({
    ...defaultOptimizationSettings,
    maxIterations: project.optimizationMaxIterations ?? defaultOptimizationSettings.maxIterations
  }))
  // Initialize results from stored entity residuals if available
  const [results, setResults] = useState<any>(() => loadStoredResults(project))
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [pnpResults, setPnpResults] = useState<{camera: string, before: number, after: number, iterations: number}[]>([])
  const [isInitializingCameras, setIsInitializingCameras] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [bestError, setBestError] = useState<number | null>(null)
  const [candidateProgress, setCandidateProgressState] = useState<{ current: number; total: number } | null>(null)

  const hasAutoStartedRef = useRef(false)
  const prevOptimizeTriggerRef = useRef(optimizeTrigger)

  const clientSolver = useOptimization()
  const { cancel: cancelOptimization } = clientSolver

  const stats = checkOptimizationReadiness(project)

  const canOptimize = useCallback(() => {
    if (isOptimizing) return false
    return stats.canOptimize
  }, [stats, isOptimizing])

  useEffect(() => {
    if (!isOpen) {
      hasAutoStartedRef.current = false
    }
  }, [isOpen])

  const handleOptimize = useCallback(async () => {
    if (!canOptimize()) return

    onOptimizationStart?.()

    // Track last log message for display
    let lastLogMessage = 'Initializing cameras and world points...'

    flushSync(() => {
      setIsOptimizing(true)
      setResults(null)
      setPnpResults([])
      setStatusMessage(lastLogMessage)
      setBestError(null)
      setCandidateProgressState(null)
    })

    // Set up log callback to capture messages during optimization
    // Use flushSync to force immediate React update so user sees progress
    setLogCallback((message: string) => {
      // Filter out verbose debug messages, keep phase/status/progress messages
      if (!message.startsWith('[VP Debug]')) {
        flushSync(() => {
          setStatusMessage(message)
          // Update best error from the logger's tracking
          const best = getBestResidualSoFar()
          if (best < Infinity) {
            setBestError(best)
          }
          // Update candidate progress
          setCandidateProgressState(getCandidateProgress())
        })
      }
    })

    // Wait for browser to paint: double RAF + small timeout to ensure paint completes
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 50)
        })
      })
    })

    const startTime = performance.now()

    try {
      // Yield callback for real-time UI updates between phases
      const yieldToUI = async (phase: string) => {
        flushSync(() => {
          setStatusMessage(phase)
        })
        // Wait for browser to paint
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setTimeout(resolve, 10)
            })
          })
        })
      }

      const solverResult = await clientSolver.optimize(
        project,
        {
          maxIterations: settings.maxIterations,
          tolerance: settings.tolerance,
          damping: settings.damping,
          verbose: settings.verbose,
          yieldToUI
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
        medianReprojectionError: solverResult.medianReprojectionError,
        quality: solverResult.quality,
        elapsedMs: solverResult.solveTimeMs ?? solveTimeMs,
        solver: getSolverBackend()
      }

      setResults(result)
      setStatusMessage(null)

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
        outliers: [],
        quality: getSolveQuality(undefined)
      })
      setStatusMessage(null)

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
      setLogCallback(null)
      setIsOptimizing(false)
      setStatusMessage(null)
    }
  }, [canOptimize, project, settings, clientSolver, onOptimizationComplete, onOptimizationStart])

  const handleStop = useCallback(() => {
    cancelOptimization()
    setIsOptimizing(false)
    setStatusMessage(null)
  }, [cancelOptimization])

  const handleFineTune = useCallback(async () => {
    if (!canOptimize()) return

    onOptimizationStart?.()

    flushSync(() => {
      setIsOptimizing(true)
      setResults(null)
      setPnpResults([])
      setStatusMessage('Running fine-tune optimization...')
    })

    // Wait for browser to paint
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 50)
        })
      })
    })

    try {
      const fineTuneResult = fineTuneProject(project, {
        tolerance: settings.tolerance,
        maxIterations: settings.maxIterations,
        damping: settings.damping,
        lockCameraPoses: project.lockCameraPoses,
        verbose: settings.verbose
      })

      const result = {
        converged: fineTuneResult.converged,
        error: fineTuneResult.error,
        totalError: fineTuneResult.residual,
        pointAccuracy: fineTuneResult.residual / Math.max(1, project.worldPoints.size),
        iterations: fineTuneResult.iterations,
        outliers: [],
        medianReprojectionError: undefined,
        // Fine-tune doesn't compute median, fall back to residual (less accurate quality)
        quality: getSolveQuality(undefined, fineTuneResult.residual),
        elapsedMs: fineTuneResult.solveTimeMs,
        solver: getSolverBackend()
      }

      setResults(result)
      setStatusMessage(null)

      if (result.converged) {
        onOptimizationComplete(true, `Fine-tune converged in ${fineTuneResult.iterations} iterations`)
      } else {
        onOptimizationComplete(false, fineTuneResult.error || 'Fine-tune failed to converge')
      }

    } catch (error) {
      console.error('Fine-tune failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Fine-tune failed'

      setResults({
        converged: false,
        error: errorMessage,
        totalError: Infinity,
        pointAccuracy: 0,
        iterations: 0,
        outliers: [],
        quality: getSolveQuality(undefined)
      })
      setStatusMessage(null)
      onOptimizationComplete(false, errorMessage)
    } finally {
      setIsOptimizing(false)
      setStatusMessage(null)
    }
  }, [canOptimize, project, settings, onOptimizationComplete, onOptimizationStart])

  useEffect(() => {
    if (isOpen && autoStart && !hasAutoStartedRef.current && stats.canOptimize && !isOptimizing) {
      hasAutoStartedRef.current = true
      const timer = setTimeout(() => {
        handleOptimize()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isOpen, autoStart, stats.canOptimize, isOptimizing, handleOptimize])

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
    setSettings((prev: OptimizationSettings) => ({ ...prev, [key]: value }))
    // Persist maxIterations to project so it saves with the project
    if (key === 'maxIterations') {
      project.optimizationMaxIterations = value
    }
  }, [project])

  const resetToDefaults = useCallback(() => {
    setSettings(defaultOptimizationSettings)
    project.optimizationMaxIterations = undefined
  }, [project])

  const toggleAdvanced = useCallback(() => {
    setShowAdvanced(prev => !prev)
  }, [])

  return {
    isOptimizing,
    settings,
    results,
    showAdvanced,
    pnpResults,
    isInitializingCameras,
    statusMessage,
    bestError,
    candidateProgress,
    stats,
    canOptimize,
    handleOptimize,
    handleStop,
    handleFineTune,
    handleInitializeCameras,
    handleSettingChange,
    resetToDefaults,
    toggleAdvanced
  }
}
