import React from 'react'
import { observer } from 'mobx-react-lite'
import { WorldPoint } from '../../entities/world-point'
import { Line as LineEntity } from '../../entities/line'
import { Viewpoint } from '../../entities/viewpoint'
import { Project } from '../../entities/project'
import LinesManager from '../LinesManager'
import PlanesManager from '../PlanesManager'
import ImagePointsManager, { ImagePointReference } from '../ImagePointsManager'
import ConstraintsManager from '../ConstraintsManager'
import WorldPointEditor from '../WorldPointEditor'
import { VanishingPointQualityWindow } from '../VanishingPointQualityWindow'
import OptimizationPanel from '../OptimizationPanel'
import FloatingWindow from '../FloatingWindow'

interface BottomPanelProps {
  entityPopups: {
    showLinesPopup: boolean
    showPlanesPopup: boolean
    showImagePointsPopup: boolean
    showConstraintsPopup: boolean
    showOptimizationPanel: boolean
  }
  onClosePopup: (popup: string) => void
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
  worldPointsMap: Map<string, WorldPoint>
  viewpointsMap: Map<string, Viewpoint>
  onEditImagePoint: (ref: ImagePointReference) => void
  onDeleteImagePoint: (ref: ImagePointReference) => void
  onSelectImagePoint: (ref: ImagePointReference) => void
  constraints: any[]
  allLines: LineEntity[]
  onEditConstraint: (constraint: any) => void
  onDeleteConstraint: (constraint: any) => void
  onToggleConstraint: (constraint: any) => void
  onSelectConstraint: (constraint: any) => void
  project: Project | null
  onOptimizationComplete: (success: boolean, message: string) => void
  onSelectWorldPoint?: (worldPoint: WorldPoint) => void
  onHoverWorldPoint?: (worldPoint: WorldPoint | null) => void
  onHoverLine?: (line: LineEntity | null) => void
  worldPointEditWindow: { isOpen: boolean; worldPoint: WorldPoint | null }
  onCloseWorldPointEdit: () => void
  onUpdateWorldPoint: (worldPoint: WorldPoint) => void
  onDeleteWorldPoint: (worldPoint: WorldPoint) => void
  showVPQualityWindow: boolean
  onCloseVPQualityWindow: () => void
  currentViewpoint: Viewpoint | null
}

export const BottomPanel: React.FC<BottomPanelProps> = observer(({
  entityPopups,
  onClosePopup,
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
  onSelectImagePoint,
  constraints,
  allLines,
  onEditConstraint,
  onDeleteConstraint,
  onToggleConstraint,
  onSelectConstraint,
  project,
  onOptimizationComplete,
  onSelectWorldPoint,
  onHoverWorldPoint,
  onHoverLine,
  worldPointEditWindow,
  onCloseWorldPointEdit,
  onUpdateWorldPoint,
  onDeleteWorldPoint,
  showVPQualityWindow,
  onCloseVPQualityWindow,
  currentViewpoint
}) => {
  return (
    <>
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
        planes={{}}
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
        onToggleConstraint={onToggleConstraint}
        onSelectConstraint={onSelectConstraint}
      />

      {entityPopups.showOptimizationPanel && (
        <FloatingWindow
          title="Bundle Adjustment Optimization"
          isOpen={entityPopups.showOptimizationPanel}
          onClose={() => onClosePopup('showOptimizationPanel')}
          width={500}
          height={600}
          storageKey="optimization-panel"
        >
          {project && (
            <OptimizationPanel
              project={project}
              onOptimizationComplete={onOptimizationComplete}
              onSelectWorldPoint={onSelectWorldPoint}
              onSelectLine={onSelectLine}
              onHoverWorldPoint={onHoverWorldPoint}
              onHoverLine={onHoverLine}
            />
          )}
        </FloatingWindow>
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
