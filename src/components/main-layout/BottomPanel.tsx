import React from 'react'
import { observer } from 'mobx-react-lite'
import { WorldPoint } from '../../entities/world-point'
import { Line as LineEntity } from '../../entities/line'
import { Viewpoint } from '../../entities/viewpoint'
import { Project } from '../../entities/project'
import { CoplanarPointsConstraint } from '../../entities/constraints/coplanar-points-constraint'
import WorldPointsManager from '../WorldPointsManager'
import LinesManager from '../LinesManager'
import PlanesManager from '../PlanesManager'
import ImagePointsManager, { ImagePointReference } from '../ImagePointsManager'
import ConstraintsManager from '../ConstraintsManager'
import CoplanarConstraintsManager from '../CoplanarConstraintsManager'
import WorldPointEditor from '../WorldPointEditor'
import { VanishingPointQualityWindow } from '../VanishingPointQualityWindow'
import OptimizationPanel from '../OptimizationPanel'

interface BottomPanelProps {
  entityPopups: {
    showWorldPointsPopup: boolean
    showLinesPopup: boolean
    showPlanesPopup: boolean
    showImagePointsPopup: boolean
    showConstraintsPopup: boolean
    showCoplanarConstraintsPopup: boolean
    showOptimizationPanel: boolean
  }
  onClosePopup: (popup: keyof BottomPanelProps['entityPopups']) => void
  optimizeTrigger?: number
  linesMap: Map<string, LineEntity>
  allWorldPoints: WorldPoint[]
  selectedLines: LineEntity[]
  onEditLine: (line: LineEntity) => void
  onDeleteLine: (line: LineEntity) => void
  onDeleteAllLines: () => void
  onUpdateLine: (updatedLine: LineEntity) => void
  onToggleLineVisibility: (line: LineEntity) => void
  onSelectLine: (line: LineEntity) => void
  onCreateLine: (pointA: WorldPoint, pointB: WorldPoint, lineConstraints?: any) => void
  selectedPlanes: any[]
  onEditPlane: (plane: any) => void
  onDeletePlane: (plane: any) => void
  onTogglePlaneVisibility: (plane: any) => void
  onSelectPlane: (plane: any) => void
  worldPointsMap: Set<WorldPoint>
  viewpointsMap: Map<string, Viewpoint>
  onEditImagePoint: (ref: ImagePointReference) => void
  onDeleteImagePoint: (ref: ImagePointReference) => void
  onDeleteAllImagePoints?: () => void
  onSelectImagePoint: (ref: ImagePointReference) => void
  constraints: any[]
  allLines: LineEntity[]
  onEditConstraint: (constraint: any) => void
  onDeleteConstraint: (constraint: any) => void
  onDeleteAllConstraints?: () => void
  onSelectConstraint: (constraint: any) => void
  onEditCoplanarConstraint?: (constraint: CoplanarPointsConstraint) => void
  onDeleteCoplanarConstraint?: (constraint: CoplanarPointsConstraint) => void
  onDeleteAllCoplanarConstraints?: () => void
  onSelectCoplanarConstraint?: (constraint: CoplanarPointsConstraint) => void
  onHoverCoplanarConstraint?: (constraint: CoplanarPointsConstraint | null) => void
  selectedCoplanarConstraints?: CoplanarPointsConstraint[]
  hoveredCoplanarConstraint?: CoplanarPointsConstraint | null
  project: Project | null
  onOptimizationStart?: () => void
  onOptimizationComplete: (success: boolean, message: string) => void
  onSelectWorldPoint?: (worldPoint: WorldPoint) => void
  onHoverWorldPoint?: (worldPoint: WorldPoint | null) => void
  onHoverLine?: (line: LineEntity | null) => void
  isWorldPointSelected?: (worldPoint: WorldPoint) => boolean
  isLineSelected?: (line: LineEntity) => boolean
  hoveredWorldPoint?: WorldPoint | null
  worldPointEditWindow: { isOpen: boolean; worldPoint: WorldPoint | null }
  onCloseWorldPointEdit: () => void
  onUpdateWorldPoint: (worldPoint: WorldPoint) => void
  onDeleteWorldPoint: (worldPoint: WorldPoint) => void
  onDeleteAllWorldPoints?: () => void
  onEditWorldPointFromManager?: (worldPoint: WorldPoint) => void
  selectedWorldPoints?: WorldPoint[]
  showVPQualityWindow: boolean
  onCloseVPQualityWindow: () => void
  currentViewpoint: Viewpoint | null
}

