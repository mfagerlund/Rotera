// Orientation Paint Tool - Click lines to apply a selected orientation
import React, { useState, useEffect, useCallback } from 'react'
import { observer } from 'mobx-react-lite'
import { Line, LineDirection } from '../../entities/line'

interface OrientationPaintToolProps {
  isActive: boolean
  onCancel: () => void
  onPaintLine: (line: Line, direction: LineDirection) => void
}

export const OrientationPaintTool: React.FC<OrientationPaintToolProps> = observer(({
  isActive,
  onCancel,
  onPaintLine
}) => {
  const [selectedDirection, setSelectedDirection] = useState<LineDirection>('free')

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

  useEffect(() => {
    if (!isActive) return

    const handleLinePaint = (event: CustomEvent<{ line: Line }>) => {
      onPaintLine(event.detail.line, selectedDirection)
    }

    window.addEventListener('orientationPaintLineClick', handleLinePaint as EventListener)
    return () => window.removeEventListener('orientationPaintLineClick', handleLinePaint as EventListener)
  }, [isActive, selectedDirection, onPaintLine])

  if (!isActive) return null

  const directionOptions: { value: LineDirection; label: string; tooltip: string }[] = [
    { value: 'free', label: 'Free', tooltip: 'No constraint' },
    { value: 'x', label: 'X', tooltip: 'Parallel to X axis' },
    { value: 'y', label: 'Y', tooltip: 'Parallel to Y axis (vertical)' },
    { value: 'z', label: 'Z', tooltip: 'Parallel to Z axis' },
    { value: 'xy', label: 'XY', tooltip: 'In XY plane' },
    { value: 'xz', label: 'XZ', tooltip: 'In XZ plane (horizontal)' },
    { value: 'yz', label: 'YZ', tooltip: 'In YZ plane' }
  ]

  return (
    <div className="orientation-paint-tool">
      <div className="tool-header">
        <h4>Paint Orientation</h4>
        <button className="btn-cancel" onClick={onCancel}>X</button>
      </div>
      <div className="tool-message">
        Click lines to apply the selected orientation
      </div>
      <div style={{ margin: '10px 0' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '12px' }}>Direction:</label>
        <div className="orientation-buttons compact">
          {directionOptions.map(option => (
            <button
              key={option.value}
              className={`orientation-btn ${selectedDirection === option.value ? 'active' : ''}`}
              onClick={() => setSelectedDirection(option.value)}
              title={option.tooltip}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="tool-help">
        <div className="help-text">
          Press Esc to cancel
        </div>
      </div>
    </div>
  )
})

export default OrientationPaintTool
