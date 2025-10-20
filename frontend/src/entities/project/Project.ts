import type { WorldPoint } from '../world-point/WorldPoint'
import type { Line } from '../line/Line'
import type { Viewpoint } from '../viewpoint/Viewpoint'
import type { Constraint } from '../constraints/base-constraint'

export type MeasurementUnits = 'meters' | 'feet' | 'inches'
export type Theme = 'dark' | 'light'
export type WorkspaceType = 'image' | 'world'
export type VisualFeedbackLevel = 'minimal' | 'standard' | 'detailed'
export type ImageSortOrder = 'name' | 'date'

export interface ProjectSettings {
  showPointNames: boolean
  autoSave: boolean
  theme: Theme
  measurementUnits: MeasurementUnits
  precisionDigits: number
  showConstraintGlyphs: boolean
  showMeasurements: boolean
  autoOptimize: boolean
  gridVisible: boolean
  snapToGrid: boolean
  defaultWorkspace: WorkspaceType
  showConstructionGeometry: boolean
  enableSmartSnapping: boolean
  constraintPreview: boolean
  visualFeedbackLevel: VisualFeedbackLevel
  imageSortOrder?: ImageSortOrder
}

export class Project {
  id: string  // Do *not* use this id as a reference, use the full entity everywhere!
  name: string

  worldPoints: Set<WorldPoint>
  lines: Set<Line>
  viewpoints: Set<Viewpoint>
  constraints: Constraint[]

  history: any[]

  showPointNames: boolean
  autoSave: boolean
  theme: Theme
  measurementUnits: MeasurementUnits
  precisionDigits: number
  showConstraintGlyphs: boolean
  showMeasurements: boolean
  autoOptimize: boolean
  gridVisible: boolean
  snapToGrid: boolean
  defaultWorkspace: WorkspaceType
  showConstructionGeometry: boolean
  enableSmartSnapping: boolean
  constraintPreview: boolean
  visualFeedbackLevel: VisualFeedbackLevel
  imageSortOrder?: ImageSortOrder

  createdAt: string
  updatedAt: string

  private constructor(
    id: string,
    name: string,
    worldPoints: Set<WorldPoint>,
    lines: Set<Line>,
    viewpoints: Set<Viewpoint>,
    constraints: Constraint[],
    history: any[],
    settings: {
      showPointNames: boolean
      autoSave: boolean
      theme: Theme
      measurementUnits: MeasurementUnits
      precisionDigits: number
      showConstraintGlyphs: boolean
      showMeasurements: boolean
      autoOptimize: boolean
      gridVisible: boolean
      snapToGrid: boolean
      defaultWorkspace: WorkspaceType
      showConstructionGeometry: boolean
      enableSmartSnapping: boolean
      constraintPreview: boolean
      visualFeedbackLevel: VisualFeedbackLevel
      imageSortOrder?: ImageSortOrder
    },
    createdAt: string,
    updatedAt: string
  ) {
    this.id = id
    this.name = name
    this.worldPoints = worldPoints
    this.lines = lines
    this.viewpoints = viewpoints
    this.constraints = constraints
    this.history = history
    this.showPointNames = settings.showPointNames
    this.autoSave = settings.autoSave
    this.theme = settings.theme
    this.measurementUnits = settings.measurementUnits
    this.precisionDigits = settings.precisionDigits
    this.showConstraintGlyphs = settings.showConstraintGlyphs
    this.showMeasurements = settings.showMeasurements
    this.autoOptimize = settings.autoOptimize
    this.gridVisible = settings.gridVisible
    this.snapToGrid = settings.snapToGrid
    this.defaultWorkspace = settings.defaultWorkspace
    this.showConstructionGeometry = settings.showConstructionGeometry
    this.enableSmartSnapping = settings.enableSmartSnapping
    this.constraintPreview = settings.constraintPreview
    this.visualFeedbackLevel = settings.visualFeedbackLevel
    this.imageSortOrder = settings.imageSortOrder
    this.createdAt = createdAt
    this.updatedAt = updatedAt
  }

