// Batch operations panel for bulk actions on points and constraints

import React, { useState, useCallback, useMemo } from 'react'
import { Project, WorldPoint, Constraint } from '../types/project'

export type BatchOperation =
  | 'delete_points'
  | 'lock_points'
  | 'unlock_points'
  | 'set_group'
  | 'clear_group'
  | 'set_color'
  | 'add_tags'
  | 'remove_tags'
  | 'delete_constraints'
  | 'bulk_rename'
  | 'merge_points'
  | 'triangulate_points'

interface BatchOperationConfig {
  operation: BatchOperation
  label: string
  icon: string
  description: string
  requiresParameter: boolean
  parameterType?: 'text' | 'color' | 'group' | 'tags'
  category: 'points' | 'constraints' | 'advanced'
}

interface BatchOperationsPanelProps {
  project: Project
  selectedPointIds: string[]
  selectedConstraintIds: string[]
  onExecuteOperation: (operation: BatchOperation, params?: any) => void
  onClearSelection: () => void
}

const BATCH_OPERATIONS: BatchOperationConfig[] = [
  // Point operations
  {
    operation: 'delete_points',
    label: 'Delete Points',
    icon: '🗑️',
    description: 'Delete selected world points and their image points',
    requiresParameter: false,
    category: 'points'
  },
  {
    operation: 'lock_points',
    label: 'Lock Points',
    icon: '🔒',
    description: 'Lock selected points to prevent modification during optimization',
    requiresParameter: false,
    category: 'points'
  },
  {
    operation: 'unlock_points',
    label: 'Unlock Points',
    icon: '🔓',
    description: 'Unlock selected points to allow modification during optimization',
    requiresParameter: false,
    category: 'points'
  },
  {
    operation: 'set_group',
    label: 'Set Group',
    icon: '📁',
    description: 'Assign selected points to a group',
    requiresParameter: true,
    parameterType: 'group',
    category: 'points'
  },
  {
    operation: 'clear_group',
    label: 'Clear Group',
    icon: '📂',
    description: 'Remove group assignment from selected points',
    requiresParameter: false,
    category: 'points'
  },
  {
    operation: 'set_color',
    label: 'Set Color',
    icon: '🎨',
    description: 'Change color of selected points',
    requiresParameter: true,
    parameterType: 'color',
    category: 'points'
  },
  {
    operation: 'add_tags',
    label: 'Add Tags',
    icon: '🏷️',
    description: 'Add tags to selected points',
    requiresParameter: true,
    parameterType: 'tags',
    category: 'points'
  },
  {
    operation: 'remove_tags',
    label: 'Remove Tags',
    icon: '🏷️',
    description: 'Remove tags from selected points',
    requiresParameter: true,
    parameterType: 'tags',
    category: 'points'
  },
  {
    operation: 'bulk_rename',
    label: 'Bulk Rename',
    icon: '📝',
    description: 'Rename selected points with a pattern',
    requiresParameter: true,
    parameterType: 'text',
    category: 'points'
  },

  // Constraint operations
  {
    operation: 'delete_constraints',
    label: 'Delete Constraints',
    icon: '🗑️',
    description: 'Delete selected constraints',
    requiresParameter: false,
    category: 'constraints'
  },

  // Advanced operations
  {
    operation: 'triangulate_points',
    label: 'Triangulate Points',
    icon: '📐',
    description: 'Compute 3D coordinates for selected points from image observations',
    requiresParameter: false,
    category: 'advanced'
  },
  {
    operation: 'merge_points',
    label: 'Merge Similar',
    icon: '🔗',
    description: 'Find and merge duplicate or nearby points',
    requiresParameter: false,
    category: 'advanced'
  }
]