export const BottomPanel: React.FC<BottomPanelProps> = observer(({
  entityPopups,
  onClosePopup,
  optimizeTrigger,
  linesMap,
  allWorldPoints,
  selectedLines,
  onEditLine,
  onDeleteLine,
  onDeleteAllLines,
  onUpdateLine,
  onToggleLineVisibility,
  onSelectLine,
  onCreateLine,
  selectedPlanes,
  onEditPlane,
  onDeletePlane,
  onTogglePlaneVisibility,
  onSelectPlane,
  worldPointsMap,
  viewpointsMap,
  onEditImagePoint,
  onDeleteImagePoint,
  onDeleteAllImagePoints,
  onSelectImagePoint,
  constraints,
  allLines,
  onEditConstraint,
  onDeleteConstraint,
  onDeleteAllConstraints,
  onSelectConstraint,
  onEditCoplanarConstraint,
  onDeleteCoplanarConstraint,
  onDeleteAllCoplanarConstraints,
  onSelectCoplanarConstraint,
  onHoverCoplanarConstraint,
  selectedCoplanarConstraints = [],
  hoveredCoplanarConstraint,
  project,
  onOptimizationStart,
  onOptimizationComplete,
  onSelectWorldPoint,
  onHoverWorldPoint,
  onHoverLine,
  isWorldPointSelected,
  isLineSelected,
  hoveredWorldPoint,
  worldPointEditWindow,
  onCloseWorldPointEdit,
  onUpdateWorldPoint,
  onDeleteWorldPoint,
  onDeleteAllWorldPoints,
  onEditWorldPointFromManager,
  selectedWorldPoints = [],
  showVPQualityWindow,
  onCloseVPQualityWindow,
  currentViewpoint
}) => {
  return (
    <>
      <WorldPointsManager
        isOpen={entityPopups.showWorldPointsPopup}
        onClose={() => onClosePopup('showWorldPointsPopup')}
        worldPoints={worldPointsMap}
        viewpoints={viewpointsMap}
        selectedWorldPoints={selectedWorldPoints}
        onEditWorldPoint={onEditWorldPointFromManager}
        onDeleteWorldPoint={onDeleteWorldPoint}
        onDeleteAllWorldPoints={onDeleteAllWorldPoints}
        onSelectWorldPoint={onSelectWorldPoint}
      />

      <LinesManager
        isOpen={entityPopups.showLinesPopup}
        onClose={() => onClosePopup('showLinesPopup')}
        lines={linesMap}
        allWorldPoints={allWorldPoints}
        selectedLines={selectedLines}
        onEditLine={onEditLine}
        onDeleteLine={onDeleteLine}
        onDeleteAllLines={onDeleteAllLines}
        onUpdateLine={onUpdateLine}
        onToggleLineVisibility={onToggleLineVisibility}
        onSelectLine={onSelectLine}
        onCreateLine={onCreateLine}
      />

      <PlanesManager
        isOpen={entityPopups.showPlanesPopup}
        onClose={() => onClosePopup('showPlanesPopup')}
        planes={[]}
        allWorldPoints={allWorldPoints}
        selectedPlanes={selectedPlanes}
        onEditPlane={onEditPlane}
        onDeletePlane={onDeletePlane}
        onTogglePlaneVisibility={onTogglePlaneVisibility}
        onSelectPlane={onSelectPlane}
      />

      <ImagePointsManager
        isOpen={entityPopups.showImagePointsPopup}
        onClose={() => onClosePopup('showImagePointsPopup')}
        worldPoints={worldPointsMap}
        images={viewpointsMap}
        onEditImagePoint={onEditImagePoint}
        onDeleteImagePoint={onDeleteImagePoint}
        onDeleteAllImagePoints={onDeleteAllImagePoints}
        onSelectImagePoint={onSelectImagePoint}
      />

      <ConstraintsManager
        isOpen={entityPopups.showConstraintsPopup}
        onClose={() => onClosePopup('showConstraintsPopup')}
        constraints={constraints}
        allWorldPoints={allWorldPoints}
        allLines={allLines}
        onEditConstraint={onEditConstraint}
        onDeleteConstraint={onDeleteConstraint}
        onDeleteAllConstraints={onDeleteAllConstraints}
        onSelectConstraint={onSelectConstraint}
      />

      {project && (
        <CoplanarConstraintsManager
          isOpen={entityPopups.showCoplanarConstraintsPopup}
          onClose={() => onClosePopup('showCoplanarConstraintsPopup')}
          constraints={project.coplanarConstraints}
          selectedConstraints={selectedCoplanarConstraints}
          onEditConstraint={onEditCoplanarConstraint}
          onDeleteConstraint={onDeleteCoplanarConstraint}
          onDeleteAllConstraints={onDeleteAllCoplanarConstraints}
          onSelectConstraint={onSelectCoplanarConstraint}
        />
      )}

      {project && (
        <OptimizationPanel
          isOpen={entityPopups.showOptimizationPanel}
          onClose={() => onClosePopup('showOptimizationPanel')}
          project={project}
          onOptimizationStart={onOptimizationStart}
          onOptimizationComplete={onOptimizationComplete}
          onSelectWorldPoint={onSelectWorldPoint}
          onSelectLine={onSelectLine}
          onSelectCoplanarConstraint={onSelectCoplanarConstraint}
          onHoverWorldPoint={onHoverWorldPoint}
          onHoverLine={onHoverLine}
          onHoverCoplanarConstraint={onHoverCoplanarConstraint}
          isWorldPointSelected={isWorldPointSelected}
          isLineSelected={isLineSelected}
          isCoplanarConstraintSelected={(c) => selectedCoplanarConstraints.includes(c)}
          hoveredWorldPoint={hoveredWorldPoint}
          hoveredCoplanarConstraint={hoveredCoplanarConstraint}
          autoStart={true}
          optimizeTrigger={optimizeTrigger}
        />
      )}

      {worldPointEditWindow.worldPoint && (
        <WorldPointEditor
          isOpen={worldPointEditWindow.isOpen}
          onClose={onCloseWorldPointEdit}
          worldPoint={worldPointEditWindow.worldPoint}
          onUpdateWorldPoint={onUpdateWorldPoint}
          onDeleteWorldPoint={onDeleteWorldPoint}
          onDeleteImagePoint={onDeleteImagePoint}
          images={viewpointsMap}
        />
      )}

      <VanishingPointQualityWindow
        isOpen={showVPQualityWindow}
        onClose={onCloseVPQualityWindow}
        currentViewpoint={currentViewpoint}
      />
    </>
  )
})
