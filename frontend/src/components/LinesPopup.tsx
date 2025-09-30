// Lines Management Popup

import React, { useState } from 'react'
import EntityListPopup, { EntityListItem } from './EntityListPopup'
import FloatingWindow from './FloatingWindow'
import LineCreationTool from './tools/LineCreationTool'
import { Line } from '../types/project'

interface LinesPopupProps {
  isOpen: boolean
  onClose: () => void
  lines: Record<string, Line>
  worldPointNames: Record<string, string>
  selectedLines?: string[]
  onEditLine?: (lineId: string) => void
  onDeleteLine?: (lineId: string) => void
  onDeleteAllLines?: () => void
  onUpdateLine?: (updatedLine: Line) => void
  onToggleLineVisibility?: (lineId: string) => void
  onSelectLine?: (lineId: string) => void
  onCreateLine?: (pointIds: [string, string], constraints?: any) => void
}

export const LinesPopup: React.FC<LinesPopupProps> = ({
  isOpen,
  onClose,
  lines,
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
  const [editingLineId, setEditingLineId] = useState<string | null>(null)

  const getPointName = (pointId: string) => worldPointNames[pointId] || pointId

  // Convert lines to EntityListItem format
  const lineEntities: EntityListItem[] = Object.values(lines).map(line => ({
    id: line.id,
    name: line.name,
    displayInfo: `${getPointName(line.pointA)} ↔ ${getPointName(line.pointB)}`,
    additionalInfo: [
      line.isConstruction ? 'Construction line' : 'Driving line',
      ...(line.constraints?.direction && line.constraints.direction !== 'free' ? [`Direction: ${line.constraints.direction}`] : []),
      ...(line.constraints?.targetLength ? [`Length: ${line.constraints.targetLength}m`] : [])
    ],
    color: line.color,
    isVisible: line.isVisible,
    isActive: selectedLines.includes(line.id)
  }))

  const handleEdit = (lineId: string) => {
    setEditingLineId(lineId)
  }

  const handleCloseEdit = () => {
    setEditingLineId(null)
  }

  const handleUpdateLine = (updatedLine: Line) => {
    onUpdateLine?.(updatedLine)
    setEditingLineId(null)
  }

  const editingLine = editingLineId ? lines[editingLineId] : null

  return (
    <>
      <EntityListPopup
        title="Lines"
        isOpen={isOpen && !editingLineId}
        onClose={onClose}
        entities={lineEntities}
        emptyMessage="No lines created yet"
        storageKey="lines-popup"
        onEdit={handleEdit}
        onDelete={onDeleteLine}
        onDeleteAll={onDeleteAllLines}
        onToggleVisibility={onToggleLineVisibility}
        onSelect={onSelectLine}
        renderEntityDetails={(entity) => {
          const line = lines[entity.id]
          return (
            <div className="line-details">
              {line.constraints?.targetLength && (
                <div className="constraint-badge">
                  Length: {line.constraints.targetLength}m
                </div>
              )}
              {line.constraints?.direction && line.constraints.direction !== 'free' && (
                <div className="constraint-badge">
                  {line.constraints.direction}
                </div>
              )}
            </div>
          )
        }}
      />

      {/* Line Edit Window */}
      {editingLineId && editingLine && (
        <FloatingWindow
          title={`Edit Line: ${editingLine.name}`}
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
        >
          <LineCreationTool
            selectedPoints={[editingLine.pointA, editingLine.pointB]}
            worldPointNames={worldPointNames}
            existingLines={lines}
            onCreateLine={() => {}} // Not used in edit mode
            onCancel={handleCloseEdit}
            isActive={true}
            showHeader={false}
            showActionButtons={false}
            editMode={true}
            existingLine={editingLine}
            onUpdateLine={handleUpdateLine}
            onDeleteLine={onDeleteLine}
          />
        </FloatingWindow>
      )}
    </>
  )
}

export default LinesPopup