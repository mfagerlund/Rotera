// Point merging dialog for combining duplicate or nearby points

import React, { useState, useCallback, useMemo } from 'react'
import { Project, WorldPoint, Constraint } from '../types/project'

interface MergeCandidate {
  sourcePoint: WorldPoint
  targetPoint: WorldPoint
  distance: number
  confidence: number
  reason: string
}

interface MergeOperation {
  sourcePointId: string
  targetPointId: string
  mergeStrategy: 'keep_target' | 'keep_source' | 'average' | 'weighted_average'
  preserveConstraints: boolean
}

interface PointMergeDialogProps {
  isOpen: boolean
  project: Project
  onClose: () => void
  onMergePoints: (operations: MergeOperation[]) => void
  selectedPointIds?: string[]
}

export const PointMergeDialog: React.FC<PointMergeDialogProps> = ({
  isOpen,
  project,
  onClose,
  onMergePoints,
  selectedPointIds = []
}) => {
  const [mergeCandidates, setMergeCandidates] = useState<MergeCandidate[]>([])
  const [selectedOperations, setSelectedOperations] = useState<Set<string>>(new Set())
  const [mergeSettings, setMergeSettings] = useState({
    maxDistance: 1.0, // mm
    minConfidence: 0.7,
    strategy: 'weighted_average' as MergeOperation['mergeStrategy'],
    preserveConstraints: true,
    autoSelectSimilar: true
  })
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisComplete, setAnalysisComplete] = useState(false)

  // Calculate distance between two points
  const calculateDistance = useCallback((pointA: WorldPoint, pointB: WorldPoint): number => {
    if (!pointA.xyz || !pointB.xyz) return Infinity

    const dx = pointA.xyz[0] - pointB.xyz[0]
    const dy = pointA.xyz[1] - pointB.xyz[1]
    const dz = pointA.xyz[2] - pointB.xyz[2]

    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }, [])

  // Calculate merge confidence based on various factors
  const calculateMergeConfidence = useCallback((pointA: WorldPoint, pointB: WorldPoint, distance: number): number => {
    let confidence = 0

    // Distance factor (closer = higher confidence)
    const distanceFactor = Math.max(0, 1 - (distance / mergeSettings.maxDistance))
    confidence += distanceFactor * 0.4

    // Name similarity factor
    const nameSimilarity = calculateNameSimilarity(pointA.name, pointB.name)
    confidence += nameSimilarity * 0.3

    // Image overlap factor (more shared images = higher confidence)
    const sharedImages = getSharedImages(pointA, pointB)
    const totalImages = Math.max(pointA.imagePoints.length, pointB.imagePoints.length)
    const imageFactor = totalImages > 0 ? sharedImages / totalImages : 0
    confidence += imageFactor * 0.2

    // Group similarity factor
    const groupFactor = pointA.group === pointB.group ? 0.1 : 0
    confidence += groupFactor

    return Math.min(1, confidence)
  }, [mergeSettings.maxDistance])

  // Calculate name similarity using Levenshtein distance
  const calculateNameSimilarity = useCallback((nameA: string, nameB: string): number => {
    const a = nameA.toLowerCase().trim()
    const b = nameB.toLowerCase().trim()

    if (a === b) return 1

    const maxLength = Math.max(a.length, b.length)
    if (maxLength === 0) return 1

    const distance = levenshteinDistance(a, b)
    return 1 - (distance / maxLength)
  }, [])

  // Get number of shared images between two points
  const getSharedImages = useCallback((pointA: WorldPoint, pointB: WorldPoint): number => {
    const imagesA = new Set(pointA.imagePoints.map(ip => ip.imageId))
    const imagesB = new Set(pointB.imagePoints.map(ip => ip.imageId))

    return Array.from(imagesA).filter(id => imagesB.has(id)).length
  }, [])

  // Find merge candidates
  const findMergeCandidates = useCallback(async () => {
    setIsAnalyzing(true)
    setMergeCandidates([])
    setAnalysisComplete(false)

    try {
      // Simulate analysis delay for large datasets
      await new Promise(resolve => setTimeout(resolve, 500))

      const candidates: MergeCandidate[] = []
      const worldPoints = Object.values(project.worldPoints)
      const pointsToAnalyze = selectedPointIds.length > 0
        ? worldPoints.filter(wp => selectedPointIds.includes(wp.id))
        : worldPoints

      for (let i = 0; i < pointsToAnalyze.length; i++) {
        for (let j = i + 1; j < worldPoints.length; j++) {
          const pointA = pointsToAnalyze[i]
          const pointB = worldPoints[j]

          // Skip if same point or if analyzing selection and B is not in worldPoints
          if (pointA.id === pointB.id) continue
          if (selectedPointIds.length > 0 && !worldPoints.includes(pointB)) continue

          const distance = calculateDistance(pointA, pointB)

          // Skip if distance is too large
          if (distance > mergeSettings.maxDistance) continue

          const confidence = calculateMergeConfidence(pointA, pointB, distance)

          // Skip if confidence is too low
          if (confidence < mergeSettings.minConfidence) continue

          const reason = getMergeReason(pointA, pointB, distance, confidence)

          candidates.push({
            sourcePoint: pointA,
            targetPoint: pointB,
            distance,
            confidence,
            reason
          })
        }
      }

      // Sort by confidence (highest first)
      candidates.sort((a, b) => b.confidence - a.confidence)

      setMergeCandidates(candidates)

      // Auto-select high-confidence candidates if enabled
      if (mergeSettings.autoSelectSimilar) {
        const autoSelected = new Set<string>()
        candidates.forEach(candidate => {
          if (candidate.confidence >= 0.8) {
            autoSelected.add(`${candidate.sourcePoint.id}-${candidate.targetPoint.id}`)
          }
        })
        setSelectedOperations(autoSelected)
      }

      setAnalysisComplete(true)

    } catch (error) {
      console.error('Merge analysis failed:', error)
    } finally {
      setIsAnalyzing(false)
    }
  }, [
    project.worldPoints,
    selectedPointIds,
    mergeSettings.maxDistance,
    mergeSettings.minConfidence,
    mergeSettings.autoSelectSimilar,
    calculateDistance,
    calculateMergeConfidence
  ])

  // Get merge reason description
  const getMergeReason = useCallback((pointA: WorldPoint, pointB: WorldPoint, distance: number, confidence: number): string => {
    const reasons: string[] = []

    if (distance < 0.1) reasons.push('Very close proximity')
    else if (distance < 0.5) reasons.push('Close proximity')

    const nameSimilarity = calculateNameSimilarity(pointA.name, pointB.name)
    if (nameSimilarity > 0.8) reasons.push('Similar names')

    const sharedImages = getSharedImages(pointA, pointB)
    if (sharedImages > 0) reasons.push(`${sharedImages} shared images`)

    if (pointA.group && pointA.group === pointB.group) reasons.push('Same group')

    return reasons.length > 0 ? reasons.join(', ') : 'Spatial proximity'
  }, [calculateNameSimilarity, getSharedImages])

  // Handle operation selection
  const handleOperationToggle = useCallback((sourceId: string, targetId: string) => {
    const operationKey = `${sourceId}-${targetId}`
    const newSelected = new Set(selectedOperations)

    if (newSelected.has(operationKey)) {
      newSelected.delete(operationKey)
    } else {
      newSelected.add(operationKey)
    }

    setSelectedOperations(newSelected)
  }, [selectedOperations])

  // Execute merge operations
  const handleMerge = useCallback(() => {
    const operations: MergeOperation[] = []

    selectedOperations.forEach(operationKey => {
      const [sourceId, targetId] = operationKey.split('-')
      operations.push({
        sourcePointId: sourceId,
        targetPointId: targetId,
        mergeStrategy: mergeSettings.strategy,
        preserveConstraints: mergeSettings.preserveConstraints
      })
    })

    onMergePoints(operations)
    onClose()
  }, [selectedOperations, mergeSettings.strategy, mergeSettings.preserveConstraints, onMergePoints, onClose])

  // Check for conflicts in selected operations
  const getConflicts = useMemo(() => {
    const sourcePoints = new Set<string>()
    const targetPoints = new Set<string>()
    const conflicts: string[] = []

    selectedOperations.forEach(operationKey => {
      const [sourceId, targetId] = operationKey.split('-')

      if (sourcePoints.has(sourceId)) {
        conflicts.push(`Point ${project.worldPoints[sourceId]?.name} is source for multiple merges`)
      }
      if (targetPoints.has(targetId)) {
        conflicts.push(`Point ${project.worldPoints[targetId]?.name} is target for multiple merges`)
      }
      if (sourcePoints.has(targetId) || targetPoints.has(sourceId)) {
        conflicts.push(`Circular merge detected involving ${project.worldPoints[sourceId]?.name} and ${project.worldPoints[targetId]?.name}`)
      }

      sourcePoints.add(sourceId)
      targetPoints.add(targetId)
    })

    return conflicts
  }, [selectedOperations, project.worldPoints])

  // Run initial analysis when dialog opens
  React.useEffect(() => {
    if (isOpen && !analysisComplete) {
      findMergeCandidates()
    }
  }, [isOpen, findMergeCandidates, analysisComplete])

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="point-merge-dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Merge Duplicate Points</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="dialog-content">
          <div className="merge-settings">
            <h3>Analysis Settings</h3>
            <div className="settings-grid">
              <label>
                <span>Max distance (mm):</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10"
                  value={mergeSettings.maxDistance}
                  onChange={(e) => setMergeSettings(prev => ({
                    ...prev,
                    maxDistance: parseFloat(e.target.value)
                  }))}
                />
              </label>
              <label>
                <span>Min confidence:</span>
                <input
                  type="number"
                  step="0.05"
                  min="0.1"
                  max="1"
                  value={mergeSettings.minConfidence}
                  onChange={(e) => setMergeSettings(prev => ({
                    ...prev,
                    minConfidence: parseFloat(e.target.value)
                  }))}
                />
              </label>
              <label>
                <span>Merge strategy:</span>
                <select
                  value={mergeSettings.strategy}
                  onChange={(e) => setMergeSettings(prev => ({
                    ...prev,
                    strategy: e.target.value as MergeOperation['mergeStrategy']
                  }))}
                >
                  <option value="keep_target">Keep target position</option>
                  <option value="keep_source">Keep source position</option>
                  <option value="average">Average positions</option>
                  <option value="weighted_average">Weighted average</option>
                </select>
              </label>
            </div>
            <div className="settings-options">
              <label className="option-checkbox">
                <input
                  type="checkbox"
                  checked={mergeSettings.preserveConstraints}
                  onChange={(e) => setMergeSettings(prev => ({
                    ...prev,
                    preserveConstraints: e.target.checked
                  }))}
                />
                <span>Preserve constraints</span>
              </label>
              <label className="option-checkbox">
                <input
                  type="checkbox"
                  checked={mergeSettings.autoSelectSimilar}
                  onChange={(e) => setMergeSettings(prev => ({
                    ...prev,
                    autoSelectSimilar: e.target.checked
                  }))}
                />
                <span>Auto-select high confidence matches</span>
              </label>
            </div>
            <button
              className="analyze-btn"
              onClick={findMergeCandidates}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? 'Analyzing...' : 'Re-analyze'}
            </button>
          </div>

          {isAnalyzing && (
            <div className="analysis-progress">
              <div className="progress-spinner">🔄</div>
              <span>Analyzing point similarities...</span>
            </div>
          )}

          {analysisComplete && (
            <div className="merge-results">
              <div className="results-header">
                <h3>Merge Candidates ({mergeCandidates.length})</h3>
                <div className="selection-summary">
                  {selectedOperations.size} selected
                  {selectedOperations.size > 0 && (
                    <button
                      className="clear-selection-btn"
                      onClick={() => setSelectedOperations(new Set())}
                    >
                      Clear all
                    </button>
                  )}
                </div>
              </div>

              {getConflicts.length > 0 && (
                <div className="merge-conflicts">
                  <h4>⚠️ Conflicts Detected</h4>
                  <ul>
                    {getConflicts.map((conflict, index) => (
                      <li key={index}>{conflict}</li>
                    ))}
                  </ul>
                </div>
              )}

              {mergeCandidates.length === 0 ? (
                <div className="no-candidates">
                  <div className="no-candidates-icon">🔍</div>
                  <div className="no-candidates-text">No merge candidates found</div>
                  <div className="no-candidates-hint">
                    Try adjusting the distance threshold or confidence level
                  </div>
                </div>
              ) : (
                <div className="candidates-list">
                  {mergeCandidates.map((candidate, index) => {
                    const operationKey = `${candidate.sourcePoint.id}-${candidate.targetPoint.id}`
                    const isSelected = selectedOperations.has(operationKey)

                    return (
                      <div
                        key={operationKey}
                        className={`candidate-item ${isSelected ? 'selected' : ''}`}
                      >
                        <label className="candidate-checkbox">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleOperationToggle(candidate.sourcePoint.id, candidate.targetPoint.id)}
                          />
                          <div className="candidate-info">
                            <div className="candidate-header">
                              <span className="candidate-names">
                                {candidate.sourcePoint.name} → {candidate.targetPoint.name}
                              </span>
                              <div className="candidate-metrics">
                                <span className="confidence-badge" style={{
                                  backgroundColor: candidate.confidence > 0.8 ? 'var(--success-color)' :
                                                  candidate.confidence > 0.6 ? 'var(--warning-color)' :
                                                  'var(--error-color)'
                                }}>
                                  {Math.round(candidate.confidence * 100)}%
                                </span>
                                <span className="distance-badge">
                                  {candidate.distance.toFixed(2)}mm
                                </span>
                              </div>
                            </div>
                            <div className="candidate-reason">{candidate.reason}</div>
                            <div className="candidate-details">
                              <span>Images: {candidate.sourcePoint.imagePoints.length} + {candidate.targetPoint.imagePoints.length}</span>
                              <span>Groups: {candidate.sourcePoint.group || 'None'} + {candidate.targetPoint.group || 'None'}</span>
                            </div>
                          </div>
                        </label>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="dialog-actions">
          <button
            className="btn-primary"
            onClick={handleMerge}
            disabled={selectedOperations.size === 0 || getConflicts.length > 0}
          >
            Merge {selectedOperations.size} Point{selectedOperations.size !== 1 ? 's' : ''}
          </button>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// Helper function for Levenshtein distance
function levenshteinDistance(a: string, b: string): number {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null))

  for (let i = 0; i <= a.length; i++) {
    matrix[0][i] = i
  }

  for (let j = 0; j <= b.length; j++) {
    matrix[j][0] = j
  }

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + substitutionCost // substitution
      )
    }
  }

  return matrix[b.length][a.length]
}

export default PointMergeDialog