// Constraint templates panel for quick constraint creation

import React, { useState, useCallback, useMemo } from 'react'
import { Project, WorldPoint, Constraint } from '../types/project'

export interface ConstraintTemplate {
  id: string
  name: string
  description: string
  icon: string
  category: 'geometry' | 'measurement' | 'alignment' | 'custom'
  constraints: Omit<Constraint, 'id'>[]
  requiredPoints: number
  pointLabels: string[]
  createdAt: string
  usageCount: number
}

interface ConstraintTemplatesPanelProps {
  project: Project
  onTemplateApply: (template: ConstraintTemplate, pointIds: string[]) => void
  onTemplateCreate: (template: Omit<ConstraintTemplate, 'id' | 'createdAt' | 'usageCount'>) => void
  onTemplateUpdate: (templateId: string, updates: Partial<ConstraintTemplate>) => void
  onTemplateDelete: (templateId: string) => void
  selectedPointIds: string[]
  onClearSelection: () => void
}

const DEFAULT_TEMPLATES: Omit<ConstraintTemplate, 'id' | 'createdAt' | 'usageCount'>[] = [
  {
    name: 'Rectangle',
    description: 'Create a rectangle with four points (corners)',
    icon: '⬜',
    category: 'geometry',
    requiredPoints: 4,
    pointLabels: ['Top-Left', 'Top-Right', 'Bottom-Right', 'Bottom-Left'],
    constraints: [
      {
        type: 'distance',
        pointA: 'point1',
        pointB: 'point2',
        value: 100,
        tolerance: 1.0
      },
      {
        type: 'distance',
        pointA: 'point2',
        pointB: 'point3',
        value: 100,
        tolerance: 1.0
      },
      {
        type: 'distance',
        pointA: 'point3',
        pointB: 'point4',
        value: 100,
        tolerance: 1.0
      },
      {
        type: 'distance',
        pointA: 'point4',
        pointB: 'point1',
        value: 100,
        tolerance: 1.0
      },
      {
        type: 'perpendicular',
        line1_wp_a: 'point1',
        line1_wp_b: 'point2',
        line2_wp_a: 'point2',
        line2_wp_b: 'point3'
      },
      {
        type: 'perpendicular',
        line1_wp_a: 'point2',
        line1_wp_b: 'point3',
        line2_wp_a: 'point3',
        line2_wp_b: 'point4'
      }
    ]
  },
  {
    name: 'Square',
    description: 'Create a square with four equal sides',
    icon: '⬛',
    category: 'geometry',
    requiredPoints: 4,
    pointLabels: ['Corner A', 'Corner B', 'Corner C', 'Corner D'],
    constraints: [
      {
        type: 'rectangle',
        cornerA: 'point1',
        cornerB: 'point2',
        cornerC: 'point3',
        cornerD: 'point4'
      }
    ]
  },
  {
    name: 'Right Triangle',
    description: 'Create a right-angled triangle',
    icon: '📐',
    category: 'geometry',
    requiredPoints: 3,
    pointLabels: ['Right Angle', 'Point A', 'Point B'],
    constraints: [
      {
        type: 'angle',
        vertex: 'point1',
        line1_end: 'point2',
        line2_end: 'point3',
        value: 90
      }
    ]
  },
  {
    name: 'Parallel Lines',
    description: 'Create two parallel lines',
    icon: '⫽',
    category: 'alignment',
    requiredPoints: 4,
    pointLabels: ['Line 1 Start', 'Line 1 End', 'Line 2 Start', 'Line 2 End'],
    constraints: [
      {
        type: 'parallel',
        line1_wp_a: 'point1',
        line1_wp_b: 'point2',
        line2_wp_a: 'point3',
        line2_wp_b: 'point4'
      }
    ]
  },
  {
    name: 'Perpendicular Lines',
    description: 'Create two perpendicular lines',
    icon: '⟂',
    category: 'alignment',
    requiredPoints: 4,
    pointLabels: ['Line 1 Start', 'Line 1 End', 'Line 2 Start', 'Line 2 End'],
    constraints: [
      {
        type: 'perpendicular',
        line1_wp_a: 'point1',
        line1_wp_b: 'point2',
        line2_wp_a: 'point3',
        line2_wp_b: 'point4'
      }
    ]
  },
  {
    name: 'Collinear Points',
    description: 'Make three or more points lie on the same line',
    icon: '⋯',
    category: 'alignment',
    requiredPoints: 3,
    pointLabels: ['Point A', 'Point B', 'Point C'],
    constraints: [
      {
        type: 'collinear',
        wp_ids: ['point1', 'point2', 'point3']
      }
    ]
  },
  {
    name: 'Circle from 3 Points',
    description: 'Create a circle constraint from three points',
    icon: '⭕',
    category: 'geometry',
    requiredPoints: 3,
    pointLabels: ['Point A', 'Point B', 'Point C'],
    constraints: [
      {
        type: 'circle',
        point_ids: ['point1', 'point2', 'point3'],
        radius: 50
      }
    ]
  },
  {
    name: 'Fixed Distance',
    description: 'Set a fixed distance between two points',
    icon: '📏',
    category: 'measurement',
    requiredPoints: 2,
    pointLabels: ['Start Point', 'End Point'],
    constraints: [
      {
        type: 'distance',
        pointA: 'point1',
        pointB: 'point2',
        value: 100,
        tolerance: 1.0
      }
    ]
  },
  {
    name: 'Fixed Angle',
    description: 'Set a fixed angle between three points',
    icon: '∠',
    category: 'measurement',
    requiredPoints: 3,
    pointLabels: ['Vertex', 'Ray 1 End', 'Ray 2 End'],
    constraints: [
      {
        type: 'angle',
        vertex: 'point1',
        line1_end: 'point2',
        line2_end: 'point3',
        value: 90
      }
    ]
  },
  {
    name: 'Horizontal Line',
    description: 'Make a line horizontal',
    icon: '⬌',
    category: 'alignment',
    requiredPoints: 2,
    pointLabels: ['Start Point', 'End Point'],
    constraints: [
      {
        type: 'horizontal',
        pointA: 'point1',
        pointB: 'point2'
      }
    ]
  },
  {
    name: 'Vertical Line',
    description: 'Make a line vertical',
    icon: '⬍',
    category: 'alignment',
    requiredPoints: 2,
    pointLabels: ['Start Point', 'End Point'],
    constraints: [
      {
        type: 'vertical',
        pointA: 'point1',
        pointB: 'point2'
      }
    ]
  }
]

