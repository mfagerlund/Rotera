import React from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRuler, faSquare, faCamera, faGear, faBullseye } from '@fortawesome/free-solid-svg-icons'
import { WorldPoint } from '../../entities/world-point'
import { Line as LineEntity } from '../../entities/line'
import { Viewpoint } from '../../entities/viewpoint'
import { Plane } from '../../entities/plane'
import { VanishingLine } from '../../entities/vanishing-line'
import type { ISelectable } from '../../types/selectable'
import { ConstructionPreview } from '../image-viewer/types'
import { ActiveTool } from '../../hooks/useMainLayoutState'
import CreationToolsManager from '../tools/CreationToolsManager'
import ConstraintPropertyPanel from '../ConstraintPropertyPanel'
import WorldPointPanel from '../WorldPointPanel'
import { Project } from '../../entities/project'

interface RightPanelProps {
  selectedEntities: ISelectable[]
  activeTool: ActiveTool
  onToolChange: (tool: ActiveTool) => void
  allWorldPoints: WorldPoint[]
  existingLines: Map<string, LineEntity>
  onCreatePoint: (imageId: string, u: number, v: number) => void
  onCreateLine: (pointA: WorldPoint, pointB: WorldPoint, lineConstraints?: any) => void
  onCreateConstraint: (constraint: any) => void
  onCreatePlane: (definition: any) => void
  onCreateCircle: (definition: any) => void
  onConstructionPreviewChange: (preview: ConstructionPreview | null) => void
  onClearSelection: () => void
  currentViewpoint?: Viewpoint
  editingLine: LineEntity | null
  onUpdateLine: (lineEntity: LineEntity, updatedLine: any) => void
  onDeleteLine: (line: LineEntity) => void
  onClearEditingLine: () => void
  projectConstraints: any[]
  currentVanishingLineAxis: 'x' | 'y' | 'z'
  onVanishingLineAxisChange: (axis: 'x' | 'y' | 'z') => void
  activeConstraintType: string | null
  selectedPoints: WorldPoint[]
  selectedLines: LineEntity[]
  constraintParameters: any
  isConstraintComplete: boolean
  onParameterChange: (key: string, value: any) => void
  onApplyConstraint: () => void
  onCancelConstraintCreation: () => void
  worldPointsMap: Map<string, WorldPoint>
  viewpointsMap: Map<string, Viewpoint>
  constraints: any[]
  selectedWorldPoints: WorldPoint[]
  hoveredWorldPoint: WorldPoint | null
  placementMode: { active: boolean; worldPoint: WorldPoint | null }
  onSelectWorldPoint: (worldPoint: WorldPoint, ctrlKey: boolean, shiftKey: boolean) => void
  onHighlightWorldPoint: (worldPoint: WorldPoint | null) => void
  onHoverWorldPoint: (worldPoint: WorldPoint | null) => void
  onRenameWorldPoint: (worldPoint: WorldPoint, newName: string) => void
  onDeleteWorldPoint: (worldPoint: WorldPoint) => void
  onEditWorldPoint: (worldPoint: WorldPoint) => void
  onStartPlacement: (worldPoint: WorldPoint) => void
  onCancelPlacement: () => void
  project: Project
  onShowLinesPopup: () => void
  onShowPlanesPopup: () => void
  onShowImagePointsPopup: () => void
  onShowConstraintsPopup: () => void
  onShowOptimizationPanel: () => void
}

