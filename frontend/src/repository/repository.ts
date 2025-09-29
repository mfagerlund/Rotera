// Repository layer with caching and dependency tracking

import type {
  EntityId, PointId, LineId, PlaneId, CameraId, ImageId, ConstraintId, ProjectId
} from '../types/ids'
import type { ISelectable } from '../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult } from '../validation/validator'
import { ValidationEngine } from '../validation/validator'
import { ReferenceManager, createReferenceManager, type IEntityRepository } from '../services/ReferenceManager'

// Import our DTOs and domain classes
import { WorldPoint, type WorldPointDto } from '../entities/world-point'
import { Line, type LineDto } from '../entities/line'
import { Plane, type PlaneDto } from '../entities/plane'
import { Camera, type CameraDto } from '../entities/camera'
import { Image, type ImageDto } from '../entities/image'
import { Constraint, type ConstraintDto, createConstraintFromDto } from '../entities/constraint'

// Project DTO (storage only - no runtime state)
export interface ProjectDto {
  id: ProjectId
  version: number
  name: string
  description?: string
  createdAt: string
  updatedAt: string

  // Entity collections with branded IDs
  points: Record<PointId, WorldPointDto>
  lines: Record<LineId, LineDto>
  planes: Record<PlaneId, PlaneDto>
  cameras: Record<CameraId, CameraDto>
  images: Record<ImageId, ImageDto>
  constraints: ConstraintDto[]

  // Project settings (clean structure)
  settings: {
    units: 'mm' | 'cm' | 'm' | 'in' | 'ft'
    precision: number
    coordinateSystem?: {
      origin: PointId
      xAxis?: LineId
      yAxis?: LineId
      zAxis?: LineId
    }
  }
}