export const BatchOperationsPanel: React.FC<BatchOperationsPanelProps> = ({
  project,
  selectedPointIds,
  selectedConstraintIds,
  onExecuteOperation,
  onClearSelection
}) => {
  const [activeCategory, setActiveCategory] = useState<'points' | 'constraints' | 'advanced'>('points')
  const [operationParams, setOperationParams] = useState<Record<string, any>>({})
  const [confirmOperation, setConfirmOperation] = useState<BatchOperation | null>(null)

  // Get available groups from project
  const availableGroups = useMemo(() => {
    const groups = new Set<string>()
    Object.values(project.worldPoints).forEach(wp => {
      if (wp.group) groups.add(wp.group)
    })
    return Array.from(groups).sort()
  }, [project.worldPoints])

  // Get available tags from project
  const availableTags = useMemo(() => {
    const tags = new Set<string>()
    Object.values(project.worldPoints).forEach(wp => {
      if (wp.tags) {
        wp.tags.forEach(tag => tags.add(tag))
      }
    })
    return Array.from(tags).sort()
  }, [project.worldPoints])

  // Filter operations by category and availability
  const availableOperations = useMemo(() => {
    return BATCH_OPERATIONS.filter(op => {
      if (op.category !== activeCategory) return false

      // Check if operation can be performed based on selection
      if (op.category === 'points' && selectedPointIds.length === 0) return false
      if (op.category === 'constraints' && selectedConstraintIds.length === 0) return false
      if (op.category === 'advanced' && selectedPointIds.length === 0) return false

      return true
    })
  }, [activeCategory, selectedPointIds.length, selectedConstraintIds.length])

  // Get operation statistics
  const getOperationStats = useCallback(() => {
    const selectedPoints = selectedPointIds.map(id => project.worldPoints[id]).filter(Boolean)
    const selectedConstraints = selectedConstraintIds.map(id =>
      project.constraints?.find(c => c.id === id)
    ).filter(Boolean)

    const pointsWithXYZ = selectedPoints.filter(wp => wp.xyz).length
    const lockedPoints = selectedPoints.filter(wp => wp.isLocked).length
    const pointsInGroups = selectedPoints.filter(wp => wp.group).length
    const pointsWithTags = selectedPoints.filter(wp => wp.tags && wp.tags.length > 0).length

    return {
      totalPoints: selectedPoints.length,
      totalConstraints: selectedConstraints.length,
      pointsWithXYZ,
      lockedPoints,
      pointsInGroups,
      pointsWithTags,
      unlockedPoints: selectedPoints.length - lockedPoints
    }
  }, [selectedPointIds, selectedConstraintIds, project.worldPoints, project.constraints])

  const stats = getOperationStats()

  // Handle parameter change
  const handleParameterChange = useCallback((operation: BatchOperation, value: any) => {
    setOperationParams(prev => ({
      ...prev,
      [operation]: value
    }))
  }, [])

  // Execute operation with confirmation for destructive actions
  const handleExecuteOperation = useCallback((operation: BatchOperation) => {
    const operationConfig = BATCH_OPERATIONS.find(op => op.operation === operation)
    if (!operationConfig) return

    // Check if we need confirmation for destructive operations
    const destructiveOperations: BatchOperation[] = ['delete_points', 'delete_constraints', 'merge_points']
    if (destructiveOperations.includes(operation)) {
      setConfirmOperation(operation)
      return
    }

    // Get parameters if required
    let params: any = undefined
    if (operationConfig.requiresParameter) {
      params = operationParams[operation]
      if (!params) {
        alert(`Please provide a ${operationConfig.parameterType} for this operation`)
        return
      }
    }

    onExecuteOperation(operation, params)
  }, [operationParams, onExecuteOperation])

  // Confirm destructive operation
  const handleConfirmOperation = useCallback(() => {
    if (!confirmOperation) return

    const operationConfig = BATCH_OPERATIONS.find(op => op.operation === confirmOperation)
    let params: any = undefined
    if (operationConfig?.requiresParameter) {
      params = operationParams[confirmOperation]
    }

    onExecuteOperation(confirmOperation, params)
    setConfirmOperation(null)
  }, [confirmOperation, operationParams, onExecuteOperation])

  // Render parameter input for operation
  const renderParameterInput = useCallback((operation: BatchOperationConfig) => {
    const currentValue = operationParams[operation.operation] || ''

    switch (operation.parameterType) {
      case 'text':
        return (
          <input
            type="text"
            placeholder={operation.operation === 'bulk_rename' ? 'e.g., Point_{n} or Prefix_{n}' : 'Enter value'}
            value={currentValue}
            onChange={(e) => handleParameterChange(operation.operation, e.target.value)}
            className="parameter-input"
          />
        )

      case 'color':
        return (
          <input
            type="color"
            value={currentValue || '#ff6b6b'}
            onChange={(e) => handleParameterChange(operation.operation, e.target.value)}
            className="parameter-color"
          />
        )

      case 'group':
        return (
          <div className="parameter-group">
            <select
              value={currentValue}
              onChange={(e) => handleParameterChange(operation.operation, e.target.value)}
              className="parameter-select"
            >
              <option value="">Select group...</option>
              {availableGroups.map(group => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Or create new group"
              value={currentValue}
              onChange={(e) => handleParameterChange(operation.operation, e.target.value)}
              className="parameter-input"
            />
          </div>
        )

      case 'tags':
        return (
          <div className="parameter-tags">
            <input
              type="text"
              placeholder="Enter tags separated by commas"
              value={currentValue}
              onChange={(e) => handleParameterChange(operation.operation, e.target.value)}
              className="parameter-input"
            />
            {availableTags.length > 0 && (
              <div className="available-tags">
                <span>Available: </span>
                {availableTags.slice(0, 5).map(tag => (
                  <button
                    key={tag}
                    className="tag-btn"
                    onClick={() => {
                      const existing = currentValue.split(',').map((t: string) => t.trim()).filter(Boolean)
                      if (!existing.includes(tag)) {
                        const newValue = existing.concat([tag]).join(', ')
                        handleParameterChange(operation.operation, newValue)
                      }
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        )

      default:
        return null
    }
  }, [operationParams, handleParameterChange, availableGroups, availableTags])

  return (
    <div className="batch-operations-panel">
      <div className="panel-header">
        <h3>Batch Operations</h3>
        <div className="selection-info">
          {selectedPointIds.length > 0 && (
            <span className="selection-count">
              {selectedPointIds.length} point{selectedPointIds.length !== 1 ? 's' : ''}
            </span>
          )}
          {selectedConstraintIds.length > 0 && (
            <span className="selection-count">
              {selectedConstraintIds.length} constraint{selectedConstraintIds.length !== 1 ? 's' : ''}
            </span>
          )}
          {(selectedPointIds.length > 0 || selectedConstraintIds.length > 0) && (
            <button className="clear-selection-btn" onClick={onClearSelection}>
              Clear
            </button>
          )}
        </div>
      </div>

      {(selectedPointIds.length > 0 || selectedConstraintIds.length > 0) && (
        <div className="selection-stats">
          <div className="stats-grid">
            {stats.totalPoints > 0 && (
              <>
                <div className="stat-item">
                  <span>With 3D coordinates:</span>
                  <span>{stats.pointsWithXYZ}/{stats.totalPoints}</span>
                </div>
                <div className="stat-item">
                  <span>Locked:</span>
                  <span>{stats.lockedPoints}/{stats.totalPoints}</span>
                </div>
                <div className="stat-item">
                  <span>In groups:</span>
                  <span>{stats.pointsInGroups}/{stats.totalPoints}</span>
                </div>
                <div className="stat-item">
                  <span>With tags:</span>
                  <span>{stats.pointsWithTags}/{stats.totalPoints}</span>
                </div>
              </>
            )}
            {stats.totalConstraints > 0 && (
              <div className="stat-item">
                <span>Selected constraints:</span>
                <span>{stats.totalConstraints}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="category-tabs">
        <button
          className={`category-tab ${activeCategory === 'points' ? 'active' : ''}`}
          onClick={() => setActiveCategory('points')}
          disabled={selectedPointIds.length === 0}
        >
          📍 Points
        </button>
        <button
          className={`category-tab ${activeCategory === 'constraints' ? 'active' : ''}`}
          onClick={() => setActiveCategory('constraints')}
          disabled={selectedConstraintIds.length === 0}
        >
          🔗 Constraints
        </button>
        <button
          className={`category-tab ${activeCategory === 'advanced' ? 'active' : ''}`}
          onClick={() => setActiveCategory('advanced')}
          disabled={selectedPointIds.length === 0}
        >
          ⚡ Advanced
        </button>
      </div>

      <div className="operations-list">
        {availableOperations.map(operation => (
          <div key={operation.operation} className="operation-item">
            <div className="operation-header">
              <div className="operation-info">
                <span className="operation-icon">{operation.icon}</span>
                <div className="operation-details">
                  <div className="operation-label">{operation.label}</div>
                  <div className="operation-description">{operation.description}</div>
                </div>
              </div>
              <button
                className="execute-btn"
                onClick={() => handleExecuteOperation(operation.operation)}
                disabled={operation.requiresParameter && !operationParams[operation.operation]}
              >
                Execute
              </button>
            </div>
            {operation.requiresParameter && (
              <div className="operation-parameters">
                {renderParameterInput(operation)}
              </div>
            )}
          </div>
        ))}

        {availableOperations.length === 0 && (
          <div className="no-operations">
            <div className="no-operations-icon">⚙️</div>
            <div className="no-operations-text">
              {activeCategory === 'points' && 'Select points to see available operations'}
              {activeCategory === 'constraints' && 'Select constraints to see available operations'}
              {activeCategory === 'advanced' && 'Select points to see advanced operations'}
            </div>
          </div>
        )}
      </div>

      {confirmOperation && (
        <div className="modal-overlay">
          <div className="confirm-dialog">
            <div className="confirm-header">
              <h3>Confirm Operation</h3>
            </div>
            <div className="confirm-content">
              <p>
                Are you sure you want to execute "{BATCH_OPERATIONS.find(op => op.operation === confirmOperation)?.label}"?
              </p>
              <p className="confirm-warning">
                This action cannot be undone.
              </p>
              {confirmOperation === 'delete_points' && (
                <p className="confirm-details">
                  This will delete {selectedPointIds.length} point{selectedPointIds.length !== 1 ? 's' : ''} and all associated constraints.
                </p>
              )}
              {confirmOperation === 'delete_constraints' && (
                <p className="confirm-details">
                  This will delete {selectedConstraintIds.length} constraint{selectedConstraintIds.length !== 1 ? 's' : ''}.
                </p>
              )}
            </div>
            <div className="confirm-actions">
              <button className="btn-confirm" onClick={handleConfirmOperation}>
                Confirm
              </button>
              <button className="btn-cancel" onClick={() => setConfirmOperation(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BatchOperationsPanel