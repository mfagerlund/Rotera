import { Project } from './project/Project'
import { WorldPoint } from './world-point/WorldPoint'
import { Line } from './line/Line'
import { Viewpoint } from './viewpoint/Viewpoint'
import { ImagePoint } from './imagePoint/ImagePoint'
import type { IImagePoint } from './interfaces'
import { Plane } from './plane'
import type { LineId, ViewpointId, PlaneId, PointId, ImagePointId } from '../types/ids'

// ============================================================================
// DTOs - PRIVATE, NEVER EXPORTED
// ============================================================================

interface WorldPointDto {
  id: string
  name: string
  xyz?: [number | null, number | null, number | null]
  xyzProvenance?: {
    source: 'manual' | 'imported' | 'optimized'
    timestamp: Date
    metadata?: any
  }
  color: string
  isVisible: boolean
  isOrigin: boolean
  isLocked?: boolean
  lockedAxes?: {
    x?: boolean
    y?: boolean
    z?: boolean
  }
  group?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}

interface LineDto {
  id: string
  name: string
  pointA: string
  pointB: string
  color: string
  isVisible: boolean
  isConstruction: boolean
  lineStyle: 'solid' | 'dashed' | 'dotted'
  thickness: number
  constraints: {
    direction: 'free' | 'horizontal' | 'vertical' | 'x-aligned' | 'z-aligned'
    targetLength?: number
    tolerance?: number
  }
  group?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}

interface ImagePointDto {
  id: string
  worldPointId: string
  viewpointId: string
  u: number
  v: number
  isVisible: boolean
  isManuallyPlaced: boolean
  confidence: number
  createdAt: string
  updatedAt: string
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
  group?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}

interface PlaneDto {
  id: string
  name: string
  pointIds: string[]
  color: string
  isVisible: boolean
  opacity: number
  fillStyle: 'solid' | 'wireframe' | 'transparent'
  group?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}

interface ProjectSettingsDto {
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

interface ProjectDto {
  id: string
  name: string
  worldPoints: Record<string, WorldPointDto>
  lines: Record<string, LineDto>
  viewpoints: Record<string, ViewpointDto>
  imagePoints: Record<string, ImagePointDto>
  planes?: Record<string, PlaneDto>
  constraints: any[]
  settings: ProjectSettingsDto
  createdAt: string
  updatedAt: string
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
    const worldPoints: Record<string, WorldPointDto> = {}
    project.worldPoints.forEach(point => {
      worldPoints[point.id] = this.worldPointToDto(point)
    })

    const lines: Record<string, LineDto> = {}
    project.lines.forEach(line => {
      lines[line.id] = this.lineToDto(line)
    })

    const viewpoints: Record<string, ViewpointDto> = {}
    project.viewpoints.forEach(viewpoint => {
      viewpoints[viewpoint.id] = this.viewpointToDto(viewpoint)
    })

    const imagePoints: Record<string, ImagePointDto> = {}
    project.imagePoints.forEach(imagePoint => {
      imagePoints[imagePoint.id] = this.imagePointToDto(imagePoint)
    })

    return {
      id: project.id,
      name: project.name,
      worldPoints,
      lines,
      viewpoints,
      imagePoints,
      constraints: [],
      settings: {
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
      },
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    }
  }

  private static dtoToProject(dto: ProjectDto): Project {
    const tempPointMap = new Map<string, WorldPoint>()
    Object.entries(dto.worldPoints).forEach(([id, pointDto]) => {
      const point = this.dtoToWorldPoint(pointDto)
      tempPointMap.set(id, point)
    })
    const worldPoints = new Set(tempPointMap.values())

    const linesSet = new Set<Line>()
    Object.entries(dto.lines).forEach(([id, lineDto]) => {
      const pointA = tempPointMap.get(lineDto.pointA)
      const pointB = tempPointMap.get(lineDto.pointB)
      if (pointA && pointB) {
        linesSet.add(this.dtoToLine(lineDto, pointA, pointB))
      }
    })

    const tempViewpointMap = new Map<string, Viewpoint>()
    Object.entries(dto.viewpoints).forEach(([id, viewpointDto]) => {
      const viewpoint = this.dtoToViewpoint(viewpointDto)
      tempViewpointMap.set(id, viewpoint)
    })
    const viewpointsSet = new Set(tempViewpointMap.values())

    const imagePointsSet = new Set<IImagePoint>()
    Object.entries(dto.imagePoints || {}).forEach(([id, imagePointDto]) => {
      const worldPoint = tempPointMap.get(imagePointDto.worldPointId)
      const viewpoint = tempViewpointMap.get(imagePointDto.viewpointId)
      if (worldPoint && viewpoint) {
        const imagePoint = this.dtoToImagePoint(imagePointDto, worldPoint, viewpoint)
        imagePointsSet.add(imagePoint)
        worldPoint.addImagePoint(imagePoint)
        viewpoint.addImagePoint(imagePoint)
      }
    })

    return Project.createFull(
      dto.id,
      dto.name,
      worldPoints,
      linesSet,
      viewpointsSet,
      imagePointsSet,
      dto.settings,
      dto.createdAt,
      dto.updatedAt
    )
  }

