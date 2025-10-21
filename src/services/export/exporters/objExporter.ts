// OBJ format exporter

import type { Project } from '../../../entities/project'
import type { ExportOptions, ExportResult } from '../types'
import { createDownloadURL } from '../utils'
import { getFormattedWorldPoints } from './shared'

export function exportOBJ(project: Project, options: ExportOptions): ExportResult {
  const worldPoints = getFormattedWorldPoints(project, options)
  const points = Object.values(worldPoints).filter(wp =>
    wp.xyz && wp.xyz[0] !== null && wp.xyz[1] !== null && wp.xyz[2] !== null
  )

  let objContent = `# Exported from Pictorigo
# Project: ${project.name}
# Points: ${points.length}

`

  // Export vertices
  points.forEach(wp => {
    const [x, y, z] = wp.xyz as [number, number, number]
    objContent += `v ${x.toFixed(options.precision)} ${y.toFixed(options.precision)} ${z.toFixed(options.precision)}\n`
  })

  // Add point names as comments
  objContent += '\n# Point names:\n'
  points.forEach((wp, index) => {
    objContent += `# ${index + 1}: ${wp.name}\n`
  })

  const filename = `${project.name}_points.obj`

  return {
    success: true,
    message: 'OBJ export completed',
    filename,
    data: objContent,
    url: createDownloadURL(objContent, 'application/octet-stream')
  }
}
