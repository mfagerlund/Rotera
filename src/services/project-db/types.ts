export interface OptimizationResultSummary {
  error: number | null
  /** RMS reprojection error in pixels - used for quality assessment */
  rmsReprojectionError?: number
  converged: boolean
  solveTimeMs: number
  errorMessage?: string
  optimizedAt: Date
}

export interface ProjectSummary {
  id: string
  name: string
  folderId: string | null
  createdAt: Date
  updatedAt: Date
  thumbnailUrl?: string
  viewpointCount: number
  worldPointCount: number
  optimizationResult?: OptimizationResultSummary
}

export interface Folder {
  id: string
  name: string
  parentId: string | null
  createdAt: Date
}

export interface StoredImage {
  id: string
  projectId: string
  blob: Blob
  metadata: {
    width: number
    height: number
    mimeType: string
    originalFilename: string
  }
}

export interface StoredProject {
  id: string
  name: string
  folderId: string | null
  createdAt: Date
  updatedAt: Date
  data: string
  thumbnailUrl?: string
  viewpointCount: number
  worldPointCount: number
  optimizationResult?: OptimizationResultSummary
}

export interface ThumbnailGeometry {
  imageWidth: number
  imageHeight: number
  points: Array<{ u: number; v: number; color: string }>
  lines: Array<{ p1: { u: number; v: number }; p2: { u: number; v: number }; color: string; isConstruction: boolean }>
  vanishingLines: Array<{ p1: { u: number; v: number }; p2: { u: number; v: number }; axis: 'x' | 'y' | 'z' }>
}
