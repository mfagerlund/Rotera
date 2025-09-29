// Creation Tools Manager - Handles all geometry creation tools

import React, { useState, useCallback } from 'react'
import LineCreationTool from './LineCreationTool'
import FloatingWindow from '../FloatingWindow'
import { LineConstraintSettings } from '../../entities/line'
import '../../styles/tools.css'

type ToolType = 'select' | 'point' | 'line' | 'plane' | 'circle'

interface LineConstraints {
  name?: string
  color?: string
  isVisible?: boolean
  isConstruction?: boolean
  constraints?: LineConstraintSettings
}

interface CreationToolsManagerProps {
  selectedPoints: string[]
  selectedLines: string[]
  selectedPlanes: string[]
  activeTool: ToolType
  onToolChange: (tool: ToolType) => void
  worldPointNames: Record<string, string>
  existingLines: Record<string, any> // Existing lines for duplicate checking
  onCreatePoint: (imageId: string, u: number, v: number) => void
  onCreateLine: (pointIds: [string, string], constraints?: LineConstraints) => void
  onCreatePlane: (definition: any) => void
  onCreateCircle: (definition: any) => void
  onConstructionPreviewChange?: (preview: {
    type: 'line'
    pointA?: string
    pointB?: string
    showToCursor?: boolean
  } | null) => void
  currentImageId?: string
}

