import React from 'react'

interface OptimizationSettingsType {
  maxIterations: number
  tolerance: number
  damping: number
  verbose: boolean
}

interface OptimizationSettingsProps {
  settings: OptimizationSettingsType
  onSettingChange: (key: string, value: any) => void
  onResetToDefaults: () => void
}

export const OptimizationSettings: React.FC<OptimizationSettingsProps> = ({
  settings,
  onSettingChange,
  onResetToDefaults
}) => {
  return (
    <div className="optimization-settings">
      <h4>Advanced Settings</h4>
      <div className="setting-row">
        <label>
          <span>Max Iterations:</span>
          <input
            type="number"
            min="1"
            max="1000"
            value={settings.maxIterations}
            onChange={(e) => onSettingChange('maxIterations', parseInt(e.target.value))}
          />
        </label>
      </div>
      <div className="setting-row">
        <label>
          <span>Tolerance:</span>
          <input
            type="number"
            step="1e-9"
            min="1e-12"
            max="1e-3"
            value={settings.tolerance}
            onChange={(e) => onSettingChange('tolerance', parseFloat(e.target.value))}
          />
        </label>
      </div>
      <div className="setting-row">
        <label>
          <span>Damping Factor:</span>
          <input
            type="number"
            step="0.01"
            min="0.001"
            max="1"
            value={settings.damping}
            onChange={(e) => onSettingChange('damping', parseFloat(e.target.value))}
          />
        </label>
      </div>
      <div className="setting-row">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.verbose}
            onChange={(e) => onSettingChange('verbose', e.target.checked)}
          />
          <span>Verbose Output</span>
        </label>
      </div>
      <div className="settings-actions">
        <button className="btn-reset" onClick={onResetToDefaults}>
          Reset to Defaults
        </button>
      </div>
    </div>
  )
}
