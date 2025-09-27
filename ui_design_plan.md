# Pictorigo UI Design Plan

## Overall Architecture: Fusion 360-Inspired Photogrammetry

### Core Paradigm
- **Single project in browser localStorage** (no server persistence initially)
- **World points** have auto-generated names (WP1, WP2, WP3...) and UUIDs
- **Constraint creation** via property-window modals (not complex dialogs)
- **Point selection** via dropdown OR click-on-image (like Fusion 360 sketching)
- **Constraint editing** allows replacing/updating point references
- **Timeline-style constraint list** showing constraint history

## Data Model Updates

### World Point Structure
```typescript
interface WorldPoint {
  id: string           // UUID for backend
  name: string         // Display name: "WP1", "WP2", etc.
  xyz?: [number, number, number]  // 3D coordinates (optional)
  imagePoints: ImagePoint[]       // Associated image observations
  isVisible: boolean   // Show/hide in UI
  color?: string       // Visual distinction
}

interface ImagePoint {
  imageId: string
  u: number           // Pixel x coordinate
  v: number           // Pixel y coordinate
  wpId: string        // Associated world point
}
```

### Project Structure (localStorage)
```typescript
interface Project {
  id: string
  name: string
  worldPoints: Record<string, WorldPoint>
  images: Record<string, ProjectImage>
  cameras: Record<string, Camera>
  constraints: Constraint[]
  nextWpNumber: number    // For auto-naming WP1, WP2...
  settings: ProjectSettings
}

interface ProjectImage {
  id: string
  name: string
  blob: string          // Base64 encoded image data
  width: number
  height: number
  cameraId?: string
}
```

## Component Architecture

### 1. Image Management System
```tsx
// Core Components:
- ImageUploadDropzone
  * Drag/drop or file picker
  * Stores as base64 in localStorage
  * Auto-creates camera for each image

- ImageViewer
  * Canvas-based with zoom/pan
  * Click-to-place world points
  * Visual point overlays with names
  * Selection highlighting

- ImageGallery
  * Thumbnail view of all images
  * Click to switch active image
  * Add/remove images
```

### 2. World Point Management
```tsx
// Point Creation & Management:
- WorldPointManager
  * Auto-generates names: WP1, WP2, WP3...
  * Creates both world point and image point when user clicks
  * Maintains point visibility and selection state

- PointSelector Component
  * Dropdown showing all world points by name
  * Search/filter capability
  * Current selection highlighting
  * "Click on image" alternative mode

- PointOverlay Component
  * Renders points on image viewer
  * Shows WP names as labels
  * Hover/selection states
  * Click to select for constraint creation
```

### 3. Context-Sensitive Constraint Creation (Fusion 360-style)
```tsx
// Context-Sensitive Toolbar Pattern:
- ConstraintToolbar
  * Top toolbar that shows available constraints based on selection
  * Dynamically enables/disables constraint types
  * Shows constraint icons with tooltips
  * Immediate constraint creation on click

- Selection-Based Availability:
  * 0 points: No constraints available
  * 1 point: Fixed position constraint
  * 2 points: Distance, axis-aligned constraints
  * 2 lines (4 points): Parallel, perpendicular, angle
  * 3 points: Plane, collinear, angle
  * 4+ points: Rectangle, circle, etc.

- Constraint Properties Panel:
  * Shows parameter inputs for selected constraint
  * Real-time validation and preview
  * Non-modal, always accessible

- Point Selection Modes:
  * Click-on-image selection (primary)
  * Multi-select with Ctrl/Shift
  * Selection preview and highlighting
```

## Data Storage: Browser localStorage

### Single Project Storage
```typescript
// localStorage keys:
const PROJECT_KEY = 'pictorigo_project'
const SETTINGS_KEY = 'pictorigo_settings'

// Storage utilities:
class ProjectStorage {
  static save(project: Project): void {
    localStorage.setItem(PROJECT_KEY, JSON.stringify(project))
  }

  static load(): Project | null {
    const data = localStorage.getItem(PROJECT_KEY)
    return data ? JSON.parse(data) : null
  }

  static clear(): void {
    localStorage.removeItem(PROJECT_KEY)
  }
}

// Auto-save on every change
// Size limit: ~5MB for images (warn user)
```

## Fusion 360-Style UI Implementation

### Point Selection UX Pattern
```tsx
// Fusion 360 Point Selection Component
const PointSelector = ({ value, onChange, label, required = false }) => {
  const [selectionMode, setSelectionMode] = useState<'dropdown' | 'click'>('dropdown')
  const { worldPoints, selectedPoint, setSelectedPoint } = useProject()

  return (
    <div className="point-selector">
      <label className="point-selector-label">
        {label} {required && <span className="required">*</span>}
      </label>

      <div className="point-selector-controls">
        {/* Primary: Dropdown Selection */}
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="point-dropdown"
          disabled={selectionMode === 'click'}
        >
          <option value="">Select point...</option>
          {Object.values(worldPoints).map(wp => (
            <option key={wp.id} value={wp.id}>
              {wp.name}
            </option>
          ))}
        </select>

        {/* Alternative: Click Selection */}
        <button
          type="button"
          className={`click-select-btn ${selectionMode === 'click' ? 'active' : ''}`}
          onClick={() => setSelectionMode(mode => mode === 'click' ? 'dropdown' : 'click')}
          title="Click on image to select point"
        >
          📍
        </button>
      </div>

      {/* Visual feedback when in click mode */}
      {selectionMode === 'click' && (
        <div className="click-mode-indicator">
          Click on a point in the image viewer →
        </div>
      )}
    </div>
  )
}
```

### Context-Sensitive Constraint Toolbar
```tsx
// Fusion 360-style context-sensitive constraint toolbar
const ConstraintToolbar = () => {
  const { selectedPoints, selectedLines } = useSelection()
  const { createConstraint } = useConstraints()
  const availableConstraints = getAvailableConstraints(selectedPoints, selectedLines)

  return (
    <div className="constraint-toolbar">
      <div className="toolbar-section">
        <span className="toolbar-label">Constraints:</span>
        <div className="constraint-buttons">
          {availableConstraints.map(constraintType => (
            <ConstraintButton
              key={constraintType.type}
              type={constraintType.type}
              icon={constraintType.icon}
              tooltip={constraintType.tooltip}
              enabled={constraintType.enabled}
              onClick={() => createConstraint(constraintType.type, selectedPoints, selectedLines)}
            />
          ))}
        </div>
      </div>

      <div className="toolbar-section">
        <span className="selection-info">
          {getSelectionSummary(selectedPoints, selectedLines)}
        </span>
      </div>
    </div>
  )
}

const ConstraintButton = ({ type, icon, tooltip, enabled, onClick }) => {
  return (
    <button
      className={`constraint-btn ${enabled ? 'enabled' : 'disabled'}`}
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      title={tooltip}
    >
      <span className="constraint-icon">{icon}</span>
      <span className="constraint-label">{type}</span>
    </button>
  )
}

// Logic for determining available constraints based on selection
const getAvailableConstraints = (selectedPoints, selectedLines) => {
  const constraints = []
  const pointCount = selectedPoints.length
  const lineCount = selectedLines.length

  // 1 point selected
  if (pointCount === 1 && lineCount === 0) {
    constraints.push({
      type: 'fixed',
      icon: '📌',
      tooltip: 'Fix point position in 3D space',
      enabled: true
    })
  }

  // 2 points selected
  if (pointCount === 2 && lineCount === 0) {
    constraints.push(
      {
        type: 'distance',
        icon: '↔',
        tooltip: 'Set distance between points',
        enabled: true
      },
      {
        type: 'horizontal',
        icon: '⟷',
        tooltip: 'Make points horizontally aligned',
        enabled: true
      },
      {
        type: 'vertical',
        icon: '↕',
        tooltip: 'Make points vertically aligned',
        enabled: true
      }
    )
  }

  // 3 points selected
  if (pointCount === 3 && lineCount === 0) {
    constraints.push(
      {
        type: 'collinear',
        icon: '─',
        tooltip: 'Make points lie on same line',
        enabled: true
      },
      {
        type: 'angle',
        icon: '∠',
        tooltip: 'Set angle between three points',
        enabled: true
      }
    )
  }

  // 4 points selected
  if (pointCount === 4 && lineCount === 0) {
    constraints.push(
      {
        type: 'rectangle',
        icon: '▭',
        tooltip: 'Form rectangle with four corners',
        enabled: true
      },
      {
        type: 'plane',
        icon: '◱',
        tooltip: 'Make points coplanar',
        enabled: true
      }
    )
  }

  // 2 lines selected (4 points forming 2 lines)
  if (lineCount === 2) {
    constraints.push(
      {
        type: 'parallel',
        icon: '∥',
        tooltip: 'Make lines parallel',
        enabled: true
      },
      {
        type: 'perpendicular',
        icon: '⊥',
        tooltip: 'Make lines perpendicular',
        enabled: true
      },
      {
        type: 'angle',
        icon: '∠',
        tooltip: 'Set angle between lines',
        enabled: true
      }
    )
  }

  // Circle constraints (3+ points)
  if (pointCount >= 3) {
    constraints.push({
      type: 'circle',
      icon: '○',
      tooltip: `Make ${pointCount} points lie on circle`,
      enabled: true
    })
  }

  return constraints
}

const getSelectionSummary = (selectedPoints, selectedLines) => {
  const parts = []

  if (selectedPoints.length > 0) {
    parts.push(`${selectedPoints.length} point${selectedPoints.length !== 1 ? 's' : ''}`)
  }

  if (selectedLines.length > 0) {
    parts.push(`${selectedLines.length} line${selectedLines.length !== 1 ? 's' : ''}`)
  }

  if (parts.length === 0) {
    return 'Select points or lines to see available constraints'
  }

  return `Selected: ${parts.join(', ')}`
}
```

