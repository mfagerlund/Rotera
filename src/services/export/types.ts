// Export service types

export type ExportFormat = 'json' | 'csv' | 'xlsx' | 'ply' | 'obj' | 'dxf' | 'pdf' | 'xml'

export interface ExportOptions {
  format: ExportFormat
  includeImages: boolean
  includeConstraints: boolean
  includeMetadata: boolean
  coordinateSystem: 'local' | 'world'
  precision: number
  units: 'mm' | 'cm' | 'm' | 'in' | 'ft'
}

export interface ExportResult {
  success: boolean
  message: string
  filename: string
  data?: string | ArrayBuffer
  url?: string
}

// Simple export format (not the same as DTOs)
export interface ExportWorldPoint {
  id: string
  name: string
  xyz?: [number, number, number] | null
  color: string
  group?: string
  isLocked: boolean
  imagePoints: any[] // Legacy field for compatibility
}

// Default export options
export const defaultExportOptions: ExportOptions = {
  format: 'json',
  includeImages: false,
  includeConstraints: true,
  includeMetadata: true,
  coordinateSystem: 'local',
  precision: 6,
  units: 'mm'
}
