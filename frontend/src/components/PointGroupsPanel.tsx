// Point groups/layers management panel

import React, { useState, useCallback, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEye, faEyeSlash, faFolderOpen, faLocationDot, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons'
import { Project, WorldPoint } from '../types/project'
import { useConfirm } from './ConfirmDialog'

export interface PointGroup {
  id: string
  name: string
  color: string
  visible: boolean
  locked: boolean
  description?: string
  createdAt: string
  pointCount: number
}

interface PointGroupsPanelProps {
  project: Project
  onGroupCreate: (group: Omit<PointGroup, 'id' | 'createdAt' | 'pointCount'>) => void
  onGroupUpdate: (groupId: string, updates: Partial<PointGroup>) => void
  onGroupDelete: (groupId: string) => void
  onGroupAssign: (pointIds: string[], groupId: string | null) => void
  onGroupSelect: (groupId: string | null) => void
  onGroupToggleVisibility: (groupId: string) => void
  onGroupToggleLock: (groupId: string) => void
  selectedPointIds: string[]
  selectedGroupId: string | null
}

export const PointGroupsPanel: React.FC<PointGroupsPanelProps> = ({
  project,
  onGroupCreate,
  onGroupUpdate,
  onGroupDelete,
  onGroupAssign,
  onGroupSelect,
  onGroupToggleVisibility,
  onGroupToggleLock,
  selectedPointIds,
  selectedGroupId
}) => {
  const { confirm, dialog } = useConfirm()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [newGroupForm, setNewGroupForm] = useState({
    name: '',
    color: '#4CAF50',
    description: '',
    visible: true,
    locked: false
  })

  // Get groups from project data
  const groups = useMemo((): PointGroup[] => {
    const groupMap = new Map<string, PointGroup>()

    // Count points per group and extract group info
    Object.values(project.worldPoints).forEach(point => {
      if (point.group) {
        if (!groupMap.has(point.group)) {
          groupMap.set(point.group, {
            id: point.group,
            name: point.group,
            color: point.color || '#4CAF50',
            visible: point.isVisible !== false,
            locked: point.isLocked || false,
            createdAt: point.createdAt || new Date().toISOString(),
            pointCount: 0
          })
        }
        const group = groupMap.get(point.group)!
        group.pointCount++
      }
    })

    return Array.from(groupMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [project.worldPoints])

  // Get ungrouped points
  const ungroupedPoints = useMemo(() => {
    return Object.values(project.worldPoints).filter(point => !point.group)
  }, [project.worldPoints])

  // Get points in selected group
  const getPointsInGroup = useCallback((groupId: string | null) => {
    return Object.values(project.worldPoints).filter(point =>
      groupId ? point.group === groupId : !point.group
    )
  }, [project.worldPoints])

  // Handle create group
  const handleCreateGroup = useCallback(() => {
    if (!newGroupForm.name.trim()) return

    // Check for duplicate names
    if (groups.some(g => g.name.toLowerCase() === newGroupForm.name.toLowerCase())) {
      alert('A group with this name already exists')
      return
    }

    onGroupCreate({
      name: newGroupForm.name.trim(),
      color: newGroupForm.color,
      description: newGroupForm.description.trim(),
      visible: newGroupForm.visible,
      locked: newGroupForm.locked
    })

    // Reset form
    setNewGroupForm({
      name: '',
      color: '#4CAF50',
      description: '',
      visible: true,
      locked: false
    })
    setShowCreateForm(false)
  }, [newGroupForm, groups, onGroupCreate])

  // Handle group edit
  const handleGroupEdit = useCallback((groupId: string, field: string, value: any) => {
    onGroupUpdate(groupId, { [field]: value })
  }, [onGroupUpdate])

  // Handle assign selected points to group
  const handleAssignToGroup = useCallback((groupId: string | null) => {
    if (selectedPointIds.length === 0) return
    onGroupAssign(selectedPointIds, groupId)
  }, [selectedPointIds, onGroupAssign])

  // Handle group selection
  const handleGroupClick = useCallback((groupId: string | null) => {
    onGroupSelect(selectedGroupId === groupId ? null : groupId)
  }, [selectedGroupId, onGroupSelect])

  // Get group statistics
  const getGroupStats = useCallback(() => {
    const totalPoints = Object.keys(project.worldPoints).length
    const groupedPoints = groups.reduce((sum, group) => sum + group.pointCount, 0)
    const visibleGroups = groups.filter(g => g.visible).length
    const lockedGroups = groups.filter(g => g.locked).length

    return {
      totalGroups: groups.length,
      totalPoints,
      groupedPoints,
      ungroupedPoints: ungroupedPoints.length,
      visibleGroups,
      lockedGroups
    }
  }, [groups, ungroupedPoints.length, project.worldPoints])

  const stats = getGroupStats()

  const defaultColors = [
    '#4CAF50', '#2196F3', '#FF9800', '#F44336', '#9C27B0',
    '#00BCD4', '#FFC107', '#E91E63', '#3F51B5', '#795548'
  ]

  return (
    <>
      {dialog}
      <div className="point-groups-panel">
      <div className="panel-header">
        <h3>Point Groups</h3>
        <div className="header-actions">
          <button
            className="btn-create-group"
            onClick={() => setShowCreateForm(!showCreateForm)}
            title="Create new group"
          >
            {showCreateForm ? '✕' : '<FontAwesomeIcon icon={faPlus} />'}
          </button>
        </div>
      </div>

      <div className="groups-stats">
        <div className="stats-grid">
          <div className="stat-item">
            <span>Groups:</span>
            <span>{stats.totalGroups}</span>
          </div>
          <div className="stat-item">
            <span>Grouped:</span>
            <span>{stats.groupedPoints}/{stats.totalPoints}</span>
          </div>
          <div className="stat-item">
            <span>Visible:</span>
            <span>{stats.visibleGroups}/{stats.totalGroups}</span>
          </div>
          <div className="stat-item">
            <span>Locked:</span>
            <span>{stats.lockedGroups}/{stats.totalGroups}</span>
          </div>
        </div>
      </div>

      {showCreateForm && (
        <div className="create-group-form">
          <h4>Create New Group</h4>
          <div className="form-fields">
            <div className="form-row">
              <label>
                <span>Name:</span>
                <input
                  type="text"
                  value={newGroupForm.name}
                  onChange={(e) => setNewGroupForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Group name"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                />
              </label>
              <label>
                <span>Color:</span>
                <div className="color-input-group">
                  <input
                    type="color"
                    value={newGroupForm.color}
                    onChange={(e) => setNewGroupForm(prev => ({ ...prev, color: e.target.value }))}
                  />
                  <div className="color-presets">
                    {defaultColors.map(color => (
                      <button
                        key={color}
                        className="color-preset"
                        style={{ backgroundColor: color }}
                        onClick={() => setNewGroupForm(prev => ({ ...prev, color }))}
                      />
                    ))}
                  </div>
                </div>
              </label>
            </div>
            <div className="form-row">
              <label>
                <span>Description:</span>
                <input
                  type="text"
                  value={newGroupForm.description}
                  onChange={(e) => setNewGroupForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description"
                />
              </label>
            </div>
            <div className="form-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={newGroupForm.visible}
                  onChange={(e) => setNewGroupForm(prev => ({ ...prev, visible: e.target.checked }))}
                />
                <span>Visible</span>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={newGroupForm.locked}
                  onChange={(e) => setNewGroupForm(prev => ({ ...prev, locked: e.target.checked }))}
                />
                <span>Locked</span>
              </label>
            </div>
          </div>
          <div className="form-actions">
            <button
              className="btn-create"
              onClick={handleCreateGroup}
              disabled={!newGroupForm.name.trim()}
            >
              Create Group
            </button>
            <button
              className="btn-cancel"
              onClick={() => setShowCreateForm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {selectedPointIds.length > 0 && (
        <div className="assign-to-group">
          <h4>Assign {selectedPointIds.length} Point{selectedPointIds.length !== 1 ? 's' : ''}</h4>
          <div className="assign-buttons">
            <button
              className="assign-btn ungrouped"
              onClick={() => handleAssignToGroup(null)}
            >
              Remove from Groups
            </button>
            {groups.map(group => (
              <button
                key={group.id}
                className="assign-btn"
                onClick={() => handleAssignToGroup(group.id)}
                style={{ borderColor: group.color }}
              >
                <div className="group-color" style={{ backgroundColor: group.color }} />
                {group.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="groups-list">
        {/* Ungrouped points */}
        <div
          className={`group-item ungrouped ${selectedGroupId === null ? 'selected' : ''}`}
          onClick={() => handleGroupClick(null)}
        >
          <div className="group-header">
            <div className="group-info">
              <div className="group-color ungrouped-color"><FontAwesomeIcon icon={faLocationDot} /></div>
              <div className="group-details">
                <div className="group-name">Ungrouped</div>
                <div className="group-meta">{ungroupedPoints.length} points</div>
              </div>
            </div>
            <div className="group-controls">
              <span className="point-count">{ungroupedPoints.length}</span>
            </div>
          </div>
        </div>

        {/* Group items */}
        {groups.map(group => (
          <div
            key={group.id}
            className={`group-item ${selectedGroupId === group.id ? 'selected' : ''} ${!group.visible ? 'hidden' : ''} ${group.locked ? 'locked' : ''}`}
            onClick={() => handleGroupClick(group.id)}
          >
            <div className="group-header">
              <div className="group-info">
                <div className="group-color" style={{ backgroundColor: group.color }} />
                <div className="group-details">
                  {editingGroup === group.id ? (
                    <input
                      className="group-name-edit"
                      value={group.name}
                      onChange={(e) => handleGroupEdit(group.id, 'name', e.target.value)}
                      onBlur={() => setEditingGroup(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setEditingGroup(null)
                        if (e.key === 'Escape') setEditingGroup(null)
                      }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div
                      className="group-name"
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        setEditingGroup(group.id)
                      }}
                    >
                      {group.name}
                    </div>
                  )}
                  <div className="group-meta">
                    {group.pointCount} point{group.pointCount !== 1 ? 's' : ''}
                    {group.description && (
                      <span className="group-description"> • {group.description}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="group-controls">
                <button
                  className={`control-btn visibility-btn ${group.visible ? 'visible' : 'hidden'}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onGroupToggleVisibility(group.id)
                  }}
                  title={group.visible ? 'Hide group' : 'Show group'}
                >
                  {group.visible ? '<FontAwesomeIcon icon={faEye} />' : '<FontAwesomeIcon icon={faEyeSlash} />'}
                </button>
                <button
                  className={`control-btn lock-btn ${group.locked ? 'locked' : 'unlocked'}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onGroupToggleLock(group.id)
                  }}
                  title={group.locked ? 'Unlock group' : 'Lock group'}
                >
                  {group.locked ? '🔒' : '🔓'}
                </button>
                <input
                  type="color"
                  value={group.color}
                  onChange={(e) => handleGroupEdit(group.id, 'color', e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="color-picker"
                  title="Change group color"
                />
                <button
                  className="control-btn delete-btn"
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (await confirm(`Delete group "${group.name}"? Points will become ungrouped.`)) {
                      onGroupDelete(group.id)
                    }
                  }}
                  title="Delete group"
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {groups.length === 0 && (
          <div className="no-groups">
            <div className="no-groups-icon"><FontAwesomeIcon icon={faFolderOpen} /></div>
            <div className="no-groups-text">No groups created</div>
            <div className="no-groups-hint">
              Create groups to organize your points
            </div>
          </div>
        )}
      </div>

      <div className="groups-actions">
        <button
          className="action-btn"
          onClick={() => {
            groups.forEach(group => onGroupToggleVisibility(group.id))
          }}
          disabled={groups.length === 0}
        >
          Toggle All Visibility
        </button>
        <button
          className="action-btn"
          onClick={() => {
            groups.forEach(group => onGroupToggleLock(group.id))
          }}
          disabled={groups.length === 0}
        >
          Toggle All Locks
        </button>
      </div>
    </div>
    </>
  )
}

export default PointGroupsPanel