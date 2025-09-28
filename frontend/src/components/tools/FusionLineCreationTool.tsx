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
  showHeader?: boolean // Whether to show the internal header (false when wrapped in FloatingWindow)
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
  isActive,
  showHeader = true
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
    <>
      {showHeader && (
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
      )}

      <div style={{padding: '6px'}}>
        {/* Property Editor Layout */}
        <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            <label style={{minWidth: '50px', fontSize: '12px'}}>Point 1</label>
            <div style={{display: 'flex', alignItems: 'center', gap: '4px', flex: 1}}>
              <select
                value={pointSlot1}
                onChange={(e) => setPointSlot1(e.target.value)}
                onFocus={handleSlot1Focus}
                style={{flex: 1, fontSize: '12px', padding: '2px'}}
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
                  onClick={clearSlot1}
                  style={{padding: '2px 4px', fontSize: '10px'}}
                  title="Clear point 1"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            <label style={{minWidth: '50px', fontSize: '12px'}}>Point 2</label>
            <div style={{display: 'flex', alignItems: 'center', gap: '4px', flex: 1}}>
              <select
                value={pointSlot2}
                onChange={(e) => setPointSlot2(e.target.value)}
                onFocus={handleSlot2Focus}
                style={{flex: 1, fontSize: '12px', padding: '2px'}}
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
                  onClick={clearSlot2}
                  style={{padding: '2px 4px', fontSize: '10px'}}
                  title="Clear point 2"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>


        {/* Line Constraints */}
        <div style={{marginTop: '8px'}}>
          <h5 style={{margin: '0 0 6px 0', fontSize: '12px', fontWeight: 'bold'}}>Constraints</h5>

          <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px'}}>
            <label style={{minWidth: '50px', fontSize: '12px'}}>Direction</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              style={{flex: 1, fontSize: '12px', padding: '2px'}}
            >
              <option value="none">None</option>
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
              <option value="x-aligned">X-aligned</option>
              <option value="y-aligned">Y-aligned</option>
              <option value="z-aligned">Z-aligned</option>
            </select>
          </div>

          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            <label style={{minWidth: '50px', fontSize: '12px'}}>Length</label>
            <div style={{display: 'flex', alignItems: 'center', gap: '4px', flex: 1}}>
              <input
                type="number"
                value={lengthValue}
                onChange={(e) => setLengthValue(e.target.value)}
                step="0.1"
                min="0.001"
                placeholder="Optional"
                style={{width: '80px', fontSize: '12px', padding: '2px'}}
              />
              <span style={{fontSize: '12px'}}>m</span>
            </div>
          </div>
        </div>


        {/* Action Buttons */}
        <div style={{display: 'flex', gap: '8px', marginTop: '8px'}}>
          <button
            onClick={onCancel}
            style={{flex: 1, padding: '4px 8px', fontSize: '12px'}}
          >
            Cancel
          </button>
          <button
            onClick={handleCreateLine}
            disabled={!canCreateLine}
            style={{flex: 1, padding: '4px 8px', fontSize: '12px'}}
          >
            OK
          </button>
        </div>
      </div>

    </>
  )
}

export default FusionLineCreationTool