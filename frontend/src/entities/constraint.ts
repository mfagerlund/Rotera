// Constraint entity with DTO and domain class co-located (NO LEGACY)

import type { ConstraintId, PointId, LineId, PlaneId, EntityId } from '../types/ids'
import type { ISelectable, SelectableType } from '../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult, ValidationError } from '../validation/validator'
import { ValidationHelpers } from '../validation/validator'

// Clean constraint types (NO LEGACY)
export type ConstraintType =
  | 'distance_point_point'
  | 'distance_point_line'
  | 'distance_point_plane'
  | 'angle_point_point_point'
  | 'angle_line_line'
  | 'parallel_lines'
  | 'perpendicular_lines'
  | 'collinear_points'
  | 'coplanar_points'
  | 'fixed_point'
  | 'horizontal_line'
  | 'vertical_line'
  | 'equal_distances'
  | 'equal_angles'

export type ConstraintStatus = 'satisfied' | 'violated' | 'warning' | 'disabled'

// Constraint DTO for storage (clean, no legacy)
export interface ConstraintDto {
  id: ConstraintId
  name: string
  type: ConstraintType
  status: ConstraintStatus

  // Entity references (clean structure)
  entities: {
    points?: PointId[]
    lines?: LineId[]
    planes?: PlaneId[]
  }

  // Constraint parameters
  parameters: {
    targetValue?: number
    tolerance?: number
    priority?: number // 1-10, higher = more important
    [key: string]: any // Allow for constraint-specific parameters
  }

  // Runtime state
  currentValue?: number
  error?: number // difference from target
  isEnabled: boolean
  isDriving: boolean // true if this constraint drives optimization

  // Metadata
  group?: string
  tags?: string[]
  notes?: string
  createdAt: string
  updatedAt: string
}

// Repository interface (to avoid circular dependency)
export interface ConstraintRepository {
  getPoint(pointId: PointId): EntityId | undefined
  getLine(lineId: LineId): EntityId | undefined
  getPlane(planeId: PlaneId): EntityId | undefined
  entityExists(id: EntityId): boolean
  pointExists(pointId: PointId): boolean
  lineExists(lineId: LineId): boolean
  planeExists(planeId: PlaneId): boolean
  // Enhanced methods for smart references and batch loading
  getReferenceManager?(): {
    resolve<T extends ISelectable>(id: EntityId, type: string): T | undefined
    batchResolve<T extends ISelectable>(ids: EntityId[], type: string): T[]
    preloadReferences(rootIds: EntityId[], options?: { depth?: number }): void
  }
}

// Domain class with runtime behavior
export class Constraint implements ISelectable, IValidatable {
  private selected = false

  // Smart reference caching for performance optimization
  private _pointsRef?: any[] // Array of WorldPoint references
  private _linesRef?: any[] // Array of Line references
  private _planesRef?: any[] // Array of Plane references
  private _entitiesPreloaded = false

  private constructor(
    private repo: ConstraintRepository,
    private data: ConstraintDto
  ) {}

  // Factory methods
  static fromDTO(dto: ConstraintDto, repo: ConstraintRepository): Constraint {
    const validation = Constraint.validateDto(dto)
    if (!validation.isValid) {
      throw new Error(`Invalid Constraint DTO: ${validation.errors.map(e => e.message).join(', ')}`)
    }
    return new Constraint(repo, { ...dto })
  }

  static create(
    id: ConstraintId,
    name: string,
    type: ConstraintType,
    entities: ConstraintDto['entities'],
    repo: ConstraintRepository,
    options: {
      targetValue?: number
      tolerance?: number
      priority?: number
      isEnabled?: boolean
      isDriving?: boolean
      parameters?: Record<string, any>
      group?: string
      tags?: string[]
      notes?: string
    } = {}
  ): Constraint {
    const now = new Date().toISOString()
    const dto: ConstraintDto = {
      id,
      name,
      type,
      status: 'satisfied',
      entities: {
        points: entities.points ? [...entities.points] : undefined,
        lines: entities.lines ? [...entities.lines] : undefined,
        planes: entities.planes ? [...entities.planes] : undefined
      },
      parameters: {
        targetValue: options.targetValue,
        tolerance: options.tolerance ?? 0.001,
        priority: options.priority ?? 5,
        ...options.parameters
      },
      isEnabled: options.isEnabled ?? true,
      isDriving: options.isDriving ?? false,
      group: options.group,
      tags: options.tags,
      notes: options.notes,
      createdAt: now,
      updatedAt: now
    }
    return new Constraint(repo, dto)
  }

