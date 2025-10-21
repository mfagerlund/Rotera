// PLY format exporter

import type { Project } from '../../../entities/project'
import type { ExportOptions, ExportResult } from '../types'
import { hexToRgb, createDownloadURL } from '../utils'
import { getFormattedWorldPoints } from './shared'

export function exportPLY(project: Project, options: ExportOptions): ExportResult {
  const worldPoints = getFormattedWorldPoints(project, options)
  const points = Object.values(worldPoints).filter(wp =>
    wp.xyz && wp.xyz[0] !== null && wp.xyz[1] !== null && wp.xyz[2] !== null
  )

  let plyContent = `ply
format ascii 1.0
comment Exported from Pictorigo
element vertex ${points.length}
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
end_header
`

  points.forEach(wp => {
    const [x, y, z] = wp.xyz as [number, number, number]
    const color = hexToRgb(wp.color || '#ffffff')
    plyContent += `${x.toFixed(options.precision)} ${y.toFixed(options.precision)} ${z.toFixed(options.precision)} ${color[0]} ${color[1]} ${color[2]}\n`
  })

  const filename = `${project.name}_pointcloud.ply`

  return {
    success: true,
    message: 'PLY export completed',
    filename,
    data: plyContent,
    url: createDownloadURL(plyContent, 'application/octet-stream')
  }
}
