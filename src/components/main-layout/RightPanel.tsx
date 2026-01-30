import React from 'react'
import { observer } from 'mobx-react-lite'
import { WorldPoint } from '../../entities/world-point'
import { Line as LineEntity, LineDirection } from '../../entities/line'
import { Viewpoint } from '../../entities/viewpoint'
import type { ISelectable } from '../../types/selectable'
import { ConstructionPreview } from '../image-viewer/types'
import { ActiveTool } from '../../hooks/useMainLayoutState'
import CreationToolsManager from '../tools/CreationToolsManager'
import ConstraintPropertyPanel from '../ConstraintPropertyPanel'
import { CoplanarPointsConstraint } from '../../entities/constraints/coplanar-points-constraint'
import { Constraint } from '../../entities/constraints'

// Line creation options
interface LineConstraints {
  name?: string
  color?: string
  isConstruction?: boolean
  direction?: LineDirection
  targetLength?: number
  tolerance?: number
}

// Plane creation options
interface PlaneDefinition {
  name: string
  points: WorldPoint[]
}

// Circle creation options
type CircleDefinition =
  | { center: WorldPoint; radius: number }
  | { pointA: WorldPoint; pointB: WorldPoint; pointC: WorldPoint }

// Line update parameters
interface LineUpdateParams {
  name?: string
  color?: string
}

// Constraint parameter value types
type ConstraintParameterValue =
  | WorldPoint
  | LineEntity
  | WorldPoint[]
  | LineEntity[]
  | number
  | string
  | boolean
  | null
  | undefined

type ConstraintParameters = Record<string, ConstraintParameterValue>

interface RightPanelProps {
  selectedEntities: ISelectable[]
  activeTool: ActiveTool
  onToolChange: (tool: ActiveTool) => void
  allWorldPoints: WorldPoint[]
  existingLines: Map<string, LineEntity>
  onCreatePoint: (imageId: string, u: number, v: number) => void
  onCreateLine: (pointA: WorldPoint, pointB: WorldPoint, lineConstraints?: LineConstraints) => void
  onCreateConstraint: (constraint: Constraint) => void
  onCreatePlane: (definition: PlaneDefinition) => void
  onCreateCircle: (definition: CircleDefinition) => void
  onConstructionPreviewChange: (preview: ConstructionPreview | null) => void
  onClearSelection: () => void
  onSelectWorldPoint: (worldPoint: WorldPoint) => void
  currentViewpoint?: Viewpoint
  editingLine: LineEntity | null
  onUpdateLine: (lineEntity: LineEntity, updatedLine: LineUpdateParams) => void
  onDeleteLine: (line: LineEntity) => void
  onClearEditingLine: () => void
  projectConstraints: Constraint[]
  editingCoplanarConstraint: CoplanarPointsConstraint | null
  onUpdateCoplanarConstraint: (constraint: CoplanarPointsConstraint, updates: { name: string; points: WorldPoint[] }) => void
  onDeleteCoplanarConstraint: (constraint: CoplanarPointsConstraint) => void
  onClearEditingCoplanarConstraint: () => void
  currentVanishingLineAxis: 'x' | 'y' | 'z'
  onVanishingLineAxisChange: (axis: 'x' | 'y' | 'z') => void
  orientationPaintDirection: LineDirection
  onOrientationPaintDirectionChange: (direction: LineDirection) => void
  activeConstraintType: string | null
  selectedPoints: WorldPoint[]
  selectedLines: LineEntity[]
  constraintParameters: ConstraintParameters
  isConstraintComplete: boolean
  onParameterChange: (key: string, value: ConstraintParameterValue) => void
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
  onSelectWorldPoint,
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
  orientationPaintDirection,
  onOrientationPaintDirectionChange,
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
        onSelectWorldPoint={onSelectWorldPoint}
        selectedWorldPoints={selectedPoints}
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
        orientationPaintDirection={orientationPaintDirection}
        onOrientationPaintDirectionChange={onOrientationPaintDirectionChange}
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