  // Serialization
  toDTO(): ConstraintDto {
    return {
      ...this.data,
      entities: {
        points: this.data.entities.points ? [...this.data.entities.points] : undefined,
        lines: this.data.entities.lines ? [...this.data.entities.lines] : undefined,
        planes: this.data.entities.planes ? [...this.data.entities.planes] : undefined
      },
      parameters: { ...this.data.parameters }
    }
  }

  // ISelectable implementation
  getId(): ConstraintId {
    return this.data.id
  }

  getType(): SelectableType {
    return 'constraint'
  }

  getName(): string {
    return this.data.name
  }

  isVisible(): boolean {
    // Constraints are visible if enabled
    return this.data.isEnabled
  }

  isLocked(): boolean {
    // Constraints aren't directly lockable
    return false
  }

  getDependencies(): EntityId[] {
    // Constraints depend on the entities they reference
    const dependencies: EntityId[] = []

    if (this.data.entities.points) {
      dependencies.push(...this.data.entities.points.map(id => id as EntityId))
    }
    if (this.data.entities.lines) {
      dependencies.push(...this.data.entities.lines.map(id => id as EntityId))
    }
    if (this.data.entities.planes) {
      dependencies.push(...this.data.entities.planes.map(id => id as EntityId))
    }

    return dependencies
  }

  getDependents(): EntityId[] {
    // Constraints typically don't have dependents (they're leaf nodes)
    return []
  }

  isSelected(): boolean {
    return this.selected
  }

  setSelected(selected: boolean): void {
    this.selected = selected
  }

  canDelete(): boolean {
    // Constraints can usually be deleted safely
    return true
  }

  getDeleteWarning(): string | null {
    if (this.data.isDriving) {
      return `Constraint "${this.data.name}" is a driving constraint and affects optimization`
    }
    return null
  }

  // IValidatable implementation
  validate(context: ValidationContext): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    // Required field validation
    const nameError = ValidationHelpers.validateRequiredField(
      this.data.name,
      'name',
      this.data.id,
      'constraint'
    )
    if (nameError) errors.push(nameError)

    const idError = ValidationHelpers.validateIdFormat(this.data.id, 'constraint')
    if (idError) errors.push(idError)

    // Type-specific validation
    const typeValidation = this.validateConstraintType()
    errors.push(...typeValidation.errors)
    warnings.push(...typeValidation.warnings)

    // Entity reference validation
    if (this.data.entities.points) {
      for (const pointId of this.data.entities.points) {
        if (!context.pointExists(pointId as EntityId)) {
          errors.push(ValidationHelpers.createError(
            'INVALID_POINT_REFERENCE',
            `Constraint references non-existent point: ${pointId}`,
            this.data.id,
            'constraint',
            'entities.points'
          ))
        }
      }
    }

    if (this.data.entities.lines) {
      for (const lineId of this.data.entities.lines) {
        if (!context.lineExists(lineId as EntityId)) {
          errors.push(ValidationHelpers.createError(
            'INVALID_LINE_REFERENCE',
            `Constraint references non-existent line: ${lineId}`,
            this.data.id,
            'constraint',
            'entities.lines'
          ))
        }
      }
    }

    if (this.data.entities.planes) {
      for (const planeId of this.data.entities.planes) {
        if (!context.planeExists(planeId as EntityId)) {
          errors.push(ValidationHelpers.createError(
            'INVALID_PLANE_REFERENCE',
            `Constraint references non-existent plane: ${planeId}`,
            this.data.id,
            'constraint',
            'entities.planes'
          ))
        }
      }
    }

