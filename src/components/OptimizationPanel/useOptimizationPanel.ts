import { useState, useCallback, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Project } from '../../entities/project'
import { Viewpoint } from '../../entities/viewpoint'
import { useOptimization } from '../../hooks/useOptimization'
import { defaultOptimizationSettings } from '../../services/optimization'
import { initializeCameraWithPnP } from '../../optimization/pnp'
import { projectWorldPointToPixelQuaternion } from '../../optimization/camera-projection'
import { V, Vec3, Vec4 } from 'scalar-autograd'
import { ProjectDB } from '../../services/project-db'
import { checkOptimizationReadiness } from '../../optimization/optimization-readiness'

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
  const [settings, setSettings] = useState<OptimizationSettings>(defaultOptimizationSettings)
  const [results, setResults] = useState<any>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [pnpResults, setPnpResults] = useState<{camera: string, before: number, after: number, iterations: number}[]>([])
  const [isInitializingCameras, setIsInitializingCameras] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

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

    flushSync(() => {
      setIsOptimizing(true)
      setResults(null)
      setPnpResults([])
      setStatusMessage('Initializing cameras and world points...')
    })

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
  }, [])

  const resetToDefaults = useCallback(() => {
    setSettings(defaultOptimizationSettings)
  }, [])

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
    stats,
    canOptimize,
    handleOptimize,
    handleStop,
    handleInitializeCameras,
    handleSettingChange,
    resetToDefaults,
    toggleAdvanced
  }
}
