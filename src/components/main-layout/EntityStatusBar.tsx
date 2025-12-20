import React from 'react'
import { observer } from 'mobx-react-lite'
import type { Project } from '../../entities/project'

type EntityPopupKey = 'showWorldPointsPopup' | 'showLinesPopup' | 'showPlanesPopup' | 'showImagePointsPopup' | 'showConstraintsPopup' | 'showCoplanarConstraintsPopup' | 'showOptimizationPanel'

interface EntityStatusBarProps {
  project: Project
  selectionStats: {
    point: number
    line: number
    plane: number
    vanishingLine: number
    constraint: number
  }
  mousePosition: { u: number; v: number } | null
  onEntityPopupOpen: (popupName: EntityPopupKey) => void
}

export const EntityStatusBar: React.FC<EntityStatusBarProps> = observer(({
  project,
  selectionStats,
  mousePosition,
  onEntityPopupOpen
}) => {
  return (
    <div className="entity-status-bar">
      <button
        className="entity-status-item"
        onClick={() => onEntityPopupOpen('showWorldPointsPopup')}
        title="Manage world points"
      >
        <span className="entity-status-label">WP</span>
        <span className="entity-status-count">{project.worldPoints.size}</span>
        {selectionStats.point > 0 && <span className="entity-status-selected">({selectionStats.point})</span>}
      </button>
      <button
        className="entity-status-item"
        onClick={() => onEntityPopupOpen('showImagePointsPopup')}
        title="Manage image points"
      >
        <span className="entity-status-label">IP</span>
        <span className="entity-status-count">{Array.from(project.viewpoints).reduce((total, vp) => total + vp.imagePoints.size, 0)}</span>
      </button>
      <button
        className="entity-status-item"
        onClick={() => onEntityPopupOpen('showLinesPopup')}
        title="Manage lines"
      >
        <span className="entity-status-label">Lines</span>
        <span className="entity-status-count">{project.lines.size}</span>
        {selectionStats.line > 0 && <span className="entity-status-selected">({selectionStats.line})</span>}
      </button>
      <button
        className="entity-status-item"
        onClick={() => onEntityPopupOpen('showCoplanarConstraintsPopup')}
        title="Manage coplanar constraints"
      >
        <span className="entity-status-label">Coplanar</span>
        <span className="entity-status-count">{project.coplanarConstraints.length}</span>
      </button>
      <button
        className="entity-status-item"
        onClick={() => onEntityPopupOpen('showConstraintsPopup')}
        title="Manage constraints"
      >
        <span className="entity-status-label">Constraints</span>
        <span className="entity-status-count">{project.nonCoplanarConstraints.length}</span>
      </button>
      {mousePosition && (
        <span className="mouse-position">
          ({mousePosition.u.toFixed(0)}, {mousePosition.v.toFixed(0)})
        </span>
      )}
    </div>
  )
})
