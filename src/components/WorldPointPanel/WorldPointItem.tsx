import React, { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowsLeftRight,
  faBullseye,
  faCamera,
  faGear,
  faLocationDot,
  faTriangleExclamation
} from '@fortawesome/free-solid-svg-icons'
import { faCircle } from '@fortawesome/free-regular-svg-icons'
import type { WorldPoint } from '../../entities/world-point'
import type { Constraint } from '../../entities/constraints/base-constraint'
import { getEntityKey } from '../../utils/entityKeys'
import { setDraggingWorldPoint, clearDraggingWorldPoint } from '../../utils/dragContext'
import { getConstraintDisplayName } from '../../utils/constraintDisplay'

interface WorldPointItemProps {
  worldPoint: WorldPoint
  imagePointCount: number
  isSelected: boolean
  involvedConstraints: Constraint[]
  hasBrokenConstraints: boolean
  isMissingFromImage: boolean
  isInPlacementMode: boolean
  placementModeActive: boolean
  wasRecentlyCreated: boolean
  wasJustPlaced: boolean
  isGloballyHovered: boolean
  onSelect: (ctrlKey: boolean, shiftKey: boolean) => void
  onEdit: () => void
  onHighlight: (worldPoint: WorldPoint | null) => void
  onHover?: (worldPoint: WorldPoint | null) => void
  onStartPlacement: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

export const WorldPointItem: React.FC<WorldPointItemProps> = ({
  worldPoint,
  imagePointCount,
  isSelected,
  involvedConstraints,
  hasBrokenConstraints,
  isMissingFromImage,
  isInPlacementMode,
  placementModeActive,
  wasRecentlyCreated,
  wasJustPlaced,
  isGloballyHovered,
  onSelect,
  onEdit,
  onHighlight,
  onHover,
  onStartPlacement,
  onContextMenu
}) => {
  const [showActions, setShowActions] = useState(false)
  const [showConstraints, setShowConstraints] = useState(false)

  const itemClasses = [
    'world-point-item',
    isSelected ? 'selected' : '',
    hasBrokenConstraints ? 'broken' : '',
    isMissingFromImage ? 'missing-from-image' : '',
    isInPlacementMode ? 'in-placement-mode' : '',
    wasRecentlyCreated ? 'just-created' : '',
    wasJustPlaced ? 'optimistic-feedback' : '',
    isGloballyHovered ? 'globally-hovered' : ''
  ].filter(Boolean).join(' ')

  const constraintsText = involvedConstraints.length > 0
    ? `Used in ${involvedConstraints.length} constraint${involvedConstraints.length !== 1 ? 's' : ''}`
    : 'No constraints yet'

  return (
    <div
      className={itemClasses}
      draggable={true}
      onDragStart={(e) => {
        const action = imagePointCount > 0 ? 'move' : 'place'
        e.dataTransfer.setData('application/json', JSON.stringify({
          type: 'world-point',
          worldPointKey: getEntityKey(worldPoint),
          action
        }))
        e.dataTransfer.effectAllowed = 'copy'
        e.currentTarget.style.opacity = '0.5'
        setDraggingWorldPoint(worldPoint, action)
      }}
      onDragEnd={(e) => {
        e.currentTarget.style.opacity = '1'
        clearDraggingWorldPoint()
      }}
      onClick={(e) => {
        if (e.shiftKey) e.preventDefault()
        onSelect(e.ctrlKey || e.metaKey, e.shiftKey)
      }}
      onContextMenu={onContextMenu}
      onMouseEnter={() => {
        setShowActions(true)
        onHighlight(worldPoint)
        if (onHover) {
          onHover(worldPoint)
        }
      }}
      onMouseLeave={() => {
        setShowActions(false)
        onHighlight(null)
        if (onHover) {
          onHover(null)
        }
      }}
    >
      <div className="wp-item-main">
        <div className="wp-item-content">
          <div className="wp-color-dot world-point-hover" style={{ backgroundColor: worldPoint.color }} title={`Point: ${worldPoint.getName()}`} />

          <div className="wp-name" title={constraintsText}>{worldPoint.getName()}</div>

          <div className="wp-info">
            <span className="image-count" title={`Visible in ${imagePointCount} image${imagePointCount !== 1 ? 's' : ''}`}>
              <span className="count-icon"><FontAwesomeIcon icon={faCamera} /></span>
              <span>{imagePointCount}</span>
            </span>

            {involvedConstraints.length > 0 && (
              <span className="constraint-count" title={constraintsText}>
                <span className="count-icon"><FontAwesomeIcon icon={faGear} /></span>
                <span>{involvedConstraints.length}</span>
              </span>
            )}

            {hasBrokenConstraints && (
              <span className="broken-indicator" title="Some constraints are broken - check connections"><FontAwesomeIcon icon={faTriangleExclamation} /></span>
            )}

            {isInPlacementMode && (
              <span className="placement-indicator" title="Click on image to place this point"><FontAwesomeIcon icon={faBullseye} /></span>
            )}
          </div>
        </div>

        <div className="wp-item-actions visible">
          {!placementModeActive && (
            <>
              {isMissingFromImage && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onStartPlacement()
                  }}
                  className="btn-place"
                  title="Place this point on current image"
                >
                  <FontAwesomeIcon icon={faLocationDot} />
                </button>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit()
                }}
                className="btn-edit"
                title="Edit world point properties"
              >
                <FontAwesomeIcon icon={faGear} />
              </button>

              {involvedConstraints.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowConstraints(!showConstraints)
                  }}
                  className="btn-constraints"
                  title="Show involved constraints"
                >
                  <FontAwesomeIcon icon={faArrowsLeftRight} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {showConstraints && involvedConstraints.length > 0 && (
        <div className="wp-constraints">
          {involvedConstraints.map(constraint => {
            const constraintType = constraint.getConstraintType()
            return (
              <div
                key={getEntityKey(constraint)}
                className="wp-constraint-item constraint-completion"
              >
                <span className="constraint-icon">{getConstraintIcon(constraintType)}</span>
                <span className="constraint-name">{getConstraintDisplayName(constraint)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function getConstraintIcon(type: string): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    distance: '↔',
    angle: '∠',
    perpendicular: '⊥',
    parallel: '∥',
    collinear: '─',
    rectangle: '▭',
    circle: <FontAwesomeIcon icon={faCircle} />,
    fixed: '📌',
    horizontal: <FontAwesomeIcon icon={faArrowsLeftRight} />,
    vertical: '↕'
  }
  return icons[type] || <FontAwesomeIcon icon={faGear} />
}
