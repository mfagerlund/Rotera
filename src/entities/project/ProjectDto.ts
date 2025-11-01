import type { WorldPointDto } from '../world-point/WorldPointDto'
import type { LineDto } from '../line/LineDto'
import type { ViewpointDto } from '../viewpoint/ViewpointDto'
import type { ImagePointDto } from '../imagePoint/ImagePointDto'
import type { ConstraintDto } from '../constraints/ConstraintDto'
import type { VanishingLineDto } from '../vanishing-line/VanishingLineDto'
import type { MeasurementUnits, Theme, WorkspaceType, VisualFeedbackLevel, ImageSortOrder } from './Project'
import type { ViewSettings } from '../../types/visibility'

export interface ProjectDto {
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
}
