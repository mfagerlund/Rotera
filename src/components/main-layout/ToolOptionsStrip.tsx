// Tool options strip - shows in header when tools with options are active

import React from 'react'
import { observer } from 'mobx-react-lite'
import { ActiveTool } from '../../hooks/useMainLayoutState'
import { LineDirection } from '../../entities/line'

interface ToolOptionsStripProps {
  activeTool: ActiveTool
  // Vanishing line options
  currentVanishingLineAxis: 'x' | 'y' | 'z'
  onVanishingLineAxisChange: (axis: 'x' | 'y' | 'z') => void
  // Orientation paint options
  selectedDirection: LineDirection
  onDirectionChange: (direction: LineDirection) => void
}

const AXIS_COLORS = {
  x: '#ff4444',
  y: '#44ff44',
  z: '#4488ff'
}

const DIRECTION_OPTIONS: { value: LineDirection; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'x', label: 'X' },
  { value: 'y', label: 'Y' },
  { value: 'z', label: 'Z' },
  { value: 'xy', label: 'XY' },
  { value: 'xz', label: 'XZ' },
  { value: 'yz', label: 'YZ' }
]

export const ToolOptionsStrip: React.FC<ToolOptionsStripProps> = observer(({
  activeTool,
  currentVanishingLineAxis,
  onVanishingLineAxisChange,
  selectedDirection,
  onDirectionChange
}) => {
  // Only show for tools with options
  if (activeTool !== 'vanishing' && activeTool !== 'orientationPaint') {
    return null
  }

  return (
    <div className="tool-options-strip">
      {activeTool === 'vanishing' && (
        <>
          <span className="tool-label">Vanishing Line Axis:</span>
          <div className="axis-buttons">
            {(['x', 'y', 'z'] as const).map(axis => (
              <button
                key={axis}
                className={`axis-btn ${currentVanishingLineAxis === axis ? 'active' : ''}`}
                style={{
                  backgroundColor: currentVanishingLineAxis === axis ? AXIS_COLORS[axis] : 'transparent',
                  borderColor: AXIS_COLORS[axis],
                  color: currentVanishingLineAxis === axis ? '#fff' : AXIS_COLORS[axis]
                }}
                onClick={() => onVanishingLineAxisChange(axis)}
              >
                {axis.toUpperCase()}
              </button>
            ))}
          </div>
          <span className="tool-hint">Click two points on image to draw line</span>
        </>
      )}

      {activeTool === 'orientationPaint' && (
        <>
          <span className="tool-label">Paint Direction:</span>
          <div className="direction-buttons">
            {DIRECTION_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`direction-btn ${selectedDirection === opt.value ? 'active' : ''}`}
                onClick={() => onDirectionChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="tool-hint">Click lines to apply</span>
        </>
      )}
    </div>
  )
})
