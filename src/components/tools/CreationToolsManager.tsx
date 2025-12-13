// Creation Tools Manager - Handles all geometry creation tools

import React, { useState, useCallback, useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLocationDot, faRuler, faSquare, faPaintBrush } from '@fortawesome/free-solid-svg-icons'
import LineCreationTool from './LineCreationTool'
import LoopTraceTool from './LoopTraceTool'
import OrientationPaintTool from './OrientationPaintTool'
import CoplanarCreationTool from './CoplanarCreationTool'
import FloatingWindow from '../FloatingWindow'
import { Line, LineDirection } from '../../entities/line'
import { WorldPoint } from '../../entities/world-point'
import { Viewpoint } from '../../entities/viewpoint'
import { VanishingLine } from '../../entities/vanishing-line'
import { ConstructionPreview } from '../image-viewer/types'
import type { ISelectable } from '../../types/selectable'
import { getEntityKey } from '../../utils/entityKeys'
import { CoplanarPointsConstraint } from '../../entities/constraints/coplanar-points-constraint'
import '../../styles/tools.css'

type ToolType = 'select' | 'point' | 'line' | 'plane' | 'circle' | 'loop' | 'vanishing' | 'orientationPaint'

interface LineConstraints {
  name?: string
  color?: string
  isConstruction?: boolean
  direction?: LineDirection
  targetLength?: number
  tolerance?: number
}

interface CreationToolsManagerProps {
  selectedEntities: ISelectable[]
  activeTool: ToolType
  onToolChange: (tool: ToolType) => void
  currentVanishingLineAxis?: 'x' | 'y' | 'z'
  onVanishingLineAxisChange?: (axis: 'x' | 'y' | 'z') => void
  allWorldPoints: WorldPoint[]
  existingLines: Map<string, Line>
  onCreatePoint: (imageId: string, u: number, v: number) => void
  onCreateLine: (pointA: WorldPoint, pointB: WorldPoint, constraints?: LineConstraints) => void
  onCreateConstraint?: (constraint: any) => void
  onCreatePlane: (definition: any) => void
  onCreateCircle: (definition: any) => void
  onConstructionPreviewChange?: (preview: ConstructionPreview | null) => void
  onClearSelection?: () => void
  currentViewpoint?: Viewpoint
  editingLine?: Line | null
  onUpdateLine?: (lineEntity: Line, updatedLine: any) => void
  onDeleteLine?: (line: Line) => void
  onClearEditingLine?: () => void
  projectConstraints?: Record<string, any>
  editingCoplanarConstraint?: CoplanarPointsConstraint | null
  onUpdateCoplanarConstraint?: (constraint: CoplanarPointsConstraint, updates: { name: string; points: WorldPoint[] }) => void
  onDeleteCoplanarConstraint?: (constraint: CoplanarPointsConstraint) => void
  onClearEditingCoplanarConstraint?: () => void
}

