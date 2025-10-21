// DXF format exporter

import type { Project } from '../../../entities/project'
import type { ExportOptions, ExportResult } from '../types'
import { createDownloadURL } from '../utils'
import { getFormattedWorldPoints } from './shared'

export function exportDXF(project: Project, options: ExportOptions): ExportResult {
  const worldPoints = getFormattedWorldPoints(project, options)
  const points = Object.values(worldPoints).filter(wp =>
    wp.xyz && wp.xyz[0] !== null && wp.xyz[1] !== null && wp.xyz[2] !== null
  )

  let dxfContent = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1014
0
ENDSEC
0
SECTION
2
ENTITIES
`

  // Export points as DXF POINT entities
  points.forEach(wp => {
    const [x, y, z] = wp.xyz as [number, number, number]
    dxfContent += `0
POINT
8
POINTS
10
${x.toFixed(options.precision)}
20
${y.toFixed(options.precision)}
30
${z.toFixed(options.precision)}
`
  })

  dxfContent += `0
ENDSEC
0
EOF
`

  const filename = `${project.name}_points.dxf`

  return {
    success: true,
    message: 'DXF export completed',
    filename,
    data: dxfContent,
    url: createDownloadURL(dxfContent, 'application/octet-stream')
  }
}