export const ConstraintTemplatesPanel: React.FC<ConstraintTemplatesPanelProps> = ({
  project,
  onTemplateApply,
  onTemplateCreate,
  onTemplateUpdate,
  onTemplateDelete,
  selectedPointIds,
  onClearSelection
}) => {
  const [activeCategory, setActiveCategory] = useState<'all' | 'geometry' | 'measurement' | 'alignment' | 'custom'>('all')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [customTemplates, setCustomTemplates] = useState<ConstraintTemplate[]>([])

  // Combine default and custom templates
  const allTemplates = useMemo((): ConstraintTemplate[] => {
    const defaultWithIds = DEFAULT_TEMPLATES.map((template, index) => ({
      ...template,
      id: `default-${index}`,
      createdAt: new Date().toISOString(),
      usageCount: 0
    }))

    return [...defaultWithIds, ...customTemplates]
  }, [customTemplates])

  // Filter templates based on category and search
  const filteredTemplates = useMemo(() => {
    let filtered = allTemplates

    // Filter by category
    if (activeCategory !== 'all') {
      filtered = filtered.filter(template => template.category === activeCategory)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(template =>
        template.name.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query)
      )
    }

    // Sort by usage count (most used first) then by name
    return filtered.sort((a, b) => {
      if (a.usageCount !== b.usageCount) {
        return b.usageCount - a.usageCount
      }
      return a.name.localeCompare(b.name)
    })
  }, [allTemplates, activeCategory, searchQuery])

  // Check if template can be applied with current selection
  const canApplyTemplate = useCallback((template: ConstraintTemplate) => {
    return selectedPointIds.length >= template.requiredPoints
  }, [selectedPointIds])

  // Apply template to selected points
  const handleApplyTemplate = useCallback((template: ConstraintTemplate) => {
    if (!canApplyTemplate(template)) return

    const pointIds = selectedPointIds.slice(0, template.requiredPoints)
    onTemplateApply(template, pointIds)

    // Update usage count
    onTemplateUpdate(template.id, {
      usageCount: template.usageCount + 1
    })

    onClearSelection()
  }, [selectedPointIds, canApplyTemplate, onTemplateApply, onTemplateUpdate, onClearSelection])

  // Get category statistics
  const getCategoryStats = useCallback(() => {
    const stats = {
      all: allTemplates.length,
      geometry: 0,
      measurement: 0,
      alignment: 0,
      custom: 0
    }

    allTemplates.forEach(template => {
      stats[template.category]++
    })

    return stats
  }, [allTemplates])

  const categoryStats = getCategoryStats()

  // Get template preview information
  const getTemplatePreview = useCallback((template: ConstraintTemplate) => {
    const constraintTypes = [...new Set(template.constraints.map(c => c.type))]
    const constraintCount = template.constraints.length

    return {
      constraintTypes,
      constraintCount,
      complexity: constraintCount <= 2 ? 'Simple' : constraintCount <= 5 ? 'Medium' : 'Complex'
    }
  }, [])

  return (
    <div className="constraint-templates-panel">
      <div className="panel-header">
        <h3>Constraint Templates</h3>
        <div className="header-actions">
          <button
            className="btn-create-template"
            onClick={() => setShowCreateForm(!showCreateForm)}
            title="Create custom template"
          >
            {showCreateForm ? '✕' : '📝'}
          </button>
        </div>
      </div>

      <div className="templates-search">
        <input
          type="text"
          className="search-input"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="search-icon">🔍</div>
      </div>

      <div className="category-tabs">
        {(['all', 'geometry', 'measurement', 'alignment', 'custom'] as const).map(category => (
          <button
            key={category}
            className={`category-tab ${activeCategory === category ? 'active' : ''}`}
            onClick={() => setActiveCategory(category)}
          >
            <span className="category-name">
              {category === 'all' ? 'All' : category.charAt(0).toUpperCase() + category.slice(1)}
            </span>
            <span className="category-count">({categoryStats[category]})</span>
          </button>
        ))}
      </div>

      {selectedPointIds.length > 0 && (
        <div className="selection-info">
          <div className="selection-text">
            {selectedPointIds.length} point{selectedPointIds.length !== 1 ? 's' : ''} selected
          </div>
          <button className="clear-selection-btn" onClick={onClearSelection}>
            Clear Selection
          </button>
        </div>
      )}

      <div className="templates-grid">
        {filteredTemplates.map(template => {
          const preview = getTemplatePreview(template)
          const canApply = canApplyTemplate(template)

          return (
            <div
              key={template.id}
              className={`template-card ${!canApply ? 'disabled' : ''}`}
            >
              <div className="template-header">
                <div className="template-icon">{template.icon}</div>
                <div className="template-info">
                  <div className="template-name">{template.name}</div>
                  <div className="template-category">{template.category}</div>
                </div>
                <div className="template-actions">
                  {template.usageCount > 0 && (
                    <span className="usage-count" title="Times used">
                      {template.usageCount}×
                    </span>
                  )}
                  {template.id.startsWith('custom-') && (
                    <button
                      className="delete-template-btn"
                      onClick={() => onTemplateDelete(template.id)}
                      title="Delete template"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>

              <div className="template-description">
                {template.description}
              </div>

              <div className="template-requirements">
                <div className="requirement-item">
                  <span>Points needed:</span>
                  <span className={selectedPointIds.length >= template.requiredPoints ? 'satisfied' : 'unsatisfied'}>
                    {template.requiredPoints}
                  </span>
                </div>
                <div className="requirement-item">
                  <span>Constraints:</span>
                  <span>{preview.constraintCount}</span>
                </div>
                <div className="requirement-item">
                  <span>Complexity:</span>
                  <span className={`complexity-${preview.complexity.toLowerCase()}`}>
                    {preview.complexity}
                  </span>
                </div>
              </div>

              <div className="template-details">
                <div className="point-labels">
                  {template.pointLabels.map((label, index) => (
                    <div
                      key={index}
                      className={`point-label ${index < selectedPointIds.length ? 'assigned' : 'unassigned'}`}
                    >
                      {index + 1}. {label}
                    </div>
                  ))}
                </div>

                <div className="constraint-types">
                  {preview.constraintTypes.map(type => (
                    <span key={type} className="constraint-type-badge">
                      {type}
                    </span>
                  ))}
                </div>
              </div>

              <div className="template-footer">
                <button
                  className="apply-template-btn"
                  onClick={() => handleApplyTemplate(template)}
                  disabled={!canApply}
                >
                  {canApply ? 'Apply Template' : `Need ${template.requiredPoints - selectedPointIds.length} more point${template.requiredPoints - selectedPointIds.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          )
        })}

        {filteredTemplates.length === 0 && (
          <div className="no-templates">
            <div className="no-templates-icon">📋</div>
            <div className="no-templates-text">
              {searchQuery ? 'No templates match your search' : 'No templates in this category'}
            </div>
            {searchQuery && (
              <button
                className="clear-search-btn"
                onClick={() => setSearchQuery('')}
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </div>

      {showCreateForm && (
        <div className="create-template-form">
          <h4>Create Custom Template</h4>
          <p>Custom template creation coming soon...</p>
          <button
            className="btn-cancel"
            onClick={() => setShowCreateForm(false)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  )
}

export default ConstraintTemplatesPanel