export const RightPanel: React.FC<RightPanelProps> = observer(({
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
  currentViewpoint,
  editingLine,
  onUpdateLine,
  onDeleteLine,
  onClearEditingLine,
  projectConstraints,
  currentVanishingLineAxis,
  onVanishingLineAxisChange,
  activeConstraintType,
  selectedPoints,
  selectedLines,
  constraintParameters,
  isConstraintComplete,
  onParameterChange,
  onApplyConstraint,
  onCancelConstraintCreation,
  worldPointsMap,
  viewpointsMap,
  constraints,
  selectedWorldPoints,
  hoveredWorldPoint,
  placementMode,
  onSelectWorldPoint,
  onHighlightWorldPoint,
  onHoverWorldPoint,
  onRenameWorldPoint,
  onDeleteWorldPoint,
  onEditWorldPoint,
  onStartPlacement,
  onCancelPlacement,
  project,
  onShowLinesPopup,
  onShowPlanesPopup,
  onShowImagePointsPopup,
  onShowConstraintsPopup,
  onShowOptimizationPanel
}) => {
  return (
    <div className="sidebar-right">
      <CreationToolsManager
        selectedEntities={selectedEntities}
        activeTool={activeTool}
        onToolChange={onToolChange}
        allWorldPoints={allWorldPoints}
        existingLines={existingLines}
        onCreatePoint={onCreatePoint}
        onCreateLine={onCreateLine}
        onCreateConstraint={onCreateConstraint}
        onCreatePlane={onCreatePlane}
        onCreateCircle={onCreateCircle}
        onConstructionPreviewChange={onConstructionPreviewChange}
        onClearSelection={onClearSelection}
        currentViewpoint={currentViewpoint}
        editingLine={editingLine}
        onUpdateLine={onUpdateLine}
        onDeleteLine={onDeleteLine}
        onClearEditingLine={onClearEditingLine}
        projectConstraints={projectConstraints}
        currentVanishingLineAxis={currentVanishingLineAxis}
        onVanishingLineAxisChange={onVanishingLineAxisChange}
      />

      <ConstraintPropertyPanel
        activeConstraintType={activeConstraintType}
        selectedPoints={selectedPoints}
        selectedLines={selectedLines}
        parameters={constraintParameters}
        isComplete={isConstraintComplete}
        allWorldPoints={allWorldPoints}
        onParameterChange={onParameterChange}
        onApply={onApplyConstraint}
        onCancel={onCancelConstraintCreation}
      />

      <WorldPointPanel
        worldPoints={worldPointsMap}
        viewpoints={viewpointsMap}
        constraints={constraints}
        selectedWorldPoints={selectedWorldPoints}
        hoveredWorldPoint={hoveredWorldPoint}
        currentViewpoint={currentViewpoint ?? null}
        placementMode={placementMode}
        onSelectWorldPoint={onSelectWorldPoint}
        onHighlightWorldPoint={onHighlightWorldPoint}
        onHoverWorldPoint={onHoverWorldPoint}
        onRenameWorldPoint={onRenameWorldPoint}
        onDeleteWorldPoint={onDeleteWorldPoint}
        onEditWorldPoint={onEditWorldPoint}
        onStartPlacement={onStartPlacement}
        onCancelPlacement={onCancelPlacement}
      />

      <div className="entity-management-panel" style={{ padding: '4px', marginTop: '8px' }}>
        <div className="entity-buttons" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <button
            className="entity-button"
            onClick={onShowLinesPopup}
            title="Manage lines"
            style={{ padding: '2px 6px', fontSize: '11px', minHeight: 'auto' }}
          >
            <span className="button-icon" style={{ fontSize: '10px' }}><FontAwesomeIcon icon={faRuler} /></span>
            <span className="button-label">Lines</span>
            <span className="button-count">{project?.lines.size || 0}</span>
          </button>

          <button
            className="entity-button"
            onClick={onShowPlanesPopup}
            title="Manage planes"
            style={{ padding: '2px 6px', fontSize: '11px', minHeight: 'auto' }}
          >
            <span className="button-icon" style={{ fontSize: '10px' }}><FontAwesomeIcon icon={faSquare} /></span>
            <span className="button-label">Planes</span>
            <span className="button-count">{0}</span>
          </button>

          <button
            className="entity-button"
            onClick={onShowImagePointsPopup}
            title="Manage image points"
            style={{ padding: '2px 6px', fontSize: '11px', minHeight: 'auto' }}
          >
            <span className="button-icon" style={{ fontSize: '10px' }}><FontAwesomeIcon icon={faCamera} /></span>
            <span className="button-label">IPs</span>
            <span className="button-count">{Array.from(project?.viewpoints || []).reduce((total, vp) => total + vp.imagePoints.size, 0)}</span>
          </button>

          <button
            className="entity-button"
            onClick={onShowConstraintsPopup}
            title="Manage constraints"
            style={{ padding: '2px 6px', fontSize: '11px', minHeight: 'auto' }}
          >
            <span className="button-icon" style={{ fontSize: '10px' }}><FontAwesomeIcon icon={faGear} /></span>
            <span className="button-count">{project?.constraints.size || 0}</span>
          </button>

          <button
            className="entity-button"
            onClick={onShowOptimizationPanel}
            title="Bundle adjustment optimization"
            style={{ padding: '2px 6px', fontSize: '11px', minHeight: 'auto' }}
          >
            <span className="button-icon" style={{ fontSize: '10px' }}><FontAwesomeIcon icon={faBullseye} /></span>
            <span className="button-label">Optimize</span>
          </button>
        </div>
      </div>
    </div>
  )
})
