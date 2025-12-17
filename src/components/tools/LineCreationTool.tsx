// Line Creation Tool with slot-based selection

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRight, faBullseye, faMagnifyingGlass, faTriangleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons'
import { useConfirm } from '../ConfirmDialog'
import { WorldPoint } from '../../entities/world-point'
import { Line } from '../../entities/line'
import { getEntityKey } from '../../utils/entityKeys'

const PRESET_COLORS = [
  { value: '#0696d7', name: 'Blue' },
  { value: '#5cb85c', name: 'Green' },
  { value: '#ff8c00', name: 'Orange' },
  { value: '#d9534f', name: 'Red' },
  { value: '#9b59b6', name: 'Purple' },
  { value: '#e67e22', name: 'Dark Orange' },
  { value: '#1abc9c', name: 'Teal' },
  { value: '#f39c12', name: 'Yellow' },
  { value: '#34495e', name: 'Dark Gray' },
  { value: '#95a5a6', name: 'Light Gray' }
]

const DIRECTION_OPTIONS = [
  { value: 'free' as LineDirection, label: 'Free', tooltip: 'No constraint' },
  { value: 'x' as LineDirection, label: 'X', tooltip: 'Parallel to X axis' },
  { value: 'y' as LineDirection, label: 'Y', tooltip: 'Parallel to Y axis (vertical)' },
  { value: 'z' as LineDirection, label: 'Z', tooltip: 'Parallel to Z axis' },
  { value: 'xy' as LineDirection, label: 'XY', tooltip: 'In XY plane' },
  { value: 'xz' as LineDirection, label: 'XZ', tooltip: 'In XZ plane (horizontal)' },
  { value: 'yz' as LineDirection, label: 'YZ', tooltip: 'In YZ plane' }
]

// RENAME_TO: LineEditor (handles both creation and editing)
interface LineCreationToolProps {
  selectedPoints: WorldPoint[]
  allWorldPoints: WorldPoint[]
  existingLines: Map<string, Line>
  onCreateLine: (pointA: WorldPoint, pointB: WorldPoint, constraints?: LineConstraints) => void
  onCancel: () => void
  onConstructionPreviewChange?: (preview: {
    type: 'line'
    pointA?: WorldPoint
    pointB?: WorldPoint
    showToCursor?: boolean
  } | null) => void
  isActive: boolean
  showHeader?: boolean
  showActionButtons?: boolean
  editMode?: boolean
  existingLine?: Line
  existingConstraints?: unknown[]
  onUpdateLine?: (lineEntity: Line, updatedLine: Partial<LineConstraints & { name: string; color: string; isConstruction: boolean }>) => void
  onDeleteLine?: (line: Line) => void
}

import { LineDirection } from '../../entities/line'

interface LineConstraints {
  name?: string
  color?: string
  isConstruction?: boolean
  direction?: LineDirection
  targetLength?: number
  tolerance?: number
}

// Helper component for point slot selection
interface PointSlotSelectorProps {
  label: string
  selectedPoint: WorldPoint | null
  allPoints: WorldPoint[]
  disabledPoint?: WorldPoint | null
  onPointChange: (point: WorldPoint | null) => void
  onFocus: () => void
  onClear: () => void
}

const PointSlotSelector: React.FC<PointSlotSelectorProps> = ({
  label,
  selectedPoint,
  allPoints,
  disabledPoint,
  onPointChange,
  onFocus,
  onClear
}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
    <label style={{minWidth: '50px', fontSize: '12px'}}>{label}</label>
    <div style={{display: 'flex', alignItems: 'center', gap: '4px', flex: 1}}>
      <select
        value={selectedPoint ? allPoints.indexOf(selectedPoint) : -1}
        onChange={(e) => {
          const index = parseInt(e.target.value)
          onPointChange(index >= 0 ? allPoints[index] : null)
        }}
        onFocus={onFocus}
        className="form-input"
        style={{flex: 1, fontSize: '12px', height: '24px'}}
      >
        <option value={-1}>Select point...</option>
        {allPoints.map((point, index) => (
          <option key={getEntityKey(point)} value={index} disabled={point === disabledPoint}>
            {point.getName()}
          </option>
        ))}
      </select>
      {selectedPoint && (
        <button
          onClick={onClear}
          className="field-clear-btn"
          title={`Clear ${label.toLowerCase()}`}
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      )}
    </div>
  </div>
)