export const CreationToolsManager: React.FC<CreationToolsManagerProps> = observer(({
  selectedEntities,
  activeTool,
  onToolChange,
  currentVanishingLineAxis = 'x',
  onVanishingLineAxisChange,
  allWorldPoints,
  existingLines,
  onCreatePoint,
  onCreateLine,
  onCreateConstraint,
  onCreatePlane,
  onCreateCircle,
  onConstructionPreviewChange,
  onClearSelection,
  currentViewpoint,
  editingLine = null,
  onUpdateLine,
  onDeleteLine,
  onClearEditingLine,
  projectConstraints = {},
  editingCoplanarConstraint = null,
  onUpdateCoplanarConstraint,
  onDeleteCoplanarConstraint,
  onClearEditingCoplanarConstraint
}) => {
  const [toolMessage, setToolMessage] = useState<string>('')
  const [isRightHandGuideOpen, setIsRightHandGuideOpen] = useState(false)

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
  const selectedVanishingLines = useMemo(() =>
    selectedEntities.filter(e => e.getType() === 'vanishingLine') as VanishingLine[],
    [selectedEntities]
  )

  const handleLinePreviewChange = useCallback((linePreview: {
    type: 'line'
    pointA?: WorldPoint
    pointB?: WorldPoint
    showToCursor?: boolean
  } | null) => {
    if (!onConstructionPreviewChange) return
    if (!linePreview) {
      onConstructionPreviewChange(null)
      return
    }
    onConstructionPreviewChange({
      type: 'line',
      pointA: linePreview.pointA,
      pointB: linePreview.pointB,
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
      if (tool === 'plane' && onClearEditingCoplanarConstraint) {
        onClearEditingCoplanarConstraint()
      }
      if (tool === 'loop' && onConstructionPreviewChange) {
        onConstructionPreviewChange(null)
      }
    } else {
      // Activating a new tool - clear editing state
      if (tool === 'line' && onClearEditingLine) {
        onClearEditingLine()
      }
      if (tool === 'plane' && onClearEditingCoplanarConstraint) {
        onClearEditingCoplanarConstraint()
      }
      onToolChange(tool)
      setToolMessage('')
    }
  }, [activeTool, onToolChange, onClearEditingLine, onClearEditingCoplanarConstraint, onConstructionPreviewChange])

  const openRightHandGuide = useCallback(() => setIsRightHandGuideOpen(true), [])
  const closeRightHandGuide = useCallback(() => setIsRightHandGuideOpen(false), [])

  const handleSelectedVLAxisChange = useCallback((axis: 'x' | 'y' | 'z') => {
    selectedVanishingLines.forEach(vl => vl.setAxis(axis))
  }, [selectedVanishingLines])

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

  // Collect unique points from selected lines + selected points
  const getPlanePoints = (): WorldPoint[] => {
    const pointSet = new Set<WorldPoint>(selectedPoints)
    selectedLines.forEach(line => {
      pointSet.add(line.pointA)
      pointSet.add(line.pointB)
    })
    return Array.from(pointSet)
  }

  const canCreatePlane = () => {
    // Need at least 4 unique points for a coplanar constraint
    return getPlanePoints().length >= 4
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
    const planePoints = getPlanePoints()
    if (canCreatePlane()) {
      return `Create coplanar constraint with ${planePoints.length} points`
    }
    return `Select 4+ points or lines (have ${planePoints.length} unique points)`
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
          <span className="tool-label">Coplanar</span>
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

        <button
          className={`tool-button ${activeTool === 'vanishing' ? 'active' : ''}`}
          onClick={() => handleToolActivation('vanishing')}
          title="Draw vanishing lines for camera initialization"
        >
          <span className="tool-icon">📐</span>
          <span className="tool-label">Vanishing</span>
          <span className="tool-shortcut">V</span>
        </button>

        <button
          className={`tool-button ${activeTool === 'orientationPaint' ? 'active' : ''}`}
          onClick={() => handleToolActivation('orientationPaint')}
          title="Paint line orientations - click lines to apply selected direction"
        >
          <span className="tool-icon"><FontAwesomeIcon icon={faPaintBrush} /></span>
          <span className="tool-label">Orient</span>
          <span className="tool-shortcut">D</span>
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
          <div className="tool-placeholder">
            <div className="tool-message">
              Use the floating Coplanar Constraint window.
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

        {activeTool === 'vanishing' && (
          <div className="vanishing-line-tool">
            <div className="tool-header">
              <h4>Vanishing Lines</h4>
              <button className="btn-cancel" onClick={handleToolCancel}>✕</button>
            </div>
            <div className="tool-message">
              Click two points to draw a vanishing line
            </div>
            <div style={{ margin: '10px 0' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '12px' }}>Axis:</label>
              <div style={{ display: 'flex', gap: '5px' }}>
                <button
                  onClick={() => onVanishingLineAxisChange?.('x')}
                  style={{
                    backgroundColor: currentVanishingLineAxis === 'x' ? '#333' : '#1a1a1a',
                    border: currentVanishingLineAxis === 'x' ? '2px solid #ff0000' : '1px solid #555',
                    padding: '8px',
                    cursor: 'pointer',
                    flex: 1,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  <span style={{ color: '#ff0000', fontSize: '18px', fontWeight: 'bold' }}>X</span>
                </button>
                <button
                  onClick={() => onVanishingLineAxisChange?.('y')}
                  style={{
                    backgroundColor: currentVanishingLineAxis === 'y' ? '#333' : '#1a1a1a',
                    border: currentVanishingLineAxis === 'y' ? '2px solid #00ff00' : '1px solid #555',
                    padding: '8px',
                    cursor: 'pointer',
                    flex: 1,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  <span style={{ color: '#00ff00', fontSize: '18px', fontWeight: 'bold' }}>Y</span>
                </button>
                <button
                  onClick={() => onVanishingLineAxisChange?.('z')}
                  style={{
                    backgroundColor: currentVanishingLineAxis === 'z' ? '#333' : '#1a1a1a',
                    border: currentVanishingLineAxis === 'z' ? '2px solid #0000ff' : '1px solid #555',
                    padding: '8px',
                    cursor: 'pointer',
                    flex: 1,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  <span style={{ color: '#0000ff', fontSize: '18px', fontWeight: 'bold' }}>Z</span>
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button
                  type="button"
                  title="Show right-hand rule guide"
                  onClick={openRightHandGuide}
                  style={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #555',
                    borderRadius: '4px',
                    width: '32px',
                    height: '32px',
                    color: '#fff',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  ?
                </button>
              </div>
            </div>
            <div className="tool-help">
              <div className="help-text">
                • Draw lines parallel to world axes
                • Need 2+ lines per axis for vanishing point
                • Press Esc to cancel
              </div>
            </div>
          </div>
        )}

        {activeTool === 'orientationPaint' && (
          <OrientationPaintTool
            isActive={activeTool === 'orientationPaint'}
            onCancel={handleToolCancel}
            onPaintLine={(line, direction) => {
              if (onUpdateLine) {
                onUpdateLine(line, { direction })
              }
            }}
          />
        )}
      </div>

      {/* Selected Vanishing Lines Panel */}
      {selectedVanishingLines.length > 0 && activeTool !== 'vanishing' && (
        <div className="active-tool-panel" style={{ marginTop: '10px' }}>
          <div className="vanishing-line-tool">
            <div className="tool-header">
              <h4>Selected Vanishing {selectedVanishingLines.length === 1 ? 'Line' : 'Lines'}</h4>
            </div>
            <div style={{ margin: '10px 0' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '12px' }}>
                {selectedVanishingLines.length === 1 ? 'Change Axis:' : 'Set All to Axis:'}
              </label>
              <div style={{ display: 'flex', gap: '5px' }}>
                {(['x', 'y', 'z'] as const).map(axis => {
                  const allSameAxis = selectedVanishingLines.every(vl => vl.axis === axis)
                  const colors = { x: '#ff0000', y: '#00ff00', z: '#0000ff' }
                  return (
                    <button
                      key={axis}
                      onClick={() => handleSelectedVLAxisChange(axis)}
                      style={{
                        backgroundColor: allSameAxis ? '#333' : '#1a1a1a',
                        border: allSameAxis ? `2px solid ${colors[axis]}` : '1px solid #555',
                        padding: '8px',
                        cursor: 'pointer',
                        flex: 1,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center'
                      }}
                    >
                      <span style={{ color: colors[axis], fontSize: '18px', fontWeight: 'bold' }}>
                        {axis.toUpperCase()}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Floating Coplanar Constraint Tool */}
      <FloatingWindow
        title={editingCoplanarConstraint ? `Edit: ${editingCoplanarConstraint.getName()}` : "Create Coplanar Constraint"}
        isOpen={activeTool === 'plane'}
        onClose={handleToolCancel}
        storageKey="coplanar-tool"
        width={400}
        maxHeight={500}
        showOkCancel={true}
        onOk={() => {
          window.dispatchEvent(new CustomEvent('coplanarToolSave'))
        }}
        onCancel={handleToolCancel}
        onDelete={editingCoplanarConstraint && onDeleteCoplanarConstraint ? () => {
          onDeleteCoplanarConstraint(editingCoplanarConstraint)
          handleToolCancel()
        } : undefined}
        okText={editingCoplanarConstraint ? "Save" : "Create"}
        cancelText="Cancel"
      >
        <CoplanarCreationTool
          selectedPoints={editingCoplanarConstraint ? [] : selectedPoints}
          selectedLines={editingCoplanarConstraint ? [] : selectedLines}
          allWorldPoints={allWorldPoints}
          onCreateConstraint={(constraint) => {
            onCreateConstraint?.(constraint)
          }}
          onUpdateConstraint={onUpdateCoplanarConstraint}
          onDeleteConstraint={onDeleteCoplanarConstraint}
          onCancel={handleToolCancel}
          isActive={activeTool === 'plane'}
          editMode={!!editingCoplanarConstraint}
          existingConstraint={editingCoplanarConstraint || undefined}
        />
      </FloatingWindow>

      {/* Right-hand rule guide */}
      <FloatingWindow
        title="Right-Hand Coordinate Guide"
        isOpen={isRightHandGuideOpen}
        onClose={closeRightHandGuide}
        storageKey="right-hand-guide"
        showOkCancel={false}
        onCancel={closeRightHandGuide}
      >
        <div style={{ textAlign: 'center' }}>
          <img
            src="/right-hand.png"
            alt="Illustration of the right-hand coordinate system"
            style={{ maxWidth: '100%', borderRadius: '4px' }}
          />
          <p style={{ marginTop: '8px', fontSize: '12px', color: '#ccc' }}>
            Thumb = +X, Index = +Y, Middle = +Z.
          </p>
        </div>
      </FloatingWindow>
    </div>
  )
})

export default CreationToolsManager
