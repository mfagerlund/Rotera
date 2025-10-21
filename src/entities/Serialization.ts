import { Project } from './project/Project'
import { WorldPoint } from './world-point/WorldPoint'
import { Line } from './line/Line'
import { Viewpoint } from './viewpoint/Viewpoint'
import { ImagePoint } from './imagePoint/ImagePoint'
import type { IImagePoint } from './interfaces'
import { Constraint } from './constraints'

// ============================================================================
// DTOs - PRIVATE, NEVER EXPORTED
// ============================================================================

interface WorldPointDto {
  id: string
  name: string
  lockedXyz: [number | null, number | null, number | null]
  optimizedXyz?: [number, number, number]
  color: string
  isVisible: boolean
  isOrigin: boolean
}

interface LineDto {
  id: string
  name: string
  pointAId: string
  pointBId: string
  color: string
  isVisible: boolean
  isConstruction: boolean
  lineStyle: 'solid' | 'dashed' | 'dotted'
  thickness: number
  direction: 'free' | 'horizontal' | 'vertical' | 'x-aligned' | 'z-aligned'
  targetLength?: number
  tolerance?: number
}

interface ImagePointDto {
  id: string
  worldPointId: string
  viewpointId: string
  u: number
  v: number
  isVisible: boolean
  confidence: number
}

interface ViewpointDto {
  id: string
  name: string
  filename: string
  url: string
  imageWidth: number
  imageHeight: number
  focalLength: number
  principalPointX: number
  principalPointY: number
  skewCoefficient: number
  aspectRatio: number
  radialDistortion: [number, number, number]
  tangentialDistortion: [number, number]
  position: [number, number, number]
  rotation: [number, number, number, number]
  calibrationAccuracy: number
  calibrationDate?: string
  calibrationNotes?: string
  isProcessed: boolean
  processingNotes?: string
  metadata?: any
  isVisible: boolean
  opacity: number
  color: string
}

interface DistanceConstraintDto {
  id: string
  name: string
  type: 'distance_point_point'
  pointAId: string
  pointBId: string
  targetDistance: number
  tolerance?: number
  priority?: number
  isEnabled?: boolean
  isDriving?: boolean
  group?: string
  tags?: string[]
  notes?: string
}

interface ConstraintDto {
  id: string
  type: string
  [key: string]: any
}

interface ProjectDto {
  name: string
  worldPoints: WorldPointDto[]
  lines: LineDto[]
  viewpoints: ViewpointDto[]
  imagePoints: ImagePointDto[]
  constraints: ConstraintDto[]
  showPointNames: boolean
  autoSave: boolean
  theme: 'dark' | 'light'
  measurementUnits: 'meters' | 'feet' | 'inches'
  precisionDigits: number
  showConstraintGlyphs: boolean
  showMeasurements: boolean
  autoOptimize: boolean
  gridVisible: boolean
  snapToGrid: boolean
  defaultWorkspace: 'image' | 'world'
  showConstructionGeometry: boolean
  enableSmartSnapping: boolean
  constraintPreview: boolean
  visualFeedbackLevel: 'minimal' | 'standard' | 'detailed'
  imageSortOrder?: 'name' | 'date'
}

// ============================================================================
// Serialization Class
// ============================================================================

export class Serialization {

  static serialize(project: Project): string {
    const dto = this.projectToDto(project)
    return JSON.stringify(dto, null, 2)
  }

  static deserialize(json: string): Project {
    const dto = JSON.parse(json) as ProjectDto
    return this.dtoToProject(dto)
  }