// Repository implementation with caching and dependency tracking
export class Repository implements
  ValidationContext,
  IEntityRepository
{
  private pointCache = new Map<PointId, WorldPoint>()
  private lineCache = new Map<LineId, Line>()
  private planeCache = new Map<PlaneId, Plane>()
  private cameraCache = new Map<CameraId, Camera>()
  private imageCache = new Map<ImageId, Image>()
  private constraintCache = new Map<ConstraintId, Constraint>()

  // Dependency tracking
  private dependencyGraph = new Map<EntityId, Set<EntityId>>()
  private dependentGraph = new Map<EntityId, Set<EntityId>>()

  // Smart reference management
  private referenceManager: ReferenceManager

  constructor(private project: ProjectDto) {
    this.buildDependencyGraph()
    this.referenceManager = createReferenceManager(this)
  }

  // Factory method to create repository from DTO
  static fromProjectDto(dto: ProjectDto): Repository {
    return new Repository(dto)
  }

  // Get reference manager for advanced operations
  getReferenceManager(): ReferenceManager {
    return this.referenceManager
  }

  // Batch loading methods for performance optimization
  getPointsById(ids: PointId[]): WorldPoint[] {
    return this.referenceManager.batchResolve<WorldPoint>(ids as EntityId[], 'point')
  }

  getLinesById(ids: LineId[]): Line[] {
    return this.referenceManager.batchResolve<Line>(ids as EntityId[], 'line')
  }

  getPlanesById(ids: PlaneId[]): Plane[] {
    return this.referenceManager.batchResolve<Plane>(ids as EntityId[], 'plane')
  }

  getCamerasById(ids: CameraId[]): Camera[] {
    return this.referenceManager.batchResolve<Camera>(ids as EntityId[], 'camera')
  }

  getImagesById(ids: ImageId[]): Image[] {
    return this.referenceManager.batchResolve<Image>(ids as EntityId[], 'image')
  }

  getConstraintsById(ids: ConstraintId[]): Constraint[] {
    return this.referenceManager.batchResolve<Constraint>(ids as EntityId[], 'constraint')
  }

  // Preload entity graphs for performance-critical operations
  preloadEntityGraph(rootIds: EntityId[], depth: number = 2): void {
    this.referenceManager.preloadReferences(rootIds, { depth })
  }

  // Export current state as DTO
  toProjectDto(): ProjectDto {
    // Collect all cached changes back to DTO
    const updatedProject: ProjectDto = {
      ...this.project,
      points: {},
      lines: {},
      planes: {},
      cameras: {},
      images: {},
      constraints: []
    }

    // Update points from cache
    Object.keys(this.project.points).forEach(id => {
      const pointId = id as PointId
      const cached = this.pointCache.get(pointId)
      if (cached) {
        updatedProject.points[pointId] = cached.toDTO()
      } else {
        updatedProject.points[pointId] = this.project.points[pointId]
      }
    })

    // Update lines from cache
    Object.keys(this.project.lines).forEach(id => {
      const lineId = id as LineId
      const cached = this.lineCache.get(lineId)
      if (cached) {
        updatedProject.lines[lineId] = cached.toDTO()
      } else {
        updatedProject.lines[lineId] = this.project.lines[lineId]
      }
    })

    // Update planes from cache
    Object.keys(this.project.planes).forEach(id => {
      const planeId = id as PlaneId
      const cached = this.planeCache.get(planeId)
      if (cached) {
        updatedProject.planes[planeId] = cached.toDTO()
      } else {
        updatedProject.planes[planeId] = this.project.planes[planeId]
      }
    })

    // Update cameras from cache
    Object.keys(this.project.cameras).forEach(id => {
      const cameraId = id as CameraId
      const cached = this.cameraCache.get(cameraId)
      if (cached) {
        updatedProject.cameras[cameraId] = cached.toDTO()
      } else {
        updatedProject.cameras[cameraId] = this.project.cameras[cameraId]
      }
    })

    // Update images from cache
    Object.keys(this.project.images).forEach(id => {
      const imageId = id as ImageId
      const cached = this.imageCache.get(imageId)
      if (cached) {
        updatedProject.images[imageId] = cached.toDTO()
      } else {
        updatedProject.images[imageId] = this.project.images[imageId]
      }
    })

    // Update constraints from cache
    this.project.constraints.forEach(constraintDto => {
      const cached = this.constraintCache.get(constraintDto.id)
      if (cached) {
        updatedProject.constraints.push(cached.toConstraintDto())
      } else {
        updatedProject.constraints.push(constraintDto)
      }
    })

    return updatedProject
  }

  // Entity accessors with caching
  point(id: PointId): WorldPoint {
    if (!this.pointCache.has(id)) {
      const dto = this.project.points[id]
      if (!dto) {
        throw new Error(`Point not found: ${id}`)
      }
      this.pointCache.set(id, WorldPoint.fromDTO(dto))
    }
    return this.pointCache.get(id)!
  }

  line(id: LineId): Line {
    if (!this.lineCache.has(id)) {
      const dto = this.project.lines[id]
      if (!dto) {
        throw new Error(`Line not found: ${id}`)
      }
      const pointA = this.point(dto.pointA)
      const pointB = this.point(dto.pointB)
      this.lineCache.set(id, Line.fromDTO(dto, pointA, pointB))
    }
    return this.lineCache.get(id)!
  }

  plane(id: PlaneId): Plane {
    if (!this.planeCache.has(id)) {
      const dto = this.project.planes[id]
      if (!dto) {
        throw new Error(`Plane not found: ${id}`)
      }
      this.planeCache.set(id, Plane.fromDTO(dto, this))
    }
    return this.planeCache.get(id)!
  }

  camera(id: CameraId): Camera {
    if (!this.cameraCache.has(id)) {
      const dto = this.project.cameras[id]
      if (!dto) {
        throw new Error(`Camera not found: ${id}`)
      }
      this.cameraCache.set(id, Camera.fromDTO(dto, this))
    }
    return this.cameraCache.get(id)!
  }

  image(id: ImageId): Image {
    if (!this.imageCache.has(id)) {
      const dto = this.project.images[id]
      if (!dto) {
        throw new Error(`Image not found: ${id}`)
      }
      this.imageCache.set(id, Image.fromDTO(dto, this))
    }
    return this.imageCache.get(id)!
  }

  constraint(id: ConstraintId): Constraint {
    if (!this.constraintCache.has(id)) {
      const dto = this.project.constraints.find(c => c.id === id)
      if (!dto) {
        throw new Error(`Constraint not found: ${id}`)
      }
      this.constraintCache.set(id, createConstraintFromDto(dto, this))
    }
    return this.constraintCache.get(id)!
  }

  // Collection accessors
  getAllPoints(): WorldPoint[] {
    return Object.keys(this.project.points).map(id => this.point(id as PointId))
  }

  getAllLines(): Line[] {
    return Object.keys(this.project.lines).map(id => this.line(id as LineId))
  }

  getAllPlanes(): Plane[] {
    return Object.keys(this.project.planes).map(id => this.plane(id as PlaneId))
  }

  getAllCameras(): Camera[] {
    return Object.keys(this.project.cameras).map(id => this.camera(id as CameraId))
  }

  getAllImages(): Image[] {
    return Object.keys(this.project.images).map(id => this.image(id as ImageId))
  }

  getAllConstraints(): Constraint[] {
    return this.project.constraints.map(dto => this.constraint(dto.id))
  }

  getAllEntities(): ISelectable[] {
    return [
      ...this.getAllPoints(),
      ...this.getAllLines(),
      ...this.getAllPlanes(),
      ...this.getAllCameras(),
      ...this.getAllImages(),
      ...this.getAllConstraints()
    ]
  }

  // Entity existence checks
  entityExists(id: EntityId): boolean {
    return this.pointExists(id) || this.lineExists(id) || this.planeExists(id) ||
           this.cameraExists(id) || this.imageExists(id) || this.constraintExists(id)
  }

  pointExists(id: EntityId): boolean {
    return this.project.points.hasOwnProperty(id)
  }

  lineExists(id: EntityId): boolean {
    return this.project.lines.hasOwnProperty(id)
  }

  planeExists(id: EntityId): boolean {
    return this.project.planes.hasOwnProperty(id)
  }

  cameraExists(id: EntityId): boolean {
    return this.project.cameras.hasOwnProperty(id)
  }

  imageExists(id: EntityId): boolean {
    return this.project.images.hasOwnProperty(id)
  }

  constraintExists(id: EntityId): boolean {
    return this.project.constraints.some(c => c.id === id)
  }

  // Get entity by ID (generic)
  getEntity(id: EntityId): ISelectable | undefined {
    try {
      if (this.pointExists(id)) return this.point(id as PointId)
      if (this.lineExists(id)) return this.line(id as LineId)
      if (this.planeExists(id)) return this.plane(id as PlaneId)
      if (this.cameraExists(id)) return this.camera(id as CameraId)
      if (this.imageExists(id)) return this.image(id as ImageId)
      if (this.constraintExists(id)) return this.constraint(id as ConstraintId)
    } catch {
      // Entity exists but failed to load
    }
    return undefined
  }

  // Repository interface implementations for entity dependencies

  // WorldPointRepository
  getLinesByPoint(pointId: PointId): EntityId[] {
    return this.getAllLines()
      .filter(line => line.pointA.getId() === pointId || line.pointB.getId() === pointId)
      .map(line => line.getId() as EntityId)
  }

  getConstraintsByPoint(pointId: PointId): EntityId[] {
    return this.getAllConstraints()
      .filter(constraint => constraint.getPointIds().includes(pointId))
      .map(constraint => constraint.getId() as EntityId)
  }

  // LineRepository
  getPoint(pointId: PointId): EntityId | undefined {
    return this.pointExists(pointId as EntityId) ? pointId as EntityId : undefined
  }

  getLine(lineId: LineId): EntityId | undefined {
    return this.lineExists(lineId as EntityId) ? lineId as EntityId : undefined
  }

  getPlane(planeId: PlaneId): EntityId | undefined {
    return this.planeExists(planeId as EntityId) ? planeId as EntityId : undefined
  }

  getConstraintsByLine(lineId: LineId): EntityId[] {
    return this.getAllConstraints()
      .filter(constraint => constraint.getLineIds().includes(lineId))
      .map(constraint => constraint.getId() as EntityId)
  }

  getPlanesByLine(lineId: LineId): EntityId[] {
    // Lines don't directly reference planes in our current model
    return []
  }

  // PlaneRepository
  getConstraintsByPlane(planeId: PlaneId): EntityId[] {
    return this.getAllConstraints()
      .filter(constraint => constraint.getPlaneIds().includes(planeId))
      .map(constraint => constraint.getId() as EntityId)
  }

  // CameraRepository
  getImagesByCamera(cameraId: CameraId): EntityId[] {
    return this.getAllImages()
      .filter(image => image.cameraId === cameraId)
      .map(image => image.getId() as EntityId)
  }

  // ImageRepository
  getCamera(cameraId: CameraId): EntityId | undefined {
    return this.cameraExists(cameraId as EntityId) ? cameraId as EntityId : undefined
  }

  getWorldPoint(pointId: string): EntityId | undefined {
    return this.pointExists(pointId as EntityId) ? pointId as EntityId : undefined
  }

  // ValidationContext implementation
  getAllPointIds(): EntityId[] {
    return Object.keys(this.project.points) as EntityId[]
  }

  getAllLineIds(): EntityId[] {
    return Object.keys(this.project.lines) as EntityId[]
  }

  getAllPlaneIds(): EntityId[] {
    return Object.keys(this.project.planes) as EntityId[]
  }

  getAllCameraIds(): EntityId[] {
    return Object.keys(this.project.cameras) as EntityId[]
  }

  getAllImageIds(): EntityId[] {
    return Object.keys(this.project.images) as EntityId[]
  }

  getAllConstraintIds(): EntityId[] {
    return this.project.constraints.map(c => c.id as EntityId)
  }

  // Dependency tracking
  getDependencies(id: EntityId): EntityId[] {
    return Array.from(this.dependencyGraph.get(id) || [])
  }

  getDependents(id: EntityId): EntityId[] {
    return Array.from(this.dependentGraph.get(id) || [])
  }

  findDependencies(id: EntityId): EntityId[] {
    const entity = this.getEntity(id)
    return entity ? entity.getDependencies() : []
  }

  findDependents(id: EntityId): EntityId[] {
    const entity = this.getEntity(id)
    return entity ? entity.getDependents() : []
  }

  // Build dependency graph
  private buildDependencyGraph(): void {
    this.dependencyGraph.clear()
    this.dependentGraph.clear()

    // Build dependency relationships
    const allEntities = this.getAllEntities()

    allEntities.forEach(entity => {
      const entityId = entity.getId()
      const dependencies = entity.getDependencies()

      this.dependencyGraph.set(entityId, new Set(dependencies))

      // Build reverse graph
      dependencies.forEach(depId => {
        if (!this.dependentGraph.has(depId)) {
          this.dependentGraph.set(depId, new Set())
        }
        this.dependentGraph.get(depId)!.add(entityId)
      })
    })
  }

  // Cascading operations
  deletePoint(id: PointId): { success: boolean; deletedEntities: EntityId[] } {
    const deletedEntities: EntityId[] = []

    try {
      // Get all dependents that need to be deleted
      const dependents = this.findDependents(id as EntityId)

      // Delete constraints first
      dependents.forEach(depId => {
        if (this.constraintExists(depId)) {
          this.deleteConstraintInternal(depId as ConstraintId)
          deletedEntities.push(depId)
        }
      })

      // Delete lines that connect to this point
      dependents.forEach(depId => {
        if (this.lineExists(depId)) {
          this.deleteLineInternal(depId as LineId)
          deletedEntities.push(depId)
        }
      })

      // Finally delete the point
      this.deletePointInternal(id)
      deletedEntities.push(id as EntityId)

      // Rebuild dependency graph
      this.buildDependencyGraph()

      return { success: true, deletedEntities }
    } catch (error) {
      return { success: false, deletedEntities: [] }
    }
  }

  deleteLine(id: LineId): { success: boolean; deletedEntities: EntityId[] } {
    const deletedEntities: EntityId[] = []

    try {
      // Get all constraints that depend on this line
      const dependents = this.findDependents(id as EntityId)

      // Delete constraints first
      dependents.forEach(depId => {
        if (this.constraintExists(depId)) {
          this.deleteConstraintInternal(depId as ConstraintId)
          deletedEntities.push(depId)
        }
      })

      // Delete the line
      this.deleteLineInternal(id)
      deletedEntities.push(id as EntityId)

      // Rebuild dependency graph
      this.buildDependencyGraph()

      return { success: true, deletedEntities }
    } catch (error) {
      return { success: false, deletedEntities: [] }
    }
  }

  // Internal deletion methods with reference invalidation
  private deletePointInternal(id: PointId): void {
    delete this.project.points[id]
    this.pointCache.delete(id)
    this.referenceManager.invalidateReferences(id as EntityId)
  }

  private deleteLineInternal(id: LineId): void {
    delete this.project.lines[id]
    this.lineCache.delete(id)
    this.referenceManager.invalidateReferences(id as EntityId)
  }

  private deleteConstraintInternal(id: ConstraintId): void {
    this.project.constraints = this.project.constraints.filter(c => c.id !== id)
    this.constraintCache.delete(id)
    this.referenceManager.invalidateReferences(id as EntityId)
  }

  // Validation
  validateProject(): ValidationResult {
    // Get all entities that are validatable (our domain classes implement both ISelectable and IValidatable)
    const entities: IValidatable[] = [
      ...this.getAllPoints(),
      ...this.getAllLines(),
      ...this.getAllPlanes(),
      ...this.getAllCameras(),
      ...this.getAllImages(),
      ...this.getAllConstraints()
    ]
    return ValidationEngine.validateProject(entities, this)
  }

  // CRUD operations with reference management
  addPoint(dto: WorldPointDto): WorldPoint {
    this.project.points[dto.id] = dto
    const point = WorldPoint.fromDTO(dto)
    this.pointCache.set(dto.id, point)
    this.buildDependencyGraph()
    // No need to invalidate - new entity doesn't affect existing references
    return point
  }

  addLine(dto: LineDto): Line {
    this.project.lines[dto.id] = dto
    const pointA = this.point(dto.pointA)
    const pointB = this.point(dto.pointB)
    const line = Line.fromDTO(dto, pointA, pointB)
    this.lineCache.set(dto.id, line)
    this.buildDependencyGraph()
    // No need to invalidate - new entity doesn't affect existing references
    return line
  }

  addConstraint(dto: ConstraintDto): Constraint {
    this.project.constraints.push(dto)
    const constraint = createConstraintFromDto(dto, this)
    this.constraintCache.set(dto.id, constraint)
    this.buildDependencyGraph()
    // No need to invalidate - new entity doesn't affect existing references
    return constraint
  }

  // Update operations with reference invalidation
  updatePoint(id: PointId, updates: Partial<WorldPointDto>): boolean {
    const existing = this.project.points[id]
    if (!existing) return false

    this.project.points[id] = { ...existing, ...updates, updatedAt: new Date().toISOString() }
    this.pointCache.delete(id) // Clear cache to force reload
    this.referenceManager.invalidateReferences(id as EntityId)
    return true
  }

  updateLine(id: LineId, updates: Partial<LineDto>): boolean {
    const existing = this.project.lines[id]
    if (!existing) return false

    this.project.lines[id] = { ...existing, ...updates, updatedAt: new Date().toISOString() }
    this.lineCache.delete(id) // Clear cache to force reload
    this.referenceManager.invalidateReferences(id as EntityId)
    return true
  }

  updateConstraint(id: ConstraintId, updates: Partial<ConstraintDto>): boolean {
    const index = this.project.constraints.findIndex(c => c.id === id)
    if (index === -1) return false

    this.project.constraints[index] = {
      ...this.project.constraints[index],
      ...updates,
      updatedAt: new Date().toISOString()
    }
    this.constraintCache.delete(id) // Clear cache to force reload
    this.referenceManager.invalidateReferences(id as EntityId)
    return true
  }

  // Cache management
  clearCache(): void {
    this.pointCache.clear()
    this.lineCache.clear()
    this.planeCache.clear()
    this.cameraCache.clear()
    this.imageCache.clear()
    this.constraintCache.clear()
  }

  // Get cache stats
  getCacheStats() {
    return {
      points: this.pointCache.size,
      lines: this.lineCache.size,
      planes: this.planeCache.size,
      cameras: this.cameraCache.size,
      images: this.imageCache.size,
      constraints: this.constraintCache.size
    }
  }
}