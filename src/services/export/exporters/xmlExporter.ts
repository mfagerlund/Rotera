// XML format exporter

import type { Project } from '../../../entities/project'
import type { ExportOptions, ExportResult } from '../types'
import { escapeXML, createDownloadURL } from '../utils'
import { getFormattedWorldPoints } from './shared'

export function exportXML(project: Project, options: ExportOptions): ExportResult {
  const worldPoints = getFormattedWorldPoints(project, options)

  let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<pictorigo-export>
  <project>
    <name>${escapeXML(project.name)}</name>
  </project>
  <world-points>
`

  Object.values(worldPoints).forEach(wp => {
    xmlContent += `    <point>
      <id>${escapeXML(wp.id)}</id>
      <name>${escapeXML(wp.name)}</name>
      ${wp.xyz ? `<coordinates>
        <x>${wp.xyz[0].toFixed(options.precision)}</x>
        <y>${wp.xyz[1].toFixed(options.precision)}</y>
        <z>${wp.xyz[2].toFixed(options.precision)}</z>
      </coordinates>` : ''}
      <color>${escapeXML(wp.color || '')}</color>
      <group>${escapeXML(wp.group || '')}</group>
      <is-locked>${wp.isLocked}</is-locked>
      <image-count>${wp.imagePoints.length}</image-count>
    </point>
`
  })

  xmlContent += `  </world-points>`

  if (options.includeConstraints && project.constraints) {
    xmlContent += `
  <constraints>
`
    project.constraints.forEach(constraint => {
      const c = constraint as any
      xmlContent += `    <constraint>
      <id>${escapeXML(c.id || '')}</id>
      <type>${escapeXML(c.type || '')}</type>
      <value>${c.parameters?.value || c.parameters?.distance || ''}</value>
    </constraint>
`
    })
    xmlContent += `  </constraints>`
  }

  xmlContent += `
</pictorigo-export>`

  const filename = `${project.name}_export.xml`

  return {
    success: true,
    message: 'XML export completed',
    filename,
    data: xmlContent,
    url: createDownloadURL(xmlContent, 'application/xml')
  }
}
