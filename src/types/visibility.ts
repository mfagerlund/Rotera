export interface VisibilitySettings {
  worldPoints: boolean
  lines: boolean
  planes: boolean
  vanishingLines: boolean
  vanishingPoints: boolean
  perspectiveGrid: boolean
  reprojectionErrors: boolean
  cameraVanishingGeometry: boolean
}

export interface LockSettings {
  worldPoints: boolean
  lines: boolean
  planes: boolean
  vanishingLines: boolean
}

export interface ViewSettings {
  visibility: VisibilitySettings
  locking: LockSettings
  isExpanded?: boolean
}

export const DEFAULT_VISIBILITY: VisibilitySettings = {
  worldPoints: true,
  lines: true,
  planes: true,
  vanishingLines: true,
  vanishingPoints: true,
  perspectiveGrid: false,
  reprojectionErrors: false,
  cameraVanishingGeometry: true
}

export const DEFAULT_LOCKING: LockSettings = {
  worldPoints: false,
  lines: false,
  planes: false,
  vanishingLines: false
}

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  visibility: DEFAULT_VISIBILITY,
  locking: DEFAULT_LOCKING,
  isExpanded: false
}
