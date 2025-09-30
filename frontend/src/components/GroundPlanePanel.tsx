// Ground plane definition panel for establishing coordinate system

import React, { useState, useCallback, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPencil, faPlus, faTrash, faTriangleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons'
import { Project, WorldPoint } from '../types/project'

export interface GroundPlaneDefinition {
  id: string
  name: string
  points: {
    origin: string
    xAxisEnd: string
    xyPlanePoint: string
  }
  plane: {
    normal: [number, number, number]
    point: [number, number, number]
  }
  scale?: {
    unit: 'mm' | 'cm' | 'm' | 'in' | 'ft'
    factor: number
  }
  createdAt: string
}

interface GroundPlanePanelProps {
  project: Project
  onGroundPlaneCreate: (groundPlane: GroundPlaneDefinition) => void
  onGroundPlaneUpdate: (groundPlaneId: string, updates: Partial<GroundPlaneDefinition>) => void
  onGroundPlaneDelete: (groundPlaneId: string) => void
  onGroundPlaneSelect: (groundPlaneId: string | null) => void
  selectedPointIds: string[]
  onPointSelect: (pointId: string, multiSelect: boolean) => void
  onClearSelection: () => void
  currentGroundPlane: string | null
}

export const GroundPlanePanel: React.FC<GroundPlanePanelProps> = ({
  project,
  onGroundPlaneCreate,
  onGroundPlaneUpdate,
  onGroundPlaneDelete,
  onGroundPlaneSelect,
  selectedPointIds,
  onPointSelect,
  onClearSelection,
  currentGroundPlane
}) => {
  const [isDefining, setIsDefining] = useState(false)
  const [definitionStep, setDefinitionStep] = useState(0)
  const [definitionData, setDefinitionData] = useState<{
    name: string
    origin?: string
    xAxisEnd?: string
    xyPlanePoint?: string
    unit: 'mm' | 'cm' | 'm' | 'in' | 'ft'
    scaleFactor: number
  }>({
    name: '',
    unit: 'mm',
    scaleFactor: 1.0
  })

  // Get existing ground planes (stored in project metadata)
  const groundPlanes = useMemo((): GroundPlaneDefinition[] => {
    if (!project.groundPlanes) return []

    return project.groundPlanes.map(gp => ({
      id: gp.id,
      name: gp.name,
      points: {
        origin: gp.pointIds[0],
        xAxisEnd: gp.pointIds[1],
        xyPlanePoint: gp.pointIds[2]
      },
      plane: {
        normal: gp.equation ? [gp.equation[0], gp.equation[1], gp.equation[2]] : [0, 0, 1],
        point: [0, 0, 0] // Will be calculated from the origin point
      },
      createdAt: new Date().toISOString() // Since this isn't stored in the project type
    }))
  }, [project.groundPlanes])

  // Get available points for ground plane definition
  const availablePoints = useMemo(() => {
    return Object.values(project.worldPoints).filter(wp => wp.xyz)
  }, [project.worldPoints])

  // Calculate plane normal from three points
  const calculatePlaneNormal = useCallback((
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number]
  ): [number, number, number] => {
    // Vector from p1 to p2
    const v1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]]
    // Vector from p1 to p3
    const v2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]]

    // Cross product to get normal
    const normal = [
      v1[1] * v2[2] - v1[2] * v2[1],
      v1[2] * v2[0] - v1[0] * v2[2],
      v1[0] * v2[1] - v1[1] * v2[0]
    ]

    // Normalize
    const length = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2)
    if (length === 0) return [0, 0, 1]

    return [normal[0] / length, normal[1] / length, normal[2] / length] as [number, number, number]
  }, [])

  // Start ground plane definition
  const startDefinition = useCallback(() => {
    setIsDefining(true)
    setDefinitionStep(0)
    setDefinitionData({
      name: `Ground Plane ${groundPlanes.length + 1}`,
      unit: 'mm',
      scaleFactor: 1.0
    })
    onClearSelection()
  }, [groundPlanes.length, onClearSelection])

  // Handle definition steps
  const handleNextStep = useCallback(() => {
    switch (definitionStep) {
      case 0:
        // Step 1: Select origin point
        if (selectedPointIds.length >= 1) {
          setDefinitionData(prev => ({
            ...prev,
            origin: selectedPointIds[0]
          }))
          onClearSelection()
          setDefinitionStep(1)
        }
        break

      case 1:
        // Step 2: Select X-axis end point
        if (selectedPointIds.length >= 1 && selectedPointIds[0] !== definitionData.origin) {
          setDefinitionData(prev => ({
            ...prev,
            xAxisEnd: selectedPointIds[0]
          }))
          onClearSelection()
          setDefinitionStep(2)
        }
        break

      case 2:
        // Step 3: Select XY-plane point
        if (selectedPointIds.length >= 1 &&
            selectedPointIds[0] !== definitionData.origin &&
            selectedPointIds[0] !== definitionData.xAxisEnd) {
          setDefinitionData(prev => ({
            ...prev,
            xyPlanePoint: selectedPointIds[0]
          }))
          setDefinitionStep(3)
        }
        break
    }
  }, [definitionStep, selectedPointIds, definitionData.origin, definitionData.xAxisEnd, onClearSelection])

  // Complete ground plane definition
  const completeDefinition = useCallback(() => {
    if (!definitionData.origin || !definitionData.xAxisEnd || !definitionData.xyPlanePoint) return

    const originPoint = project.worldPoints[definitionData.origin]
    const xAxisPoint = project.worldPoints[definitionData.xAxisEnd]
    const xyPlanePoint = project.worldPoints[definitionData.xyPlanePoint]

    if (!originPoint.xyz || !xAxisPoint.xyz || !xyPlanePoint.xyz) return

    const normal = calculatePlaneNormal(originPoint.xyz, xAxisPoint.xyz, xyPlanePoint.xyz)

    const groundPlane: GroundPlaneDefinition = {
      id: crypto.randomUUID(),
      name: definitionData.name,
      points: {
        origin: definitionData.origin,
        xAxisEnd: definitionData.xAxisEnd,
        xyPlanePoint: definitionData.xyPlanePoint
      },
      plane: {
        normal,
        point: originPoint.xyz
      },
      scale: {
        unit: definitionData.unit,
        factor: definitionData.scaleFactor
      },
      createdAt: new Date().toISOString()
    }

    onGroundPlaneCreate(groundPlane)
    setIsDefining(false)
    setDefinitionStep(0)
    onClearSelection()
  }, [definitionData, project.worldPoints, calculatePlaneNormal, onGroundPlaneCreate, onClearSelection])

  // Cancel definition
  const cancelDefinition = useCallback(() => {
    setIsDefining(false)
    setDefinitionStep(0)
    setDefinitionData({
      name: '',
      unit: 'mm',
      scaleFactor: 1.0
    })
    onClearSelection()
  }, [onClearSelection])

  // Get step instructions
  const getStepInstructions = useCallback(() => {
    switch (definitionStep) {
      case 0: return 'Select a point to be the origin (0,0,0)'
      case 1: return 'Select a point to define the positive X-axis direction'
      case 2: return 'Select a third point to define the XY-plane'
      case 3: return 'Review and confirm the ground plane definition'
      default: return ''
    }
  }, [definitionStep])

  // Check if can proceed to next step
  const canProceedToNextStep = useCallback(() => {
    switch (definitionStep) {
      case 0: return selectedPointIds.length >= 1
      case 1: return selectedPointIds.length >= 1 && selectedPointIds[0] !== definitionData.origin
      case 2: return selectedPointIds.length >= 1 &&
                     selectedPointIds[0] !== definitionData.origin &&
                     selectedPointIds[0] !== definitionData.xAxisEnd
      default: return false
    }
  }, [definitionStep, selectedPointIds, definitionData.origin, definitionData.xAxisEnd])

  // Calculate ground plane statistics
  const getGroundPlaneStats = useCallback((groundPlane: GroundPlaneDefinition) => {
    const originPoint = project.worldPoints[groundPlane.points.origin]
    const xAxisPoint = project.worldPoints[groundPlane.points.xAxisEnd]
    const xyPlanePoint = project.worldPoints[groundPlane.points.xyPlanePoint]

    if (!originPoint.xyz || !xAxisPoint.xyz || !xyPlanePoint.xyz) {
      return null
    }

    // Calculate X-axis length (scale reference)
    const xAxisLength = Math.sqrt(
      (xAxisPoint.xyz[0] - originPoint.xyz[0]) ** 2 +
      (xAxisPoint.xyz[1] - originPoint.xyz[1]) ** 2 +
      (xAxisPoint.xyz[2] - originPoint.xyz[2]) ** 2
    )

    // Calculate angle between X-axis and XY-plane vectors
    const xVector = [
      xAxisPoint.xyz[0] - originPoint.xyz[0],
      xAxisPoint.xyz[1] - originPoint.xyz[1],
      xAxisPoint.xyz[2] - originPoint.xyz[2]
    ]
    const xyVector = [
      xyPlanePoint.xyz[0] - originPoint.xyz[0],
      xyPlanePoint.xyz[1] - originPoint.xyz[1],
      xyPlanePoint.xyz[2] - originPoint.xyz[2]
    ]

    const dotProduct = xVector[0] * xyVector[0] + xVector[1] * xyVector[1] + xVector[2] * xyVector[2]
    const xLength = Math.sqrt(xVector[0] ** 2 + xVector[1] ** 2 + xVector[2] ** 2)
    const xyLength = Math.sqrt(xyVector[0] ** 2 + xyVector[1] ** 2 + xyVector[2] ** 2)

    const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct / (xLength * xyLength)))) * (180 / Math.PI)

    return {
      xAxisLength,
      angle,
      isOrthogonal: Math.abs(angle - 90) < 1 // Within 1 degree of 90°
    }
  }, [project.worldPoints])

  return (
    <div className="ground-plane-panel">
      <div className="panel-header">
        <h3>Ground Plane Definition</h3>
        <div className="plane-count">
          {groundPlanes.length} plane{groundPlanes.length !== 1 ? 's' : ''}
        </div>
      </div>

      {!isDefining ? (
        <div className="ground-plane-overview">
          <div className="overview-text">
            Define a ground plane to establish a local coordinate system for measurements and exports.
          </div>

          <button
            className="btn-define-plane"
            onClick={startDefinition}
            disabled={availablePoints.length < 3}
          ><FontAwesomeIcon icon={faPlus} /> Define Ground Plane
          </button>

          {availablePoints.length < 3 && (
            <div className="requirement-notice">
              <div className="notice-icon"><FontAwesomeIcon icon={faTriangleExclamation} /></div>
              <div className="notice-text">
                At least 3 points with 3D coordinates are required to define a ground plane
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="plane-definition">
          <div className="definition-header">
            <h4>Define Ground Plane</h4>
            <div className="step-indicator">
              Step {definitionStep + 1} of 4
            </div>
          </div>

          <div className="step-instructions">
            <div className="instruction-text">{getStepInstructions()}</div>
            {selectedPointIds.length > 0 && (
              <div className="selection-status">
                {selectedPointIds.length} point{selectedPointIds.length !== 1 ? 's' : ''} selected
              </div>
            )}
          </div>

          {definitionStep === 3 && (
            <div className="definition-settings">
              <div className="settings-row">
                <label>
                  <span>Name:</span>
                  <input
                    type="text"
                    value={definitionData.name}
                    onChange={(e) => setDefinitionData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ground plane name"
                  />
                </label>
              </div>

              <div className="settings-row">
                <label>
                  <span>Unit:</span>
                  <select
                    value={definitionData.unit}
                    onChange={(e) => setDefinitionData(prev => ({ ...prev, unit: e.target.value as any }))}
                  >
                    <option value="mm">Millimeters</option>
                    <option value="cm">Centimeters</option>
                    <option value="m">Meters</option>
                    <option value="in">Inches</option>
                    <option value="ft">Feet</option>
                  </select>
                </label>
                <label>
                  <span>Scale Factor:</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={definitionData.scaleFactor}
                    onChange={(e) => setDefinitionData(prev => ({
                      ...prev,
                      scaleFactor: parseFloat(e.target.value) || 1
                    }))}
                  />
                </label>
              </div>

              <div className="definition-preview">
                <h5>Ground Plane Preview</h5>
                <div className="preview-details">
                  <div className="detail-item">
                    <span>Origin:</span>
                    <span>{project.worldPoints[definitionData.origin!]?.name}</span>
                  </div>
                  <div className="detail-item">
                    <span>X-axis end:</span>
                    <span>{project.worldPoints[definitionData.xAxisEnd!]?.name}</span>
                  </div>
                  <div className="detail-item">
                    <span>XY-plane point:</span>
                    <span>{project.worldPoints[definitionData.xyPlanePoint!]?.name}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="definition-actions">
            {definitionStep < 3 ? (
              <>
                <button
                  className="btn-next"
                  onClick={handleNextStep}
                  disabled={!canProceedToNextStep()}
                >
                  Next Step
                </button>
                <button
                  className="btn-cancel"
                  onClick={cancelDefinition}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn-create"
                  onClick={completeDefinition}
                  disabled={!definitionData.name.trim()}
                >
                  Create Ground Plane
                </button>
                <button
                  className="btn-back"
                  onClick={() => setDefinitionStep(2)}
                >
                  Back
                </button>
                <button
                  className="btn-cancel"
                  onClick={cancelDefinition}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {groundPlanes.length > 0 && (
        <div className="existing-planes">
          <h4>Existing Ground Planes</h4>
          <div className="planes-list">
            {groundPlanes.map(plane => {
              const stats = getGroundPlaneStats(plane)
              const isActive = currentGroundPlane === plane.id

              return (
                <div
                  key={plane.id}
                  className={`plane-item ${isActive ? 'active' : ''}`}
                  onClick={() => onGroundPlaneSelect(isActive ? null : plane.id)}
                >
                  <div className="plane-header">
                    <div className="plane-info">
                      <div className="plane-name">{plane.name}</div>
                      <div className="plane-details">
                        Origin: {project.worldPoints[plane.points.origin]?.name} •
                        Scale: {plane.scale?.factor}× {plane.scale?.unit}
                      </div>
                    </div>
                    <div className="plane-actions">
                      <button
                        className="btn-edit"
                        onClick={(e) => {
                          e.stopPropagation()
                          onGroundPlaneUpdate(plane.id, {})
                        }}
                        title="Edit ground plane"
                      >
                        
                      </button>
                      <button
                        className="btn-delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          onGroundPlaneDelete(plane.id)
                        }}
                        title="Delete ground plane"
                      >
                        
                      </button>
                    </div>
                  </div>

                  {stats && (
                    <div className="plane-stats">
                      <div className="stat-item">
                        <span>X-axis length:</span>
                        <span>{stats.xAxisLength.toFixed(2)} units</span>
                      </div>
                      <div className="stat-item">
                        <span>XY angle:</span>
                        <span className={stats.isOrthogonal ? 'orthogonal' : 'non-orthogonal'}>
                          {stats.angle.toFixed(1)}°
                        </span>
                      </div>
                      <div className="stat-item">
                        <span>Normal:</span>
                        <span>
                          ({plane.plane.normal[0].toFixed(3)}, {plane.plane.normal[1].toFixed(3)}, {plane.plane.normal[2].toFixed(3)})
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default GroundPlanePanel