// Orientation Paint Tool - Click lines to apply a selected orientation
import React, { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { Line, LineDirection } from '../../entities/line'

interface OrientationPaintToolProps {
  isActive: boolean
  onCancel: () => void
  onPaintLine: (line: Line, direction: LineDirection) => void
  selectedDirection: LineDirection
  onDirectionChange: (direction: LineDirection) => void
}

export const OrientationPaintTool: React.FC<OrientationPaintToolProps> = observer(({
  isActive,
  onCancel,
  onPaintLine,
  selectedDirection,
  onDirectionChange
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
    <div className="orientation-paint-tool" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div className="orientation-buttons compact" style={{ margin: 0 }}>
        {directionOptions.map(option => (
          <button
            key={option.value}
            className={`orientation-btn ${selectedDirection === option.value ? 'active' : ''}`}
            onClick={() => onDirectionChange(option.value)}
            title={option.tooltip}
          >
            {option.label}
          </button>
        ))}
      </div>
      <button className="btn-cancel" onClick={onCancel} title="Cancel (Esc)">X</button>
    </div>
  )
})

export default OrientationPaintTool
