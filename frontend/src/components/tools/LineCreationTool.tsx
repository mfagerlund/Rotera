// Line Creation Tool with slot-based selection

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRight, faBullseye, faMagnifyingGlass, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import { useConfirm } from '../ConfirmDialog'

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

interface LineCreationToolProps {
  selectedPoints: string[]
  worldPointNames: Record<string, string> // Map of pointId -> pointName
  existingLines: Record<string, any> // Existing lines for duplicate checking
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
  showActionButtons?: boolean // Whether to show internal action buttons (false when using FloatingWindow's buttons)
  // Edit mode props
  editMode?: boolean
  existingLine?: any // Line being edited
  existingConstraints?: any[] // Constraints applied to this line
  onUpdateLine?: (updatedLine: any) => void
  onDeleteLine?: (lineId: string) => void
}

import { LineDirection, LineConstraintSettings } from '../../entities/line'

interface LineConstraints {
  name?: string
  color?: string
  isVisible?: boolean
  isConstruction?: boolean
  constraints?: LineConstraintSettings
}

export const LineCreationTool: React.FC<LineCreationToolProps> = ({
  selectedPoints,
  worldPointNames,
  existingLines,
  onCreateLine,
  onCancel,
  onPointSlotClick,
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
  const [pointSlot1, setPointSlot1] = useState<string>('')
  const [pointSlot2, setPointSlot2] = useState<string>('')

  // Line constraint settings
  const [direction, setDirection] = useState<LineDirection>('free')
  const [lengthValue, setLengthValue] = useState<string>('')

  // Line properties (for both creation and editing)
  const [lineName, setLineName] = useState<string>('')
  const [lineColor, setLineColor] = useState<string>('#0696d7')
  const [isVisible, setIsVisible] = useState<boolean>(true)
  const [isConstruction, setIsConstruction] = useState<boolean>(false)

  // Track which slot is currently active for highlighting
  const [activeSlot, setActiveSlot] = useState<1 | 2 | null>(null)

  // Track previous isActive state to detect when tool becomes active
  // Initialize to false so first activation is detected
  const prevIsActiveRef = useRef(false)

  console.log('[LineCreationTool] Component rendered. isActive:', isActive, 'editMode:', editMode)

  // Pre-populate form when in edit mode
  // IMPORTANT: Only run this on initial mount in edit mode to prevent reverting changes
  useEffect(() => {
    if (editMode && existingLine) {
      setPointSlot1(existingLine.pointA || '')
      setPointSlot2(existingLine.pointB || '')
      setLineName(existingLine.name || '')
      setLineColor(existingLine.color || '#0696d7')
      setIsVisible(existingLine.isVisible !== false)
      setIsConstruction(existingLine.isConstruction || false)

      // Load constraint settings from line properties
      if (existingLine.constraints) {
        const loadedDirection = existingLine.constraints.direction || 'free'
        setDirection(loadedDirection)

        if (existingLine.constraints.targetLength !== undefined) {
          setLengthValue(existingLine.constraints.targetLength.toString())
        } else {
          setLengthValue('')
        }
      } else {
        // Fallback to legacy behavior - load from separate constraints
        const directionConstraint = existingConstraints.find(c => c.type === 'line_axis_aligned')

        if (directionConstraint) {
          const constraintDirection = directionConstraint.parameters?.direction

          if (constraintDirection === 'vertical') {
            setDirection('vertical')
          } else if (constraintDirection === 'horizontal') {
            setDirection('horizontal')
          } else {
            setDirection('horizontal')
          }
        } else {
          setDirection('free')
        }

        setLengthValue('')
      }
    }
  }, [editMode]) // Only depend on editMode to run once when entering edit mode

  // Pre-populate slots from selection when tool opens
  // Reset slots when tool closes, pre-populate when it opens
  useEffect(() => {
    const wasActive = prevIsActiveRef.current
    const isNowActive = isActive

    console.log('[LineCreationTool] Pre-populate effect running:', {
      wasActive,
      isNowActive,
      selectedPointsLength: selectedPoints.length,
      selectedPointsArray: selectedPoints,
      editMode,
      currentSlot1: pointSlot1,
      currentSlot2: pointSlot2
    })

    // Tool just became active (opened)
    if (!wasActive && isNowActive && !editMode) {
      if (selectedPoints.length > 0) {
        console.log('[LineCreationTool] ✓ Pre-populating slots:', selectedPoints)
        setPointSlot1(selectedPoints[0] || '')
        setPointSlot2(selectedPoints[1] || '')
      } else {
        console.log('[LineCreationTool] ✗ Not pre-populating - no points selected')
      }
    }

    // Tool just became inactive (closed) - reset slots and ref
    if (wasActive && !isNowActive) {
      console.log('[LineCreationTool] Clearing slots on deactivation')
      setPointSlot1('')
      setPointSlot2('')
    }

    // Always update ref to track current state
    prevIsActiveRef.current = isActive
  }, [isActive, selectedPoints, editMode, pointSlot1, pointSlot2])

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

  // Listen for external save trigger (from FloatingWindow OK button)
  useEffect(() => {
    if (!isActive) return

    const handleExternalSave = () => {
      handleCreateLine()
    }

    window.addEventListener('lineToolSave', handleExternalSave)
    return () => window.removeEventListener('lineToolSave', handleExternalSave)
  }, [isActive, pointSlot1, pointSlot2, lineName, lineColor, isVisible, isConstruction, direction, lengthValue, editMode, existingLine, onUpdateLine, onCreateLine, onCancel, existingLines])

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

  // Check if a line already exists between two points
  const lineAlreadyExists = useCallback((pointA: string, pointB: string): { exists: boolean, lineName?: string } => {
    if (!pointA || !pointB) return { exists: false }

    const foundLine = Object.values(existingLines || {}).find(line =>
      // Exclude the current line being edited
      line.id !== existingLine?.id &&
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
        // Build constraint settings
        const lineConstraintSettings: LineConstraintSettings = {
          direction,
          tolerance: 0.001
        }

        const length = parseFloat(lengthValue)
        if (lengthValue.trim() !== '' && !isNaN(length) && length > 0) {
          lineConstraintSettings.targetLength = length
        }

        const updatedLine = {
          ...existingLine,
          name: lineName,
          color: lineColor,
          isVisible: isVisible,
          isConstruction: isConstruction,
          constraints: lineConstraintSettings
        }

        onUpdateLine(updatedLine)
        onCancel()
      }
    } else {
      // Creation mode
      if (!canCreateLine) {
        return
      }

      // Build constraint settings
      const lineConstraintSettings: LineConstraintSettings = {
        direction,
        tolerance: 0.001
      }

      const length = parseFloat(lengthValue)
      if (lengthValue.trim() !== '' && !isNaN(length) && length > 0) {
        lineConstraintSettings.targetLength = length
      }

      const constraints: LineConstraints = {
        name: lineName,
        color: lineColor,
        isVisible: isVisible,
        isConstruction: isConstruction,
        constraints: lineConstraintSettings
      }

      onCreateLine([pointSlot1, pointSlot2], constraints)
      onCancel() // Close the tool after creation
    }
  }

  const handleDeleteLine = async () => {
    if (editMode && existingLine && onDeleteLine) {
      if (await confirm(`Are you sure you want to delete line "${existingLine.name}"?\n\nThis action cannot be undone.`)) {
        onDeleteLine(existingLine.id)
        onCancel()
      }
    }
  }

  // Get available world points for dropdowns
  const availablePoints = Object.entries(worldPointNames).map(([id, name]) => ({
    id,
    name: name || id
  }))

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
            ✕
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
              style={{flex: 1, fontSize: '12px', padding: '2px'}}
              maxLength={20}
            />
          </div>

          <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px'}}>
            <label style={{minWidth: '50px', fontSize: '12px'}}>Color</label>
            <select
              value={lineColor}
              onChange={(e) => setLineColor(e.target.value)}
              style={{flex: 1, fontSize: '12px', padding: '2px'}}
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
                checked={isVisible}
                onChange={(e) => setIsVisible(e.target.checked)}
                style={{marginRight: '4px'}}
              />
              Visible
            </label>
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

          <div style={{marginBottom: '8px'}}>
            <label style={{fontSize: '12px', fontWeight: '500', display: 'block', marginBottom: '4px'}}>Direction</label>
            <div style={{display: 'flex', gap: '4px', flexWrap: 'wrap'}}>
              {[
                { value: 'free', label: 'Free', setsValue: 'free', tooltip: undefined },
                { value: 'horizontal', label: '↔ Horiz', setsValue: 'horizontal', tooltip: undefined },
                { value: 'vertical', label: '↕ Vert', setsValue: 'vertical', tooltip: undefined },
                { value: 'x-aligned', label: 'X', setsValue: 'x-aligned', tooltip: undefined },
                { value: 'y-aligned', label: 'Y', setsValue: 'vertical', tooltip: 'Same as Vert' },
                { value: 'z-aligned', label: 'Z', setsValue: 'z-aligned', tooltip: undefined }
              ].map(option => {
                const isGrayed = option.value === 'y-aligned'
                const isActive = direction === option.setsValue

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDirection(option.setsValue as LineDirection)}
                    title={option.tooltip}
                    style={{
                      flex: '1 1 auto',
                      minWidth: '50px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      border: `1px solid ${isActive ? 'var(--accent, #0696d7)' : 'var(--border, #555)'}`,
                      background: isGrayed ? 'var(--bg-disabled, #1a1a1a)' : isActive ? 'var(--accent, #0696d7)' : 'var(--bg-input, #2a2a2a)',
                      color: isGrayed ? 'var(--text-disabled, #666)' : isActive ? '#fff' : 'var(--text, #fff)',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontWeight: isActive ? '600' : '400',
                      transition: 'all 0.15s ease',
                      opacity: isGrayed ? 0.6 : 1
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
              })}
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
                style={{width: '80px', fontSize: '12px', padding: '2px'}}
              />
              <span style={{fontSize: '12px'}}>m</span>
              {lengthValue && (
                <button
                  onClick={() => setLengthValue('')}
                  style={{padding: '2px 4px', fontSize: '10px'}}
                  title="Clear length constraint"
                >
                  ✕
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

        {/* Delete Button (Edit Mode Only) */}
        {editMode && onDeleteLine && (
          <div style={{marginTop: '8px', marginBottom: '8px'}}>
            <button
              onClick={handleDeleteLine}
              style={{
                width: '100%',
                padding: '4px 8px',
                fontSize: '12px',
                backgroundColor: '#d9534f',
                color: 'white',
                border: 'none',
                borderRadius: '3px'
              }}
            >
              Delete Line
            </button>
            <p style={{fontSize: '11px', color: '#856404', margin: '4px 0 0 0', textAlign: 'center'}}>
              This will permanently delete the line and cannot be undone.
            </p>
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
}

export default LineCreationTool