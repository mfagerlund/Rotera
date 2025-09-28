// Line Creation Tool - Entity-first paradigm implementation

import React, { useState, useCallback, useEffect } from 'react'
import { Line } from '../../types/geometry'

interface LineCreationToolProps {
  selectedPoints: string[]
  onCreateLine: (pointIds: [string, string], geometry: 'segment' | 'infinite') => void
  onToolStateChange: (isActive: boolean, message?: string) => void
  onCancel: () => void
  isActive: boolean
}

export const LineCreationTool: React.FC<LineCreationToolProps> = ({
  selectedPoints,
  onCreateLine,
  onToolStateChange,
  onCancel,
  isActive
}) => {
  const [geometry, setGeometry] = useState<'segment' | 'infinite'>('segment')
  const [pendingPoints, setPendingPoints] = useState<string[]>([])
  const [toolMessage, setToolMessage] = useState<string>('')

  // Determine tool state based on selection
  useEffect(() => {
    if (!isActive) {
      setPendingPoints([])
      setToolMessage('')
      return
    }

    const totalPoints = [...pendingPoints, ...selectedPoints].slice(0, 2)

    if (totalPoints.length === 0) {
      setToolMessage('Select first point for line')
      onToolStateChange(true, 'Select first point for line')
    } else if (totalPoints.length === 1) {
      setToolMessage('Select second point for line')
      onToolStateChange(true, 'Select second point for line')
    } else if (totalPoints.length === 2) {
      // Check if we can create a line
      const [pointA, pointB] = totalPoints
      if (pointA !== pointB) {
        setToolMessage(`Creating line between ${pointA} and ${pointB}`)
        onToolStateChange(true, `Creating line between points`)

        // Auto-create line and deactivate tool
        setTimeout(() => {
          onCreateLine([pointA, pointB], geometry)
          onCancel() // Deactivate tool after creation
        }, 100)
      } else {
        setToolMessage('Cannot create line: same point selected twice')
        onToolStateChange(true, 'Cannot create line: same point selected twice')
      }
    }
  }, [selectedPoints, pendingPoints, isActive, geometry, onCreateLine, onCancel, onToolStateChange])

  // Handle Escape key to cancel tool
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isActive) {
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, onCancel])

  const handlePointSelection = useCallback((pointId: string) => {
    if (!isActive) return

    setPendingPoints(prev => {
      const newPending = [...prev, pointId].slice(0, 2)
      return newPending
    })
  }, [isActive])

  const canCreate = selectedPoints.length === 2 && selectedPoints[0] !== selectedPoints[1]

  if (!isActive) return null

  return (
    <div className="line-creation-tool">
      <div className="tool-header">
        <h4>Create Line</h4>
        <button
          className="btn-cancel"
          onClick={onCancel}
          title="Cancel line creation (Esc)"
        >
          ✕
        </button>
      </div>

      <div className="tool-content">
        <div className="tool-message">
          {toolMessage}
        </div>

        <div className="tool-options">
          <label className="option-group">
            <span>Line Type:</span>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  name="geometry"
                  value="segment"
                  checked={geometry === 'segment'}
                  onChange={(e) => setGeometry(e.target.value as 'segment' | 'infinite')}
                />
                Segment
              </label>
              <label>
                <input
                  type="radio"
                  name="geometry"
                  value="infinite"
                  checked={geometry === 'infinite'}
                  onChange={(e) => setGeometry(e.target.value as 'segment' | 'infinite')}
                />
                Infinite
              </label>
            </div>
          </label>
        </div>

        <div className="selection-status">
          <div className="selected-points">
            Selected Points: {selectedPoints.length}/2
            {selectedPoints.map((pointId, index) => (
              <span key={pointId} className="point-tag">
                {pointId}
              </span>
            ))}
          </div>
        </div>

        {selectedPoints.length === 2 && (
          <div className="tool-actions">
            <button
              className="btn-create"
              onClick={() => {
                if (canCreate) {
                  onCreateLine([selectedPoints[0], selectedPoints[1]], geometry)
                  onCancel()
                }
              }}
              disabled={!canCreate}
            >
              Create Line
            </button>
          </div>
        )}
      </div>

      <div className="tool-help">
        <div className="help-text">
          • Select two different points to create a line
          • Press Esc to cancel
          • Choose segment (finite) or infinite line
        </div>
      </div>
    </div>
  )
}

export default LineCreationTool