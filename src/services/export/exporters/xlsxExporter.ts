// Excel/XLSX format exporter (simplified - outputs CSV format)

import type { Project } from '../../../entities/project'
import type { ExportOptions, ExportResult } from '../types'
import { exportCSV } from './csvExporter'

export function exportExcel(project: Project, options: ExportOptions): ExportResult {
  // Simplified Excel export (would need a library like xlsx for full implementation)
  const csvResult = exportCSV(project, options)

  return {
    ...csvResult,
    filename: csvResult.filename.replace('.csv', '.xlsx'),
    message: 'Excel export completed (CSV format)'
  }
}
