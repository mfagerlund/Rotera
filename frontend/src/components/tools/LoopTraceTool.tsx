// Loop Trace Tool - String together points and batch-create lines

import React, { useEffect, useState, useRef } from 'react'
import { LineDirection } from '../../entities/line'
import { useLoopTrace } from '../../hooks/useLoopTrace'

interface LineConstraints {
  name?: string
  color?: string
  isVisible?: boolean
  isConstruction?: boolean
  constraints?: {
    direction: LineDirection
    targetLength?: number
    tolerance?: number
  }
}

import { ConstructionPreview } from '../image-viewer/types'

interface LoopTraceToolProps {
  selectedPoints: string[]
  worldPointNames: Record<string, string>
  existingLines: Record<string, any>
  onCreateLine: (pointIds: [string, string], constraints?: LineConstraints) => void
  onCreateConstraint?: (constraint: any) => void
  onCancel: () => void
  onConstructionPreviewChange?: (preview: ConstructionPreview | null) => void
  onClearSelection?: () => void
  isActive: boolean
  showHeader?: boolean
  showActionButtons?: boolean
}

export const LoopTraceTool: React.FC<LoopTraceToolProps> = ({
  selectedPoints,
  worldPointNames,
  existingLines,
  onCreateLine,
  onCreateConstraint,
  onCancel,
  onConstructionPreviewChange,
  onClearSelection,
  isActive,
  showHeader = true,
  showActionButtons = true
}) => {
  const [orientation, setOrientation] = useState<LineDirection>('free')
  const [coplanarEnabled, setCoplanarEnabled] = useState(true)
  const [namePrefix, setNamePrefix] = useState('')
  const [closedLoop, setClosedLoop] = useState(false)
  const prevSegmentsRef = useRef<any[]>([])
  const prevIsActiveRef = useRef(isActive)

  const {
    segments,
    lineCounts,
    complete
  } = useLoopTrace({
    selectedPoints,
    existingLines,
    onCreateLine,
    onCreateConstraint,
    orientation,
    setOrientation,
    coplanarEnabled,
    setCoplanarEnabled,
    namePrefix,
    closedLoop
  })


  // Update construction preview when chain changes
  useEffect(() => {
    if (!isActive || !onConstructionPreviewChange) return

    // Check if segments actually changed
    const segmentsChanged =
      segments.length !== prevSegmentsRef.current.length ||
      segments.some((seg, i) => {
        const prev = prevSegmentsRef.current[i]
        return !prev || seg.pointA !== prev.pointA || seg.pointB !== prev.pointB
      })

    if (!segmentsChanged) return

    prevSegmentsRef.current = segments

    if (segments.length > 0) {
      onConstructionPreviewChange({
        type: 'loop-chain',
        segments: segments
      })
    } else {
      onConstructionPreviewChange(null)
    }
  }, [isActive, segments])

  // Clear preview when tool is deactivated
  useEffect(() => {
    const wasActive = prevIsActiveRef.current
    prevIsActiveRef.current = isActive

    if (wasActive && !isActive && onConstructionPreviewChange) {
      onConstructionPreviewChange(null)
      prevSegmentsRef.current = []
    }
  }, [isActive])

  // Listen for save event from FloatingWindow
  useEffect(() => {
    if (!isActive) return

    const handleSave = () => {
      complete()
      // Clear preview and selection
      if (onConstructionPreviewChange) {
        onConstructionPreviewChange(null)
      }
      if (onClearSelection) {
        onClearSelection()
      }
      onCancel() // Close after completion
    }

    const handleSetClosed = (event: Event) => {
      const customEvent = event as CustomEvent
      const { closed } = customEvent.detail
      setClosedLoop(closed)
    }

    window.addEventListener('loopToolSave', handleSave)
    window.addEventListener('loopToolSetClosed', handleSetClosed)
    return () => {
      window.removeEventListener('loopToolSave', handleSave)
      window.removeEventListener('loopToolSetClosed', handleSetClosed)
    }
  }, [isActive, complete, selectedPoints.length])

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isActive) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        complete()
        // Clear preview and selection
        if (onConstructionPreviewChange) {
          onConstructionPreviewChange(null)
        }
        if (onClearSelection) {
          onClearSelection()
        }
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isActive, complete])

  const handleOrientationChange = (newOrientation: LineDirection) => {
    setOrientation(newOrientation)
  }

  const handleComplete = () => {
    if (showActionButtons) {
      complete()
      // Clear preview and selection
      if (onConstructionPreviewChange) {
        onConstructionPreviewChange(null)
      }
      if (onClearSelection) {
        onClearSelection()
      }
      onCancel()
    }
  }

  // Format selection display
  const getSelectionDisplay = () => {
    if (selectedPoints.length === 0) return 'No points selected'

    const names = selectedPoints.map(id => worldPointNames[id] || id)

    if (names.length <= 4) {
      return names.join(' → ')
    }

    return `${names[0]} → ... → ${names[names.length - 1]} (${names.length} points)`
  }

  return (
    <div className="loop-trace-tool">
      {showHeader && (
        <div className="tool-header">
          <h4>Loop Trace</h4>
          <button className="btn-cancel" onClick={onCancel}>✕</button>
        </div>
      )}

      <div className="tool-content">
        {/* Name Prefix */}
        <div className="tool-section compact">
          <label className="tool-label-inline">Prefix:</label>
          <input
            type="text"
            className="tool-input-small"
            value={namePrefix}
            onChange={(e) => setNamePrefix(e.target.value)}
            placeholder="e.g. EastWall"
          />
        </div>

        {/* Orientation Controls - Compact */}
        <div className="tool-section compact">
          <label className="tool-label-inline">Direction</label>
          <div className="orientation-buttons compact">
            <button
              className={`orientation-btn ${orientation === 'free' ? 'active' : ''}`}
              onClick={() => handleOrientationChange('free')}
              title="Free"
            >
              Free
            </button>
            <button
              className={`orientation-btn ${orientation === 'horizontal' ? 'active' : ''}`}
              onClick={() => handleOrientationChange('horizontal')}
              title="Horizontal"
            >
              ↔ Horiz
            </button>
            <button
              className={`orientation-btn ${orientation === 'vertical' ? 'active' : ''}`}
              onClick={() => handleOrientationChange('vertical')}
              title="Vertical"
            >
              ↕ Vert
            </button>
            <button
              className={`orientation-btn ${orientation === 'x-aligned' ? 'active' : ''}`}
              onClick={() => handleOrientationChange('x-aligned')}
              title="X-aligned"
            >
              X
            </button>
            <button
              className={`orientation-btn ${orientation === 'z-aligned' ? 'active' : ''}`}
              onClick={() => handleOrientationChange('z-aligned')}
              title="Z-aligned"
            >
              Z
            </button>
          </div>
        </div>

        {/* Closed Loop Toggle */}
        <div className="tool-section compact">
          <label className="tool-checkbox-inline">
            <input
              type="checkbox"
              checked={closedLoop}
              onChange={(e) => setClosedLoop(e.target.checked)}
            />
            <span>Closed</span>
          </label>
        </div>

        {/* Coplanar Toggle */}
        <div className="tool-section compact">
          <label className="tool-checkbox-inline">
            <input
              type="checkbox"
              checked={coplanarEnabled}
              onChange={(e) => setCoplanarEnabled(e.target.checked)}
            />
            <span>Coplanar</span>
          </label>
        </div>

        {/* Status Summary - Compact */}
        <div className="tool-section compact">
          <span className="status-text">
            {selectedPoints.length} pts • {lineCounts.newLines} new • {lineCounts.existingLines} exist
          </span>
        </div>
      </div>

      {/* Action Buttons (if not using FloatingWindow) */}
      {showActionButtons && (
        <div className="tool-actions">
          <button
            className="btn-primary"
            onClick={handleComplete}
            disabled={selectedPoints.length < 2}
          >
            Complete
          </button>
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

export default LoopTraceTool