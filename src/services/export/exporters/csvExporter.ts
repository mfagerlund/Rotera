// CSV format exporter

import type { Project } from '../../../entities/project'
import type { ExportOptions, ExportResult } from '../types'
import { createDownloadURL } from '../utils'
import { getFormattedWorldPoints, getConstraintsForPoint } from './shared'

export function exportCSV(project: Project, options: ExportOptions): ExportResult {
  const worldPoints = getFormattedWorldPoints(project, options)
  const headers = ['Name', 'ID', 'X', 'Y', 'Z', 'Color', 'Group', 'IsLocked', 'ImageCount']

  if (options.includeConstraints) {
    headers.push('ConstraintCount', 'ConstraintTypes')
  }

  const rows = [headers]

  Object.values(worldPoints).forEach(wp => {
    const row = [
      wp.name,
      wp.id,
      wp.xyz ? wp.xyz[0].toFixed(options.precision) : '',
      wp.xyz ? wp.xyz[1].toFixed(options.precision) : '',
      wp.xyz ? wp.xyz[2].toFixed(options.precision) : '',
      wp.color || '',
      wp.group || '',
      wp.isLocked ? 'true' : 'false',
      wp.imagePoints.length.toString()
    ]

    if (options.includeConstraints) {
      // Find the actual WorldPoint entity by name
      const worldPoint = Array.from(project.worldPoints).find(p => p.getName() === wp.id)
      const constraintsForPoint = worldPoint ? getConstraintsForPoint(project, worldPoint) : []
      row.push(
        constraintsForPoint.length.toString(),
        constraintsForPoint.map(c => c.type).join(';')
      )
    }

    rows.push(row)
  })

  const csvContent = rows.map(row =>
    row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(',')
  ).join('\n')

  const filename = `${project.name}_points.csv`

  return {
    success: true,
    message: 'CSV export completed',
    filename,
    data: csvContent,
    url: createDownloadURL(csvContent, 'text/csv')
  }
}
