// Coplanar Constraint Creation/Editing Tool

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrash } from '@fortawesome/free-solid-svg-icons'
import { WorldPoint } from '../../entities/world-point'
import { Line } from '../../entities/line'
import { CoplanarPointsConstraint } from '../../entities/constraints/coplanar-points-constraint'
import { getEntityKey } from '../../utils/entityKeys'

interface CoplanarCreationToolProps {
  selectedPoints: WorldPoint[]
  selectedLines: Line[]
  allWorldPoints: WorldPoint[]
  onCreateConstraint: (constraint: CoplanarPointsConstraint) => void
  onUpdateConstraint?: (constraint: CoplanarPointsConstraint, updates: { name: string; points: WorldPoint[] }) => void
  onDeleteConstraint?: (constraint: CoplanarPointsConstraint) => void
  onCancel: () => void
  isActive: boolean
  editMode?: boolean
  existingConstraint?: CoplanarPointsConstraint
}

export const CoplanarCreationTool: React.FC<CoplanarCreationToolProps> = observer(({
  selectedPoints,
  selectedLines,
  allWorldPoints,
  onCreateConstraint,
  onUpdateConstraint,
  onDeleteConstraint,
  onCancel,
  isActive,
  editMode = false,
  existingConstraint
}) => {
  const [constraintName, setConstraintName] = useState<string>('')
  const [points, setPoints] = useState<WorldPoint[]>([])
  const [hasChanges, setHasChanges] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)

  // Use refs to capture initial selection without triggering re-renders
  const initialSelectedPointsRef = useRef<WorldPoint[]>([])
  const initialSelectedLinesRef = useRef<Line[]>([])

  // Capture initial selection when tool becomes active (before initialization)
  useEffect(() => {
    if (isActive && !isInitialized && !editMode) {
      initialSelectedPointsRef.current = selectedPoints
      initialSelectedLinesRef.current = selectedLines
    }
  }, [isActive, isInitialized, editMode, selectedPoints, selectedLines])

  // Initialize form when entering edit mode or when constraint changes
  useEffect(() => {
    if (editMode && existingConstraint) {
      setConstraintName(existingConstraint.getName())
      setPoints([...existingConstraint.points])
      setHasChanges(false)
      setIsInitialized(true)
    } else if (!editMode && isActive && !isInitialized) {
      // Creation mode - collect unique points from captured initial selection
      const pointSet = new Set<WorldPoint>(initialSelectedPointsRef.current)
      initialSelectedLinesRef.current.forEach(line => {
        pointSet.add(line.pointA)
        pointSet.add(line.pointB)
      })
      setPoints(Array.from(pointSet))
      setConstraintName(`Coplanar ${pointSet.size}pts`)
      setHasChanges(false)
      setIsInitialized(true)
    }
  }, [editMode, existingConstraint, isActive, isInitialized])

  // Reset when tool closes
  useEffect(() => {
    if (!isActive) {
      setPoints([])
      setConstraintName('')
      setHasChanges(false)
      setIsInitialized(false)
    }
  }, [isActive])

  // Listen for point clicks from ImageViewer when coplanar tool is active
  useEffect(() => {
    if (!isActive) return

    const handlePointClick = (event: CustomEvent<{ worldPoint: WorldPoint }>) => {
      const { worldPoint } = event.detail
      if (!points.includes(worldPoint)) {
        setPoints(prev => [...prev, worldPoint])
        setHasChanges(true)
      }
    }

    window.addEventListener('coplanarToolPointClick', handlePointClick as EventListener)
    return () => window.removeEventListener('coplanarToolPointClick', handlePointClick as EventListener)
  }, [isActive, points])

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isActive) {
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, onCancel])

  // Listen for external save trigger (from FloatingWindow OK button)
  useEffect(() => {
    if (!isActive) return

    const handleExternalSave = () => {
      handleSave()
    }

    const handleExternalDelete = () => {
      handleDelete()
    }

    window.addEventListener('coplanarToolSave', handleExternalSave)
    window.addEventListener('coplanarToolDelete', handleExternalDelete)
    return () => {
      window.removeEventListener('coplanarToolSave', handleExternalSave)
      window.removeEventListener('coplanarToolDelete', handleExternalDelete)
    }
  }, [isActive, points, constraintName, editMode, existingConstraint, onUpdateConstraint, onCreateConstraint, onCancel, onDeleteConstraint])

  const handleChange = () => {
    setHasChanges(true)
  }

  const removePoint = (point: WorldPoint) => {
    setPoints(points.filter(p => p !== point))
    handleChange()
  }

  const addPoint = (point: WorldPoint) => {
    if (!points.includes(point)) {
      setPoints([...points, point])
      handleChange()
    }
  }

  const canSave = points.length >= 4 && (editMode ? hasChanges : true)

  const handleSave = () => {
    if (points.length < 4) return

    if (editMode && existingConstraint && onUpdateConstraint) {
      onUpdateConstraint(existingConstraint, {
        name: constraintName,
        points: points
      })
      onCancel()
    } else {
      const constraint = CoplanarPointsConstraint.create(constraintName, points)
      onCreateConstraint(constraint)
      onCancel()
    }
  }

  const handleDelete = () => {
    if (editMode && existingConstraint && onDeleteConstraint) {
      onDeleteConstraint(existingConstraint)
      onCancel()
    }
  }

  if (!isActive) return null

  const availablePoints = allWorldPoints.filter(p => !points.includes(p))

  return (
    <div className="image-edit-content">
      {/* Basic Properties */}
      <div className="edit-section">
        <h4>Properties</h4>

        <div className="form-row">
          <label>Name</label>
          <input
            type="text"
            value={constraintName}
            onChange={(e) => { setConstraintName(e.target.value); handleChange(); }}
            className="form-input"
            placeholder="Constraint name"
            maxLength={30}
          />
        </div>
      </div>

      {/* Points */}
      <div className="edit-section">
        <h4>Points ({points.length})</h4>
        <p style={{ fontSize: '11px', color: '#888', margin: '0 0 8px 0' }}>
          Click points in the image to add them, or use the dropdown below.
        </p>

        <div style={{
          maxHeight: '200px',
          overflowY: 'auto',
          border: '1px solid var(--border)',
          borderRadius: 'var(--border-radius)',
          marginBottom: '8px'
        }}>
          {points.length === 0 ? (
            <div style={{ color: '#888', fontStyle: 'italic', fontSize: '12px', padding: '8px' }}>
              No points added yet
            </div>
          ) : (
            <table style={{
              width: '100%',
              fontSize: '11px',
              borderCollapse: 'collapse'
            }}>
              <thead style={{
                position: 'sticky',
                top: 0,
                background: '#2a2a2a',
                borderBottom: '1px solid var(--border)'
              }}>
                <tr>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600' }}>Point</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '600', width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {points.map((point, idx) => (
                  <tr
                    key={getEntityKey(point)}
                    style={{
                      borderBottom: idx < points.length - 1 ? '1px solid #333' : 'none'
                    }}
                  >
                    <td style={{ padding: '4px 8px', color: '#ccc' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: point.color,
                          marginRight: '8px',
                          verticalAlign: 'middle'
                        }}
                      />
                      {point.getName()}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                      <button
                        onClick={() => removePoint(point)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#888',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          fontSize: '11px'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#f66' }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#888' }}
                        title="Remove point"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Add Point Dropdown */}
        <div className="form-row">
          <label>Add</label>
          <select
            value=""
            onChange={(e) => {
              const index = parseInt(e.target.value)
              if (index >= 0) {
                addPoint(availablePoints[index])
              }
            }}
            className="form-input"
            style={{ flex: 1 }}
          >
            <option value="">Select point to add...</option>
            {availablePoints.map((point, idx) => (
              <option key={getEntityKey(point)} value={idx}>
                {point.getName()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Validation Message */}
      {points.length < 4 && (
        <div style={{
          padding: '8px 12px',
          backgroundColor: '#fff3cd',
          border: '1px solid #ffeaa7',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#856404',
          margin: '0 8px 8px 8px'
        }}>
          Coplanar constraints require at least 4 points (have {points.length})
        </div>
      )}
    </div>
  )
})

export default CoplanarCreationTool
