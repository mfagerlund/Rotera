// Export service for various file formats

import type { Project } from '../../entities/project'
import type { ExportOptions, ExportResult } from './types'
import { exportJSON } from './exporters/jsonExporter'
import { exportCSV } from './exporters/csvExporter'
import { exportExcel } from './exporters/xlsxExporter'
import { exportPLY } from './exporters/plyExporter'
import { exportOBJ } from './exporters/objExporter'
import { exportDXF } from './exporters/dxfExporter'
import { exportPDF } from './exporters/pdfExporter'
import { exportXML } from './exporters/xmlExporter'

export class ExportService {
  private project: Project

  constructor(project: Project) {
    this.project = project
  }

  async export(options: ExportOptions): Promise<ExportResult> {
    try {
      switch (options.format) {
        case 'json':
          return exportJSON(this.project, options)
        case 'csv':
          return exportCSV(this.project, options)
        case 'xlsx':
          return exportExcel(this.project, options)
        case 'ply':
          return exportPLY(this.project, options)
        case 'obj':
          return exportOBJ(this.project, options)
        case 'dxf':
          return exportDXF(this.project, options)
        case 'pdf':
          return exportPDF(this.project, options)
        case 'xml':
          return exportXML(this.project, options)
        default:
          throw new Error(`Unsupported export format: ${options.format}`)
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Export failed',
        filename: ''
      }
    }
  }
}
