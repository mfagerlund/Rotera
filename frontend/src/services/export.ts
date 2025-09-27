// Export functionality for various file formats

import { Project, WorldPoint, Constraint, Camera } from '../types/project'

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

export class ExportService {
  private project: Project

  constructor(project: Project) {
    this.project = project
  }

  async export(options: ExportOptions): Promise<ExportResult> {
    try {
      switch (options.format) {
        case 'json':
          return this.exportJSON(options)
        case 'csv':
          return this.exportCSV(options)
        case 'xlsx':
          return this.exportExcel(options)
        case 'ply':
          return this.exportPLY(options)
        case 'obj':
          return this.exportOBJ(options)
        case 'dxf':
          return this.exportDXF(options)
        case 'pdf':
          return this.exportPDF(options)
        case 'xml':
          return this.exportXML(options)
        default:
          throw new Error(`Unsupported export format: ${options.format}`)
      }
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Export failed',
        filename: ''
      }
    }
  }

  private exportJSON(options: ExportOptions): ExportResult {
    const exportData: any = {
      project: {
        name: this.project.name,
        description: this.project.description,
        createdAt: this.project.createdAt,
        updatedAt: this.project.updatedAt
      },
      worldPoints: this.getFormattedWorldPoints(options),
      coordinateSystem: options.coordinateSystem === 'world' ? this.project.coordinateSystem : null
    }

    if (options.includeConstraints) {
      exportData.constraints = this.project.constraints
    }

    if (options.includeImages) {
      exportData.images = this.project.images
      exportData.cameras = this.project.cameras
    }

    if (options.includeMetadata) {
      exportData.metadata = {
        exportedAt: new Date().toISOString(),
        exportOptions: options,
        statistics: this.getProjectStatistics()
      }
    }

    const jsonString = JSON.stringify(exportData, null, 2)
    const filename = `${this.project.name}_export.json`

    return {
      success: true,
      message: 'JSON export completed',
      filename,
      data: jsonString,
      url: this.createDownloadURL(jsonString, 'application/json')
    }
  }

  private exportCSV(options: ExportOptions): ExportResult {
    const worldPoints = this.getFormattedWorldPoints(options)
    const headers = ['Name', 'ID', 'X', 'Y', 'Z', 'Color', 'Group', 'IsOrigin', 'IsLocked', 'ImageCount']

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
        wp.isOrigin ? 'true' : 'false',
        wp.isLocked ? 'true' : 'false',
        wp.imagePoints.length.toString()
      ]

      if (options.includeConstraints) {
        const constraintsForPoint = this.getConstraintsForPoint(wp.id)
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

    const filename = `${this.project.name}_points.csv`

    return {
      success: true,
      message: 'CSV export completed',
      filename,
      data: csvContent,
      url: this.createDownloadURL(csvContent, 'text/csv')
    }
  }

  private exportExcel(options: ExportOptions): ExportResult {
    // Simplified Excel export (would need a library like xlsx for full implementation)
    const csvResult = this.exportCSV(options)

    return {
      ...csvResult,
      filename: csvResult.filename.replace('.csv', '.xlsx'),
      message: 'Excel export completed (CSV format)'
    }
  }

  private exportPLY(options: ExportOptions): ExportResult {
    const worldPoints = this.getFormattedWorldPoints(options)
    const points = Object.values(worldPoints).filter(wp => wp.xyz)

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
      const [x, y, z] = wp.xyz!
      const color = this.hexToRgb(wp.color || '#ffffff')
      plyContent += `${x.toFixed(options.precision)} ${y.toFixed(options.precision)} ${z.toFixed(options.precision)} ${color[0]} ${color[1]} ${color[2]}\n`
    })

    const filename = `${this.project.name}_pointcloud.ply`

    return {
      success: true,
      message: 'PLY export completed',
      filename,
      data: plyContent,
      url: this.createDownloadURL(plyContent, 'application/octet-stream')
    }
  }

  private exportOBJ(options: ExportOptions): ExportResult {
    const worldPoints = this.getFormattedWorldPoints(options)
    const points = Object.values(worldPoints).filter(wp => wp.xyz)

    let objContent = `# Exported from Pictorigo
# Project: ${this.project.name}
# Points: ${points.length}

`

    // Export vertices
    points.forEach(wp => {
      const [x, y, z] = wp.xyz!
      objContent += `v ${x.toFixed(options.precision)} ${y.toFixed(options.precision)} ${z.toFixed(options.precision)}\n`
    })

    // Add point names as comments
    objContent += '\n# Point names:\n'
    points.forEach((wp, index) => {
      objContent += `# ${index + 1}: ${wp.name}\n`
    })

    const filename = `${this.project.name}_points.obj`

    return {
      success: true,
      message: 'OBJ export completed',
      filename,
      data: objContent,
      url: this.createDownloadURL(objContent, 'application/octet-stream')
    }
  }

  private exportDXF(options: ExportOptions): ExportResult {
    const worldPoints = this.getFormattedWorldPoints(options)
    const points = Object.values(worldPoints).filter(wp => wp.xyz)

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
      const [x, y, z] = wp.xyz!
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

    const filename = `${this.project.name}_points.dxf`

    return {
      success: true,
      message: 'DXF export completed',
      filename,
      data: dxfContent,
      url: this.createDownloadURL(dxfContent, 'application/octet-stream')
    }
  }

  private exportPDF(options: ExportOptions): ExportResult {
    // Simplified PDF export (would need a library like jsPDF for full implementation)
    const reportContent = this.generateReport(options)
    const filename = `${this.project.name}_report.pdf`

    return {
      success: true,
      message: 'PDF export completed (text format)',
      filename: filename.replace('.pdf', '.txt'),
      data: reportContent,
      url: this.createDownloadURL(reportContent, 'text/plain')
    }
  }

  private exportXML(options: ExportOptions): ExportResult {
    const worldPoints = this.getFormattedWorldPoints(options)

    let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<pictorigo-export>
  <project>
    <name>${this.escapeXML(this.project.name)}</name>
    <description>${this.escapeXML(this.project.description || '')}</description>
    <created-at>${this.project.createdAt}</created-at>
    <updated-at>${this.project.updatedAt}</updated-at>
  </project>
  <world-points>
`

    Object.values(worldPoints).forEach(wp => {
      xmlContent += `    <point>
      <id>${this.escapeXML(wp.id)}</id>
      <name>${this.escapeXML(wp.name)}</name>
      ${wp.xyz ? `<coordinates>
        <x>${wp.xyz[0].toFixed(options.precision)}</x>
        <y>${wp.xyz[1].toFixed(options.precision)}</y>
        <z>${wp.xyz[2].toFixed(options.precision)}</z>
      </coordinates>` : ''}
      <color>${this.escapeXML(wp.color || '')}</color>
      <group>${this.escapeXML(wp.group || '')}</group>
      <is-origin>${wp.isOrigin}</is-origin>
      <is-locked>${wp.isLocked}</is-locked>
      <image-count>${wp.imagePoints.length}</image-count>
    </point>
`
    })

    xmlContent += `  </world-points>`

    if (options.includeConstraints && this.project.constraints) {
      xmlContent += `
  <constraints>
`
      this.project.constraints.forEach(constraint => {
        xmlContent += `    <constraint>
      <id>${this.escapeXML(constraint.id)}</id>
      <type>${this.escapeXML(constraint.type)}</type>
      <value>${constraint.value || ''}</value>
    </constraint>
`
      })
      xmlContent += `  </constraints>`
    }

    xmlContent += `
</pictorigo-export>`

    const filename = `${this.project.name}_export.xml`

    return {
      success: true,
      message: 'XML export completed',
      filename,
      data: xmlContent,
      url: this.createDownloadURL(xmlContent, 'application/xml')
    }
  }

  private getFormattedWorldPoints(options: ExportOptions): Record<string, WorldPoint> {
    const worldPoints = { ...this.project.worldPoints }

    // Apply coordinate system transformation if needed
    if (options.coordinateSystem === 'world' && this.project.coordinateSystem?.origin) {
      const origin = worldPoints[this.project.coordinateSystem.origin]
      if (origin?.xyz) {
        Object.values(worldPoints).forEach(wp => {
          if (wp.xyz && wp.id !== this.project.coordinateSystem!.origin) {
            wp.xyz = [
              wp.xyz[0] - origin.xyz![0],
              wp.xyz[1] - origin.xyz![1],
              wp.xyz[2] - origin.xyz![2]
            ]
          }
        })
      }
    }

    return worldPoints
  }

  private getConstraintsForPoint(pointId: string): Constraint[] {
    if (!this.project.constraints) return []

    return this.project.constraints.filter(constraint => {
      const pointIds = this.getConstraintPointIds(constraint)
      return pointIds.includes(pointId)
    })
  }

  private getConstraintPointIds(constraint: Constraint): string[] {
    switch (constraint.type) {
      case 'distance':
        return [constraint.pointA, constraint.pointB]
      case 'angle':
        return [constraint.vertex, constraint.line1_end, constraint.line2_end]
      case 'perpendicular':
      case 'parallel':
        return [constraint.line1_wp_a, constraint.line1_wp_b, constraint.line2_wp_a, constraint.line2_wp_b]
      case 'collinear':
        return constraint.wp_ids || []
      case 'rectangle':
        return [constraint.cornerA, constraint.cornerB, constraint.cornerC, constraint.cornerD]
      case 'circle':
        return constraint.point_ids || []
      case 'fixed':
        return [constraint.point_id]
      case 'horizontal':
      case 'vertical':
        return [constraint.pointA, constraint.pointB]
      default:
        return []
    }
  }

  private getProjectStatistics() {
    const worldPointCount = Object.keys(this.project.worldPoints).length
    const constraintCount = this.project.constraints?.length || 0
    const imageCount = Object.keys(this.project.images || {}).length
    const pointsWithXYZ = Object.values(this.project.worldPoints).filter(wp => wp.xyz).length

    return {
      worldPointCount,
      constraintCount,
      imageCount,
      pointsWithXYZ,
      lockedPoints: Object.values(this.project.worldPoints).filter(wp => wp.isLocked).length,
      originPoints: Object.values(this.project.worldPoints).filter(wp => wp.isOrigin).length
    }
  }

  private generateReport(options: ExportOptions): string {
    const stats = this.getProjectStatistics()

    return `Pictorigo Project Report
========================

Project: ${this.project.name}
Description: ${this.project.description || 'No description'}
Created: ${new Date(this.project.createdAt).toLocaleString()}
Updated: ${new Date(this.project.updatedAt).toLocaleString()}

Statistics:
- World Points: ${stats.worldPointCount}
- Points with 3D coordinates: ${stats.pointsWithXYZ}
- Locked Points: ${stats.lockedPoints}
- Origin Points: ${stats.originPoints}
- Constraints: ${stats.constraintCount}
- Images: ${stats.imageCount}

Export Settings:
- Format: ${options.format}
- Coordinate System: ${options.coordinateSystem}
- Precision: ${options.precision} decimal places
- Units: ${options.units}
- Include Images: ${options.includeImages}
- Include Constraints: ${options.includeConstraints}
- Include Metadata: ${options.includeMetadata}

Generated on: ${new Date().toLocaleString()}
`
  }

  private hexToRgb(hex: string): [number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : [255, 255, 255]
  }

  private escapeXML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  private createDownloadURL(content: string, mimeType: string): string {
    const blob = new Blob([content], { type: mimeType })
    return URL.createObjectURL(blob)
  }
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

// Helper function to download file
export const downloadFile = (url: string, filename: string) => {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default ExportService