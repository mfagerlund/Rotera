import React from 'react'

import WorldView, { WorldViewRef } from '../WorldView'
import { EntityProject } from '../../types/project-entities'
import { WorldPoint } from '../../entities/world-point'
import { Line } from '../../entities/line'

interface WorldWorkspaceProps {
  project: EntityProject
  worldViewRef: React.RefObject<WorldViewRef>
  selectedPointIds: string[]
  selectedLineIds: string[]
  selectedPlaneIds: string[]
  hoveredConstraintId: string | null
  onPointClick: (worldPoint: WorldPoint, ctrlKey: boolean, shiftKey: boolean) => void
  onLineClick: (line: Line, ctrlKey: boolean, shiftKey: boolean) => void
  onPlaneClick: (planeId: string, ctrlKey: boolean, shiftKey: boolean) => void
}

const WorldWorkspace: React.FC<WorldWorkspaceProps> = ({
  project,
  worldViewRef,
  selectedPointIds,
  selectedLineIds,
  selectedPlaneIds,
  hoveredConstraintId,
  onPointClick,
  onLineClick,
  onPlaneClick
}) => (
  <div className="workspace-world-view">
    <WorldView
      ref={worldViewRef}
      project={project}
      selectedPoints={selectedPointIds}
      selectedLines={selectedLineIds}
      selectedPlanes={selectedPlaneIds}
      hoveredConstraintId={hoveredConstraintId}
      onPointClick={onPointClick}
      onLineClick={onLineClick}
      onPlaneClick={onPlaneClick}
    />
  </div>
)

export default WorldWorkspace