  private static projectToDto(project: Project): ProjectDto {
    const worldPointIds = new Map<WorldPoint, string>()
    const viewpointIds = new Map<Viewpoint, string>()
    const imagePointIds = new Map<IImagePoint, string>()

    let idCounter = 0
    const generateId = () => `temp_${idCounter++}`

    project.worldPoints.forEach(point => {
      worldPointIds.set(point, generateId())
    })

    project.viewpoints.forEach(viewpoint => {
      viewpointIds.set(viewpoint, generateId())
    })

    project.imagePoints.forEach(imagePoint => {
      imagePointIds.set(imagePoint, generateId())
    })

    const worldPoints: WorldPointDto[] = []
    project.worldPoints.forEach(point => {
      worldPoints.push(this.worldPointToDto(point, worldPointIds))
    })

    const lines: LineDto[] = []
    project.lines.forEach(line => {
      lines.push(this.lineToDto(line, worldPointIds))
    })

    const viewpoints: ViewpointDto[] = []
    project.viewpoints.forEach(viewpoint => {
      viewpoints.push(this.viewpointToDto(viewpoint, viewpointIds))
    })

    const imagePoints: ImagePointDto[] = []
    project.imagePoints.forEach(imagePoint => {
      imagePoints.push(this.imagePointToDto(imagePoint, worldPointIds, viewpointIds, imagePointIds))
    })

    const constraints: ConstraintDto[] = []

    return {
      name: project.name,
      worldPoints,
      lines,
      viewpoints,
      imagePoints,
      constraints,
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
  }

  private static dtoToProject(dto: ProjectDto): Project {
    const idToWorldPoint = new Map<string, WorldPoint>()
    dto.worldPoints.forEach(pointDto => {
      const point = this.dtoToWorldPoint(pointDto)
      idToWorldPoint.set(pointDto.id, point)
    })

    const idToViewpoint = new Map<string, Viewpoint>()
    dto.viewpoints.forEach(viewpointDto => {
      const viewpoint = this.dtoToViewpoint(viewpointDto)
      idToViewpoint.set(viewpointDto.id, viewpoint)
    })

    const lines = new Set<Line>()
    dto.lines.forEach(lineDto => {
      const pointA = idToWorldPoint.get(lineDto.pointAId)
      const pointB = idToWorldPoint.get(lineDto.pointBId)
      if (pointA && pointB) {
        lines.add(this.dtoToLine(lineDto, pointA, pointB))
      }
    })

    const imagePoints = new Set<IImagePoint>()
    dto.imagePoints.forEach(imagePointDto => {
      const worldPoint = idToWorldPoint.get(imagePointDto.worldPointId)
      const viewpoint = idToViewpoint.get(imagePointDto.viewpointId)
      if (worldPoint && viewpoint) {
        const imagePoint = this.dtoToImagePoint(imagePointDto, worldPoint, viewpoint)
        imagePoints.add(imagePoint)
        worldPoint.addImagePoint(imagePoint)
        viewpoint.addImagePoint(imagePoint)
      }
    })

    const constraints = new Set<Constraint>()
    dto.constraints.forEach(constraintDto => {
      const constraint = this.dtoToConstraint(constraintDto, idToWorldPoint, lines)
      if (constraint) {
        constraints.add(constraint)
      }
    })

    return Project.createFull(
      dto.name,
      new Set(idToWorldPoint.values()),
      lines,
      new Set(idToViewpoint.values()),
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

  private static worldPointToDto(point: WorldPoint, idMap: Map<WorldPoint, string>): WorldPointDto {
    return {
      id: idMap.get(point)!,
      name: point.name,
      lockedXyz: point.lockedXyz,
      optimizedXyz: point.optimizedXyz,
      color: point.color,
      isVisible: point.isVisible,
      isOrigin: point.isOrigin
    }
  }

  private static dtoToWorldPoint(dto: WorldPointDto): WorldPoint {
    return WorldPoint.createFromSerialized(
      dto.name,
      dto.lockedXyz,
      dto.color,
      dto.isVisible,
      dto.isOrigin,
      dto.optimizedXyz
    )
  }

  private static lineToDto(line: Line, worldPointIds: Map<WorldPoint, string>): LineDto {
    return {
      id: `line_${line.name}`,
      name: line.name,
      pointAId: worldPointIds.get(line.pointA)!,
      pointBId: worldPointIds.get(line.pointB)!,
      color: line.color,
      isVisible: line.isVisible,
      isConstruction: line.isConstruction,
      lineStyle: line.lineStyle,
      thickness: line.thickness,
      direction: line.direction,
      targetLength: line.targetLength,
      tolerance: line.tolerance
    }
  }

  private static dtoToLine(dto: LineDto, pointA: WorldPoint, pointB: WorldPoint): Line {
    return Line.create(
      dto.name,
      pointA,
      pointB,
      {
        color: dto.color,
        isVisible: dto.isVisible,
        isConstruction: dto.isConstruction,
        lineStyle: dto.lineStyle,
        thickness: dto.thickness,
        direction: dto.direction,
        targetLength: dto.targetLength,
        tolerance: dto.tolerance
      }
    )
  }

  private static viewpointToDto(viewpoint: Viewpoint, idMap: Map<Viewpoint, string>): ViewpointDto {
    return {
      id: idMap.get(viewpoint)!,
      name: viewpoint.name,
      filename: viewpoint.filename,
      url: viewpoint.url,
      imageWidth: viewpoint.imageWidth,
      imageHeight: viewpoint.imageHeight,
      focalLength: viewpoint.focalLength,
      principalPointX: viewpoint.principalPointX,
      principalPointY: viewpoint.principalPointY,
      skewCoefficient: viewpoint.skewCoefficient,
      aspectRatio: viewpoint.aspectRatio,
      radialDistortion: [...viewpoint.radialDistortion],
      tangentialDistortion: [...viewpoint.tangentialDistortion],
      position: [...viewpoint.position],
      rotation: [...viewpoint.rotation],
      calibrationAccuracy: viewpoint.calibrationAccuracy,
      calibrationDate: viewpoint.calibrationDate,
      calibrationNotes: viewpoint.calibrationNotes,
      isProcessed: viewpoint.isProcessed,
      processingNotes: viewpoint.processingNotes,
      metadata: viewpoint.metadata ? { ...viewpoint.metadata } : undefined,
      isVisible: viewpoint.isVisible,
      opacity: viewpoint.opacity,
      color: viewpoint.color
    }
  }

  private static dtoToViewpoint(dto: ViewpointDto): Viewpoint {
    return Viewpoint.createFromSerialized(
      dto.name,
      dto.filename,
      dto.url,
      dto.imageWidth,
      dto.imageHeight,
      dto.focalLength,
      dto.principalPointX,
      dto.principalPointY,
      dto.skewCoefficient,
      dto.aspectRatio,
      dto.radialDistortion,
      dto.tangentialDistortion,
      dto.position,
      dto.rotation,
      dto.calibrationAccuracy,
      dto.calibrationDate,
      dto.calibrationNotes,
      dto.isProcessed,
      dto.processingNotes,
      dto.metadata,
      dto.isVisible,
      dto.opacity,
      dto.color
    )
  }

  private static imagePointToDto(
    imagePoint: IImagePoint,
    worldPointIds: Map<WorldPoint, string>,
    viewpointIds: Map<Viewpoint, string>,
    imagePointIds: Map<IImagePoint, string>
  ): ImagePointDto {
    return {
      id: imagePointIds.get(imagePoint)!,
      worldPointId: worldPointIds.get(imagePoint.worldPoint as WorldPoint)!,
      viewpointId: viewpointIds.get(imagePoint.viewpoint as Viewpoint)!,
      u: imagePoint.u,
      v: imagePoint.v,
      isVisible: imagePoint.isVisible,
      confidence: imagePoint.confidence
    }
  }

  private static dtoToImagePoint(dto: ImagePointDto, worldPoint: WorldPoint, viewpoint: Viewpoint): ImagePoint {
    return ImagePoint.create(
      worldPoint,
      viewpoint,
      dto.u,
      dto.v,
      {
        isVisible: dto.isVisible,
        confidence: dto.confidence
      }
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

  // ============================================================================
  // Constraint serialization (EXAMPLE: DistanceConstraint)
  // ============================================================================

  private static dtoToConstraint(
    dto: ConstraintDto,
    idToWorldPoint: Map<string, WorldPoint>,
    lines: Set<Line>
  ): Constraint | null {
    if (dto.type === 'distance_point_point') {
      return this.dtoToDistanceConstraint(dto as any, idToWorldPoint)
    }
    // TODO: Add other constraint types (angle, collinear, etc.)
    console.warn(`Unknown constraint type: ${dto.type}`)
    return null
  }

  private static dtoToDistanceConstraint(
    dto: DistanceConstraintDto,
    idToWorldPoint: Map<string, WorldPoint>
  ): Constraint | null {
    const pointA = idToWorldPoint.get(dto.pointAId)
    const pointB = idToWorldPoint.get(dto.pointBId)

    if (!pointA || !pointB) {
      console.warn(`DistanceConstraint ${dto.id}: Could not resolve points ${dto.pointAId}, ${dto.pointBId}`)
      return null
    }

    // TODO: DistanceConstraint.create() requires ConstraintRepository
    // Need architectural decision on how to handle this
    // For now, constraints are not serialized
    return null
  }
}