### Enhanced Selection System
```tsx
// Multi-selection with Ctrl/Shift support
const useSelection = () => {
  const [selectedPoints, setSelectedPoints] = useState<string[]>([])
  const [selectedLines, setSelectedLines] = useState<Line[]>([])
  const [selectionMode, setSelectionMode] = useState<'points' | 'lines' | 'auto'>('auto')

  const handlePointClick = (pointId: string, ctrlKey: boolean, shiftKey: boolean) => {
    if (ctrlKey) {
      // Add/remove from selection
      setSelectedPoints(prev =>
        prev.includes(pointId)
          ? prev.filter(id => id !== pointId)
          : [...prev, pointId]
      )
    } else if (shiftKey && selectedPoints.length > 0) {
      // Select range (if applicable)
      // Implementation depends on point ordering logic
    } else {
      // Single selection
      setSelectedPoints([pointId])
    }
  }

  const detectLines = (points: string[]) => {
    // Auto-detect lines from selected points
    // Simple heuristic: every 2 consecutive points form a line
    const lines = []
    for (let i = 0; i < points.length - 1; i += 2) {
      if (points[i + 1]) {
        lines.push({
          pointA: points[i],
          pointB: points[i + 1]
        })
      }
    }
    return lines
  }

  const clearSelection = () => {
    setSelectedPoints([])
    setSelectedLines([])
  }

  // Auto-detect lines when points are selected
  useEffect(() => {
    if (selectionMode === 'auto' && selectedPoints.length >= 2) {
      const detectedLines = detectLines(selectedPoints)
      setSelectedLines(detectedLines)
    }
  }, [selectedPoints, selectionMode])

  return {
    selectedPoints,
    selectedLines,
    selectionMode,
    setSelectionMode,
    handlePointClick,
    clearSelection,
    hasSelection: selectedPoints.length > 0 || selectedLines.length > 0
  }
}
```

### Constraint Property Panel (Context-Aware)
```tsx
// Context-aware property panel that shows parameters for selected constraint
const ConstraintPropertyPanel = () => {
  const { activeConstraintType, constraintParameters, updateParameter } = useConstraints()
  const { selectedPoints, selectedLines } = useSelection()

  if (!activeConstraintType) {
    return (
      <div className="property-panel">
        <div className="property-panel-header">
          <h3>Properties</h3>
        </div>
        <div className="property-panel-content">
          <div className="empty-state">
            <span>Select points and choose a constraint type to set parameters</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="property-panel">
      <div className="property-panel-header">
        <h3>{getConstraintDisplayName(activeConstraintType)} Properties</h3>
        <button
          className="btn-clear-constraint"
          onClick={() => cancelConstraintCreation()}
          title="Cancel constraint creation"
        >
          ✕
        </button>
      </div>

      <div className="property-panel-content">
        <ConstraintParameterForm
          type={activeConstraintType}
          selectedPoints={selectedPoints}
          selectedLines={selectedLines}
          parameters={constraintParameters}
          onParameterChange={updateParameter}
        />
      </div>
    </div>
  )
}

const ConstraintParameterForm = ({ type, selectedPoints, selectedLines, parameters, onParameterChange }) => {
  switch (type) {
    case 'distance':
      return (
        <div className="parameter-form">
          <div className="selected-points-preview">
            <span>Between: {getPointNames(selectedPoints).join(' ↔ ')}</span>
          </div>
          <div className="form-field">
            <label>Distance (m)</label>
            <input
              type="number"
              step="0.001"
              value={parameters.distance || ''}
              onChange={(e) => onParameterChange('distance', parseFloat(e.target.value))}
              placeholder="Enter distance..."
            />
          </div>
          <div className="form-actions">
            <button
              className="btn-primary"
              onClick={() => applyConstraint()}
              disabled={!parameters.distance}
            >
              Apply Distance
            </button>
          </div>
        </div>
      )

    case 'angle':
      return (
        <div className="parameter-form">
          <div className="selected-points-preview">
            <span>Angle: {getPointNames(selectedPoints).join(' - ')}</span>
          </div>
          <div className="form-field">
            <label>Angle (degrees)</label>
            <input
              type="number"
              step="0.1"
              value={parameters.angle || ''}
              onChange={(e) => onParameterChange('angle', parseFloat(e.target.value))}
              placeholder="Enter angle..."
            />
          </div>
          <div className="form-actions">
            <button
              className="btn-primary"
              onClick={() => applyConstraint()}
              disabled={!parameters.angle}
            >
              Apply Angle
            </button>
          </div>
        </div>
      )

    case 'parallel':
    case 'perpendicular':
      return (
        <div className="parameter-form">
          <div className="selected-lines-preview">
            <span>
              Lines: {selectedLines.map(line =>
                `${getPointName(line.pointA)}-${getPointName(line.pointB)}`
              ).join(' and ')}
            </span>
          </div>
          <div className="constraint-description">
            Make the selected lines {type === 'parallel' ? 'parallel' : 'perpendicular'}
          </div>
          <div className="form-actions">
            <button
              className="btn-primary"
              onClick={() => applyConstraint()}
            >
              Apply {type === 'parallel' ? 'Parallel' : 'Perpendicular'}
            </button>
          </div>
        </div>
      )

    case 'rectangle':
      return (
        <div className="parameter-form">
          <div className="selected-points-preview">
            <span>Corners: {getPointNames(selectedPoints).join(', ')}</span>
          </div>
          <div className="form-field">
            <label>Aspect Ratio (optional)</label>
            <input
              type="number"
              step="0.1"
              value={parameters.aspectRatio || ''}
              onChange={(e) => onParameterChange('aspectRatio', parseFloat(e.target.value))}
              placeholder="Leave blank for free rectangle"
            />
          </div>
          <div className="form-actions">
            <button
              className="btn-primary"
              onClick={() => applyConstraint()}
            >
              Apply Rectangle
            </button>
          </div>
        </div>
      )

    case 'fixed':
      return (
        <div className="parameter-form">
          <div className="selected-points-preview">
            <span>Fix: {getPointNames(selectedPoints)[0]}</span>
          </div>
          <div className="coordinate-inputs">
            <div className="form-field">
              <label>X (m)</label>
              <input
                type="number"
                step="0.001"
                value={parameters.x || ''}
                onChange={(e) => onParameterChange('x', parseFloat(e.target.value))}
                placeholder="X coordinate"
              />
            </div>
            <div className="form-field">
              <label>Y (m)</label>
              <input
                type="number"
                step="0.001"
                value={parameters.y || ''}
                onChange={(e) => onParameterChange('y', parseFloat(e.target.value))}
                placeholder="Y coordinate"
              />
            </div>
            <div className="form-field">
              <label>Z (m)</label>
              <input
                type="number"
                step="0.001"
                value={parameters.z || ''}
                onChange={(e) => onParameterChange('z', parseFloat(e.target.value))}
                placeholder="Z coordinate"
              />
            </div>
          </div>
          <div className="form-actions">
            <button
              className="btn-primary"
              onClick={() => applyConstraint()}
              disabled={!parameters.x || !parameters.y || !parameters.z}
            >
              Fix Position
            </button>
          </div>
        </div>
      )

    default:
      return (
        <div className="parameter-form">
          <div className="constraint-description">
            Apply {type} constraint to selected elements
          </div>
          <div className="form-actions">
            <button
              className="btn-primary"
              onClick={() => applyConstraint()}
            >
              Apply {type}
            </button>
          </div>
        </div>
      )
  }
}
```