// Helper component for direction button
interface DirectionButtonProps {
  option: { value: LineDirection; label: string; tooltip: string }
  isActive: boolean
  onClick: () => void
}

const DirectionButton: React.FC<DirectionButtonProps> = ({ option, isActive, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title={option.tooltip}
    style={{
      flex: '1 1 auto',
      minWidth: '40px',
      padding: '4px 6px',
      fontSize: '11px',
      border: `1px solid ${isActive ? 'var(--accent, #0696d7)' : 'var(--border, #555)'}`,
      background: isActive ? 'var(--accent, #0696d7)' : 'var(--bg-input, #2a2a2a)',
      color: isActive ? '#fff' : 'var(--text, #fff)',
      borderRadius: '3px',
      cursor: 'pointer',
      fontWeight: isActive ? '600' : '400',
      transition: 'all 0.15s ease'
    }}
    onMouseEnter={(e) => {
      if (!isActive) {
        e.currentTarget.style.borderColor = 'var(--accent, #0696d7)'
      }
    }}
    onMouseLeave={(e) => {
      if (!isActive) {
        e.currentTarget.style.borderColor = 'var(--border, #555)'
      }
    }}
  >
    {option.label}
  </button>
)

// RENAME_TO: LineEditor
export const LineCreationTool: React.FC<LineCreationToolProps> = observer(({
  selectedPoints,
  allWorldPoints,
  existingLines,
  onCreateLine,
  onCancel,
  onConstructionPreviewChange,
  isActive,
  showHeader = true,
  showActionButtons = true,
  editMode = false,
  existingLine,
  existingConstraints = [],
  onUpdateLine,
  onDeleteLine
}) => {
  const { confirm, dialog } = useConfirm()

  // Point slots state
  const [pointSlot1, setPointSlot1] = useState<WorldPoint | null>(null)
  const [pointSlot2, setPointSlot2] = useState<WorldPoint | null>(null)

  // Line constraint settings
  const [direction, setDirection] = useState<LineDirection>('free')
  const [lengthValue, setLengthValue] = useState<string>('')

  // Line properties (for both creation and editing)
  const [lineName, setLineName] = useState<string>('')
  const [lineColor, setLineColor] = useState<string>('#0696d7')
  const [isConstruction, setIsConstruction] = useState<boolean>(false)

  // Track which slot is currently active for highlighting
  const [activeSlot, setActiveSlot] = useState<1 | 2 | null>(null)

  // Track previous isActive state to detect when tool becomes active
  // Initialize to false so first activation is detected
  const prevIsActiveRef = useRef(false)

  // Pre-populate form when in edit mode
  // IMPORTANT: Only run this on initial mount in edit mode to prevent reverting changes
  useEffect(() => {
    if (editMode && existingLine) {
      setPointSlot1(existingLine.pointA)
      setPointSlot2(existingLine.pointB)
      setLineName(existingLine.name || '')
      setLineColor(existingLine.color || '#0696d7')
      setIsConstruction(existingLine.isConstruction || false)

      // Load direction and targetLength from line properties
      setDirection(existingLine.direction || 'free')

      if (existingLine.targetLength !== undefined) {
        setLengthValue(existingLine.targetLength.toString())
      } else {
        setLengthValue('')
      }
    }
  }, [editMode]) // Only depend on editMode to run once when entering edit mode

  // Pre-populate slots from selection when tool opens
  // Reset slots when tool closes, pre-populate when it opens
  useEffect(() => {
    const wasActive = prevIsActiveRef.current
    const isNowActive = isActive

    // Tool just became active (opened)
    if (!wasActive && isNowActive && !editMode) {
      if (selectedPoints.length > 0) {
        setPointSlot1(selectedPoints[0] || null)
        setPointSlot2(selectedPoints[1] || null)
      }
    }

    // Tool just became inactive (closed) - reset slots and ref
    if (wasActive && !isNowActive) {
      setPointSlot1(null)
      setPointSlot2(null)
    }

    // Always update ref to track current state
    prevIsActiveRef.current = isActive
  }, [isActive, selectedPoints, editMode, pointSlot1, pointSlot2])

  // Handle point clicks to fill slots while tool is active
  useEffect(() => {
    if (!isActive) return

    const handleGlobalPointClick = (event: CustomEvent<{ worldPoint: WorldPoint }>) => {
      const point = event.detail.worldPoint

      if (point === pointSlot1 || point === pointSlot2) {
        return
      }

      if (!pointSlot1) {
        setPointSlot1(point)
        setActiveSlot(2)
      } else if (!pointSlot2) {
        setPointSlot2(point)
        setActiveSlot(null)
      } else {
        setPointSlot1(point)
        setPointSlot2(null)
        setActiveSlot(2)
      }
    }

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

  // Listen for external save trigger (from FloatingWindow OK button)
  useEffect(() => {
    if (!isActive) return

    const handleExternalSave = () => {
      handleCreateLine()
    }

    const handleExternalDelete = () => {
      handleDeleteLine()
    }

    window.addEventListener('lineToolSave', handleExternalSave)
    window.addEventListener('lineToolDelete', handleExternalDelete)
    return () => {
      window.removeEventListener('lineToolSave', handleExternalSave)
      window.removeEventListener('lineToolDelete', handleExternalDelete)
    }
  }, [isActive, pointSlot1, pointSlot2, lineName, lineColor, isConstruction, direction, lengthValue, editMode, existingLine, onUpdateLine, onCreateLine, onCancel, existingLines, onDeleteLine, confirm])

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
    setPointSlot1(null)
    setActiveSlot(1) // First slot becomes active
  }

  const clearSlot2 = () => {
    setPointSlot2(null)
    setActiveSlot(2) // Second slot becomes active
  }

  // Set active slot when user clicks on dropdown
  const handleSlot1Focus = () => setActiveSlot(1)
  const handleSlot2Focus = () => setActiveSlot(2)

  // Check if a line already exists between two points
  const lineAlreadyExists = useCallback((pointA: WorldPoint | null, pointB: WorldPoint | null): { exists: boolean, lineName?: string } => {
    if (!pointA || !pointB) return { exists: false }

    const foundLine = Array.from(existingLines.values()).find(line =>
      line !== existingLine &&
      ((line.pointA === pointA && line.pointB === pointB) ||
       (line.pointA === pointB && line.pointB === pointA))
    )

    return {
      exists: !!foundLine,
      lineName: foundLine?.name
    }
  }, [existingLines, existingLine])

  const lineCheck = lineAlreadyExists(pointSlot1, pointSlot2)
  const canCreateLine = pointSlot1 && pointSlot2 && pointSlot1 !== pointSlot2 && !lineCheck.exists

  const handleCreateLine = () => {
    if (editMode) {
      // Edit mode
      if (onUpdateLine && existingLine) {
        const length = parseFloat(lengthValue)
        const targetLength = lengthValue.trim() !== '' && !isNaN(length) && length > 0 ? length : undefined

        const updates = {
          name: lineName,
          color: lineColor,
          isConstruction: isConstruction,
          direction: direction,
          targetLength: targetLength,
          tolerance: 0.001
        }

        onUpdateLine(existingLine, updates)
        onCancel()
      }
    } else {
      // Creation mode
      if (!canCreateLine) {
        return
      }

      const length = parseFloat(lengthValue)
      const targetLength = lengthValue.trim() !== '' && !isNaN(length) && length > 0 ? length : undefined

      const constraints: LineConstraints = {
        name: lineName,
        color: lineColor,
        isConstruction: isConstruction,
        direction: direction,
        targetLength: targetLength,
        tolerance: 0.001
      }

      if (!pointSlot1 || !pointSlot2) return

      onCreateLine(pointSlot1, pointSlot2, constraints)
      onCancel() // Close the tool after creation
    }
  }

  const handleDeleteLine = async () => {
    if (editMode && existingLine && onDeleteLine) {
      if (await confirm(`Are you sure you want to delete line "${existingLine.name}"?\n\nThis action cannot be undone.`)) {
        onDeleteLine(existingLine)
        onCancel()
      }
    }
  }

  if (!isActive) return null

  return (
    <>
      {dialog}
      {showHeader && (
        <div className="tool-header">
          <h4>{editMode ? `Edit Line: ${existingLine?.name || 'Line'}` : 'Line Creation'}</h4>
          <button
            className="btn-cancel"
            onClick={onCancel}
            title={editMode ? "Cancel edit (Esc)" : "Cancel line creation (Esc)"}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      )}

      <div style={{padding: '6px'}}>
        {/* Line Properties */}
        <div style={{marginBottom: '8px'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px'}}>
            <label style={{minWidth: '50px', fontSize: '12px'}}>Name</label>
            <input
              type="text"
              value={lineName}
              onChange={(e) => setLineName(e.target.value)}
              placeholder="Enter line name"
              className="form-input"
              style={{flex: 1, fontSize: '12px', height: '24px'}}
              maxLength={20}
            />
          </div>

          <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px'}}>
            <label style={{minWidth: '50px', fontSize: '12px'}}>Color</label>
            <select
              value={lineColor}
              onChange={(e) => setLineColor(e.target.value)}
              className="form-input"
              style={{flex: 1, fontSize: '12px', height: '24px'}}
            >
              {PRESET_COLORS.map(color => (
                <option
                  key={color.value}
                  value={color.value}
                  style={{
                    backgroundColor: color.value,
                    color: color.value === '#34495e' || color.value === '#95a5a6' ? '#ffffff' : '#000000'
                  }}
                >
                  ● {color.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{display: 'flex', gap: '12px', marginBottom: '6px'}}>
            <label style={{display: 'flex', alignItems: 'center', fontSize: '12px'}}>
              <input
                type="checkbox"
                checked={isConstruction}
                onChange={(e) => setIsConstruction(e.target.checked)}
                style={{marginRight: '4px'}}
              />
              Construction
            </label>
          </div>
        </div>

        {/* Point Selection */}
        <div style={{display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px'}}>
          <PointSlotSelector
            label="Point 1"
            selectedPoint={pointSlot1}
            allPoints={allWorldPoints}
            onPointChange={setPointSlot1}
            onFocus={handleSlot1Focus}
            onClear={clearSlot1}
          />

          <PointSlotSelector
            label="Point 2"
            selectedPoint={pointSlot2}
            allPoints={allWorldPoints}
            disabledPoint={pointSlot1}
            onPointChange={setPointSlot2}
            onFocus={handleSlot2Focus}
            onClear={clearSlot2}
          />
        </div>


        {/* Line Constraints */}
        <div style={{marginTop: '8px'}}>
          <h5 style={{margin: '0 0 6px 0', fontSize: '12px', fontWeight: 'bold'}}>Constraints</h5>

          <div style={{marginBottom: '8px'}}>
            <label style={{fontSize: '12px', fontWeight: '500', display: 'block', marginBottom: '4px'}}>Direction</label>
            <div style={{display: 'flex', gap: '4px', flexWrap: 'wrap'}}>
              {DIRECTION_OPTIONS.map(option => (
                <DirectionButton
                  key={option.value}
                  option={option}
                  isActive={direction === option.value}
                  onClick={() => setDirection(option.value)}
                />
              ))}
            </div>
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
                className="form-input"
                style={{width: '80px', fontSize: '12px', height: '24px'}}
              />
              <span style={{fontSize: '12px'}}>m</span>
              {lengthValue && (
                <button
                  onClick={() => setLengthValue('')}
                  className="field-clear-btn"
                  title="Clear length constraint"
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              )}
            </div>
          </div>
        </div>


        {/* Duplicate Line Warning */}
        {lineCheck.exists && pointSlot1 && pointSlot2 && (
          <div style={{
            marginTop: '8px',
            padding: '4px 8px',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffeaa7',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#856404'
          }}>
            <FontAwesomeIcon icon={faTriangleExclamation} /> Line "{lineCheck.lineName}" already exists between these points
          </div>
        )}

        {/* Action Buttons */}
        {showActionButtons && (
          <div style={{display: 'flex', gap: '8px', marginTop: '8px'}}>
            <button
              onClick={onCancel}
              style={{flex: 1, padding: '4px 8px', fontSize: '12px'}}
            >
              Cancel
            </button>
            <button
              onClick={handleCreateLine}
              disabled={!editMode && !canCreateLine}
              style={{flex: 1, padding: '4px 8px', fontSize: '12px'}}
              title={!editMode && !canCreateLine && lineCheck.exists ? `Line already exists: ${lineCheck.lineName}` : ''}
            >
              {editMode ? 'Update' : 'Create'}
            </button>
          </div>
        )}
      </div>

    </>
  )
})

export default LineCreationTool