// Lines Management Popup

import React, { useState } from 'react'
import EntityListPopup, { EntityListItem } from './EntityListPopup'
import FloatingWindow from './FloatingWindow'
import LineCreationTool from './tools/LineCreationTool'
import { Line } from '../entities/line'
import { WorldPoint } from '../entities/world-point'
import { getEntityKey } from '../utils/entityKeys'

interface LinesManagerProps {
  isOpen: boolean
  onClose: () => void
  lines: Map<string, Line>
  allWorldPoints: WorldPoint[]
  selectedLines?: Line[]
  onEditLine?: (line: Line) => void
  onDeleteLine?: (line: Line) => void
  onDeleteAllLines?: () => void
  onUpdateLine?: (updatedLine: Line) => void
  onToggleLineVisibility?: (line: Line) => void
  onSelectLine?: (line: Line) => void
  onCreateLine?: (pointA: WorldPoint, pointB: WorldPoint, constraints?: any) => void
}

export const LinesManager: React.FC<LinesManagerProps> = ({
  isOpen,
  onClose,
  lines,
  allWorldPoints,
  selectedLines = [],
  onEditLine,
  onDeleteLine,
  onDeleteAllLines,
  onUpdateLine,
  onToggleLineVisibility,
  onSelectLine,
  onCreateLine
}) => {
  const [editingLine, setEditingLine] = useState<Line | null>(null)

  const linesList = Array.from(lines.values())
  const lineMap = new Map<string, Line>()

  const lineEntities: EntityListItem[] = linesList.map(line => {
    const entityKey = getEntityKey(line)
    lineMap.set(entityKey, line)
    const dirVector = line.getDirection()
    const dirLabel = dirVector ? 'constrained' : 'free'

    return {
      id: entityKey,
      name: line.getName(),
      displayInfo: `${line.pointA.getName()} ↔ ${line.pointB.getName()}`,
      additionalInfo: [
        line.isConstruction ? 'Construction line' : 'Driving line',
        ...(dirLabel !== 'free' ? [`Direction: ${dirLabel}`] : []),
        ...(line.targetLength ? [`Length: ${line.targetLength}m`] : [])
      ],
      color: line.color,
      isVisible: line.isVisible,
      isActive: selectedLines.some(l => l === line)
    }
  })

  const handleEdit = (entityId: string) => {
    const line = lineMap.get(entityId)
    if (line) {
      setEditingLine(line)
    }
  }

  const handleCloseEdit = () => {
    setEditingLine(null)
  }

  const handleUpdateLine = (updatedLine: Line) => {
    onUpdateLine?.(updatedLine)
    setEditingLine(null)
  }

  return (
    <>
      <EntityListPopup
        title="Lines"
        isOpen={isOpen && !editingLine}
        onClose={onClose}
        entities={lineEntities}
        emptyMessage="No lines created yet"
        storageKey="lines-popup"
        onEdit={handleEdit}
        onDelete={onDeleteLine ? (entityId) => {
          const line = lineMap.get(entityId)
          if (line) {
            onDeleteLine(line)
          }
        } : undefined}
        onDeleteAll={onDeleteAllLines}
        onToggleVisibility={onToggleLineVisibility ? (entityId) => {
          const line = lineMap.get(entityId)
          if (line) {
            onToggleLineVisibility(line)
          }
        } : undefined}
        onSelect={onSelectLine ? (entityId) => {
          const line = lineMap.get(entityId)
          if (line) {
            onSelectLine(line)
          }
        } : undefined}
        renderEntityDetails={(entity) => {
          const line = lineMap.get(entity.id)
          if (!line) return null
          const dirVector = line.getDirection()
          return (
            <div className="line-details">
              {line.targetLength && (
                <div className="constraint-badge">
                  Length: {line.targetLength}m
                </div>
              )}
              {dirVector && (
                <div className="constraint-badge">
                  Direction constrained
                </div>
              )}
            </div>
          )
        }}
      />

      {/* Line Edit Window */}
      {editingLine && (
        <FloatingWindow
          title={`Edit Line: ${editingLine.getName()}`}
          isOpen={true}
          onClose={handleCloseEdit}
          width={350}
          storageKey="line-edit-popup"
          showOkCancel={true}
          okText="Update"
          cancelText="Cancel"
          onOk={() => {
            // Let the LineCreationTool handle the update through its exposed handler
            const event = new CustomEvent('lineToolSave')
            window.dispatchEvent(event)
          }}
          onCancel={handleCloseEdit}
          onDelete={onDeleteLine && editingLine ? () => {
            onDeleteLine(editingLine)
            handleCloseEdit()
          } : undefined}
        >
          <LineCreationTool
            selectedPoints={[editingLine.pointA, editingLine.pointB]}
            allWorldPoints={allWorldPoints}
            existingLines={lines}
            onCreateLine={() => {}}
            onCancel={handleCloseEdit}
            isActive={true}
            showHeader={false}
            showActionButtons={false}
            editMode={true}
            existingLine={editingLine as any}
            onUpdateLine={handleUpdateLine}
            onDeleteLine={onDeleteLine}
          />
        </FloatingWindow>
      )}
    </>
  )
}

export default LinesManager