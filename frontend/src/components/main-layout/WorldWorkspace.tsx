import React from 'react'

import WorldView, { WorldViewRef } from '../WorldView'
import { Project } from '../../types/project'

interface WorldWorkspaceProps {
  project: Project
  worldViewRef: React.RefObject<WorldViewRef>
  selectedPointIds: string[]
  selectedLineIds: string[]
  selectedPlaneIds: string[]
  hoveredConstraintId: string | null
  onPointClick: (pointId: string, ctrlKey: boolean, shiftKey: boolean) => void
  onLineClick: (lineId: string, ctrlKey: boolean, shiftKey: boolean) => void
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