### Constraint Timeline (Enhanced with Hover Feedback)
```tsx
const ConstraintTimeline = () => {
  const { constraints, editConstraint, deleteConstraint, toggleConstraint } = useConstraints()
  const { setHoveredConstraintId, hoveredConstraintId } = useProject()

  return (
    <div className="constraint-timeline">
      <div className="timeline-header">
        <h3>Constraint History</h3>
        <span className="constraint-count">{constraints.length} constraints</span>
      </div>

      <div className="timeline-items">
        {constraints.map((constraint, index) => (
          <ConstraintTimelineItem
            key={constraint.id}
            constraint={constraint}
            index={index}
            isHovered={hoveredConstraintId === constraint.id}
            onEdit={() => editConstraint(constraint)}
            onDelete={() => deleteConstraint(constraint.id)}
            onToggle={() => toggleConstraint(constraint.id)}
            onMouseEnter={() => setHoveredConstraintId(constraint.id)}
            onMouseLeave={() => setHoveredConstraintId(null)}
          />
        ))}
      </div>

      {constraints.length === 0 && (
        <div className="timeline-empty">
          <div className="empty-icon">📐</div>
          <div className="empty-text">No constraints yet</div>
          <div className="empty-hint">Start by selecting a constraint type above</div>
        </div>
      )}
    </div>
  )
}

const ConstraintTimelineItem = ({
  constraint,
  index,
  isHovered,
  onEdit,
  onDelete,
  onToggle,
  onMouseEnter,
  onMouseLeave
}) => {
  const [showActions, setShowActions] = useState(false)

  return (
    <div
      className={`timeline-item ${constraint.enabled ? 'enabled' : 'disabled'} ${isHovered ? 'hovered' : ''}`}
      onMouseEnter={() => {
        setShowActions(true)
        onMouseEnter()
      }}
      onMouseLeave={() => {
        setShowActions(false)
        onMouseLeave()
      }}
    >
      <div className="timeline-item-icon">
        <ConstraintIcon type={constraint.type} />
      </div>

      <div className="timeline-item-content">
        <div className="timeline-item-title">
          {getConstraintDisplayName(constraint)}
        </div>
        <div className="timeline-item-details">
          {getConstraintSummary(constraint)}
        </div>

        {/* Show affected points when hovered */}
        {isHovered && (
          <div className="timeline-item-points">
            <span className="points-label">Affects:</span>
            {getConstraintPoints(constraint).map(pointId => (
              <span key={pointId} className="point-reference">
                {getWorldPointName(pointId)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className={`timeline-item-actions ${showActions ? 'visible' : ''}`}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          className={`btn-toggle ${constraint.enabled ? 'enabled' : 'disabled'}`}
          title={constraint.enabled ? "Disable constraint" : "Enable constraint"}
        >
          {constraint.enabled ? '👁️' : '🚫'}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          className="btn-edit"
          title="Edit constraint"
        >
          ✏️
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (confirm('Delete this constraint?')) {
              onDelete()
            }
          }}
          className="btn-delete"
          title="Delete constraint"
        >
          🗑️
        </button>
      </div>
    </div>
  )
}

// Enhanced constraint display helpers
const getConstraintDisplayName = (constraint) => {
  const worldPoints = useProject().worldPoints

  const getPointName = (pointId) => worldPoints[pointId]?.name || pointId

  switch (constraint.type) {
    case 'distance':
      return `Distance: ${getPointName(constraint.pointA)} ↔ ${getPointName(constraint.pointB)}`
    case 'angle':
      return `Angle: ${constraint.angle_degrees}°`
    case 'perpendicular':
      return `Perpendicular Lines`
    case 'parallel':
      return `Parallel Lines`
    case 'collinear':
      return `Collinear Points`
    case 'rectangle':
      return `Rectangle Shape`
    case 'circle':
      return `Circle Constraint`
    case 'fixed':
      return `Fixed Point: ${getPointName(constraint.point_id)}`
    default:
      return `${constraint.type.charAt(0).toUpperCase()}${constraint.type.slice(1)} Constraint`
  }
}

const getConstraintSummary = (constraint) => {
  const worldPoints = useProject().worldPoints

  const getPointName = (pointId) => worldPoints[pointId]?.name || pointId

  switch (constraint.type) {
    case 'distance':
      return `${constraint.distance}m between points`
    case 'angle':
      return `${constraint.angle_degrees}° angle constraint`
    case 'perpendicular':
      return `${getPointName(constraint.line1_wp_a)}-${getPointName(constraint.line1_wp_b)} ⊥ ${getPointName(constraint.line2_wp_a)}-${getPointName(constraint.line2_wp_b)}`
    case 'parallel':
      return `${getPointName(constraint.line1_wp_a)}-${getPointName(constraint.line1_wp_b)} ∥ ${getPointName(constraint.line2_wp_a)}-${getPointName(constraint.line2_wp_b)}`
    case 'collinear':
      return `${constraint.wp_ids.map(getPointName).join(', ')} on same line`
    case 'rectangle':
      return `4-corner rectangle shape`
    case 'circle':
      return `Points on circle boundary`
    case 'fixed':
      return `Fixed at (${constraint.x?.toFixed(2)}, ${constraint.y?.toFixed(2)}, ${constraint.z?.toFixed(2)})`
    default:
      return 'Geometric constraint'
  }
}

const getConstraintPoints = (constraint) => {
  switch (constraint.type) {
    case 'distance':
      return [constraint.pointA, constraint.pointB]
    case 'angle':
      return [constraint.vertex, constraint.line1_end, constraint.line2_end]
    case 'perpendicular':
    case 'parallel':
      return [constraint.line1_wp_a, constraint.line1_wp_b, constraint.line2_wp_a, constraint.line2_wp_b]
    case 'collinear':
      return constraint.wp_ids || []
    case 'rectangle':
      return [constraint.cornerA, constraint.cornerB, constraint.cornerC, constraint.cornerD]
    case 'circle':
      return constraint.point_ids || []
    case 'fixed':
      return [constraint.point_id]
    default:
      return []
  }
}

// Constraint icon component
const ConstraintIcon = ({ type }) => {
  const icons = {
    distance: '↔',
    angle: '∠',
    perpendicular: '⊥',
    parallel: '∥',
    collinear: '─',
    rectangle: '▭',
    circle: '○',
    fixed: '📌'
  }

  return <span>{icons[type] || '⚙'}</span>
}

// Hook for constraint interaction feedback
const useConstraintHover = () => {
  const [hoveredConstraintId, setHoveredConstraintId] = useState(null)
  const { currentImage, worldPoints } = useProject()

  const getAffectedImagePoints = (constraintId) => {
    const constraint = constraints.find(c => c.id === constraintId)
    if (!constraint) return []

    const pointIds = getConstraintPoints(constraint)
    return pointIds
      .map(pointId => {
        const wp = worldPoints[pointId]
        return wp?.imagePoints.find(ip => ip.imageId === currentImage?.id)
      })
      .filter(Boolean)
  }

  return {
    hoveredConstraintId,
    setHoveredConstraintId,
    getAffectedImagePoints
  }
}
```
```

## World Point Auto-Naming System

### Naming Convention Implementation
```typescript
class WorldPointManager {
  private nextNumber: number = 1
  private worldPoints: Map<string, WorldPoint> = new Map()

