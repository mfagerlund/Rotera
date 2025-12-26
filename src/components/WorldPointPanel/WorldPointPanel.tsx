import React from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCrosshairs, faGear, faLocationDot, faTrash } from '@fortawesome/free-solid-svg-icons'
import type { WorldPoint } from '../../entities/world-point'
import type { Viewpoint } from '../../entities/viewpoint'
import type { Constraint } from '../../entities/constraints/base-constraint'
import ContextMenu, { ContextMenuItem } from '../ContextMenu'
import { useConfirm } from '../ConfirmDialog'
import { getConstraintDisplayName } from '../../utils/constraintDisplay'
import { useWorldPointPanel } from './useWorldPointPanel'
import { PlacementModeHeader } from './PlacementModeHeader'
import { MissingPointsNotice } from './MissingPointsNotice'
import { EmptyState } from './EmptyState'
import { WorldPointItem } from './WorldPointItem'
import { getEntityKey } from '../../utils/entityKeys'
import { projectWorldPointToPixel, hasValidCameraPose } from '../../utils/projection'

interface WorldPointPanelProps {
  worldPoints: Set<WorldPoint>
  viewpoints: Map<string, Viewpoint>
  constraints: Constraint[]
  selectedWorldPoints: WorldPoint[]
  hoveredWorldPoint?: WorldPoint | null
  currentViewpoint: Viewpoint | null
  placementMode: { active: boolean; worldPoint: WorldPoint | null }
  onSelectWorldPoint: (worldPoint: WorldPoint, ctrlKey: boolean, shiftKey: boolean) => void
  onRenameWorldPoint: (worldPoint: WorldPoint, newName: string) => void
  onDeleteWorldPoint: (worldPoint: WorldPoint) => void
  onEditWorldPoint?: (worldPoint: WorldPoint) => void
  onHighlightWorldPoint: (worldPoint: WorldPoint | null) => void
  onHoverWorldPoint?: (worldPoint: WorldPoint | null) => void
  onStartPlacement: (worldPoint: WorldPoint) => void
  onCancelPlacement: () => void
  onAddImagePoint?: (worldPoint: WorldPoint, viewpoint: Viewpoint, u: number, v: number) => void
}

