// Entity-based project structure
// DTOs are ONLY for serialization - this is the runtime data model

import { WorldPoint } from '../entities/world-point/WorldPoint'
import { Line } from '../entities/line/Line'
import { Camera } from '../entities/camera'
import { Constraint } from '../entities/constraints/base-constraint'

export interface EntityProject {
  id: string
  name: string

  // Entity collections - fully typed, no IDs
  worldPoints: Map<string, WorldPoint>
  lines: Map<string, Line>
  cameras: Map<string, Camera>

  // Constraints hold references to entities
  constraints: Constraint[]

  // Metadata
  settings: ProjectSettings
  createdAt: string
  updatedAt: string
}

export interface ProjectSettings {
  showPointNames: boolean
  autoSave: boolean
  theme: 'dark' | 'light'
  measurementUnits: 'meters' | 'feet' | 'inches'
  precisionDigits: number
  showConstraintGlyphs: boolean
  showMeasurements: boolean
  autoOptimize: boolean
  gridVisible: boolean
  snapToGrid: boolean
  defaultWorkspace: 'image' | 'world'
  showConstructionGeometry: boolean
  enableSmartSnapping: boolean
  constraintPreview: boolean
  visualFeedbackLevel: 'minimal' | 'standard' | 'detailed'
}
