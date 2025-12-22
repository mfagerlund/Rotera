import { Project } from './project/Project'
import { WorldPoint } from './world-point/WorldPoint'
import { Line } from './line/Line'
import { ImagePoint } from './imagePoint/ImagePoint'
import { Viewpoint } from './viewpoint/Viewpoint'
import { deserializeConstraint } from './constraints/constraint-factory'
import { SerializationContext, SerializationOptions } from './serialization/SerializationContext'
import type { ProjectDto } from './project/ProjectDto'
import { CURRENT_FORMAT_VERSION } from './project/ProjectDto'
import type { VanishingLineDto } from './vanishing-line/VanishingLineDto'
import { VanishingLine } from './vanishing-line/VanishingLine'
import { DEFAULT_VIEW_SETTINGS } from '../types/visibility'
import { migrateProject } from './migrations/migrate'

export class Serialization {

  static serialize(project: Project, options: SerializationOptions = {}): string {
    const context = new SerializationContext(options)

    const allVanishingLines: VanishingLine[] = []
    for (const vp of project.viewpoints) {
      allVanishingLines.push(...Array.from(vp.vanishingLines))
    }

    const dto: ProjectDto = {
      formatVersion: CURRENT_FORMAT_VERSION,
      name: project.name,
      worldPoints: Array.from(project.worldPoints).map(wp => wp.serialize(context)),
      viewpoints: Array.from(project.viewpoints).map(vp => vp.serialize(context)),
      lines: Array.from(project.lines).map(line => line.serialize(context)),
      imagePoints: Array.from(project.imagePoints).map(ip => (ip as ImagePoint).serialize(context)),
      constraints: Array.from(project.constraints).map(c => c.serialize(context)),
      vanishingLines: allVanishingLines.length > 0 ? allVanishingLines.map(vl => vl.serialize(context)) : undefined,

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
      viewSettings: project.viewSettings,
      imageSortOrder: project.imageSortOrder,
      optimizationMaxIterations: project.optimizationMaxIterations
    }

    return JSON.stringify(dto, null, 2)
  }

  static deserialize(json: string): Project {
    let dto = JSON.parse(json) as ProjectDto

    // Migrate from older format versions if needed
    dto = migrateProject(dto)

    const context = new SerializationContext()

    const worldPoints = new Set(
      (dto.worldPoints || []).map(wpDto => WorldPoint.deserialize(wpDto, context))
    )

    const viewpointsArray = (dto.viewpoints || []).map(vpDto => Viewpoint.deserialize(vpDto, context))
    const viewpoints = new Set(viewpointsArray)

    ;(dto.vanishingLines || []).forEach((vlDto: VanishingLineDto) => {
      VanishingLine.deserialize(vlDto, context)
    })

    const lines = new Set(
      (dto.lines || []).map(lineDto => Line.deserialize(lineDto, context))
    )

    const imagePoints = new Set<ImagePoint>(
      (dto.imagePoints || []).map(ipDto => ImagePoint.deserialize(ipDto, context))
    )

    const constraints = new Set(
      (dto.constraints || []).map(cDto => deserializeConstraint(cDto, context))
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
      dto.viewSettings || DEFAULT_VIEW_SETTINGS,
      dto.imageSortOrder,
      dto.optimizationMaxIterations
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
