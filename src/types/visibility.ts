export interface VisibilitySettings {
  worldPoints: boolean
  lines: boolean
  planes: boolean
  vanishingLines: boolean
  vanishingPoints: boolean
  perspectiveGrid: boolean
}

export const DEFAULT_VISIBILITY: VisibilitySettings = {
  worldPoints: true,
  lines: true,
  planes: true,
  vanishingLines: true,
  vanishingPoints: true,
  perspectiveGrid: false
}
