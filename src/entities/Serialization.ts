import { Project } from './project/Project'
import { WorldPoint } from './world-point/WorldPoint'
import { Line } from './line/Line'
import { Viewpoint } from './viewpoint/Viewpoint'
import { ImagePoint } from './imagePoint/ImagePoint'
import { Constraint } from './constraints'
import { SerializationContext } from './serialization/SerializationContext'
import type { ProjectDto } from './project/ProjectDto'
import type { IImagePoint } from './interfaces'

export class Serialization {

  static serialize(project: Project): string {
    const context = new SerializationContext()

    const dto: ProjectDto = {
      name: project.name,
      worldPoints: Array.from(project.worldPoints).map(wp => wp.serialize(context)),
      viewpoints: Array.from(project.viewpoints).map(vp => vp.serialize(context)),
      lines: Array.from(project.lines).map(line => line.serialize(context)),
      imagePoints: Array.from(project.imagePoints).map(ip => (ip as ImagePoint).serialize(context)),
      constraints: Array.from(project.constraints).map(c => c.serialize(context)),

      showPointNames: project.showPointNames,
      autoSave: project.autoSave,
      theme: project.theme,
      measurementUnits: project.measurementUnits,
      precisionDigits: project.precisionDigits,
      showConstraintGlyphs: project.showConstraintGlyphs,
      showMeasurements: project.showMeasurements,
      autoOptimize: project.autoOptimize,
      gridVisible: project.gridVisible,
      snapToGrid: project.snapToGrid,
      defaultWorkspace: project.defaultWorkspace,
      showConstructionGeometry: project.showConstructionGeometry,
      enableSmartSnapping: project.enableSmartSnapping,
      constraintPreview: project.constraintPreview,
      visualFeedbackLevel: project.visualFeedbackLevel,
      imageSortOrder: project.imageSortOrder
    }

    return JSON.stringify(dto, null, 2)
  }

  static deserialize(json: string): Project {
    const dto = JSON.parse(json) as ProjectDto
    const context = new SerializationContext()

    const worldPoints = new Set(
      dto.worldPoints.map(wpDto => WorldPoint.deserialize(wpDto, context))
    )

    const viewpoints = new Set(
      dto.viewpoints.map(vpDto => Viewpoint.deserialize(vpDto, context))
    )

    const lines = new Set(
      dto.lines.map(lineDto => Line.deserialize(lineDto, context))
    )

    const imagePoints = new Set<IImagePoint>(
      dto.imagePoints.map(ipDto => ImagePoint.deserialize(ipDto, context))
    )

    const constraints = new Set(
      dto.constraints.map(cDto => Constraint.deserialize(cDto, context))
    )

    return Project.createFull(
      dto.name,
      worldPoints,
      lines,
      viewpoints,
      imagePoints,
      constraints,
      dto.showPointNames,
      dto.autoSave,
      dto.theme,
      dto.measurementUnits,
      dto.precisionDigits,
      dto.showConstraintGlyphs,
      dto.showMeasurements,
      dto.autoOptimize,
      dto.gridVisible,
      dto.snapToGrid,
      dto.defaultWorkspace,
      dto.showConstructionGeometry,
      dto.enableSmartSnapping,
      dto.constraintPreview,
      dto.visualFeedbackLevel,
      dto.imageSortOrder
    )
  }

  static saveToLocalStorage(project: Project, key: string = 'pictorigo-project'): void {
    const json = this.serialize(project)
    localStorage.setItem(key, json)
    localStorage.setItem(`${key}-timestamp`, new Date().toISOString())
  }

  static loadFromLocalStorage(key: string = 'pictorigo-project'): Project | null {
    const json = localStorage.getItem(key)
    if (!json) return null

    try {
      return this.deserialize(json)
    } catch (e) {
      console.error('Failed to load project from localStorage:', e)
      return null
    }
  }
}
