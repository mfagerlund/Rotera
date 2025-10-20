// Lines Management Popup

import React, { useState } from 'react'
import EntityListPopup, { EntityListItem } from './EntityListPopup'
import FloatingWindow from './FloatingWindow'
import LineCreationTool from './tools/LineCreationTool'
import { Line } from '../entities/line'
import { WorldPoint } from '../entities/world-point'

interface LinesManagerProps {
  isOpen: boolean
  onClose: () => void
  lines: Map<string, Line>
  worldPoints: Map<string, WorldPoint>
  worldPointNames: Record<string, string>
  selectedLines?: string[]
  onEditLine?: (line: Line) => void
  onDeleteLine?: (line: Line) => void
  onDeleteAllLines?: () => void
  onUpdateLine?: (updatedLine: Line) => void
  onToggleLineVisibility?: (lineId: string) => void
  onSelectLine?: (line: Line) => void
  onCreateLine?: (pointA: WorldPoint, pointB: WorldPoint, constraints?: any) => void
}

export const LinesManager: React.FC<LinesManagerProps> = ({
  isOpen,
  onClose,
  lines,
  worldPoints,
  worldPointNames,
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

  const getPointName = (pointId: string) => worldPointNames[pointId] || pointId

  // Convert lines to EntityListItem format
  const lineEntities: EntityListItem[] = Array.from(lines.values()).map(line => {
    const dirVector = line.getDirection()
    const dirLabel = dirVector ? 'constrained' : 'free'

    return {
      id: line.getId(),
      name: line.getName(),
      displayInfo: `${getPointName(line.pointA.getId())} ↔ ${getPointName(line.pointB.getId())}`,
      additionalInfo: [
        line.isConstruction ? 'Construction line' : 'Driving line',
        ...(dirLabel !== 'free' ? [`Direction: ${dirLabel}`] : []),
        ...(line.constraints.targetLength ? [`Length: ${line.constraints.targetLength}m`] : [])
      ],
      color: line.color,
      isVisible: line.isVisible,
      isActive: selectedLines.includes(line.getId())
    }
  })

  const handleEdit = (lineId: string) => {
    const line = lines.get(lineId)
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
        onDelete={onDeleteLine ? (lineId) => {
          const line = lines.get(lineId)
          if (line) {
            onDeleteLine(line)
          }
        } : undefined}
        onDeleteAll={onDeleteAllLines}
        onToggleVisibility={onToggleLineVisibility}
        onSelect={onSelectLine ? (lineId) => {
          const line = lines.get(lineId)
          if (line) {
            onSelectLine(line)
          }
        } : undefined}
        renderEntityDetails={(entity) => {
          const line = lines.get(entity.id)
          if (!line) return null
          const dirVector = line.getDirection()
          return (
            <div className="line-details">
              {line.constraints.targetLength && (
                <div className="constraint-badge">
                  Length: {line.constraints.targetLength}m
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
            selectedPoints={[editingLine.pointA.getId(), editingLine.pointB.getId()]}
            worldPointNames={worldPointNames}
            worldPoints={worldPoints}
            existingLines={lines}
            onCreateLine={() => {}} // Not used in edit mode
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