  static create(name: string): Project {
    const now = new Date().toISOString()
    return new Project(
      crypto.randomUUID(),
      name,
      new Set<WorldPoint>(),
      new Set<Line>(),
      new Set<Viewpoint>(),
      [],
      [],
      {
        showPointNames: true,
        autoSave: true,
        theme: 'dark',
        measurementUnits: 'meters',
        precisionDigits: 3,
        showConstraintGlyphs: true,
        showMeasurements: true,
        autoOptimize: false,
        gridVisible: true,
        snapToGrid: false,
        defaultWorkspace: 'world',
        showConstructionGeometry: true,
        enableSmartSnapping: true,
        constraintPreview: true,
        visualFeedbackLevel: 'standard'
      },
      now,
      now
    )
  }

  static createFull(
    id: string,
    name: string,
    worldPoints: Set<WorldPoint>,
    lines: Set<Line>,
    viewpoints: Set<Viewpoint>,
    settings: {
      showPointNames: boolean
      autoSave: boolean
      theme: Theme
      measurementUnits: MeasurementUnits
      precisionDigits: number
      showConstraintGlyphs: boolean
      showMeasurements: boolean
      autoOptimize: boolean
      gridVisible: boolean
      snapToGrid: boolean
      defaultWorkspace: WorkspaceType
      showConstructionGeometry: boolean
      enableSmartSnapping: boolean
      constraintPreview: boolean
      visualFeedbackLevel: VisualFeedbackLevel
      imageSortOrder?: ImageSortOrder
    },
    createdAt: string,
    updatedAt: string
  ): Project {
    return new Project(
      id,
      name,
      worldPoints,
      lines,
      viewpoints,
      [],
      [],
      settings,
      createdAt,
      updatedAt
    )
  }

  clone(): Project {
    return new Project(
      this.id,
      this.name,
      this.worldPoints,
      this.lines,
      this.viewpoints,
      this.constraints,
      this.history,
      {
        showPointNames: this.showPointNames,
        autoSave: this.autoSave,
        theme: this.theme,
        measurementUnits: this.measurementUnits,
        precisionDigits: this.precisionDigits,
        showConstraintGlyphs: this.showConstraintGlyphs,
        showMeasurements: this.showMeasurements,
        autoOptimize: this.autoOptimize,
        gridVisible: this.gridVisible,
        snapToGrid: this.snapToGrid,
        defaultWorkspace: this.defaultWorkspace,
        showConstructionGeometry: this.showConstructionGeometry,
        enableSmartSnapping: this.enableSmartSnapping,
        constraintPreview: this.constraintPreview,
        visualFeedbackLevel: this.visualFeedbackLevel,
        imageSortOrder: this.imageSortOrder
      },
      this.createdAt,
      this.updatedAt
    )
  }

  addWorldPoint(point: WorldPoint): void {
    this.worldPoints.add(point)
    this.updatedAt = new Date().toISOString()
  }

  removeWorldPoint(point: WorldPoint): void {
    this.worldPoints.delete(point)
    this.updatedAt = new Date().toISOString()
  }

  addLine(line: Line): void {
    this.lines.add(line)
    this.updatedAt = new Date().toISOString()
  }

  removeLine(line: Line): void {
    this.lines.delete(line)
    this.updatedAt = new Date().toISOString()
  }

  addViewpoint(viewpoint: Viewpoint): void {
    this.viewpoints.add(viewpoint)
    this.updatedAt = new Date().toISOString()
  }

  removeViewpoint(viewpoint: Viewpoint): void {
    this.viewpoints.delete(viewpoint)
    this.updatedAt = new Date().toISOString()
  }

  addConstraint(constraint: Constraint): void {
    this.constraints.push(constraint)
    this.updatedAt = new Date().toISOString()
  }

  removeConstraint(constraint: Constraint): void {
    const index = this.constraints.indexOf(constraint)
    if (index !== -1) {
      this.constraints.splice(index, 1)
      this.updatedAt = new Date().toISOString()
    }
  }

  clear(): void {
    this.worldPoints.clear()
    this.lines.clear()
    this.viewpoints.clear()
    this.constraints = []
    this.history = []
    this.updatedAt = new Date().toISOString()
  }

  getStats() {
    return {
      worldPoints: this.worldPoints.size,
      lines: this.lines.size,
      viewpoints: this.viewpoints.size,
      constraints: this.constraints.length
    }
  }
}
