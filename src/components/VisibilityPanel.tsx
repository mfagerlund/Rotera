import React, { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEye, faChevronUp, faChevronDown } from '@fortawesome/free-solid-svg-icons'
import { VisibilitySettings } from '../types/visibility'

interface VisibilityPanelProps {
  visibility: VisibilitySettings
  onVisibilityChange: (key: keyof VisibilitySettings, value: boolean) => void
}

export const VisibilityPanel: React.FC<VisibilityPanelProps> = ({
  visibility,
  onVisibilityChange
}) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded)
  }

  const visibilityOptions: Array<{ key: keyof VisibilitySettings; label: string }> = [
    { key: 'worldPoints', label: 'World Points' },
    { key: 'lines', label: 'Lines' },
    { key: 'planes', label: 'Planes' },
    { key: 'vanishingLines', label: 'Vanishing Lines' },
    { key: 'vanishingPoints', label: 'Vanishing Points' },
    { key: 'perspectiveGrid', label: 'Perspective Grid' }
  ]

  return (
    <div className="visibility-panel">
      <button
        className="visibility-panel__toggle"
        onClick={toggleExpanded}
        title="Toggle visibility controls"
      >
        <FontAwesomeIcon icon={faEye} />
        <span>Visibility</span>
        <FontAwesomeIcon icon={isExpanded ? faChevronDown : faChevronUp} />
      </button>

      {isExpanded && (
        <div className="visibility-panel__content">
          <div className="visibility-panel__header">
            Visibility Controls
          </div>
          <div className="visibility-panel__options">
            {visibilityOptions.map(option => (
              <label
                key={option.key}
                className="visibility-panel__option"
              >
                <input
                  type="checkbox"
                  checked={visibility[option.key]}
                  onChange={(e) => onVisibilityChange(option.key, e.target.checked)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
