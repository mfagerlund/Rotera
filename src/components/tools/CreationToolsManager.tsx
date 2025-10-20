// Creation Tools Manager - Handles all geometry creation tools

import React, { useState, useCallback, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLocationDot, faRuler, faSquare } from '@fortawesome/free-solid-svg-icons'
import LineCreationTool from './LineCreationTool'
import LoopTraceTool from './LoopTraceTool'
import FloatingWindow from '../FloatingWindow'
import { Line, LineDirection } from '../../entities/line'
import { WorldPoint } from '../../entities/world-point'
import { ConstructionPreview } from '../image-viewer/types'
import type { ISelectable } from '../../types/selectable'
import { getEntityKey } from '../../utils/entityKeys'
import '../../styles/tools.css'

type ToolType = 'select' | 'point' | 'line' | 'plane' | 'circle' | 'loop'

interface LineConstraints {
  name?: string
  color?: string
  isVisible?: boolean
  isConstruction?: boolean
  direction?: LineDirection
  targetLength?: number
  tolerance?: number
}

interface CreationToolsManagerProps {
  selectedEntities: ISelectable[]
  activeTool: ToolType
  onToolChange: (tool: ToolType) => void
  allWorldPoints: WorldPoint[]
  existingLines: Map<string, Line>
  onCreatePoint: (imageId: string, u: number, v: number) => void
  onCreateLine: (pointA: WorldPoint, pointB: WorldPoint, constraints?: LineConstraints) => void
  onCreateConstraint?: (constraint: any) => void
  onCreatePlane: (definition: any) => void
  onCreateCircle: (definition: any) => void
  onConstructionPreviewChange?: (preview: ConstructionPreview | null) => void
  onClearSelection?: () => void
  currentImageId?: string
  editingLine?: Line | null
  onUpdateLine?: (lineEntity: Line, updatedLine: any) => void
  onDeleteLine?: (line: Line) => void
  onClearEditingLine?: () => void
  projectConstraints?: Record<string, any>
}

