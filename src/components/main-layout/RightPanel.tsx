import React from 'react'
import { observer } from 'mobx-react-lite'
import { WorldPoint } from '../../entities/world-point'
import { Line as LineEntity } from '../../entities/line'
import { Viewpoint } from '../../entities/viewpoint'
import type { ISelectable } from '../../types/selectable'
import { ConstructionPreview } from '../image-viewer/types'
import { ActiveTool } from '../../hooks/useMainLayoutState'
import CreationToolsManager from '../tools/CreationToolsManager'
import ConstraintPropertyPanel from '../ConstraintPropertyPanel'
import { CoplanarPointsConstraint } from '../../entities/constraints/coplanar-points-constraint'

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
  editingCoplanarConstraint: CoplanarPointsConstraint | null
  onUpdateCoplanarConstraint: (constraint: CoplanarPointsConstraint, updates: { name: string; points: WorldPoint[] }) => void
  onDeleteCoplanarConstraint: (constraint: CoplanarPointsConstraint) => void
  onClearEditingCoplanarConstraint: () => void
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
  editingCoplanarConstraint,
  onUpdateCoplanarConstraint,
  onDeleteCoplanarConstraint,
  onClearEditingCoplanarConstraint,
  currentVanishingLineAxis,
  onVanishingLineAxisChange,
  activeConstraintType,
  selectedPoints,
  selectedLines,
  constraintParameters,
  isConstraintComplete,
  onParameterChange,
  onApplyConstraint,
  onCancelConstraintCreation
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
        editingCoplanarConstraint={editingCoplanarConstraint}
        onUpdateCoplanarConstraint={onUpdateCoplanarConstraint}
        onDeleteCoplanarConstraint={onDeleteCoplanarConstraint}
        onClearEditingCoplanarConstraint={onClearEditingCoplanarConstraint}
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
    </div>
  )
})