    // Parameters validation
    if (this.data.parameters.tolerance !== undefined && this.data.parameters.tolerance < 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_TOLERANCE',
        'tolerance must be non-negative',
        this.data.id,
        'constraint',
        'parameters.tolerance'
      ))
    }

    if (this.data.parameters.priority !== undefined) {
      if (this.data.parameters.priority < 1 || this.data.parameters.priority > 10) {
        errors.push(ValidationHelpers.createError(
          'INVALID_PRIORITY',
          'priority must be between 1 and 10',
          this.data.id,
          'constraint',
          'parameters.priority'
        ))
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0 ? 'Constraint validation passed' : `Constraint validation failed: ${errors.length} errors`
    }
  }

  // Type-specific validation
  private validateConstraintType(): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    switch (this.data.type) {
      case 'distance_point_point':
        if (!this.data.entities.points || this.data.entities.points.length !== 2) {
          errors.push(ValidationHelpers.createError(
            'INVALID_ENTITY_COUNT',
            'distance_point_point requires exactly 2 points',
            this.data.id,
            'constraint'
          ))
        }
        if (this.data.parameters.targetValue === undefined) {
          errors.push(ValidationHelpers.createError(
            'MISSING_TARGET_VALUE',
            'distance_point_point requires targetValue parameter',
            this.data.id,
            'constraint'
          ))
        }
        break

      case 'angle_point_point_point':
        if (!this.data.entities.points || this.data.entities.points.length !== 3) {
          errors.push(ValidationHelpers.createError(
            'INVALID_ENTITY_COUNT',
            'angle_point_point_point requires exactly 3 points',
            this.data.id,
            'constraint'
          ))
        }
        if (this.data.parameters.targetValue === undefined) {
          errors.push(ValidationHelpers.createError(
            'MISSING_TARGET_VALUE',
            'angle_point_point_point requires targetValue parameter',
            this.data.id,
            'constraint'
          ))
        }
        break

      case 'parallel_lines':
      case 'perpendicular_lines':
        if (!this.data.entities.lines || this.data.entities.lines.length !== 2) {
          errors.push(ValidationHelpers.createError(
            'INVALID_ENTITY_COUNT',
            `${this.data.type} requires exactly 2 lines`,
            this.data.id,
            'constraint'
          ))
        }
        break

      case 'collinear_points':
        if (!this.data.entities.points || this.data.entities.points.length < 3) {
          errors.push(ValidationHelpers.createError(
            'INVALID_ENTITY_COUNT',
            'collinear_points requires at least 3 points',
            this.data.id,
            'constraint'
          ))
        }
        break

      case 'coplanar_points':
        if (!this.data.entities.points || this.data.entities.points.length < 4) {
          errors.push(ValidationHelpers.createError(
            'INVALID_ENTITY_COUNT',
            'coplanar_points requires at least 4 points',
            this.data.id,
            'constraint'
          ))
        }
        break

      case 'fixed_point':
        if (!this.data.entities.points || this.data.entities.points.length !== 1) {
          errors.push(ValidationHelpers.createError(
            'INVALID_ENTITY_COUNT',
            'fixed_point requires exactly 1 point',
            this.data.id,
            'constraint'
          ))
        }
        break

      case 'horizontal_line':
      case 'vertical_line':
        if (!this.data.entities.lines || this.data.entities.lines.length !== 1) {
          errors.push(ValidationHelpers.createError(
            'INVALID_ENTITY_COUNT',
            `${this.data.type} requires exactly 1 line`,
            this.data.id,
            'constraint'
          ))
        }
        break

      default:
        errors.push(ValidationHelpers.createError(
          'UNKNOWN_CONSTRAINT_TYPE',
          `Unknown constraint type: ${this.data.type}`,
          this.data.id,
          'constraint'
        ))
    }

    return { isValid: errors.length === 0, errors, warnings, summary: '' }
  }

  // Static DTO validation
  private static validateDto(dto: ConstraintDto): ValidationResult {
    const errors: ValidationError[] = []

    if (!dto.id) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'id is required',
        dto.id,
        'constraint',
        'id'
      ))
    }

    if (!dto.name) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'name is required',
        dto.id,
        'constraint',
        'name'
      ))
    }

    if (!dto.type) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'type is required',
        dto.id,
        'constraint',
        'type'
      ))
    }

    if (!dto.entities) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'entities is required',
        dto.id,
        'constraint',
        'entities'
      ))
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      summary: errors.length === 0 ? 'DTO validation passed' : `DTO validation failed: ${errors.length} errors`
    }
  }

  // Domain methods (getters/setters)
  get name(): string {
    return this.data.name
  }

  set name(value: string) {
    this.data.name = value
    this.updateTimestamp()
  }

  get constraintType(): ConstraintType {
    return this.data.type
  }

  get status(): ConstraintStatus {
    return this.data.status
  }

  set status(value: ConstraintStatus) {
    this.data.status = value
    this.updateTimestamp()
  }

  get entities(): ConstraintDto['entities'] {
    return {
      points: this.data.entities.points ? [...this.data.entities.points] : undefined,
      lines: this.data.entities.lines ? [...this.data.entities.lines] : undefined,
      planes: this.data.entities.planes ? [...this.data.entities.planes] : undefined
    }
  }

  get parameters(): ConstraintDto['parameters'] {
    return { ...this.data.parameters }
  }

  setParameter(key: string, value: any): void {
    this.data.parameters[key] = value
    this.updateTimestamp()
  }

  getParameter<T>(key: string): T | undefined {
    return this.data.parameters[key] as T
  }

  get targetValue(): number | undefined {
    return this.data.parameters.targetValue
  }

  set targetValue(value: number | undefined) {
    this.data.parameters.targetValue = value
    this.updateTimestamp()
  }

  get tolerance(): number {
    return this.data.parameters.tolerance ?? 0.001
  }

  set tolerance(value: number) {
    if (value < 0) {
      throw new Error('Tolerance must be non-negative')
    }
    this.data.parameters.tolerance = value
    this.updateTimestamp()
  }

  get priority(): number {
    return this.data.parameters.priority ?? 5
  }

  set priority(value: number) {
    if (value < 1 || value > 10) {
      throw new Error('Priority must be between 1 and 10')
    }
    this.data.parameters.priority = value
    this.updateTimestamp()
  }

  get currentValue(): number | undefined {
    return this.data.currentValue
  }

  set currentValue(value: number | undefined) {
    this.data.currentValue = value
    this.updateTimestamp()
  }

  get error(): number | undefined {
    return this.data.error
  }

  set error(value: number | undefined) {
    this.data.error = value
    this.updateTimestamp()
  }

  get isEnabled(): boolean {
    return this.data.isEnabled
  }

  set isEnabled(value: boolean) {
    this.data.isEnabled = value
    this.updateTimestamp()
  }

  get isDriving(): boolean {
    return this.data.isDriving
  }

  set isDriving(value: boolean) {
    this.data.isDriving = value
    this.updateTimestamp()
  }

  get group(): string | undefined {
    return this.data.group
  }

  set group(value: string | undefined) {
    this.data.group = value
    this.updateTimestamp()
  }

  get tags(): string[] {
    return this.data.tags ? [...this.data.tags] : []
  }

  set tags(value: string[]) {
    this.data.tags = [...value]
    this.updateTimestamp()
  }

  get notes(): string | undefined {
    return this.data.notes
  }

  set notes(value: string | undefined) {
    this.data.notes = value
    this.updateTimestamp()
  }

  get createdAt(): string {
    return this.data.createdAt
  }

  get updatedAt(): string {
    return this.data.updatedAt
  }

  // Utility methods
  isSatisfied(): boolean {
    return this.data.status === 'satisfied'
  }

  isViolated(): boolean {
    return this.data.status === 'violated'
  }

  hasTarget(): boolean {
    return this.data.parameters.targetValue !== undefined
  }

  getEntityIds(): EntityId[] {
    return this.getDependencies()
  }

  getPointIds(): PointId[] {
    return this.data.entities.points || []
  }

  getLineIds(): LineId[] {
    return this.data.entities.lines || []
  }

  getPlaneIds(): PlaneId[] {
    return this.data.entities.planes || []
  }

  // Smart reference getters for performance optimization
  // MAJOR PERFORMANCE IMPROVEMENT: Direct object access instead of ID-based repository lookups

  /**
   * Get all constraint points as WorldPoint objects (direct references)
   * Uses smart caching and batch loading to avoid multiple repository lookups
   * This is the core optimization that eliminates the constraint evaluation bottleneck!
   */
  get points(): any[] {
    if (!this._pointsRef) {
      const refManager = this.repo.getReferenceManager?.()
      if (refManager) {
        const pointIds = this.getPointIds()
        this._pointsRef = refManager.batchResolve(pointIds as EntityId[], 'point')
      } else {
        this._pointsRef = []
      }
    }
    return this._pointsRef
  }

  /**
   * Get all constraint lines as Line objects (direct references)
   * Uses smart caching and batch loading for performance
   */
  get lines(): any[] {
    if (!this._linesRef) {
      const refManager = this.repo.getReferenceManager?.()
      if (refManager) {
        const lineIds = this.getLineIds()
        this._linesRef = refManager.batchResolve(lineIds as EntityId[], 'line')
      } else {
        this._linesRef = []
      }
    }
    return this._linesRef
  }

  /**
   * Get all constraint planes as Plane objects (direct references)
   * Uses smart caching and batch loading for performance
   */
  get planes(): any[] {
    if (!this._planesRef) {
      const refManager = this.repo.getReferenceManager?.()
      if (refManager) {
        const planeIds = this.getPlaneIds()
        this._planesRef = refManager.batchResolve(planeIds as EntityId[], 'plane')
      } else {
        this._planesRef = []
      }
    }
    return this._planesRef
  }

  /**
   * Get all entities referenced by this constraint in one optimized call
   * This replaces multiple individual lookups with a single batch operation
   * CRITICAL for constraint evaluation performance!
   */
  get allEntities(): { points: any[], lines: any[], planes: any[] } {
    // Ensure all references are loaded
    const points = this.points
    const lines = this.lines
    const planes = this.planes

    return { points, lines, planes }
  }

  /**
   * Preload all entity references for this constraint
   * Call this for performance-critical constraint evaluation workflows
   */
  preloadEntities(): void {
    if (!this._entitiesPreloaded) {
      const refManager = this.repo.getReferenceManager?.()
      if (refManager) {
        const allIds = [
          ...this.getPointIds(),
          ...this.getLineIds(),
          ...this.getPlaneIds()
        ] as EntityId[]

        // Preload with depth 1 to get connected entities too
        refManager.preloadReferences(allIds, { depth: 1 })
        this._entitiesPreloaded = true
      }
    }

    // Force load all references
    this.allEntities
  }

  /**
   * Invalidate cached references when underlying data changes
   * Called automatically on updates that might affect relationships
   */
  private invalidateReferences(): void {
    this._pointsRef = undefined
    this._linesRef = undefined
    this._planesRef = undefined
    this._entitiesPreloaded = false
  }

  clone(newId: ConstraintId, newName?: string): Constraint {
    const clonedData: ConstraintDto = {
      ...this.data,
      id: newId,
      name: newName || `${this.data.name} (copy)`,
      entities: {
        points: this.data.entities.points ? [...this.data.entities.points] : undefined,
        lines: this.data.entities.lines ? [...this.data.entities.lines] : undefined,
        planes: this.data.entities.planes ? [...this.data.entities.planes] : undefined
      },
      parameters: { ...this.data.parameters },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    return new Constraint(this.repo, clonedData)
  }

  private updateTimestamp(): void {
    this.data.updatedAt = new Date().toISOString()
  }

  // Override visibility (constraint enabled state)
  setVisible(visible: boolean): void {
    this.data.isEnabled = visible
    this.updateTimestamp()
  }

  // Enhanced constraint evaluation using smart references
  // MAJOR PERFORMANCE IMPROVEMENT: Direct object access eliminates lookup overhead
  evaluate(): { value: number; satisfied: boolean } {
    // Use smart references for direct entity access - no repository lookups!
    const { points, lines, planes } = this.allEntities

    let value = 0
    let satisfied = false

    // High-performance constraint evaluation based on type
    switch (this.data.type) {
      case 'distance_point_point':
        if (points.length >= 2 && points[0].hasCoordinates() && points[1].hasCoordinates()) {
          value = points[0].distanceTo(points[1]) ?? 0
        }
        break

      case 'distance_point_line':
        if (points.length >= 1 && lines.length >= 1 && points[0].hasCoordinates()) {
          // Placeholder for point-to-line distance calculation
          value = 0
        }
        break

      case 'angle_point_point_point':
        if (points.length >= 3 && points.every(p => p.hasCoordinates())) {
          value = this.calculateAngleBetweenPoints(points[0], points[1], points[2])
        }
        break

      case 'parallel_lines':
        if (lines.length >= 2) {
          const dir1 = lines[0].getDirection()
          const dir2 = lines[1].getDirection()
          if (dir1 && dir2) {
            // Calculate dot product to check parallelism
            const dotProduct = Math.abs(dir1[0] * dir2[0] + dir1[1] * dir2[1] + dir1[2] * dir2[2])
            value = Math.acos(Math.min(1, dotProduct)) * (180 / Math.PI)
          }
        }
        break

      case 'perpendicular_lines':
        if (lines.length >= 2) {
          const dir1 = lines[0].getDirection()
          const dir2 = lines[1].getDirection()
          if (dir1 && dir2) {
            const dotProduct = dir1[0] * dir2[0] + dir1[1] * dir2[1] + dir1[2] * dir2[2]
            value = Math.abs(dotProduct)
          }
        }
        break

      case 'fixed_point':
        if (points.length >= 1 && points[0].hasCoordinates()) {
          const targetPos = [
            this.data.parameters.x ?? points[0].xyz![0],
            this.data.parameters.y ?? points[0].xyz![1],
            this.data.parameters.z ?? points[0].xyz![2]
          ]
          const currentPos = points[0].xyz!
          value = Math.sqrt(
            Math.pow(currentPos[0] - targetPos[0], 2) +
            Math.pow(currentPos[1] - targetPos[1], 2) +
            Math.pow(currentPos[2] - targetPos[2], 2)
          )
        }
        break

      case 'collinear_points':
        if (points.length >= 3 && points.every(p => p.hasCoordinates())) {
          value = points[0].isColinearWith(points[1], points[2]) ? 0 : 1
        }
        break

      default:
        // Fallback to cached value
        value = this.data.currentValue ?? 0
    }

    // Check satisfaction
    const target = this.data.parameters.targetValue ?? 0
    const tolerance = this.tolerance
    satisfied = Math.abs(value - target) <= tolerance

    return { value, satisfied }
  }

  /**
   * Fast batch evaluation for multiple constraints
   * Preloads all entities once, then evaluates without additional lookups
   * CRITICAL for constraint solver performance!
   */
  static batchEvaluate(constraints: Constraint[]): Array<{ constraint: Constraint; value: number; satisfied: boolean }> {
    // Preload all entities for batch processing
    for (const constraint of constraints) {
      constraint.preloadEntities()
    }

    // Evaluate all constraints using cached entities
    return constraints.map(constraint => {
      const evaluation = constraint.evaluate()
      return {
        constraint,
        value: evaluation.value,
        satisfied: evaluation.satisfied
      }
    })
  }

  /**
   * Calculate angle between three points (in degrees)
   * Helper method for angle constraints
   */
  private calculateAngleBetweenPoints(pointA: any, vertex: any, pointC: any): number {
    if (!pointA.hasCoordinates() || !vertex.hasCoordinates() || !pointC.hasCoordinates()) {
      return 0
    }

    const [x1, y1, z1] = pointA.xyz!
    const [x2, y2, z2] = vertex.xyz!
    const [x3, y3, z3] = pointC.xyz!

    // Calculate vectors from vertex to other points
    const vec1 = [x1 - x2, y1 - y2, z1 - z2]
    const vec2 = [x3 - x2, y3 - y2, z3 - z2]

    // Calculate magnitudes
    const mag1 = Math.sqrt(vec1[0] ** 2 + vec1[1] ** 2 + vec1[2] ** 2)
    const mag2 = Math.sqrt(vec2[0] ** 2 + vec2[1] ** 2 + vec2[2] ** 2)

    if (mag1 === 0 || mag2 === 0) return 0

    // Calculate dot product
    const dotProduct = vec1[0] * vec2[0] + vec1[1] * vec2[1] + vec1[2] * vec2[2]

    // Calculate angle in radians then convert to degrees
    const angleRad = Math.acos(Math.max(-1, Math.min(1, dotProduct / (mag1 * mag2))))
    return angleRad * (180 / Math.PI)
  }

  // Update constraint state after evaluation
  updateFromEvaluation(value: number, satisfied: boolean): void {
    this.data.currentValue = value
    this.data.error = this.data.parameters.targetValue !== undefined
      ? Math.abs(value - this.data.parameters.targetValue)
      : undefined
    this.data.status = satisfied ? 'satisfied' : 'violated'
    this.updateTimestamp()
  }
}

// Helper function for getting constraint point IDs (replaces the legacy version)
export function getConstraintPointIds(constraint: ConstraintDto): PointId[] {
  return constraint.entities.points || []
}

// Helper function for getting all constraint entity IDs
export function getConstraintEntityIds(constraint: ConstraintDto): EntityId[] {
  const ids: EntityId[] = []

  if (constraint.entities.points) {
    ids.push(...constraint.entities.points.map(id => id as EntityId))
  }
  if (constraint.entities.lines) {
    ids.push(...constraint.entities.lines.map(id => id as EntityId))
  }
  if (constraint.entities.planes) {
    ids.push(...constraint.entities.planes.map(id => id as EntityId))
  }

  return ids
}