export const CreationToolsManager: React.FC<CreationToolsManagerProps> = ({
  selectedEntities,
  activeTool,
  onToolChange,
  allWorldPoints,
  existingLines,
  onCreatePoint,
  onCreateLine,
  onCreateConstraint,
  onCreatePlane,
  onCreateCircle,
  onConstructionPreviewChange,
  onClearSelection,
  currentImageId,
  editingLine = null,
  onUpdateLine,
  onDeleteLine,
  onClearEditingLine,
  projectConstraints = {}
}) => {
  const [toolMessage, setToolMessage] = useState<string>('')

  // Split selected entities by type
  const selectedPoints = useMemo(() =>
    selectedEntities.filter(e => e.getType() === 'point') as WorldPoint[],
    [selectedEntities]
  )
  const selectedLines = useMemo(() =>
    selectedEntities.filter(e => e.getType() === 'line') as Line[],
    [selectedEntities]
  )
  const selectedPlanes = useMemo(() =>
    selectedEntities.filter(e => e.getType() === 'plane'),
    [selectedEntities]
  )

  const handleLinePreviewChange = useCallback((linePreview: {
    type: 'line'
    pointA?: string
    pointB?: string
    showToCursor?: boolean
  } | null) => {
    if (!onConstructionPreviewChange) return
    if (!linePreview) {
      onConstructionPreviewChange(null)
      return
    }
    onConstructionPreviewChange({
      type: 'line',
      pointA: undefined,
      pointB: undefined,
      showToCursor: linePreview.showToCursor
    })
  }, [onConstructionPreviewChange])

  const handleToolActivation = useCallback((tool: ToolType) => {
    if (activeTool === tool) {
      // Deactivate if same tool clicked
      onToolChange('select')
      setToolMessage('')
      if (tool === 'line' && onClearEditingLine) {
        onClearEditingLine()
      }
      if (tool === 'loop' && onConstructionPreviewChange) {
        onConstructionPreviewChange(null)
      }
    } else {
      // Activating a new tool - clear editing state for line tool
      if (tool === 'line' && onClearEditingLine) {
        onClearEditingLine()
      }
      onToolChange(tool)
      setToolMessage('')
    }
  }, [activeTool, onToolChange, onClearEditingLine, onConstructionPreviewChange])

  const handleToolCancel = useCallback(() => {
    if (activeTool === 'loop' && onClearSelection) {
      onClearSelection()
    }
    onToolChange('select')
    setToolMessage('')
    // Clear construction preview when canceling
    if (onConstructionPreviewChange) {
      onConstructionPreviewChange(null)
    }
  }, [onToolChange, onConstructionPreviewChange, activeTool, onClearSelection])

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
          <span className="tool-icon"><FontAwesomeIcon icon={faLocationDot} /></span>
          <span className="tool-label">Point</span>
          <span className="tool-shortcut">W</span>
        </button>

        <button
          className={`tool-button ${activeTool === 'line' ? 'active' : ''} ${!canCreateLine() ? 'disabled' : ''}`}
          onClick={() => canCreateLine() && handleToolActivation('line')}
          disabled={!canCreateLine()}
          title={getLineButtonTooltip()}
        >
          <span className="tool-icon"><FontAwesomeIcon icon={faRuler} /></span>
          <span className="tool-label">Line</span>
          <span className="tool-shortcut">L</span>
        </button>

        <button
          className={`tool-button ${activeTool === 'plane' ? 'active' : ''} ${!canCreatePlane() ? 'disabled' : ''}`}
          onClick={() => canCreatePlane() && handleToolActivation('plane')}
          disabled={!canCreatePlane()}
          title={getPlaneButtonTooltip()}
        >
          <span className="tool-icon"><FontAwesomeIcon icon={faSquare} /></span>
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

        <button
          className={`tool-button ${activeTool === 'loop' ? 'active' : ''}`}
          onClick={() => handleToolActivation('loop')}
          title="Loop trace - String together points and create lines"
        >
          <span className="tool-icon">🔗</span>
          <span className="tool-label">Loop</span>
          <span className="tool-shortcut">O</span>
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

      {/* Floating Line Tool - handles both creation and editing */}
      <FloatingWindow
        title={editingLine ? `Edit Line: ${editingLine.name}` : "Create Line"}
        isOpen={activeTool === 'line'}
        onClose={handleToolCancel}
        storageKey="line-tool"
        showOkCancel={true}
        onOk={() => {
          // Trigger save via custom event
          window.dispatchEvent(new CustomEvent('lineToolSave'))
        }}
        onCancel={handleToolCancel}
        onDelete={editingLine && onDeleteLine ? () => {
          onDeleteLine(editingLine)
          handleToolCancel()
        } : undefined}
        okText={editingLine ? "Save" : "Create"}
        cancelText="Cancel"
      >
        <LineCreationTool
          selectedPoints={editingLine ? [] : selectedPoints}
          allWorldPoints={allWorldPoints}
          existingLines={existingLines}
          onCreateLine={onCreateLine}
          onCancel={handleToolCancel}
          onConstructionPreviewChange={handleLinePreviewChange}
          isActive={activeTool === 'line'}
          showHeader={false}
          showActionButtons={false}
          editMode={!!editingLine}
          existingLine={editingLine || undefined}
          existingConstraints={
            editingLine && projectConstraints
              ? Object.values(projectConstraints).filter(c => {
                  const constraintLineIds = c.entities?.lines || []
                  const constraintPointIds = c.entities?.points || []
                  return constraintLineIds.includes(getEntityKey(editingLine)) ||
                         (constraintPointIds.includes(getEntityKey(editingLine.pointA)) && constraintPointIds.includes(getEntityKey(editingLine.pointB)))
                })
              : []
          }
          onUpdateLine={onUpdateLine}
          onDeleteLine={onDeleteLine}
        />
      </FloatingWindow>

      {/* Floating Loop Trace Tool */}
      <FloatingWindow
        title="Loop Trace"
        isOpen={activeTool === 'loop'}
        onClose={handleToolCancel}
        storageKey="loop-trace-tool"
        showOkCancel={true}
        onOk={() => {
          // Trigger save via custom event
          window.dispatchEvent(new CustomEvent('loopToolSave'))
        }}
        onCancel={handleToolCancel}
        okText="Complete"
        cancelText="Cancel"
      >
        <LoopTraceTool
          selectedPoints={selectedPoints}
          allWorldPoints={allWorldPoints}
          existingLines={existingLines}
          onCreateLine={onCreateLine}
          onCreateConstraint={onCreateConstraint}
          onCancel={handleToolCancel}
          onConstructionPreviewChange={onConstructionPreviewChange}
          onClearSelection={onClearSelection}
          isActive={activeTool === 'loop'}
          showHeader={false}
          showActionButtons={false}
        />
      </FloatingWindow>
    </div>
  )
}

export default CreationToolsManager