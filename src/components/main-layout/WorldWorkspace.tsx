import React from 'react'

import WorldView, { WorldViewRef } from '../WorldView'
import { Project } from '../../entities/project'
import { WorldPoint } from '../../entities/world-point'
import { Line } from '../../entities/line'
import type { Plane } from '../../entities/plane'
import type { ISelectable } from '../../types/selectable'

interface WorldWorkspaceProps {
  project: Project
  worldViewRef: React.RefObject<WorldViewRef>
  selectedEntities: ISelectable[]
  hoveredConstraintId: string | null
  onPointClick: (worldPoint: WorldPoint, ctrlKey: boolean, shiftKey: boolean) => void
  onLineClick: (line: Line, ctrlKey: boolean, shiftKey: boolean) => void
  onPlaneClick: (plane: Plane, ctrlKey: boolean, shiftKey: boolean) => void
  onPointRightClick?: (worldPoint: WorldPoint) => void
  onLineRightClick?: (line: Line) => void
}

const WorldWorkspace: React.FC<WorldWorkspaceProps> = ({
  project,
  worldViewRef,
  selectedEntities,
  hoveredConstraintId,
  onPointClick,
  onLineClick,
  onPlaneClick,
  onPointRightClick,
  onLineRightClick
}) => (
  <div className="workspace-world-view">
    <WorldView
      ref={worldViewRef}
      project={project}
      selectedEntities={selectedEntities}
      hoveredConstraintId={hoveredConstraintId}
      onPointClick={onPointClick}
      onLineClick={onLineClick}
      onPlaneClick={onPlaneClick}
      onPointRightClick={onPointRightClick}
      onLineRightClick={onLineRightClick}
    />
  </div>
)

export default WorldWorkspace
