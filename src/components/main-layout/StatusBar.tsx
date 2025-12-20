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

      <div style={{
        marginLeft: '12px',
        padding: '4px 12px',
        backgroundColor: __WORKTREE_NAME__ === 'main' ? '#1a4d2e' : '#8b4513',
        color: '#fff',
        borderRadius: '4px',
        fontWeight: 'bold',
        fontSize: '13px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        border: '2px solid ' + (__WORKTREE_NAME__ === 'main' ? '#2d7a4d' : '#d2691e')
      }}>
        {__WORKTREE_NAME__ === 'main' ? __WORKTREE_NAME__ : __WORKTREE_NAME__.replace('Pictorigo-', '')}
      </div>

      <span style={{ marginLeft: '12px', color: '#888' }}>v0.4-ENHANCED</span>

      <VisibilityPanel
        viewSettings={project.viewSettings}
        onVisibilityChange={onVisibilityChange}
        onLockingChange={onLockingChange}
      />
    </div>
  )
})
