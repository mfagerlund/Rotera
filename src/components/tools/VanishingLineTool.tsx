// Vanishing Line Tool - Draw vanishing lines for camera initialization
import React, { useEffect } from 'react'
import { observer } from 'mobx-react-lite'

interface VanishingLineToolProps {
  isActive: boolean
  onCancel: () => void
  selectedAxis: 'x' | 'y' | 'z'
  onAxisChange: (axis: 'x' | 'y' | 'z') => void
  onShowGuide: () => void
}

const AXIS_COLORS = {
  x: '#ff0000',
  y: '#00ff00',
  z: '#0000ff'
}

export const VanishingLineTool: React.FC<VanishingLineToolProps> = observer(({
  isActive,
  onCancel,
  selectedAxis,
  onAxisChange,
  onShowGuide
}) => {

  useEffect(() => {
    if (!isActive) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, onCancel])

  if (!isActive) return null

  const axisOptions: { value: 'x' | 'y' | 'z'; label: string; tooltip: string }[] = [
    { value: 'x', label: 'X', tooltip: 'Lines parallel to X axis (red)' },
    { value: 'y', label: 'Y', tooltip: 'Lines parallel to Y axis (green/vertical)' },
    { value: 'z', label: 'Z', tooltip: 'Lines parallel to Z axis (blue)' }
  ]

  return (
    <div className="vanishing-line-tool-popup">
      <div style={{ marginBottom: '8px', fontSize: '12px', color: '#aaa' }}>
        Click two points to draw a vanishing line
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>Axis:</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {axisOptions.map(option => (
            <button
              key={option.value}
              className={`axis-btn ${selectedAxis === option.value ? 'active' : ''}`}
              style={{
                backgroundColor: selectedAxis === option.value ? '#333' : '#1a1a1a',
                border: selectedAxis === option.value ? `2px solid ${AXIS_COLORS[option.value]}` : '1px solid #555',
                padding: '6px 12px',
                cursor: 'pointer',
                borderRadius: '3px',
                minWidth: '36px'
              }}
              onClick={() => onAxisChange(option.value)}
              title={option.tooltip}
            >
              <span style={{ color: AXIS_COLORS[option.value], fontSize: '14px', fontWeight: 'bold' }}>
                {option.label}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          title="Show right-hand rule guide"
          onClick={onShowGuide}
          style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #555',
            borderRadius: '4px',
            width: '28px',
            height: '28px',
            color: '#fff',
            fontWeight: 'bold',
            cursor: 'pointer',
            marginLeft: '4px'
          }}
        >
          ?
        </button>
      </div>
    </div>
  )
})

export default VanishingLineTool
