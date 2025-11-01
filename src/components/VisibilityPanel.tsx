import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEye, faEyeSlash, faLock, faLockOpen, faChevronUp, faChevronDown, faXmark } from '@fortawesome/free-solid-svg-icons'
import { ViewSettings, VisibilitySettings, LockSettings } from '../types/visibility'
import { observer } from 'mobx-react-lite'

interface VisibilityPanelProps {
  viewSettings: ViewSettings
  onVisibilityChange: (key: keyof VisibilitySettings, value: boolean) => void
  onLockingChange: (key: keyof LockSettings, value: boolean) => void
}

export const VisibilityPanel: React.FC<VisibilityPanelProps> = observer(({
  viewSettings,
  onVisibilityChange,
  onLockingChange
}) => {
  const isExpanded = viewSettings.isExpanded ?? false

  const toggleExpanded = () => {
    viewSettings.isExpanded = !isExpanded
  }

  const visibilityOptions: Array<{
    key: keyof VisibilitySettings
    label: string
    supportsLocking: boolean
  }> = [
    { key: 'worldPoints', label: 'World Points', supportsLocking: true },
    { key: 'lines', label: 'Lines', supportsLocking: true },
    { key: 'planes', label: 'Planes', supportsLocking: true },
    { key: 'vanishingLines', label: 'Vanishing Lines', supportsLocking: true },
    { key: 'vanishingPoints', label: 'Vanishing Points', supportsLocking: false },
    { key: 'perspectiveGrid', label: 'Perspective Grid', supportsLocking: false },
    { key: 'reprojectionErrors', label: 'Reprojection Errors', supportsLocking: false },
    { key: 'cameraVanishingGeometry', label: 'Camera VPs & Horizon', supportsLocking: false }
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
            <span>Visibility & Locking Controls</span>
            <button
              className="visibility-panel__close"
              onClick={toggleExpanded}
              title="Close visibility panel"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
          <div className="visibility-panel__options">
            {visibilityOptions.map(option => {
              const isVisible = viewSettings.visibility[option.key]
              const isLocked = option.supportsLocking
                ? viewSettings.locking[option.key as keyof LockSettings]
                : false

              return (
                <div key={option.key} className="visibility-panel__option">
                  <span className="visibility-panel__label">{option.label}</span>
                  <div className="visibility-panel__controls">
                    <button
                      className={`visibility-panel__icon-toggle ${isVisible ? 'active' : ''}`}
                      onClick={() => onVisibilityChange(option.key, !isVisible)}
                      title={isVisible ? 'Hide' : 'Show'}
                    >
                      <FontAwesomeIcon icon={isVisible ? faEye : faEyeSlash} />
                    </button>

                    {option.supportsLocking && (
                      <button
                        className={`visibility-panel__icon-toggle ${isLocked ? 'active' : ''} ${!isVisible ? 'disabled' : ''}`}
                        onClick={() => !isVisible ? null : onLockingChange(option.key as keyof LockSettings, !isLocked)}
                        disabled={!isVisible}
                        title={!isVisible ? 'Auto-locked (hidden)' : isLocked ? 'Unlock' : 'Lock'}
                      >
                        <FontAwesomeIcon icon={isLocked || !isVisible ? faLock : faLockOpen} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
})
