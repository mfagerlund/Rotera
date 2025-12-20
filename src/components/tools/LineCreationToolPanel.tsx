import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTriangleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons'
import { WorldPoint } from '../../entities/world-point'
import { LineDirection } from '../../entities/line'
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

interface LineCreationToolPanelProps {
  // Line properties
  lineName: string
  lineColor: string
  isConstruction: boolean
  onLineNameChange: (name: string) => void
  onLineColorChange: (color: string) => void
  onIsConstructionChange: (isConstruction: boolean) => void

  // Point selection
  pointSlot1: WorldPoint | null
  pointSlot2: WorldPoint | null
  allWorldPoints: WorldPoint[]
  onPointSlot1Change: (point: WorldPoint | null) => void
  onPointSlot2Change: (point: WorldPoint | null) => void
  onSlot1Focus: () => void
  onSlot2Focus: () => void
  onClearSlot1: () => void
  onClearSlot2: () => void

  // Constraints
  direction: LineDirection
  lengthValue: string
  onDirectionChange: (direction: LineDirection) => void
  onLengthValueChange: (value: string) => void

  // Validation
  lineCheck: { exists: boolean, lineName?: string }

  // Actions
  editMode: boolean
  canCreateLine: boolean
  showActionButtons: boolean
  onCancel: () => void
  onCreateLine: () => void
}

export const LineCreationToolPanel: React.FC<LineCreationToolPanelProps> = ({
  lineName,
  lineColor,
  isConstruction,
  onLineNameChange,
  onLineColorChange,
  onIsConstructionChange,
  pointSlot1,
  pointSlot2,
  allWorldPoints,
  onPointSlot1Change,
  onPointSlot2Change,
  onSlot1Focus,
  onSlot2Focus,
  onClearSlot1,
  onClearSlot2,
  direction,
  lengthValue,
  onDirectionChange,
  onLengthValueChange,
  lineCheck,
  editMode,
  canCreateLine,
  showActionButtons,
  onCancel,
  onCreateLine
}) => {
  return (
    <div style={{padding: '6px'}}>
      {/* Line Properties */}
      <div style={{marginBottom: '8px'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px'}}>
          <label style={{minWidth: '50px', fontSize: '12px'}}>Name</label>
          <input
            type="text"
            value={lineName}
            onChange={(e) => onLineNameChange(e.target.value)}
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
            onChange={(e) => onLineColorChange(e.target.value)}
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
              onChange={(e) => onIsConstructionChange(e.target.checked)}
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
          onPointChange={onPointSlot1Change}
          onFocus={onSlot1Focus}
          onClear={onClearSlot1}
        />

        <PointSlotSelector
          label="Point 2"
          selectedPoint={pointSlot2}
          allPoints={allWorldPoints}
          disabledPoint={pointSlot1}
          onPointChange={onPointSlot2Change}
          onFocus={onSlot2Focus}
          onClear={onClearSlot2}
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
                onClick={() => onDirectionChange(option.value)}
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
              onChange={(e) => onLengthValueChange(e.target.value)}
              step="0.1"
              min="0.001"
              placeholder="Optional"
              className="form-input"
              style={{width: '80px', fontSize: '12px', height: '24px'}}
            />
            <span style={{fontSize: '12px'}}>m</span>
            {lengthValue && (
              <button
                onClick={() => onLengthValueChange('')}
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
            onClick={onCreateLine}
            disabled={!editMode && !canCreateLine}
            style={{flex: 1, padding: '4px 8px', fontSize: '12px'}}
            title={!editMode && !canCreateLine && lineCheck.exists ? `Line already exists: ${lineCheck.lineName}` : ''}
          >
            {editMode ? 'Update' : 'Create'}
          </button>
        </div>
      )}
    </div>
  )
}
