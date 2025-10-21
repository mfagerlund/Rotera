// JSON format exporter

import type { Project } from '../../../entities/project'
import type { ExportOptions, ExportResult, ExportWorldPoint } from '../types'
import { createDownloadURL } from '../utils'
import { getFormattedWorldPoints, getProjectStatistics } from './shared'

export function exportJSON(project: Project, options: ExportOptions): ExportResult {
  const exportData: any = {
    project: {
      name: project.name
    },
    worldPoints: getFormattedWorldPoints(project, options),
    coordinateSystem: options.coordinateSystem === 'world' ? (project as any).coordinateSystem : null
  }

  if (options.includeConstraints) {
    // Convert entity constraints to DTO constraints for export
    exportData.constraints = Array.from(project.constraints).map(c => (c as any))
  }

  if (options.includeImages) {
    exportData.images = (project as any).images
    exportData.cameras = (project as any).cameras
    exportData.viewpoints = Array.from(project.viewpoints).reduce((acc, vp) => ({ ...acc, [vp.getName()]: vp }), {} as Record<string, any>)
  }

  if (options.includeMetadata) {
    exportData.metadata = {
      exportedAt: new Date().toISOString(),
      exportOptions: options,
      statistics: getProjectStatistics(project)
    }
  }

  const jsonString = JSON.stringify(exportData, null, 2)
  const filename = `${project.name}_export.json`

  return {
    success: true,
    message: 'JSON export completed',
    filename,
    data: jsonString,
    url: createDownloadURL(jsonString, 'application/json')
  }
}
