import React from 'react'
import { observer } from 'mobx-react-lite'
import { WorkspaceStatus } from '../WorkspaceManager'
import { VisibilityPanel } from '../VisibilityPanel'
import { EntityStatusBar } from './EntityStatusBar'
import type { Project } from '../../entities/project'
import type { VisibilitySettings, LockSettings } from '../../types/visibility'

type EntityPopupKey = 'showWorldPointsPopup' | 'showLinesPopup' | 'showPlanesPopup' | 'showImagePointsPopup' | 'showConstraintsPopup' | 'showCoplanarConstraintsPopup' | 'showOptimizationPanel'

interface StatusBarProps {
  currentWorkspace: 'image' | 'world' | 'split'
  imageInfo: {
    currentImage?: string
    totalImages: number
    pointsInCurrentImage: number
  }
  worldInfo: {
    totalPoints: number
    totalConstraints: number
    optimizationStatus: string
  }
  project: Project
  selectionStats: {
    point: number
    line: number
    plane: number
    vanishingLine: number
    constraint: number
  }
  mousePosition: { u: number; v: number } | null
  showComponentNames: boolean
  onEntityPopupOpen: (popupName: EntityPopupKey) => void
  onComponentOverlayToggle: () => void
  onVisibilityChange: (key: keyof VisibilitySettings, value: boolean) => void
  onLockingChange: (key: keyof LockSettings, value: boolean) => void
}

export const StatusBar: React.FC<StatusBarProps> = observer(({
  currentWorkspace,
  imageInfo,
  worldInfo,
  project,
  selectionStats,
  mousePosition,
  showComponentNames,
  onEntityPopupOpen,
  onComponentOverlayToggle,
  onVisibilityChange,
  onLockingChange
}) => {
  return (
    <div className="status-bar">
      <WorkspaceStatus
        workspace={currentWorkspace}
        imageInfo={imageInfo}
        worldInfo={worldInfo}
      />

      <EntityStatusBar
        project={project}
        selectionStats={selectionStats}
        mousePosition={mousePosition}
        onEntityPopupOpen={onEntityPopupOpen}
      />

      <button
        type="button"
        className="status-bar__toggle"
        data-active={showComponentNames}
        aria-pressed={showComponentNames}
        onClick={onComponentOverlayToggle}
        title="Toggle component label overlay"
      >
        <span className="status-bar__toggle-indicator" aria-hidden="true" />
        <span className="status-bar__toggle-label">Component labels</span>
      </button>

      
      <VisibilityPanel
        viewSettings={project.viewSettings}
        onVisibilityChange={onVisibilityChange}
        onLockingChange={onLockingChange}
      />
    </div>
  )
})