  private static worldPointToDto(point: WorldPoint): WorldPointDto {
    return {
      id: point.id,
      name: point.name,
      xyz: point.lockedXyz,
      xyzProvenance: point.isOptimized ? {
        source: 'optimized',
        timestamp: point.optimizedAt || new Date(),
        metadata: {}
      } : undefined,
      color: point.color,
      isVisible: point.isVisible,
      isOrigin: point.isOrigin,
      isLocked: point.isLocked(),
      lockedAxes: point.lockedAxes,
      group: point.group,
      tags: [...point.tags],
      createdAt: point.createdAt,
      updatedAt: point.updatedAt
    }
  }

  private static dtoToWorldPoint(dto: WorldPointDto): WorldPoint {
    const isOptimized = dto.xyzProvenance?.source === 'optimized'
    const optimizedAt = dto.xyzProvenance?.timestamp || null

    return WorldPoint.createFromSerialized(
      dto.id,
      dto.name,
      dto.xyz,
      dto.color,
      dto.isVisible,
      dto.isOrigin,
      dto.lockedAxes || (dto.isLocked ? { x: true, y: true, z: true } : undefined),
      isOptimized,
      optimizedAt,
      dto.group,
      dto.tags || [],
      dto.createdAt,
      dto.updatedAt
    )
  }

  private static lineToDto(line: Line): LineDto {
    return {
      id: line.id,
      name: line.name,
      pointA: line.pointA.id,
      pointB: line.pointB.id,
      color: line.color,
      isVisible: line.isVisible,
      isConstruction: line.isConstruction,
      lineStyle: line.lineStyle,
      thickness: line.thickness,
      constraints: { ...line.constraints },
      group: line.group,
      tags: [...line.tags],
      createdAt: line.createdAt,
      updatedAt: line.updatedAt
    }
  }

  private static dtoToLine(dto: LineDto, pointA: WorldPoint, pointB: WorldPoint): Line {
    return Line.createFromSerialized(
      dto.id,
      dto.name,
      pointA,
      pointB,
      dto.color,
      dto.isVisible,
      dto.isConstruction,
      dto.lineStyle,
      dto.thickness,
      dto.constraints,
      dto.group,
      dto.tags || [],
      dto.createdAt,
      dto.updatedAt
    )
  }

  private static viewpointToDto(viewpoint: Viewpoint): ViewpointDto {
    return {
      id: viewpoint.id,
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
      lockedXyz: [...viewpoint.position],
      rotation: [...viewpoint.rotation],
      calibrationAccuracy: viewpoint.calibrationAccuracy,
      calibrationDate: viewpoint.calibrationDate,
      calibrationNotes: viewpoint.calibrationNotes,
      isProcessed: viewpoint.isProcessed,
      processingNotes: viewpoint.processingNotes,
      metadata: viewpoint.metadata ? { ...viewpoint.metadata } : undefined,
      isVisible: viewpoint.isVisible,
      opacity: viewpoint.opacity,
      color: viewpoint.color,
      group: viewpoint.group,
      tags: viewpoint.tags,
      createdAt: viewpoint.createdAt,
      updatedAt: viewpoint.updatedAt
    }
  }

  private static dtoToViewpoint(dto: ViewpointDto): Viewpoint {
    return Viewpoint.createFromSerialized(
      dto.id,
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
      dto.color,
      dto.group,
      dto.tags,
      dto.createdAt,
      dto.updatedAt
    )
  }

  private static imagePointToDto(imagePoint: ImagePoint): ImagePointDto {
    return {
      id: imagePoint.id,
      worldPointId: imagePoint.worldPoint.id,
      viewpointId: imagePoint.viewpoint.id,
      u: imagePoint.u,
      v: imagePoint.v,
      isVisible: imagePoint.isVisible,
      isManuallyPlaced: imagePoint.isManuallyPlaced,
      confidence: imagePoint.confidence,
      createdAt: imagePoint.createdAt,
      updatedAt: imagePoint.updatedAt
    }
  }

  private static dtoToImagePoint(dto: ImagePointDto, worldPoint: WorldPoint, viewpoint: Viewpoint): ImagePoint {
    return ImagePoint.createFromSerialized(
      dto.id,
      worldPoint,
      viewpoint,
      dto.u,
      dto.v,
      dto.isVisible,
      dto.isManuallyPlaced,
      dto.confidence,
      dto.createdAt,
      dto.updatedAt
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