export const CreationToolsManager: React.FC<CreationToolsManagerProps> = ({
  selectedPoints,
  selectedLines,
  selectedPlanes,
  activeTool,
  onToolChange,
  worldPointNames,
  existingLines,
  onCreatePoint,
  onCreateLine,
  onCreatePlane,
  onCreateCircle,
  onConstructionPreviewChange,
  currentImageId
}) => {
  const [toolMessage, setToolMessage] = useState<string>('')

  const handleToolActivation = useCallback((tool: ToolType) => {
    if (activeTool === tool) {
      // Deactivate if same tool clicked
      onToolChange('select')
      setToolMessage('')
    } else {
      onToolChange(tool)
      setToolMessage('')
    }
  }, [activeTool, onToolChange])

  const handleToolCancel = useCallback(() => {
    onToolChange('select')
    setToolMessage('')
  }, [onToolChange])

  const handleToolStateChange = useCallback((isActive: boolean, message?: string) => {
    if (message) {
      setToolMessage(message)
    }
  }, [])

  // Determine if tools should be enabled based on selection
  const canCreateLine = () => {
    return selectedPoints.length >= 0 && selectedPoints.length <= 2
  }

  const canCreatePlane = () => {
    // 3 points, 2 lines, or 1 line + 1 point
    return (
      selectedPoints.length === 3 ||
      selectedLines.length === 2 ||
      (selectedLines.length === 1 && selectedPoints.length === 1)
    )
  }

  const getLineButtonTooltip = () => {
    if (selectedPoints.length > 2) {
      return 'Select 0, 1, or 2 points to create line'
    }
    if (selectedPoints.length === 2) {
      return 'Create line between selected points'
    }
    if (selectedPoints.length === 1) {
      return 'Select second point for line'
    }
    return 'Select points for line creation'
  }

  const getPlaneButtonTooltip = () => {
    if (canCreatePlane()) {
      return 'Create plane from selection'
    }
    return 'Select 3 points, 2 lines, or 1 line + 1 point to create plane'
  }

  return (
    <div className="creation-tools-panel">
      <div className="tools-header">
        <h4>Creation Tools</h4>
        {toolMessage && (
          <div className="tool-status-message">
            {toolMessage}
          </div>
        )}
      </div>

      <div className="tool-buttons">
        <button
          className={`tool-button ${activeTool === 'point' ? 'active' : ''}`}
          onClick={() => handleToolActivation('point')}
          title="Create point in image view"
        >
          <span className="tool-icon">📍</span>
          <span className="tool-label">Point</span>
          <span className="tool-shortcut">W</span>
        </button>

        <button
          className={`tool-button ${activeTool === 'line' ? 'active' : ''} ${!canCreateLine() ? 'disabled' : ''}`}
          onClick={() => canCreateLine() && handleToolActivation('line')}
          disabled={!canCreateLine()}
          title={getLineButtonTooltip()}
        >
          <span className="tool-icon">📏</span>
          <span className="tool-label">Line</span>
          <span className="tool-shortcut">L</span>
        </button>

        <button
          className={`tool-button ${activeTool === 'plane' ? 'active' : ''} ${!canCreatePlane() ? 'disabled' : ''}`}
          onClick={() => canCreatePlane() && handleToolActivation('plane')}
          disabled={!canCreatePlane()}
          title={getPlaneButtonTooltip()}
        >
          <span className="tool-icon">🟨</span>
          <span className="tool-label">Plane</span>
          <span className="tool-shortcut">P</span>
        </button>

        <button
          className={`tool-button ${activeTool === 'circle' ? 'active' : ''}`}
          onClick={() => handleToolActivation('circle')}
          title="Create circle (center + radius or 3 points)"
        >
          <span className="tool-icon">⭕</span>
          <span className="tool-label">Circle</span>
          <span className="tool-shortcut">C</span>
        </button>
      </div>

      {/* Active Tool Panel */}
      <div className="active-tool-panel">
        {activeTool === 'line' && (
          <div className="tool-placeholder">
            <div className="tool-message">
              Use the floating Line Creation window.
            </div>
          </div>
        )}

        {activeTool === 'point' && (
          <div className="point-creation-tool">
            <div className="tool-header">
              <h4>Create Point</h4>
              <button className="btn-cancel" onClick={handleToolCancel}>✕</button>
            </div>
            <div className="tool-message">
              Click on an image to place a point
            </div>
            <div className="tool-help">
              <div className="help-text">
                • Switch to Image View to place points
                • Press Esc to cancel
              </div>
            </div>
          </div>
        )}

        {activeTool === 'plane' && (
          <div className="plane-creation-tool">
            <div className="tool-header">
              <h4>Create Plane</h4>
              <button className="btn-cancel" onClick={handleToolCancel}>✕</button>
            </div>
            <div className="tool-message">
              Plane creation tool - Coming soon
            </div>
            <div className="selection-status">
              <div>Selected Points: {selectedPoints.length}</div>
              <div>Selected Lines: {selectedLines.length}</div>
            </div>
          </div>
        )}

        {activeTool === 'circle' && (
          <div className="circle-creation-tool">
            <div className="tool-header">
              <h4>Create Circle</h4>
              <button className="btn-cancel" onClick={handleToolCancel}>✕</button>
            </div>
            <div className="tool-message">
              Circle creation tool - Coming soon
            </div>
          </div>
        )}
      </div>

      {/* Selection Summary */}
      <div className="selection-summary">
        <div className="summary-item">
          <span className="summary-label">Points:</span>
          <span className="summary-count">{selectedPoints.length}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Lines:</span>
          <span className="summary-count">{selectedLines.length}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Planes:</span>
          <span className="summary-count">{selectedPlanes.length}</span>
        </div>
      </div>

      {/* Floating Line Creation Tool */}
      <FloatingWindow
        title="Create Line"
        isOpen={activeTool === 'line'}
        onClose={handleToolCancel}
        width={300}
        storageKey="line-creation-tool"
        showOkCancel={false}
      >
        <LineCreationTool
          selectedPoints={selectedPoints}
          worldPointNames={worldPointNames}
          existingLines={existingLines}
          onCreateLine={onCreateLine}
          onCancel={handleToolCancel}
          onConstructionPreviewChange={onConstructionPreviewChange}
          isActive={activeTool === 'line'}
          showHeader={false}
        />
      </FloatingWindow>
    </div>
  )
}

export default CreationToolsManager