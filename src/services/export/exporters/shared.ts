// Shared utilities for exporters

import type { Project } from '../../../entities/project'
import type { WorldPoint } from '../../../entities/world-point'
import type { ExportOptions, ExportWorldPoint } from '../types'

export function getFormattedWorldPoints(project: Project, options: ExportOptions): Record<string, ExportWorldPoint> {
  const worldPoints: Record<string, ExportWorldPoint> = {}
  for (const wp of project.worldPoints) {
    const coords = wp.optimizedXyz
    worldPoints[wp.getName()] = {
      id: wp.getName(),
      name: wp.getName(),
      xyz: coords || null,
      color: wp.color,
      isLocked: wp.isLocked(),
      imagePoints: [] // Legacy field - image point data now in Viewpoints
    }
  }

  // Apply coordinate system transformation if needed
  const coordinateSystem = (project as any).coordinateSystem
  if (options.coordinateSystem === 'world' && coordinateSystem?.origin) {
    const origin = worldPoints[coordinateSystem.origin]
    const originXyz = origin?.xyz
    if (originXyz) {
      Object.values(worldPoints).forEach(wp => {
        const wpXyz = wp.xyz
        if (wpXyz && wp.id !== coordinateSystem!.origin) {
          wp.xyz = [
            wpXyz[0] - originXyz[0],
            wpXyz[1] - originXyz[1],
            wpXyz[2] - originXyz[2]
          ]
        }
      })
    }
  }

  return worldPoints
}

export function getConstraintsForPoint(project: Project, point: WorldPoint): any[] {
  if (!project.constraints) return []

  return Array.from(project.constraints).filter((constraint: any) => {
    const points = getConstraintPoints(constraint)
    return points.includes(point)
  }) as any[]
}

export function getConstraintPoints(constraint: any): WorldPoint[] {
  // Use the entities structure to get actual point objects
  // Note: constraints may have different entity structures depending on type
  // This is a best-effort approach for the export service
  const points: WorldPoint[] = []
  if (constraint.entities?.points) {
    points.push(...constraint.entities.points)
  }
  return points
}

export function getProjectStatistics(project: Project) {
  const worldPointCount = project.worldPoints.size
  const constraintCount = project.constraints?.size || 0
  const imageCount = (project as any).images ? Object.keys((project as any).images).length : project.viewpoints.size
  const pointsWithXYZ = Array.from(project.worldPoints.values()).filter(wp => (wp as any).xyz).length

  return {
    worldPointCount,
    constraintCount,
    imageCount,
    pointsWithXYZ,
    lockedPoints: Array.from(project.worldPoints.values()).filter(wp => wp.isLocked()).length
  }
}

export function generateReport(project: Project, options: ExportOptions): string {
  const stats = getProjectStatistics(project)
  const description = (project as any).description || 'No description'

  return `Pictorigo Project Report
========================

Project: ${project.name}
Description: ${description}
Statistics:
- World Points: ${stats.worldPointCount}
- Points with 3D coordinates: ${stats.pointsWithXYZ}
- Locked Points: ${stats.lockedPoints}
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