export const WorldPointPanel: React.FC<WorldPointPanelProps> = observer(({
  worldPoints,
  viewpoints,
  constraints,
  selectedWorldPoints,
  hoveredWorldPoint,
  currentViewpoint,
  placementMode,
  onSelectWorldPoint,
  onRenameWorldPoint,
  onDeleteWorldPoint,
  onEditWorldPoint,
  onHighlightWorldPoint,
  onHoverWorldPoint,
  onStartPlacement,
  onCancelPlacement,
  onAddImagePoint
}) => {
  const { confirm, dialog } = useConfirm()

  const {
    contextMenu,
    worldPointsList,
    missingWPs,
    latestMissingWP,
    recentlyCreated,
    justPlaced,
    getImagePointCount,
    getConstraintsForWorldPoint,
    hasBrokenConstraints,
    isWorldPointMissingFromImage,
    markAsJustPlaced,
    handleContextMenu,
    closeContextMenu
  } = useWorldPointPanel({
    worldPoints,
    viewpoints,
    constraints,
    currentViewpoint
  })

  // Check if auto-place at reprojection is available for a world point
  const canAutoPlace = (wp: WorldPoint): boolean => {
    if (!currentViewpoint) return false
    if (!isWorldPointMissingFromImage(wp)) return false
    if (!hasValidCameraPose(currentViewpoint)) return false
    if (!wp.optimizedXyz) return false
    const projection = projectWorldPointToPixel(wp, currentViewpoint)
    if (!projection) return false
    return projection.u >= 0 && projection.u <= currentViewpoint.imageWidth &&
           projection.v >= 0 && projection.v <= currentViewpoint.imageHeight
  }

  // Handle auto-placing a world point at its reprojected position
  const handleAutoPlace = (wp: WorldPoint) => {
    if (!currentViewpoint || !onAddImagePoint) return
    const projection = projectWorldPointToPixel(wp, currentViewpoint)
    if (!projection) return
    onAddImagePoint(wp, currentViewpoint, projection.u, projection.v)
    markAsJustPlaced(wp)
  }


  const handleDelete = async (wp: WorldPoint) => {
    const involvedConstraints = getConstraintsForWorldPoint(wp)

    let message = `Delete world point "${wp.getName()}"?`
    if (involvedConstraints.length > 0) {
      message += `\n\nThis will also delete ${involvedConstraints.length} constraint${involvedConstraints.length !== 1 ? 's' : ''}:`
      involvedConstraints.forEach(constraint => {
        message += `\n• ${getConstraintDisplayName(constraint)}`
      })
    }

    if (await confirm(message)) {
      onDeleteWorldPoint(wp)
    }
  }

  const handlePlacement = (wp: WorldPoint) => {
    onStartPlacement(wp)
    markAsJustPlaced(wp)
  }

  const getContextMenuItems = (worldPoint: WorldPoint): ContextMenuItem[] => {
    const items: ContextMenuItem[] = []
    const isMissingFromImage = currentViewpoint && !Array.from(currentViewpoint.imagePoints).some(ip => ip.worldPoint === worldPoint)

    if (onEditWorldPoint) {
      items.push({
        id: 'edit-properties',
        label: 'Edit Properties',
        icon: faGear,
        onClick: () => onEditWorldPoint(worldPoint)
      })
    }

    if (isMissingFromImage) {
      // Add auto-place option if available
      if (canAutoPlace(worldPoint)) {
        items.push({
          id: 'auto-place',
          label: 'Auto-place at Reprojection',
          icon: faCrosshairs,
          onClick: () => handleAutoPlace(worldPoint)
        })
      }
      items.push({
        id: 'place',
        label: 'Place on Image',
        icon: faLocationDot,
        onClick: () => onStartPlacement(worldPoint)
      })
    }

    if (items.length > 0) {
      items.push({
        id: 'separator',
        label: '',
        separator: true,
        onClick: () => {}
      })
    }

    items.push({
      id: 'delete',
      label: 'Delete',
      icon: faTrash,
      onClick: async () => {
        if (await confirm(`Delete world point "${worldPoint.getName()}"?\n\nThis will also delete any constraints that reference this point.`)) {
          onDeleteWorldPoint(worldPoint)
        }
      }
    })

    return items
  }

  return (
    <>
      {dialog}
      <div className="world-point-panel">
        {placementMode.active && (
          <PlacementModeHeader
            worldPoint={placementMode.worldPoint}
            onCancelPlacement={onCancelPlacement}
          />
        )}

        <div className="panel-header">
          <h3>World Points</h3>
          <div className="point-count status-indicator connected">
            {worldPointsList.length} points
          </div>
        </div>

        {!placementMode.active && (
          <MissingPointsNotice
            missingCount={missingWPs.length}
            latestMissingWP={latestMissingWP}
            onPlaceLatest={() => latestMissingWP && handlePlacement(latestMissingWP)}
          />
        )}

        <div className="world-point-list">
          {worldPointsList.length > 0 ? (
            worldPointsList.map(wp => {
              const isSelected = selectedWorldPoints.some(swp => swp === wp)
              const involvedConstraints = getConstraintsForWorldPoint(wp)
              const hasBroken = hasBrokenConstraints(wp)
              const isMissingFromImage = isWorldPointMissingFromImage(wp)
              const isInPlacementMode = placementMode.worldPoint === wp
              const wasRecentlyCreated = recentlyCreated.has(wp)
              const wasJustPlaced = justPlaced.has(wp)
              const isGloballyHovered = hoveredWorldPoint === wp
              const autoPlaceAvailable = canAutoPlace(wp)

              return (
                <WorldPointItem
                  key={getEntityKey(wp)}
                  worldPoint={wp}
                  imagePointCount={getImagePointCount(wp)}
                  isSelected={isSelected}
                  involvedConstraints={involvedConstraints}
                  hasBrokenConstraints={hasBroken}
                  isMissingFromImage={isMissingFromImage}
                  isInPlacementMode={isInPlacementMode}
                  placementModeActive={placementMode.active}
                  wasRecentlyCreated={wasRecentlyCreated}
                  wasJustPlaced={wasJustPlaced}
                  isGloballyHovered={isGloballyHovered}
                  canAutoPlace={autoPlaceAvailable}
                  onSelect={(ctrlKey, shiftKey) => onSelectWorldPoint(wp, ctrlKey, shiftKey)}
                  onEdit={() => onEditWorldPoint?.(wp)}
                  onHighlight={onHighlightWorldPoint}
                  onHover={onHoverWorldPoint}
                  onStartPlacement={() => handlePlacement(wp)}
                  onAutoPlace={() => handleAutoPlace(wp)}
                  onContextMenu={(e) => handleContextMenu(e, wp)}
                />
              )
            })
          ) : (
            <EmptyState />
          )}
        </div>

        {contextMenu.worldPoint && (
          <ContextMenu
            isOpen={contextMenu.isOpen}
            position={contextMenu.position}
            items={getContextMenuItems(contextMenu.worldPoint)}
            onClose={closeContextMenu}
          />
        )}
      </div>
    </>
  )
})

export default WorldPointPanel
