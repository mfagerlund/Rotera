// Line Creation Tool with slot-based selection

import React, { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { useConfirm } from '../ConfirmDialog'
import { WorldPoint } from '../../entities/world-point'
import { Line } from '../../entities/line'
import { useLineCreation } from './useLineCreation'
import { LineCreationToolPanel } from './LineCreationToolPanel'

// RENAME_TO: LineEditor (handles both creation and editing)
interface LineCreationToolProps {
  selectedPoints: WorldPoint[]
  allWorldPoints: WorldPoint[]
  existingLines: Map<string, Line>
  onCreateLine: (pointA: WorldPoint, pointB: WorldPoint, constraints?: LineConstraints) => void
  onCancel: () => void
  onConstructionPreviewChange?: (preview: {
    type: 'line'
    pointA?: WorldPoint
    pointB?: WorldPoint
    showToCursor?: boolean
  } | null) => void
  isActive: boolean
  showHeader?: boolean
  showActionButtons?: boolean
  editMode?: boolean
  existingLine?: Line
  existingConstraints?: unknown[]
  onUpdateLine?: (lineEntity: Line, updatedLine: Partial<LineConstraints & { name: string; color: string; isConstruction: boolean }>) => void
  onDeleteLine?: (line: Line) => void
}

import { LineDirection } from '../../entities/line'

interface LineConstraints {
  name?: string
  color?: string
  isConstruction?: boolean
  direction?: LineDirection
  targetLength?: number
  tolerance?: number
}

// RENAME_TO: LineEditor
export const LineCreationTool: React.FC<LineCreationToolProps> = observer(({
  selectedPoints,
  allWorldPoints,
  existingLines,
  onCreateLine,
  onCancel,
  onConstructionPreviewChange,
  isActive,
  showHeader = true,
  showActionButtons = true,
  editMode = false,
  existingLine,
  existingConstraints = [],
  onUpdateLine,
  onDeleteLine
}) => {
  const { confirm, dialog } = useConfirm()

  const {
    pointSlot1,
    pointSlot2,
    direction,
    lengthValue,
    lineName,
    lineColor,
    isConstruction,
    activeSlot,
    lineCheck,
    canCreateLine,
    collinearPoints,
    setPointSlot1,
    setPointSlot2,
    setDirection,
    setLengthValue,
    setLineName,
    setLineColor,
    setIsConstruction,
    setCollinearPoints,
    clearSlot1,
    clearSlot2,
    handleSlot1Focus,
    handleSlot2Focus,
    handleCreateLine,
    handleDeleteLine
  } = useLineCreation({
    selectedPoints,
    existingLines,
    isActive,
    editMode,
    existingLine,
    onConstructionPreviewChange,
    onCancel,
    onCreateLine,
    onUpdateLine,
    onDeleteLine
  })

  // Listen for external save trigger (from FloatingWindow OK button)
  useEffect(() => {
    if (!isActive) return

    const handleExternalSave = () => {
      handleCreateLine()
    }

    const handleExternalDelete = () => {
      handleDeleteLine(confirm)
    }

    window.addEventListener('lineToolSave', handleExternalSave)
    window.addEventListener('lineToolDelete', handleExternalDelete)
    return () => {
      window.removeEventListener('lineToolSave', handleExternalSave)
      window.removeEventListener('lineToolDelete', handleExternalDelete)
    }
  }, [isActive, handleCreateLine, handleDeleteLine, confirm])

  if (!isActive) return null

  return (
    <>
      {dialog}
      {showHeader && (
        <div className="tool-header">
          <h4>{editMode ? `Edit Line: ${existingLine?.name || 'Line'}` : 'Line Creation'}</h4>
          <button
            className="btn-cancel"
            onClick={onCancel}
            title={editMode ? "Cancel edit (Esc)" : "Cancel line creation (Esc)"}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      )}

      <LineCreationToolPanel
        lineName={lineName}
        lineColor={lineColor}
        isConstruction={isConstruction}
        onLineNameChange={setLineName}
        onLineColorChange={setLineColor}
        onIsConstructionChange={setIsConstruction}
        pointSlot1={pointSlot1}
        pointSlot2={pointSlot2}
        allWorldPoints={allWorldPoints}
        onPointSlot1Change={setPointSlot1}
        onPointSlot2Change={setPointSlot2}
        onSlot1Focus={handleSlot1Focus}
        onSlot2Focus={handleSlot2Focus}
        onClearSlot1={clearSlot1}
        onClearSlot2={clearSlot2}
        direction={direction}
        lengthValue={lengthValue}
        onDirectionChange={setDirection}
        onLengthValueChange={setLengthValue}
        collinearPoints={collinearPoints}
        onCollinearPointsChange={setCollinearPoints}
        lineCheck={lineCheck}
        editMode={editMode}
        canCreateLine={canCreateLine}
        showActionButtons={showActionButtons}
        onCancel={onCancel}
        onCreateLine={handleCreateLine}
      />
    </>
  )
})

export default LineCreationTool