  createWorldPoint(imageId: string, u: number, v: number): WorldPoint {
    const id = crypto.randomUUID()
    const name = `WP${this.nextNumber++}`

    const worldPoint: WorldPoint = {
      id,
      name,
      xyz: undefined, // Will be estimated during optimization
      imagePoints: [{
        imageId,
        u,
        v,
        wpId: id
      }],
      isVisible: true,
      color: this.generateColor()
    }

    this.worldPoints.set(id, worldPoint)
    this.saveToStorage()
    return worldPoint
  }

  renameWorldPoint(id: string, newName: string): void {
    const wp = this.worldPoints.get(id)
    if (wp) {
      wp.name = newName
      this.saveToStorage()
    }
  }

  private generateColor(): string {
    // Cycle through distinct colors for visual identification
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd']
    return colors[(this.nextNumber - 1) % colors.length]
  }
}
```

## Image Viewer with Point Interaction

### Canvas-Based Image Viewer
```tsx
const ImageViewer = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { currentImage, worldPoints, addWorldPoint, selectedWpId, setSelectedWpId } = useProject()
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  const handleCanvasClick = (event: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas || !currentImage) return

    const rect = canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left - offset.x) / scale
    const y = (event.clientY - rect.top - offset.y) / scale

    // Check if clicking near existing point (selection)
    const clickedPoint = findNearbyPoint(x, y, worldPoints, 10) // 10px threshold

    if (clickedPoint) {
      setSelectedWpId(clickedPoint.id)
    } else {
      // Create new world point
      const newPoint = addWorldPoint(currentImage.id, x, y)
      setSelectedWpId(newPoint.id)
    }
  }

  const renderPoints = (ctx: CanvasRenderingContext2D) => {
    Object.values(worldPoints).forEach(wp => {
      const imagePoint = wp.imagePoints.find(ip => ip.imageId === currentImage?.id)
      if (!imagePoint || !wp.isVisible) return

      const x = imagePoint.u * scale + offset.x
      const y = imagePoint.v * scale + offset.y

      // Draw point
      ctx.fillStyle = wp.color || '#ff6b6b'
      ctx.strokeStyle = wp.id === selectedWpId ? '#ffffff' : '#000000'
      ctx.lineWidth = wp.id === selectedWpId ? 3 : 1

      ctx.beginPath()
      ctx.arc(x, y, 6, 0, 2 * Math.PI)
      ctx.fill()
      ctx.stroke()

      // Draw label
      ctx.fillStyle = '#000000'
      ctx.font = '12px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(wp.name, x, y - 10)
    })
  }

  // ... zoom/pan logic, image rendering, etc.
}

const findNearbyPoint = (x: number, y: number, worldPoints: Record<string, WorldPoint>, threshold: number) => {
  return Object.values(worldPoints).find(wp => {
    const imagePoint = wp.imagePoints.find(ip => ip.imageId === currentImage?.id)
    if (!imagePoint) return false

    const distance = Math.sqrt(
      Math.pow(imagePoint.u - x, 2) + Math.pow(imagePoint.v - y, 2)
    )
    return distance <= threshold
  })
}
```

## Cross-Image Constraint Creation & Visual Feedback

### Core UX Requirements
1. **Non-modal constraint creation** - switch images during constraint setup
2. **Visual constraint display** - show constraints around selected points
3. **Hover feedback** - highlight related components on hover
4. **Image navigation** - left toolbar for quick image switching
5. **Point visibility** - show point names and associated constraints

### Image Navigation Toolbar (Enhanced for Cross-Image Constraints)
```tsx
const ImageNavigationToolbar = () => {
  const { images, currentImageId, setCurrentImageId, renameImage, addImage } = useProject()
  const { isCreatingConstraint, creationState } = useConstraints()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAddImage = () => {
    fileInputRef.current?.click()
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      try {
        const projectImage = await ImageUtils.loadImageFile(file)
        addImage(projectImage)
      } catch (error) {
        console.error('Failed to load image:', error)
      }
    }

    // Reset file input
    event.target.value = ''
  }

  const getConstraintProgress = () => {
    if (!isCreatingConstraint) return null

    const requiredPoints = getRequiredPointsForConstraint(creationState.type)
    const selectedCount = creationState.selectedPoints.length

    return {
      current: selectedCount,
      total: requiredPoints,
      isComplete: selectedCount >= requiredPoints
    }
  }

  const progress = getConstraintProgress()

  return (
    <div className="image-toolbar">
      <div className="image-toolbar-header">
        <h3>Images</h3>
        <button
          className="btn-add-image"
          title="Add Images"
          onClick={handleAddImage}
        >
          ➕
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
      </div>

      {/* Constraint Creation Progress Indicator */}
      {isCreatingConstraint && progress && (
        <div className="constraint-creation-status">
          <div className="constraint-type-badge">
            {creationState.type?.toUpperCase()}
          </div>
          <div className="progress-indicator">
            <div className="progress-text">
              Select points: {progress.current}/{progress.total}
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
          <div className="navigation-hint">
            Switch images freely during creation
          </div>
        </div>
      )}

      <div className="image-list">
        {Object.values(images).map(image => (
          <ImageNavigationItem
            key={image.id}
            image={image}
            isActive={currentImageId === image.id}
            isConstraintMode={isCreatingConstraint}
            constraintProgress={progress}
            onClick={() => setCurrentImageId(image.id)}
            onRename={(newName) => renameImage(image.id, newName)}
          />
        ))}
      </div>

      {/* Instructions for cross-image constraint creation */}
      {isCreatingConstraint && (
        <div className="constraint-instructions">
          <h4>Cross-Image Constraint Creation</h4>
          <ul>
            <li>📍 Click points in any image</li>
            <li>🔄 Switch images anytime</li>
            <li>👁️ Selected points highlighted</li>
            <li>✅ Complete when enough points selected</li>
          </ul>
        </div>
      )}
    </div>
  )
}

