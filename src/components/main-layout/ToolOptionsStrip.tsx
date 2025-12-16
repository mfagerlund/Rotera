// Tool options strip - shows in header when tools with options are active

import React from 'react'
import { observer } from 'mobx-react-lite'
import { ActiveTool } from '../../hooks/useMainLayoutState'

interface ToolOptionsStripProps {
  activeTool: ActiveTool
  // Vanishing line options
  currentVanishingLineAxis: 'x' | 'y' | 'z'
  onVanishingLineAxisChange: (axis: 'x' | 'y' | 'z') => void
}

const AXIS_COLORS = {
  x: '#ff4444',
  y: '#44ff44',
  z: '#4488ff'
}

export const ToolOptionsStrip: React.FC<ToolOptionsStripProps> = observer(({
  activeTool,
  currentVanishingLineAxis,
  onVanishingLineAxisChange
}) => {
  // Only show for vanishing tool
  if (activeTool !== 'vanishing') {
    return null
  }

  return (
    <div className="tool-options-strip">
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
    </div>
  )
})
