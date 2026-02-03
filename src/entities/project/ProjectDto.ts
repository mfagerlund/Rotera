import type { WorldPointDto } from '../world-point/WorldPointDto'
import type { LineDto } from '../line/LineDto'
import type { ViewpointDto } from '../viewpoint/ViewpointDto'
import type { ImagePointDto } from '../imagePoint/ImagePointDto'
import type { ConstraintDto } from '../constraints/ConstraintDto'
import type { VanishingLineDto } from '../vanishing-line/VanishingLineDto'
import type { MeasurementUnits, Theme, WorkspaceType, VisualFeedbackLevel, ImageSortOrder } from './Project'
import type { ViewSettings } from '../../types/visibility'

// Current format version: 1
// Version history:
// - 0 (implicit): Original format with 'horizontal', 'vertical', 'x-aligned', 'z-aligned' directions
// - 1: New axis-based directions: 'x', 'y', 'z', 'xy', 'xz', 'yz'
export const CURRENT_FORMAT_VERSION = 1

export interface ProjectDto {
  formatVersion?: number  // undefined = version 0
  name: string
  worldPoints: WorldPointDto[]
  lines: LineDto[]
  viewpoints: ViewpointDto[]
  imagePoints: ImagePointDto[]
  constraints: ConstraintDto[]
  vanishingLines?: VanishingLineDto[]

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
  viewSettings?: ViewSettings
  imageSortOrder?: ImageSortOrder
  optimizationMaxIterations?: number
  leftSidebarWidth?: number
  imageHeights?: Record<string, number>
  lockCameraPoses?: boolean
  lastMedianReprojectionError?: number
}
