// Fusion 360-style Line Creation Tool with slot-based selection

import React, { useState, useCallback, useEffect } from 'react'

interface FusionLineCreationToolProps {
  selectedPoints: string[]
  worldPointNames: Record<string, string> // Map of pointId -> pointName
  onCreateLine: (pointIds: [string, string], constraints?: LineConstraints) => void
  onCancel: () => void
  onPointSlotClick?: (pointId: string) => void // For clicking points to fill slots
  onConstructionPreviewChange?: (preview: {
    type: 'line'
    pointA?: string
    pointB?: string
    showToCursor?: boolean
  } | null) => void
  isActive: boolean
}

interface LineConstraints {
  direction?: 'horizontal' | 'vertical' | 'x-aligned' | 'y-aligned' | 'z-aligned'
  length?: number
}

export const FusionLineCreationTool: React.FC<FusionLineCreationToolProps> = ({
  selectedPoints,
  worldPointNames,
  onCreateLine,
  onCancel,
  onPointSlotClick,
  onConstructionPreviewChange,
  isActive
}) => {
  // Point slots state
  const [pointSlot1, setPointSlot1] = useState<string>('')
  const [pointSlot2, setPointSlot2] = useState<string>('')

  // Line-local constraints
  const [direction, setDirection] = useState<string>('none')
  const [lengthValue, setLengthValue] = useState<string>('')

  // Track which slot is currently active for highlighting
  const [activeSlot, setActiveSlot] = useState<1 | 2 | null>(null)

  // Pre-populate slots from selection when tool opens
  useEffect(() => {
    if (isActive && selectedPoints.length > 0) {
      setPointSlot1(selectedPoints[0] || '')
      setPointSlot2(selectedPoints[1] || '')
    }
  }, [isActive, selectedPoints])

  // Handle point clicks to fill slots while tool is active
  useEffect(() => {
    if (!isActive) return

    const handleGlobalPointClick = (event: CustomEvent<{ pointId: string }>) => {
      const pointId = event.detail.pointId

      // Prevent selecting the same point twice
      if (pointId === pointSlot1 || pointId === pointSlot2) {
        return
      }

      if (!pointSlot1) {
        setPointSlot1(pointId)
        setActiveSlot(2) // Next slot becomes active
      } else if (!pointSlot2) {
        setPointSlot2(pointId)
        setActiveSlot(null) // No more slots to fill
      } else {
        // Both slots filled, replace first slot and clear second
        setPointSlot1(pointId)
        setPointSlot2('')
        setActiveSlot(2) // Second slot becomes active
      }
    }

    // Listen for point clicks from the main app
    window.addEventListener('lineToolPointClick', handleGlobalPointClick as EventListener)
    return () => window.removeEventListener('lineToolPointClick', handleGlobalPointClick as EventListener)
  }, [isActive, pointSlot1, pointSlot2])

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isActive) {
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, onCancel])

  // Update construction preview when slots change
  useEffect(() => {
    if (!isActive || !onConstructionPreviewChange) return

    if (pointSlot1 && pointSlot2) {
      // Both points selected - show complete line preview
      onConstructionPreviewChange({
        type: 'line',
        pointA: pointSlot1,
        pointB: pointSlot2,
        showToCursor: false
      })
    } else if (pointSlot1) {
      // Only first point selected - show line to cursor
      onConstructionPreviewChange({
        type: 'line',
        pointA: pointSlot1,
        showToCursor: true
      })
    } else {
      // No points selected - clear preview
      onConstructionPreviewChange(null)
    }
  }, [isActive, pointSlot1, pointSlot2, onConstructionPreviewChange])

  // Clear preview when tool is deactivated
  useEffect(() => {
    if (!isActive && onConstructionPreviewChange) {
      onConstructionPreviewChange(null)
    }
  }, [isActive, onConstructionPreviewChange])

  const clearSlot1 = () => {
    setPointSlot1('')
    setActiveSlot(1) // First slot becomes active
  }

  const clearSlot2 = () => {
    setPointSlot2('')
    setActiveSlot(2) // Second slot becomes active
  }

  // Set active slot when user clicks on dropdown
  const handleSlot1Focus = () => setActiveSlot(1)
  const handleSlot2Focus = () => setActiveSlot(2)

  const canCreateLine = pointSlot1 && pointSlot2 && pointSlot1 !== pointSlot2

  const handleCreateLine = () => {
    if (!canCreateLine) return

    const constraints: LineConstraints = {}

    if (direction !== 'none') {
      constraints.direction = direction as LineConstraints['direction']
    }

    const length = parseFloat(lengthValue)
    if (lengthValue.trim() !== '' && !isNaN(length) && length > 0) {
      constraints.length = length
    }

    onCreateLine([pointSlot1, pointSlot2], constraints)
    onCancel() // Close the tool after creation
  }

  // Get available world points for dropdowns
  const availablePoints = Object.entries(worldPointNames).map(([id, name]) => ({
    id,
    name: name || id
  }))

  if (!isActive) return null

  return (
    <div className="fusion-line-creation-tool">
      <div className="tool-header">
        <h4>Line Creation</h4>
        <button
          className="btn-cancel"
          onClick={onCancel}
          title="Cancel line creation (Esc)"
        >
          ✕
        </button>
      </div>

      <div className="tool-content">
        {/* Property Editor Layout */}
        <div className="property-editor">
          <div className={`property-row ${activeSlot === 1 ? 'active' : ''}`}>
            <label className="property-label">Point 1</label>
            <div className="property-value">
              <select
                value={pointSlot1}
                onChange={(e) => setPointSlot1(e.target.value)}
                onFocus={handleSlot1Focus}
                className="point-slot-dropdown"
              >
                <option value="">Select point...</option>
                {availablePoints.map(point => (
                  <option key={point.id} value={point.id}>
                    {point.name}
                  </option>
                ))}
              </select>
              {pointSlot1 && (
                <button
                  className="btn-clear-icon"
                  onClick={clearSlot1}
                  title="Clear point 1"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className={`property-row ${activeSlot === 2 ? 'active' : ''}`}>
            <label className="property-label">Point 2</label>
            <div className="property-value">
              <select
                value={pointSlot2}
                onChange={(e) => setPointSlot2(e.target.value)}
                onFocus={handleSlot2Focus}
                className="point-slot-dropdown"
              >
                <option value="">Select point...</option>
                {availablePoints.map(point => (
                  <option key={point.id} value={point.id} disabled={point.id === pointSlot1}>
                    {point.name}
                  </option>
                ))}
              </select>
              {pointSlot2 && (
                <button
                  className="btn-clear-icon"
                  onClick={clearSlot2}
                  title="Clear point 2"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>


        {/* Line Constraints */}
        <div className="constraints-section">
          <h5 className="section-header">Constraints</h5>

          <div className="property-row">
            <label className="property-label">Direction</label>
            <div className="property-value">
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                className="direction-dropdown"
              >
                <option value="none">None</option>
                <option value="horizontal">Horizontal</option>
                <option value="vertical">Vertical</option>
                <option value="x-aligned">X-aligned</option>
                <option value="y-aligned">Y-aligned</option>
                <option value="z-aligned">Z-aligned</option>
              </select>
            </div>
          </div>

          <div className="property-row">
            <label className="property-label">Length</label>
            <div className="property-value">
              <div className="length-input">
                <input
                  type="number"
                  value={lengthValue}
                  onChange={(e) => setLengthValue(e.target.value)}
                  step="0.1"
                  min="0.001"
                  placeholder="Optional"
                  className="length-value"
                />
                <span className="unit">m</span>
              </div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="instructions">
          <div className="instruction-text">
            {!pointSlot1 && !pointSlot2 && "Click points or use dropdowns to fill slots"}
            {pointSlot1 && !pointSlot2 && "Select second point"}
            {pointSlot1 && pointSlot2 && pointSlot1 === pointSlot2 && "Points must be different"}
            {canCreateLine && "Ready to create line"}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="action-buttons">
          <button
            className="btn-cancel-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="btn-create-line"
            onClick={handleCreateLine}
            disabled={!canCreateLine}
          >
            OK
          </button>
        </div>
      </div>

      <div className="tool-help">
        <div className="help-text">
          • Click existing points to fill slots sequentially
          • Use dropdowns to manually select points
          • Press Esc to cancel
        </div>
      </div>
    </div>
  )
}

export default FusionLineCreationTool