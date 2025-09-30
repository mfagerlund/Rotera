// Symmetry constraints panel for mirror and rotational symmetries

import React, { useState, useCallback, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowsLeftRight, faPencil, faRotate, faTrash, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import { Project, WorldPoint, Constraint } from '../types/project'

export type SymmetryType = 'mirror' | 'rotational' | 'translational'

interface SymmetricPointPair {
  original: string
  symmetric: string
}

export interface SymmetryConstraint extends Omit<Constraint, 'type'> {
  type: 'symmetry'
  symmetryType: SymmetryType
  // Mirror symmetry
  mirrorLine?: {
    point1: string
    point2: string
  }
  mirrorPlane?: {
    normal: [number, number, number]
    point: [number, number, number]
  }
  // Rotational symmetry
  rotationCenter?: string
  rotationAxis?: [number, number, number]
  rotationAngle?: number
  rotationCount?: number
  // Translational symmetry
  translationVector?: [number, number, number]
  // Symmetric point pairs
  symmetricPairs: Array<{
    original: string
    symmetric: string
  }>
}

interface SymmetryConstraintsPanelProps {
  project: Project
  onSymmetryCreate: (constraint: SymmetryConstraint) => void
  onSymmetryUpdate: (constraintId: string, updates: Partial<SymmetryConstraint>) => void
  onSymmetryDelete: (constraintId: string) => void
  selectedPointIds: string[]
  onPointSelect: (pointId: string, multiSelect: boolean) => void
  onClearSelection: () => void
}

export const SymmetryConstraintsPanel: React.FC<SymmetryConstraintsPanelProps> = ({
  project,
  onSymmetryCreate,
  onSymmetryUpdate,
  onSymmetryDelete,
  selectedPointIds,
  onPointSelect,
  onClearSelection
}) => {
  const [activeSymmetryType, setActiveSymmetryType] = useState<SymmetryType>('mirror')
  const [isCreating, setIsCreating] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [symmetryData, setSymmetryData] = useState<Partial<SymmetryConstraint>>({
    symmetryType: 'mirror',
    symmetricPairs: []
  })

  // Get existing symmetry constraints
  const symmetryConstraints = useMemo(() => {
    return (project.constraints || [])
      .filter((c): c is SymmetryConstraint => c.type === 'symmetry')
  }, [project.constraints])

  // Get available points for symmetry
  const availablePoints = useMemo(() => {
    return Object.values(project.worldPoints).filter(wp => wp.xyz)
  }, [project.worldPoints])

  // Calculate mirror point position
  const calculateMirrorPoint = useCallback((
    originalPoint: [number, number, number],
    linePoint1: [number, number, number],
    linePoint2: [number, number, number]
  ): [number, number, number] => {
    // Calculate the mirror of a point across a line in 3D
    const [px, py, pz] = originalPoint
    const [l1x, l1y, l1z] = linePoint1
    const [l2x, l2y, l2z] = linePoint2

    // Line direction vector
    const dx = l2x - l1x
    const dy = l2y - l1y
    const dz = l2z - l1z

    // Vector from line point to original point
    const vx = px - l1x
    const vy = py - l1y
    const vz = pz - l1z

    // Project vector onto line direction
    const dotProduct = vx * dx + vy * dy + vz * dz
    const lineLengthSq = dx * dx + dy * dy + dz * dz

    if (lineLengthSq === 0) return originalPoint

    const t = dotProduct / lineLengthSq

    // Closest point on line
    const closestX = l1x + t * dx
    const closestY = l1y + t * dy
    const closestZ = l1z + t * dz

    // Mirror point
    const mirrorX = 2 * closestX - px
    const mirrorY = 2 * closestY - py
    const mirrorZ = 2 * closestZ - pz

    return [mirrorX, mirrorY, mirrorZ]
  }, [])

  // Calculate rotational symmetry point
  const calculateRotationalPoint = useCallback((
    originalPoint: [number, number, number],
    center: [number, number, number],
    axis: [number, number, number],
    angle: number
  ): [number, number, number] => {
    // Rodrigues' rotation formula
    const [px, py, pz] = originalPoint
    const [cx, cy, cz] = center
    const [ax, ay, az] = axis

    // Translate to origin
    const x = px - cx
    const y = py - cy
    const z = pz - cz

    // Normalize axis
    const axisLength = Math.sqrt(ax * ax + ay * ay + az * az)
    const kx = ax / axisLength
    const ky = ay / axisLength
    const kz = az / axisLength

    const cosTheta = Math.cos(angle)
    const sinTheta = Math.sin(angle)
    const oneMinusCos = 1 - cosTheta

    // Rotation matrix
    const r11 = cosTheta + kx * kx * oneMinusCos
    const r12 = kx * ky * oneMinusCos - kz * sinTheta
    const r13 = kx * kz * oneMinusCos + ky * sinTheta
    const r21 = ky * kx * oneMinusCos + kz * sinTheta
    const r22 = cosTheta + ky * ky * oneMinusCos
    const r23 = ky * kz * oneMinusCos - kx * sinTheta
    const r31 = kz * kx * oneMinusCos - ky * sinTheta
    const r32 = kz * ky * oneMinusCos + kx * sinTheta
    const r33 = cosTheta + kz * kz * oneMinusCos

    // Apply rotation
    const rotX = r11 * x + r12 * y + r13 * z
    const rotY = r21 * x + r22 * y + r23 * z
    const rotZ = r31 * x + r32 * y + r33 * z

    // Translate back
    return [rotX + cx, rotY + cy, rotZ + cz]
  }, [])

  // Start creating symmetry constraint
  const startSymmetryCreation = useCallback((type: SymmetryType) => {
    setActiveSymmetryType(type)
    setIsCreating(true)
    setCurrentStep(0)
    setSymmetryData({
      symmetryType: type,
      symmetricPairs: []
    })
    onClearSelection()
  }, [onClearSelection])

  // Handle symmetry creation steps
  const handleNextStep = useCallback(() => {
    switch (activeSymmetryType) {
      case 'mirror':
        if (currentStep === 0) {
          // Step 1: Select mirror line (2 points)
          if (selectedPointIds.length >= 2) {
            setSymmetryData(prev => ({
              ...prev,
              mirrorLine: {
                point1: selectedPointIds[0],
                point2: selectedPointIds[1]
              }
            }))
            onClearSelection()
            setCurrentStep(1)
          }
        } else if (currentStep === 1) {
          // Step 2: Select point pairs
          if (selectedPointIds.length >= 2 && selectedPointIds.length % 2 === 0) {
            const pairs: SymmetricPointPair[] = []
            for (let i = 0; i < selectedPointIds.length; i += 2) {
              pairs.push({
                original: selectedPointIds[i],
                symmetric: selectedPointIds[i + 1]
              })
            }
            setSymmetryData(prev => ({
              ...prev,
              symmetricPairs: pairs
            }))
            setCurrentStep(2)
          }
        }
        break

      case 'rotational':
        if (currentStep === 0) {
          // Step 1: Select rotation center
          if (selectedPointIds.length >= 1) {
            setSymmetryData(prev => ({
              ...prev,
              rotationCenter: selectedPointIds[0],
              rotationAxis: [0, 0, 1], // Default Z-axis
              rotationAngle: Math.PI / 2, // Default 90 degrees
              rotationCount: 4 // Default 4-fold symmetry
            }))
            onClearSelection()
            setCurrentStep(1)
          }
        } else if (currentStep === 1) {
          // Step 2: Select symmetric point pairs
          if (selectedPointIds.length >= 2 && selectedPointIds.length % 2 === 0) {
            const pairs: SymmetricPointPair[] = []
            for (let i = 0; i < selectedPointIds.length; i += 2) {
              pairs.push({
                original: selectedPointIds[i],
                symmetric: selectedPointIds[i + 1]
              })
            }
            setSymmetryData(prev => ({
              ...prev,
              symmetricPairs: pairs
            }))
            setCurrentStep(2)
          }
        }
        break

      case 'translational':
        if (currentStep === 0) {
          // Step 1: Define translation vector from 2 points
          if (selectedPointIds.length >= 2) {
            const point1 = project.worldPoints[selectedPointIds[0]]
            const point2 = project.worldPoints[selectedPointIds[1]]
            if (point1.xyz && point2.xyz) {
              const vector: [number, number, number] = [
                point2.xyz[0] - point1.xyz[0],
                point2.xyz[1] - point1.xyz[1],
                point2.xyz[2] - point1.xyz[2]
              ]
              setSymmetryData(prev => ({
                ...prev,
                translationVector: vector
              }))
              onClearSelection()
              setCurrentStep(1)
            }
          }
        } else if (currentStep === 1) {
          // Step 2: Select symmetric point pairs
          if (selectedPointIds.length >= 2 && selectedPointIds.length % 2 === 0) {
            const pairs: SymmetricPointPair[] = []
            for (let i = 0; i < selectedPointIds.length; i += 2) {
              pairs.push({
                original: selectedPointIds[i],
                symmetric: selectedPointIds[i + 1]
              })
            }
            setSymmetryData(prev => ({
              ...prev,
              symmetricPairs: pairs
            }))
            setCurrentStep(2)
          }
        }
        break
    }
  }, [activeSymmetryType, currentStep, selectedPointIds, project.worldPoints, onClearSelection])

  // Complete symmetry creation
  const completeSymmetryCreation = useCallback(() => {
    if (symmetryData.symmetricPairs && symmetryData.symmetricPairs.length > 0) {
      const constraint: SymmetryConstraint = {
        ...symmetryData as SymmetryConstraint,
        id: crypto.randomUUID(),
        type: 'symmetry'
      }
      onSymmetryCreate(constraint)
    }

    setIsCreating(false)
    setCurrentStep(0)
    setSymmetryData({ symmetryType: 'mirror', symmetricPairs: [] })
    onClearSelection()
  }, [symmetryData, onSymmetryCreate, onClearSelection])

  // Cancel symmetry creation
  const cancelSymmetryCreation = useCallback(() => {
    setIsCreating(false)
    setCurrentStep(0)
    setSymmetryData({ symmetryType: 'mirror', symmetricPairs: [] })
    onClearSelection()
  }, [onClearSelection])

  // Get step instructions
  const getStepInstructions = useCallback(() => {
    switch (activeSymmetryType) {
      case 'mirror':
        switch (currentStep) {
          case 0: return 'Select 2 points to define the mirror line'
          case 1: return 'Select pairs of symmetric points (original, then mirror)'
          case 2: return 'Review and confirm the mirror symmetry'
          default: return ''
        }
      case 'rotational':
        switch (currentStep) {
          case 0: return 'Select the center point for rotation'
          case 1: return 'Select pairs of symmetric points'
          case 2: return 'Review and confirm the rotational symmetry'
          default: return ''
        }
      case 'translational':
        switch (currentStep) {
          case 0: return 'Select 2 points to define the translation vector'
          case 1: return 'Select pairs of symmetric points'
          case 2: return 'Review and confirm the translational symmetry'
          default: return ''
        }
      default: return ''
    }
  }, [activeSymmetryType, currentStep])

  // Validate current step
  const canProceedToNextStep = useCallback(() => {
    switch (activeSymmetryType) {
      case 'mirror':
        if (currentStep === 0) return selectedPointIds.length >= 2
        if (currentStep === 1) return selectedPointIds.length >= 2 && selectedPointIds.length % 2 === 0
        return false
      case 'rotational':
        if (currentStep === 0) return selectedPointIds.length >= 1
        if (currentStep === 1) return selectedPointIds.length >= 2 && selectedPointIds.length % 2 === 0
        return false
      case 'translational':
        if (currentStep === 0) return selectedPointIds.length >= 2
        if (currentStep === 1) return selectedPointIds.length >= 2 && selectedPointIds.length % 2 === 0
        return false
      default: return false
    }
  }, [activeSymmetryType, currentStep, selectedPointIds])

  return (
    <div className="symmetry-constraints-panel">
      <div className="panel-header">
        <h3>Symmetry Constraints</h3>
        <div className="symmetry-count">
          {symmetryConstraints.length} constraint{symmetryConstraints.length !== 1 ? 's' : ''}
        </div>
      </div>

      {!isCreating ? (
        <div className="symmetry-types">
          <div className="symmetry-type-grid">
            <button
              className="symmetry-type-btn mirror"
              onClick={() => startSymmetryCreation('mirror')}
              disabled={availablePoints.length < 4}
            >
              <div className="symmetry-icon">🪞</div>
              <div className="symmetry-info">
                <div className="symmetry-name">Mirror Symmetry</div>
                <div className="symmetry-description">Reflect points across a line</div>
              </div>
            </button>

            <button
              className="symmetry-type-btn rotational"
              onClick={() => startSymmetryCreation('rotational')}
              disabled={availablePoints.length < 3}
            >
              <div className="symmetry-icon"><FontAwesomeIcon icon={faRotate} /></div>
              <div className="symmetry-info">
                <div className="symmetry-name">Rotational Symmetry</div>
                <div className="symmetry-description">Rotate points around a center</div>
              </div>
            </button>

            <button
              className="symmetry-type-btn translational"
              onClick={() => startSymmetryCreation('translational')}
              disabled={availablePoints.length < 4}
            >
              <div className="symmetry-icon"><FontAwesomeIcon icon={faArrowsLeftRight} /></div>
              <div className="symmetry-info">
                <div className="symmetry-name">Translational Symmetry</div>
                <div className="symmetry-description">Translate points by a vector</div>
              </div>
            </button>
          </div>

          {availablePoints.length < 3 && (
            <div className="requirement-notice">
              <div className="notice-icon"><FontAwesomeIcon icon={faTriangleExclamation} /></div>
              <div className="notice-text">
                At least 3 points with 3D coordinates are required for symmetry constraints
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="symmetry-creation">
          <div className="creation-header">
            <h4>Create {activeSymmetryType.charAt(0).toUpperCase() + activeSymmetryType.slice(1)} Symmetry</h4>
            <div className="step-indicator">
              Step {currentStep + 1} of 3
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

          {currentStep === 2 && (
            <div className="symmetry-preview">
              <h5>Symmetry Preview</h5>
              <div className="preview-details">
                <div className="detail-item">
                  <span>Type:</span>
                  <span>{activeSymmetryType}</span>
                </div>
                <div className="detail-item">
                  <span>Symmetric pairs:</span>
                  <span>{symmetryData.symmetricPairs?.length || 0}</span>
                </div>
                {symmetryData.mirrorLine && (
                  <div className="detail-item">
                    <span>Mirror line:</span>
                    <span>
                      {project.worldPoints[symmetryData.mirrorLine.point1]?.name} - {project.worldPoints[symmetryData.mirrorLine.point2]?.name}
                    </span>
                  </div>
                )}
                {symmetryData.rotationCenter && (
                  <div className="detail-item">
                    <span>Rotation center:</span>
                    <span>{project.worldPoints[symmetryData.rotationCenter]?.name}</span>
                  </div>
                )}
              </div>

              <div className="symmetric-pairs-list">
                <h6>Symmetric Point Pairs:</h6>
                {symmetryData.symmetricPairs?.map((pair, index) => (
                  <div key={index} className="pair-item">
                    <span>{project.worldPoints[pair.original]?.name}</span>
                    <span className="pair-arrow">↔</span>
                    <span>{project.worldPoints[pair.symmetric]?.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="creation-actions">
            {currentStep < 2 ? (
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
                  onClick={cancelSymmetryCreation}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn-create"
                  onClick={completeSymmetryCreation}
                  disabled={!symmetryData.symmetricPairs || symmetryData.symmetricPairs.length === 0}
                >
                  Create Symmetry
                </button>
                <button
                  className="btn-back"
                  onClick={() => setCurrentStep(1)}
                >
                  Back
                </button>
                <button
                  className="btn-cancel"
                  onClick={cancelSymmetryCreation}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {symmetryConstraints.length > 0 && (
        <div className="existing-symmetries">
          <h4>Existing Symmetries</h4>
          <div className="symmetries-list">
            {symmetryConstraints.map(constraint => (
              <div
                key={constraint.id}
                className="symmetry-item"
                onClick={() => onSymmetryUpdate(constraint.id, {})}
              >
                <div className="symmetry-header">
                  <div className="symmetry-type-icon">
                    {constraint.symmetryType === 'mirror' && '🪞'}
                    {constraint.symmetryType === 'rotational' && <FontAwesomeIcon icon={faRotate} />}
                    {constraint.symmetryType === 'translational' && <FontAwesomeIcon icon={faArrowsLeftRight} />}
                  </div>
                  <div className="symmetry-details">
                    <div className="symmetry-title">
                      {constraint.symmetryType.charAt(0).toUpperCase() + constraint.symmetryType.slice(1)} Symmetry
                    </div>
                    <div className="symmetry-info">
                      {constraint.symmetricPairs.length} pair{constraint.symmetricPairs.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="symmetry-actions">
                    <button
                      className="btn-edit"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSymmetryUpdate(constraint.id, {})
                      }}
                      title="Edit symmetry constraint"
                    >
                      
                    </button>
                    <button
                      className="btn-delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSymmetryDelete(constraint.id)
                      }}
                      title="Delete symmetry constraint"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default SymmetryConstraintsPanel