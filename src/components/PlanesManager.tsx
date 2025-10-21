// Planes Management Popup

import React from 'react'
import EntityListPopup, { EntityListItem } from './EntityListPopup'
// Plane is still in legacy types (not yet migrated to entity)
import { Plane } from '../types/project'
import { WorldPoint } from '../entities/world-point'
import type { ISelectable } from '../types/selectable'
import { getEntityKey } from '../utils/entityKeys'

interface PlanesManagerProps {
  isOpen: boolean
  onClose: () => void
  planes: Record<string, Plane>
  allWorldPoints: WorldPoint[]
  selectedPlanes?: ISelectable[]
  onEditPlane?: (plane: Plane) => void
  onDeletePlane?: (plane: Plane) => void
  onTogglePlaneVisibility?: (plane: Plane) => void
  onSelectPlane?: (plane: Plane) => void
}

export const PlanesManager: React.FC<PlanesManagerProps> = ({
  isOpen,
  onClose,
  planes,
  allWorldPoints,
  selectedPlanes = [],
  onEditPlane,
  onDeletePlane,
  onTogglePlaneVisibility,
  onSelectPlane
}) => {
  // NOTE: Planes are still in legacy format and use string IDs to reference points.
  // LEGACY CODE: This violates the "no runtime IDs" rule, but is acceptable because
  // Planes haven't been migrated to the entity architecture yet. When Planes are
  // migrated, they will use WorldPoint object references instead of IDs.
  // TODO: Remove this when Planes are migrated to entity architecture.
  const pointMap = new Map(allWorldPoints.map(p => [p.getName(), p]))
  const planeMap = new Map(Object.entries(planes).map(([id, plane]) => [id, plane]))

  // LEGACY: Try to look up by name, fall back to showing the ID
  const getPointName = (pointId: string) => {
    // First try direct lookup by name
    const point = pointMap.get(pointId)
    if (point) return point.getName()

    // Try without prefix (in case ID was "point-Name" and name is "Name")
    const withoutPrefix = pointId.replace(/^point-/, '')
    const pointByStripped = pointMap.get(withoutPrefix)
    if (pointByStripped) return pointByStripped.getName()

    // Fall back to showing the ID
    return pointId
  }

  const getPlaneDefinitionInfo = (plane: Plane): string[] => {
    const info: string[] = []

    switch (plane.definition.type) {
      case 'three_points':
        if (plane.definition.pointIds) {
          const [p1, p2, p3] = plane.definition.pointIds
          info.push(`Points: ${getPointName(p1)}, ${getPointName(p2)}, ${getPointName(p3)}`)
        }
        break
      case 'two_lines':
        if (plane.definition.lineIds) {
          info.push(`Lines: ${plane.definition.lineIds.length} lines`)
        }
        break
      case 'line_point':
        if (plane.definition.lineId && plane.definition.pointId) {
          info.push(`Line + Point: ${plane.definition.pointId}`)
        }
        break
    }

    if (plane.equation) {
      const [a, b, c, d] = plane.equation
      info.push(`Equation: ${a.toFixed(3)}x + ${b.toFixed(3)}y + ${c.toFixed(3)}z + ${d.toFixed(3)} = 0`)
    }

    if (plane.isConstruction) {
      info.push('Construction plane')
    }

    return info
  }

  // Convert planes to EntityListItem format
  const planeEntities: EntityListItem<Plane>[] = Object.values(planes).map(plane => ({
    id: plane.id,
    name: plane.name,
    displayInfo: `${plane.definition.type.replace('_', ' ')}`,
    additionalInfo: getPlaneDefinitionInfo(plane),
    color: plane.color,
    isVisible: plane.isVisible,
    isActive: selectedPlanes.some(p => p.getType() === 'plane' && p.getName() === plane.name),
    entity: plane  // Pass the actual Plane object
  }))

  return (
    <EntityListPopup
      title="Planes"
      isOpen={isOpen}
      onClose={onClose}
      entities={planeEntities}
      emptyMessage="No planes created yet"
      storageKey="planes-popup"
      onEdit={onEditPlane}
      onDelete={onDeletePlane}
      onToggleVisibility={onTogglePlaneVisibility}
      onSelect={onSelectPlane}
      renderEntityDetails={(entityItem) => {
        const plane = entityItem.entity
        return (
          <div className="plane-details">
            <div className="definition-type">
              Type: {plane.definition.type.replace('_', ' ')}
            </div>
          </div>
        )
      }}
    />
  )
}

export default PlanesManager