const ImageNavigationItem = ({
  image,
  isActive,
  isConstraintMode,
  constraintProgress,
  onClick,
  onRename
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(image.name)
  const { getImagePointCount, getSelectedPointsInImage, creationState } = useProject()

  const pointCount = getImagePointCount(image.id)
  const selectedInThisImage = isConstraintMode ?
    getSelectedPointsInImage(image.id, creationState.selectedPoints) : 0

  const handleImageClick = () => {
    if (isConstraintMode) {
      // In constraint mode, always allow switching
      onClick()
    } else {
      // Normal mode navigation
      onClick()
    }
  }

  return (
    <div className={`image-nav-item ${isActive ? 'active' : ''} ${isConstraintMode ? 'constraint-mode' : ''}`}>
      <div className="image-thumbnail" onClick={handleImageClick}>
        <img src={image.blob} alt={image.name} />

        {/* Constraint mode overlay */}
        {isConstraintMode && (
          <div className="constraint-mode-overlay">
            {selectedInThisImage > 0 && (
              <div className="selected-points-indicator">
                {selectedInThisImage} selected
              </div>
            )}
            {!isActive && (
              <div className="switch-hint">
                Click to switch →
              </div>
            )}
          </div>
        )}

        {/* Active image indicator */}
        {isActive && (
          <div className="active-indicator">
            <div className="active-dot"></div>
          </div>
        )}
      </div>

      <div className="image-info">
        {isEditing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              setIsEditing(false)
              onRename(name)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setIsEditing(false)
                onRename(name)
              }
              if (e.key === 'Escape') {
                setIsEditing(false)
                setName(image.name) // Reset to original
              }
            }}
            autoFocus
            className="image-name-input"
          />
        ) : (
          <div
            className="image-name"
            onDoubleClick={() => !isConstraintMode && setIsEditing(true)}
            title={isConstraintMode ? "Exit constraint mode to rename" : "Double-click to rename"}
          >
            {image.name}
          </div>
        )}

        <div className="image-stats">
          <div className="stat-item">
            <span className="stat-icon">📍</span>
            <span>{pointCount} points</span>
          </div>
          <div className="stat-item">
            <span className="stat-icon">📐</span>
            <span>{image.width}×{image.height}</span>
          </div>
          {isConstraintMode && selectedInThisImage > 0 && (
            <div className="stat-item selected">
              <span className="stat-icon">✓</span>
              <span>{selectedInThisImage} selected</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Helper hook for image navigation state
const useImageNavigation = () => {
  const { images, currentImageId, setCurrentImageId } = useProject()
  const { isCreatingConstraint } = useConstraints()

  const navigateToNextImage = () => {
    const imageIds = Object.keys(images)
    const currentIndex = imageIds.indexOf(currentImageId)
    const nextIndex = (currentIndex + 1) % imageIds.length
    setCurrentImageId(imageIds[nextIndex])
  }

  const navigateToPrevImage = () => {
    const imageIds = Object.keys(images)
    const currentIndex = imageIds.indexOf(currentImageId)
    const prevIndex = (currentIndex - 1 + imageIds.length) % imageIds.length
    setCurrentImageId(imageIds[prevIndex])
  }

  // Keyboard shortcuts for image navigation
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 'ArrowLeft':
            event.preventDefault()
            navigateToPrevImage()
            break
          case 'ArrowRight':
            event.preventDefault()
            navigateToNextImage()
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [currentImageId, images])

  return {
    navigateToNextImage,
    navigateToPrevImage,
    canNavigate: !isCreatingConstraint || true // Always allow navigation in constraint mode
  }
}
```

### Visual Constraint Display System
```tsx
const ConstraintOverlay = () => {
  const { currentImage, worldPoints, constraints, selectedWpId, hoveredConstraintId } = useProject()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const renderConstraintVisuals = (ctx: CanvasRenderingContext2D) => {
    // Show constraints related to selected point (Fusion 360 style)
    if (selectedWpId) {
      const relatedConstraints = constraints.filter(c =>
        constraintInvolvesPoint(c, selectedWpId)
      )

      relatedConstraints.forEach(constraint => {
        renderConstraintGlyph(ctx, constraint, selectedWpId)
      })
    }

    // Highlight hovered constraint from timeline
    if (hoveredConstraintId) {
      const constraint = constraints.find(c => c.id === hoveredConstraintId)
      if (constraint) {
        highlightConstraintComponents(ctx, constraint)
      }
    }
  }

  const renderConstraintGlyph = (ctx: CanvasRenderingContext2D, constraint: Constraint, centerPointId: string) => {
    const centerPoint = getImagePoint(centerPointId, currentImage.id)
    if (!centerPoint) return

    const x = centerPoint.u * scale + offset.x
    const y = centerPoint.v * scale + offset.y

    // Draw constraint icon near the point (Fusion 360 style positioning)
    const glyphInfo = getConstraintGlyph(constraint.type)

    ctx.fillStyle = constraint.id === hoveredConstraintId ? '#ff8c00' : '#0696d7'
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2

    // Position glyph around the point in a circle to avoid overlap
    const radius = 20
    const angle = (glyphInfo.offset * Math.PI * 2) / 8 // 8 positions around point
    const glyphX = x + Math.cos(angle) * radius
    const glyphY = y + Math.sin(angle) * radius

    // Draw constraint glyph background
    ctx.beginPath()
    ctx.arc(glyphX, glyphY, 12, 0, 2 * Math.PI)
    ctx.fill()
    ctx.stroke()

    // Draw constraint icon
    ctx.fillStyle = '#ffffff'
    ctx.font = '12px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(glyphInfo.icon, glyphX, glyphY)

    // Draw connection line to point (subtle)
    ctx.strokeStyle = 'rgba(6, 150, 215, 0.3)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 2])
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(glyphX, glyphY)
    ctx.stroke()
    ctx.setLineDash([])
  }

  const highlightConstraintComponents = (ctx: CanvasRenderingContext2D, constraint: Constraint) => {
    // Highlight all points involved in the constraint
    const involvedPoints = getConstraintPoints(constraint)

    involvedPoints.forEach(pointId => {
      const imagePoint = getImagePoint(pointId, currentImage.id)
      if (imagePoint) {
        const x = imagePoint.u * scale + offset.x
        const y = imagePoint.v * scale + offset.y

        // Draw highlight ring (Fusion 360 style)
        ctx.strokeStyle = '#ff8c00'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(x, y, 10, 0, 2 * Math.PI)
        ctx.stroke()

        // Subtle pulse animation
        const time = Date.now() * 0.003
        const pulseRadius = 10 + Math.sin(time) * 2
        ctx.strokeStyle = 'rgba(255, 140, 0, 0.4)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(x, y, pulseRadius, 0, 2 * Math.PI)
        ctx.stroke()
      }
    })

    // Draw constraint-specific visualization overlays
    renderConstraintSpecificHighlight(ctx, constraint)
  }

  const renderConstraintSpecificHighlight = (ctx: CanvasRenderingContext2D, constraint: Constraint) => {
    switch (constraint.type) {
      case 'distance':
        renderDistanceHighlight(ctx, constraint)
        break
      case 'angle':
        renderAngleHighlight(ctx, constraint)
        break
      case 'perpendicular':
      case 'parallel':
        renderLineRelationHighlight(ctx, constraint)
        break
      case 'rectangle':
        renderRectangleHighlight(ctx, constraint)
        break
      case 'collinear':
        renderCollinearHighlight(ctx, constraint)
        break
    }
  }

  const renderDistanceHighlight = (ctx: CanvasRenderingContext2D, constraint: any) => {
    const pointA = getImagePoint(constraint.pointA, currentImage.id)
    const pointB = getImagePoint(constraint.pointB, currentImage.id)

    if (pointA && pointB) {
      const x1 = pointA.u * scale + offset.x
      const y1 = pointA.v * scale + offset.y
      const x2 = pointB.u * scale + offset.x
      const y2 = pointB.v * scale + offset.y

      // Draw distance line
      ctx.strokeStyle = '#ff8c00'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.setLineDash([])

      // Draw distance label
      const midX = (x1 + x2) / 2
      const midY = (y1 + y2) / 2
      ctx.fillStyle = '#ff8c00'
      ctx.font = '12px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(`${constraint.distance}m`, midX, midY - 8)
    }
  }

  const renderAngleHighlight = (ctx: CanvasRenderingContext2D, constraint: any) => {
    // Draw angle arc between two lines
    // Implementation for angle visualization
  }

  const renderLineRelationHighlight = (ctx: CanvasRenderingContext2D, constraint: any) => {
    // Draw parallel/perpendicular indicators
    // Implementation for line relationship visualization
  }

  const renderRectangleHighlight = (ctx: CanvasRenderingContext2D, constraint: any) => {
    // Draw rectangle outline
    // Implementation for rectangle visualization
  }

  const renderCollinearHighlight = (ctx: CanvasRenderingContext2D, constraint: any) => {
    // Draw line through collinear points
    // Implementation for collinear visualization
  }

  // Constraint type specific glyphs (Fusion 360-inspired icons)
  const getConstraintGlyph = (type: string) => {
    const glyphs = {
      distance: { icon: '↔', offset: 0 },
      angle: { icon: '∠', offset: 1 },
      perpendicular: { icon: '⊥', offset: 2 },
      parallel: { icon: '∥', offset: 3 },
      collinear: { icon: '─', offset: 4 },
      rectangle: { icon: '▭', offset: 5 },
      circle: { icon: '○', offset: 6 },
      fixed: { icon: '📌', offset: 7 }
    }
    return glyphs[type] || { icon: '⚙', offset: 0 }
  }

  return (
    <canvas
      ref={canvasRef}
      className="constraint-overlay"
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    />
  )
}

// Enhanced point name display with constraint indicators
const PointNameOverlay = () => {
  const { currentImage, worldPoints, constraints, showPointNames, selectedWpId } = useProject()

  if (!showPointNames) return null

  const getPointConstraintCount = (pointId: string) => {
    return constraints.filter(c => constraintInvolvesPoint(c, pointId)).length
  }

  return (
    <div className="point-names-overlay">
      {Object.values(worldPoints).map(wp => {
        const imagePoint = wp.imagePoints.find(ip => ip.imageId === currentImage?.id)
        if (!imagePoint || !wp.isVisible) return null

        const constraintCount = getPointConstraintCount(wp.id)
        const isSelected = wp.id === selectedWpId

        return (
          <div
            key={wp.id}
            className={`point-name-label ${isSelected ? 'selected' : ''}`}
            style={{
              left: imagePoint.u * scale + offset.x,
              top: imagePoint.v * scale + offset.y - 30,
              transform: 'translateX(-50%)'
            }}
          >
            <div className="point-name-text">{wp.name}</div>
            {constraintCount > 0 && (
              <div className="constraint-count-badge">{constraintCount}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

### Constraint Creation State Management
```tsx
const useConstraintCreation = () => {
  const [creationState, setCreationState] = useState<{
    type: string | null
    selectedPoints: string[]
    currentStep: number
    isActive: boolean
  }>({
    type: null,
    selectedPoints: [],
    currentStep: 0,
    isActive: false
  })

  const startConstraintCreation = (type: string) => {
    setCreationState({
      type,
      selectedPoints: [],
      currentStep: 0,
      isActive: true
    })
  }

  const addPointToConstraint = (pointId: string) => {
    setCreationState(prev => ({
      ...prev,
      selectedPoints: [...prev.selectedPoints, pointId],
      currentStep: prev.currentStep + 1
    }))
  }

  const isConstraintComplete = () => {
    const requiredPoints = getRequiredPointsForConstraint(creationState.type)
    return creationState.selectedPoints.length >= requiredPoints
  }

  const completeConstraint = (additionalParams: any) => {
    const constraint = createConstraint({
      type: creationState.type,
      ...getConstraintParamsFromPoints(creationState.selectedPoints),
      ...additionalParams
    })

    addConstraintToProject(constraint)
    setCreationState({
      type: null,
      selectedPoints: [],
      currentStep: 0,
      isActive: false
    })
  }

  return {
    creationState,
    startConstraintCreation,
    addPointToConstraint,
    isConstraintComplete,
    completeConstraint,
    isCreatingConstraint: creationState.isActive
  }
}

// Property panel that works across images
const ConstraintPropertyPanel = () => {
  const { creationState, completeConstraint, isConstraintComplete } = useConstraintCreation()
  const { worldPoints } = useProject()

  if (!creationState.isActive) {
    return <ConstraintTypeSelector />
  }

  const getSelectedPointNames = () => {
    return creationState.selectedPoints.map(id =>
      worldPoints[id]?.name || 'Unknown'
    ).join(', ')
  }

  return (
    <div className="constraint-creation-panel">
      <div className="creation-header">
        <h3>Creating {creationState.type} constraint</h3>
        <div className="selected-points">
          Points: {getSelectedPointNames()}
        </div>
      </div>

      <div className="creation-instructions">
        {getInstructionsForStep(creationState.type, creationState.currentStep)}
      </div>

      {creationState.type === 'distance' && (
        <DistanceConstraintForm
          selectedPoints={creationState.selectedPoints}
          onComplete={completeConstraint}
          isComplete={isConstraintComplete()}
        />
      )}

      {creationState.type === 'angle' && (
        <AngleConstraintForm
          selectedPoints={creationState.selectedPoints}
          onComplete={completeConstraint}
          isComplete={isConstraintComplete()}
        />
      )}

      <div className="creation-actions">
        <button
          className="btn-complete"
          disabled={!isConstraintComplete()}
          onClick={() => completeConstraint({})}
        >
          Complete Constraint
        </button>
        <button className="btn-cancel" onClick={() => cancelConstraintCreation()}>
          Cancel
        </button>
      </div>
    </div>
  )
}
```

### Layout Structure (Updated with Context Toolbar)
```tsx
const MainLayout = () => {
  return (
    <div className="app-layout">
      {/* Top toolbar with context-sensitive constraints */}
      <div className="top-toolbar">
        <div className="toolbar-section">
          <button className="btn-tool">📁 Open</button>
          <button className="btn-tool">💾 Save</button>
          <button className="btn-tool">📤 Export</button>
        </div>

        {/* Context-sensitive constraint toolbar */}
        <ConstraintToolbar />

        <div className="toolbar-section">
          <button className="btn-tool">🔍 Zoom Fit</button>
          <button className="btn-tool">🎯 Zoom Selection</button>
          <label className="toolbar-toggle">
            <input type="checkbox" /> Show Point Names
          </label>
        </div>
      </div>

      {/* Main content area */}
      <div className="content-area">
        {/* Left sidebar: Image Navigation */}
        <div className="sidebar-left">
          <ImageNavigationToolbar />
        </div>

        {/* Center: Image viewer with overlays */}
        <div className="viewer-area">
          <div className="image-viewer-container">
            <ImageViewer />
            <ConstraintOverlay />
            <PointNameOverlay />
            <SelectionOverlay />
          </div>
        </div>

        {/* Right sidebar: Properties & Timeline */}
        <div className="sidebar-right">
          <ConstraintPropertyPanel />
          <ConstraintTimeline />
          <WorldPointsList />
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="status-bar">
        <span>Image: {currentImage?.name}</span>
        <span>WP: {worldPoints.length}</span>
        <span>Constraints: {constraints.length}</span>
        <span>Selection: {getSelectionSummary()}</span>
        <span>Scale: {scale.toFixed(2)}x</span>
      </div>
    </div>
  )
}

// Selection overlay for multi-select visualization
const SelectionOverlay = () => {
  const { selectedPoints } = useSelection()
  const { currentImage, worldPoints, scale, offset } = useProject()

  return (
    <div className="selection-overlay">
      {selectedPoints.map(pointId => {
        const wp = worldPoints[pointId]
        const imagePoint = wp?.imagePoints.find(ip => ip.imageId === currentImage?.id)

        if (!imagePoint) return null

        return (
          <div
            key={pointId}
            className="selection-indicator"
            style={{
              left: imagePoint.u * scale + offset.x,
              top: imagePoint.v * scale + offset.y,
              transform: 'translate(-50%, -50%)'
            }}
          >
            <div className="selection-ring"></div>
            <div className="selection-number">
              {selectedPoints.indexOf(pointId) + 1}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

## Global Styling (Fusion 360-like)

### CSS Variables for Consistency
```css
:root {
  /* Fusion 360-inspired color scheme */
  --bg-primary: #393939;
  --bg-secondary: #2d2d2d;
  --bg-panel: #454545;
  --text-primary: #ffffff;
  --text-secondary: #cccccc;
  --text-muted: #999999;

  /* Accent colors */
  --accent-blue: #0696d7;
  --accent-orange: #ff8c00;
  --accent-green: #5cb85c;
  --accent-red: #d9534f;

  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;

  /* Layout */
  --sidebar-width: 300px;
  --top-toolbar-height: 56px;
  --status-bar-height: 24px;

  /* Form elements */
  --border-radius: 3px;
  --input-height: 32px;
  --button-height: 32px;
}

/* Fusion 360-style panels */
.property-panel, .constraint-timeline {
  background: var(--bg-panel);
  border: 1px solid #666;
  border-radius: var(--border-radius);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

/* Point selector styling */
.point-selector {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-md);
}

.point-selector-controls {
  display: flex;
  gap: var(--spacing-xs);
}

.point-dropdown {
  flex: 1;
  height: var(--input-height);
  background: var(--bg-secondary);
  border: 1px solid #666;
  color: var(--text-primary);
  border-radius: var(--border-radius);
  padding: 0 var(--spacing-sm);
}

.click-select-btn {
  width: var(--input-height);
  height: var(--input-height);
  background: var(--bg-secondary);
  border: 1px solid #666;
  border-radius: var(--border-radius);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.click-select-btn.active {
  background: var(--accent-blue);
  border-color: var(--accent-blue);
}

/* Timeline styling with hover feedback */
.timeline-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  border-radius: var(--border-radius);
  margin-bottom: var(--spacing-xs);
  background: var(--bg-secondary);
  border: 1px solid #666;
  transition: all 0.2s ease;
  cursor: pointer;
}

.timeline-item:hover {
  background: var(--bg-panel);
  border-color: var(--accent-blue);
  box-shadow: 0 2px 8px rgba(6, 150, 215, 0.2);
}

.timeline-item.disabled {
  opacity: 0.6;
}

.timeline-item.disabled:hover {
  background: var(--bg-secondary);
  border-color: #666;
  box-shadow: none;
}

.timeline-item.hovered {
  background: var(--bg-panel);
  border-color: var(--accent-orange);
  box-shadow: 0 2px 8px rgba(255, 140, 0, 0.3);
}

.timeline-item-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-blue);
  border-radius: 50%;
  color: white;
  font-size: 12px;
  transition: background-color 0.2s ease;
}

.timeline-item:hover .timeline-item-icon {
  background: var(--accent-orange);
}

.timeline-item-content {
  flex: 1;
}

.timeline-item-title {
  font-weight: 500;
  color: var(--text-primary);
  font-size: 14px;
}

.timeline-item-details {
  color: var(--text-muted);
  font-size: 12px;
}

.timeline-item-actions {
  display: flex;
  gap: var(--spacing-xs);
}

.timeline-item-actions button {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--border-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease;
}

.timeline-item-actions button:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* Image navigation toolbar styles with constraint mode feedback */
.image-toolbar {
  background: var(--bg-panel);
  border-right: 1px solid #666;
  padding: var(--spacing-md);
  height: 100vh;
  overflow-y: auto;
  width: var(--sidebar-width);
}

.image-toolbar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-md);
}

.image-toolbar-header h3 {
  margin: 0;
  color: var(--text-primary);
}

.btn-add-image {
  width: 32px;
  height: 32px;
  background: var(--accent-blue);
  border: none;
  border-radius: var(--border-radius);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease;
}

.btn-add-image:hover {
  background: var(--accent-orange);
}

/* Constraint creation status */
.constraint-creation-status {
  background: rgba(6, 150, 215, 0.1);
  border: 1px solid var(--accent-blue);
  border-radius: var(--border-radius);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.constraint-type-badge {
  background: var(--accent-blue);
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: bold;
  display: inline-block;
  margin-bottom: var(--spacing-xs);
}

.progress-indicator {
  margin-bottom: var(--spacing-xs);
}

.progress-text {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.progress-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent-blue);
  transition: width 0.3s ease;
}

.navigation-hint {
  font-size: 11px;
  color: var(--text-muted);
  font-style: italic;
}

/* Image navigation items */
.image-nav-item {
  display: flex;
  margin-bottom: var(--spacing-md);
  border-radius: var(--border-radius);
  overflow: hidden;
  border: 2px solid transparent;
  transition: all 0.2s ease;
}

.image-nav-item.active {
  border-color: var(--accent-blue);
  box-shadow: 0 2px 8px rgba(6, 150, 215, 0.3);
}

.image-nav-item.constraint-mode {
  border-color: var(--accent-orange);
}

.image-nav-item.constraint-mode.active {
  border-color: var(--accent-blue);
  box-shadow: 0 2px 8px rgba(6, 150, 215, 0.4);
}

.image-thumbnail {
  width: 80px;
  height: 60px;
  position: relative;
  cursor: pointer;
  overflow: hidden;
}

.image-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.constraint-mode-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 140, 0, 0.8);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 10px;
  text-align: center;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.image-nav-item:hover .constraint-mode-overlay {
  opacity: 1;
}

.selected-points-indicator {
  background: rgba(255, 255, 255, 0.9);
  color: var(--accent-orange);
  padding: 2px 6px;
  border-radius: 8px;
  font-weight: bold;
  margin-bottom: 4px;
}

.switch-hint {
  font-size: 9px;
}

.active-indicator {
  position: absolute;
  top: 4px;
  right: 4px;
}

.active-dot {
  width: 8px;
  height: 8px;
  background: var(--accent-blue);
  border-radius: 50%;
  border: 2px solid white;
}

.image-info {
  flex: 1;
  padding: var(--spacing-sm);
  background: var(--bg-secondary);
}

.image-name {
  color: var(--text-primary);
  font-weight: 500;
  font-size: 13px;
  margin-bottom: 4px;
  cursor: pointer;
}

.image-name-input {
  background: var(--bg-primary);
  border: 1px solid var(--accent-blue);
  color: var(--text-primary);
  padding: 2px 4px;
  border-radius: 2px;
  font-size: 13px;
  width: 100%;
}

.image-stats {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
}

.stat-item.selected {
  color: var(--accent-blue);
  font-weight: bold;
}

.stat-icon {
  font-size: 10px;
}

/* Constraint instructions */
.constraint-instructions {
  background: rgba(255, 140, 0, 0.1);
  border: 1px solid var(--accent-orange);
  border-radius: var(--border-radius);
  padding: var(--spacing-md);
  margin-top: var(--spacing-md);
}

.constraint-instructions h4 {
  margin: 0 0 var(--spacing-sm) 0;
  color: var(--accent-orange);
  font-size: 14px;
}

.constraint-instructions ul {
  margin: 0;
  padding-left: var(--spacing-md);
  color: var(--text-secondary);
}

.constraint-instructions li {
  font-size: 12px;
  margin-bottom: 4px;
}

/* Point name overlays with constraint feedback */
.point-names-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
}

.point-name-label {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 4px;
  pointer-events: none;
}

.point-name-label.selected {
  z-index: 20;
}

.point-name-text {
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
  white-space: nowrap;
}

.point-name-label.selected .point-name-text {
  background: var(--accent-blue);
  box-shadow: 0 2px 8px rgba(6, 150, 215, 0.5);
}

.constraint-count-badge {
  background: var(--accent-orange);
  color: white;
  border-radius: 50%;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
}

/* Context-sensitive constraint toolbar */
.top-toolbar {
  height: var(--top-toolbar-height);
  background: var(--bg-panel);
  border-bottom: 1px solid #666;
  display: flex;
  align-items: center;
  padding: 0 var(--spacing-md);
  gap: var(--spacing-lg);
}

.constraint-toolbar {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.toolbar-label {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  margin-right: var(--spacing-sm);
}

.constraint-buttons {
  display: flex;
  gap: var(--spacing-xs);
}

.constraint-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1px solid transparent;
  border-radius: var(--border-radius);
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 60px;
}

.constraint-btn.enabled {
  border-color: var(--accent-blue);
  background: rgba(6, 150, 215, 0.1);
  color: var(--text-primary);
}

.constraint-btn.enabled:hover {
  background: rgba(6, 150, 215, 0.2);
  border-color: var(--accent-orange);
}

.constraint-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
  color: var(--text-muted);
}

.constraint-icon {
  font-size: 16px;
  margin-bottom: 2px;
}

.constraint-label {
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 500;
}

.selection-info {
  color: var(--text-secondary);
  font-size: 12px;
  padding: var(--spacing-xs) var(--spacing-sm);
  background: rgba(255, 255, 255, 0.05);
  border-radius: var(--border-radius);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Selection overlay */
.selection-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 15;
}

.selection-indicator {
  position: absolute;
  pointer-events: none;
}

.selection-ring {
  width: 24px;
  height: 24px;
  border: 3px solid var(--accent-blue);
  border-radius: 50%;
  background: rgba(6, 150, 215, 0.2);
  animation: selection-pulse 2s infinite;
}

.selection-number {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 16px;
  height: 16px;
  background: var(--accent-blue);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
  border: 2px solid white;
}

@keyframes selection-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(6, 150, 215, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(6, 150, 215, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(6, 150, 215, 0);
  }
}

/* Property panel updates for constraint parameters */
.parameter-form {
  padding: var(--spacing-md);
}

.selected-points-preview,
.selected-lines-preview {
  background: rgba(6, 150, 215, 0.1);
  border: 1px solid var(--accent-blue);
  border-radius: var(--border-radius);
  padding: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
  font-size: 12px;
  color: var(--text-secondary);
}

.constraint-description {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: var(--spacing-md);
  padding: var(--spacing-sm);
  background: rgba(255, 255, 255, 0.05);
  border-radius: var(--border-radius);
}

.coordinate-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.form-actions {
  display: flex;
  gap: var(--spacing-sm);
  justify-content: flex-end;
}

.btn-primary {
  background: var(--accent-blue);
  color: white;
  border: none;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--border-radius);
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-orange);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-clear-constraint {
  background: transparent;
  border: 1px solid #666;
  color: var(--text-muted);
  width: 24px;
  height: 24px;
  border-radius: var(--border-radius);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.btn-clear-constraint:hover {
  background: var(--accent-red);
  border-color: var(--accent-red);
  color: white;
}
```

## Implementation Priority

### Phase 1: Core Foundation (Week 1-2)
1. **localStorage Project Management**
   - Replace backend project store with localStorage
   - Implement ProjectStorage utility class
   - Add auto-save on every change
   - Handle localStorage size limits (warn at 4MB)

2. **World Point Auto-Naming System**
   - Implement WorldPointManager class
   - Auto-generate WP1, WP2, WP3... names
   - Add UUID generation for backend IDs
   - Color cycling for visual distinction

3. **Image Upload & Storage**
   - File picker with drag/drop support
   - Convert to base64 for localStorage
   - Image thumbnail generation
   - Basic image gallery component

### Phase 2: Interactive Image Viewer (Week 3-4)
1. **Canvas-Based Image Viewer**
   - Zoom/pan functionality
   - Click-to-place world points
   - Point visualization with names
   - Selection highlighting

2. **Point Management UI**
   - World points list with visibility toggles
   - Point renaming capability
   - Color assignment and changes
   - Delete/merge point operations

### Phase 3: Context-Sensitive Constraint System (Week 5-6)
1. **Context-Sensitive Constraint Toolbar**
   - Top toolbar showing available constraints based on selection
   - Dynamic enabling/disabling of constraint buttons
   - Immediate constraint creation on click
   - Selection summary display

2. **Multi-Selection System**
   - Ctrl/Shift click for multi-select
   - Visual selection indicators with numbering
   - Auto-detection of lines from selected points
   - Selection overlay with pulse animation

3. **Enhanced Constraint Forms**
   - Context-aware parameter input forms
   - Preview of selected points/lines
   - Real-time validation
   - One-click constraint application

### Phase 4: Constraint Timeline (Week 7-8)
1. **Timeline Component**
   - Constraint history display
   - Enable/disable constraints
   - Edit existing constraints
   - Delete constraints with confirmation

2. **Constraint Editing**
   - Populate forms with existing constraint data
   - Replace point references in constraints
   - Update timeline display
   - Validation for constraint modifications

### Phase 5: Layout & Polish (Week 9-10)
1. **Fusion 360-Inspired Layout**
   - Three-panel layout (images, viewer, properties)
   - Resizable panels
   - Toolbar with common actions
   - Status bar with project stats

2. **Advanced Features**
   - Keyboard shortcuts
   - Undo/redo system
   - Project export/import
   - Constraint conflict detection

## Technical Implementation Details

### React Hook Form + Zod Schema Examples
```typescript
// Distance constraint schema
const distanceConstraintSchema = z.object({
  pointA: z.string().min(1, "Point A is required"),
  pointB: z.string().min(1, "Point B is required"),
  distance: z.number().positive("Distance must be positive")
}).refine(data => data.pointA !== data.pointB, {
  message: "Points must be different",
  path: ["pointB"]
})

// Rectangle constraint schema
const rectangleConstraintSchema = z.object({
  cornerA: z.string().min(1, "Corner A is required"),
  cornerB: z.string().min(1, "Corner B is required"),
  cornerC: z.string().min(1, "Corner C is required"),
  cornerD: z.string().min(1, "Corner D is required"),
  aspectRatio: z.number().positive().optional()
}).refine(data => {
  const corners = [data.cornerA, data.cornerB, data.cornerC, data.cornerD]
  return new Set(corners).size === 4
}, {
  message: "All corners must be different points"
})
```

### localStorage Size Management
```typescript
class StorageManager {
  static checkStorageSize(): { used: number, available: number, warning: boolean } {
    const used = new Blob(Object.values(localStorage)).size
    const available = 5 * 1024 * 1024 // 5MB typical limit
    const warning = used > available * 0.8 // Warn at 80%

    return { used, available, warning }
  }

  static compressImages(project: Project): Project {
    // Implement image compression if storage is getting full
    return project
  }
}
```

### Image Processing Utilities
```typescript
class ImageUtils {
  static async loadImageFile(file: File): Promise<ProjectImage> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      const img = new Image()

      reader.onload = (e) => {
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')!

          // Resize if too large
          const maxSize = 1920
          let { width, height } = img

          if (width > maxSize || height > maxSize) {
            const scale = maxSize / Math.max(width, height)
            width *= scale
            height *= scale
          }

          canvas.width = width
          canvas.height = height
          ctx.drawImage(img, 0, 0, width, height)

          resolve({
            id: crypto.randomUUID(),
            name: file.name,
            blob: canvas.toDataURL('image/jpeg', 0.8),
            width,
            height
          })
        }

        img.src = e.target?.result as string
      }

      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }
}
```

This comprehensive plan provides:
- ✅ **Fusion 360-inspired UX** with property panels and timeline
- ✅ **Auto-naming world points** (WP1, WP2, WP3...)
- ✅ **Hybrid point selection** (dropdown + click)
- ✅ **localStorage persistence** for single project
- ✅ **Constraint editing** with point replacement
- ✅ **Progressive implementation** over 10 weeks