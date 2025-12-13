// Lines Management Popup

import React, { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPencil, faTrash } from '@fortawesome/free-solid-svg-icons'
import FloatingWindow from './FloatingWindow'
import LineCreationTool from './tools/LineCreationTool'
import { Line } from '../entities/line'
import { WorldPoint } from '../entities/world-point'
import { useConfirm } from './ConfirmDialog'

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

export const LinesManager: React.FC<LinesManagerProps> = observer(({
  isOpen,
  onClose,
  lines,
  allWorldPoints,
  selectedLines = [],
  onEditLine,
  onDeleteLine,
  onDeleteAllLines,
  onUpdateLine,
  onSelectLine
}) => {
  const { confirm, dialog } = useConfirm()
  const [editingLine, setEditingLine] = useState<Line | null>(null)

  const linesList = Array.from(lines.values())

  const handleEdit = (line: Line) => {
    setEditingLine(line)
  }

  const handleCloseEdit = () => {
    setEditingLine(null)
  }

  const handleUpdateLine = (updatedLine: Line) => {
    onUpdateLine?.(updatedLine)
    setEditingLine(null)
  }

  const handleDelete = async (line: Line) => {
    if (await confirm(`Delete line "${line.getName()}"?`)) {
      onDeleteLine?.(line)
    }
  }

  const handleDeleteAll = async () => {
    if (await confirm(`Delete all ${linesList.length} lines?`)) {
      onDeleteAllLines?.()
    }
  }

  const getDirectionLabel = (line: Line): string => {
    const dir = line.direction
    if (!dir) return '-'
    return dir.toUpperCase()
  }

  const formatResidual = (line: Line): string => {
    const info = line.getOptimizationInfo()
    if (info.residuals.length === 0) return '-'
    return info.rmsResidual.toFixed(2)
  }

  const formatLength = (line: Line): string => {
    const currentLength = line.length()
    if (currentLength === null) return '-'
    if (line.targetLength) {
      return `${currentLength.toFixed(2)}m (${line.targetLength}m)`
    }
    return `${currentLength.toFixed(2)}m`
  }

  return (
    <>
      {dialog}
      <FloatingWindow
        title={`Lines (${linesList.length})`}
        isOpen={isOpen && !editingLine}
        onClose={onClose}
        width={500}
        maxHeight={400}
        storageKey="lines-popup"
        showOkCancel={false}
        onDelete={linesList.length > 0 && onDeleteAllLines ? handleDeleteAll : undefined}
      >
        <div className="lines-manager">
          {linesList.length === 0 ? (
            <div className="lines-manager__empty">No lines created yet</div>
          ) : (
            <table className="lines-manager__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Points</th>
                  <th>Dir</th>
                  <th>Length</th>
                  <th>Residual</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {linesList.map(line => {
                  const isSelected = selectedLines.some(l => l === line)
                  return (
                    <tr
                      key={line.pointA.name + '-' + line.pointB.name}
                      className={isSelected ? 'selected' : ''}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectLine?.(line)
                      }}
                    >
                      <td>
                        <span
                          className="color-dot"
                          style={{ backgroundColor: line.color }}
                        />
                        {line.getName()}
                      </td>
                      <td className="points-cell">
                        {line.pointA.getName()} - {line.pointB.getName()}
                      </td>
                      <td className="dir-cell">{getDirectionLabel(line)}</td>
                      <td className="length-cell">{formatLength(line)}</td>
                      <td className="residual-cell">{formatResidual(line)}</td>
                      <td className="actions-cell">
                        <button
                          className="btn-icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEdit(line)
                          }}
                          title="Edit"
                        >
                          <FontAwesomeIcon icon={faPencil} />
                        </button>
                        <button
                          className="btn-icon btn-danger-icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(line)
                          }}
                          title="Delete"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </FloatingWindow>

      {/* Line Edit Window */}
      {editingLine && (
        <FloatingWindow
          title={`Edit Line: ${editingLine.getName()}`}
          isOpen={true}
          onClose={handleCloseEdit}
          width={350}
          maxHeight={500}
          storageKey="line-edit-popup"
          showOkCancel={true}
          okText="Update"
          cancelText="Cancel"
          onOk={() => {
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
})

export default LinesManager
