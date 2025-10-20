// Abstract base constraint class for polymorphic constraint architecture

import type { ConstraintId, PointId, LineId, PlaneId, EntityId } from '../../types/ids'
import type { ISelectable, SelectableType } from '../../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult, ValidationError } from '../../validation/validator'
import type { ValueMap, IResidualProvider } from '../../optimization/IOptimizable'
import type { Value } from 'scalar-autograd'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point'
import type { Line } from '../line'

// Forward declaration for Plane
export interface IPlane extends ISelectable {
  getId(): EntityId
}

export type ConstraintStatus = 'satisfied' | 'violated' | 'warning' | 'disabled'

export interface ConstraintEvaluation {
  value: number
  satisfied: boolean
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
  getReferenceManager?(): {
    resolve<T extends ISelectable>(id: EntityId, type: string): T | undefined
    batchResolve<T extends ISelectable>(ids: EntityId[], type: string): T[]
    preloadReferences(rootIds: EntityId[], options?: { depth?: number }): void
  }
}

// Base DTO structure - each subclass adds its own optional property
export interface BaseConstraintDto {
  id: ConstraintId
  name: string
  type: string
  status: ConstraintStatus

  // Entity references
  entities: {
    points?: PointId[]
    lines?: LineId[]
    planes?: PlaneId[]
  }

  // Common parameters
  parameters: {
    tolerance?: number
    priority?: number
    [key: string]: any
  }

  // Runtime state
  currentValue?: number
  error?: number
  isEnabled: boolean
  isDriving: boolean

  // Metadata
  group?: string
  tags?: string[]
  notes?: string
  createdAt: string
  updatedAt: string
}

// Polymorphic DTO with all possible constraint types
export interface ConstraintDto extends BaseConstraintDto {
  distanceConstraint?: DistanceConstraintDto
  angleConstraint?: AngleConstraintDto
  parallelLinesConstraint?: ParallelLinesConstraintDto
  perpendicularLinesConstraint?: PerpendicularLinesConstraintDto
  fixedPointConstraint?: FixedPointConstraintDto
  collinearPointsConstraint?: CollinearPointsConstraintDto
  coplanarPointsConstraint?: CoplanarPointsConstraintDto
  equalDistancesConstraint?: EqualDistancesConstraintDto
  equalAnglesConstraint?: EqualAnglesConstraintDto
  projectionConstraint?: ProjectionConstraintDto
}

// Individual constraint DTOs
export interface DistanceConstraintDto {
  targetDistance: number
}

export interface AngleConstraintDto {
  targetAngle: number
}

export interface ParallelLinesConstraintDto {
  // No additional parameters
}

export interface PerpendicularLinesConstraintDto {
  // No additional parameters
}

export interface FixedPointConstraintDto {
  targetXyz: [number, number, number]
}

export interface CollinearPointsConstraintDto {
  // No additional parameters
}

export interface CoplanarPointsConstraintDto {
  // No additional parameters
}

export interface EqualDistancesConstraintDto {
  distancePairs: [PointId, PointId][]
}

export interface EqualAnglesConstraintDto {
  angleTriplets: [PointId, PointId, PointId][]
}

export interface ProjectionConstraintDto {
  cameraId: string // CameraId
  observedU: number
  observedV: number
}

// Abstract base constraint class
export abstract class Constraint implements ISelectable, IValidatable, IResidualProvider {
  private selected = false

  // Direct object references for performance
  protected _points: Set<WorldPoint> = new Set()
  protected _lines: Set<Line> = new Set()
  protected _planes: Set<IPlane> = new Set()
  protected _entitiesPreloaded = false

  protected constructor(
    protected repo: ConstraintRepository,
    protected data: BaseConstraintDto
  ) {}

  // Abstract methods that must be implemented by subclasses
  abstract getConstraintType(): string
  abstract evaluate(): ConstraintEvaluation
  abstract validateConstraintSpecific(): ValidationResult
  abstract getRequiredEntityCounts(): { points?: number; lines?: number; planes?: number }
  abstract toConstraintDto(): ConstraintDto
  abstract clone(newId: ConstraintId, newName?: string): Constraint

  /**
   * Compute residuals for this constraint.
   * Must be implemented by each constraint type to define its residual function.
   *
   * @param valueMap - The ValueMap containing all entity values
   * @returns Array of Value objects (residuals that should be zero)
   */
  abstract computeResiduals(valueMap: ValueMap): Value[]

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

  get isVisible(): boolean {
    return this.data.isEnabled
  }

  isLocked(): boolean {
    return false
  }

  getDependencies(): EntityId[] {
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
    return []
  }

  isSelected(): boolean {
    return this.selected
  }

  setSelected(selected: boolean): void {
    this.selected = selected
  }

  canDelete(): boolean {
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

    // Common validation
    const nameError = ValidationHelpers.validateRequiredField(
      this.data.name,
      'name',
      this.data.id,
      'constraint'
    )
    if (nameError) errors.push(nameError)

    const idError = ValidationHelpers.validateIdFormat(this.data.id, 'constraint')
    if (idError) errors.push(idError)

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

    // Parameter validation
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

    // Entity count validation
    const requiredCounts = this.getRequiredEntityCounts()
    if (requiredCounts.points !== undefined) {
      const actualPoints = this.data.entities.points?.length ?? 0
      if (actualPoints !== requiredCounts.points) {
        errors.push(ValidationHelpers.createError(
          'INVALID_ENTITY_COUNT',
          `${this.getConstraintType()} requires exactly ${requiredCounts.points} points, got ${actualPoints}`,
          this.data.id,
          'constraint'
        ))
      }
    }

    if (requiredCounts.lines !== undefined) {
      const actualLines = this.data.entities.lines?.length ?? 0
      if (actualLines !== requiredCounts.lines) {
        errors.push(ValidationHelpers.createError(
          'INVALID_ENTITY_COUNT',
          `${this.getConstraintType()} requires exactly ${requiredCounts.lines} lines, got ${actualLines}`,
          this.data.id,
          'constraint'
        ))
      }
    }

    // Constraint-specific validation
    const specificValidation = this.validateConstraintSpecific()
    errors.push(...specificValidation.errors)
    warnings.push(...specificValidation.warnings)

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0 ? 'Constraint validation passed' : `Constraint validation failed: ${errors.length} errors`
    }
  }

  // Common getters/setters
  get name(): string {
    return this.data.name
  }

  set name(value: string) {
    this.data.name = value
    this.updateTimestamp()
  }

  get constraintType(): string {
    return this.getConstraintType()
  }

  get status(): ConstraintStatus {
    return this.data.status
  }

  set status(value: ConstraintStatus) {
    this.data.status = value
    this.updateTimestamp()
  }

  get entities(): BaseConstraintDto['entities'] {
    return {
      points: this.data.entities.points ? [...this.data.entities.points] : undefined,
      lines: this.data.entities.lines ? [...this.data.entities.lines] : undefined,
      planes: this.data.entities.planes ? [...this.data.entities.planes] : undefined
    }
  }

  get parameters(): BaseConstraintDto['parameters'] {
    return { ...this.data.parameters }
  }

  setParameter(key: string, value: number | string | boolean | number[] | string[]): void {
    this.data.parameters[key] = value
    this.updateTimestamp()
  }

  getParameter<T>(key: string): T | undefined {
    return this.data.parameters[key] as T
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

  // Entity access methods
  get points(): WorldPoint[] {
    return Array.from(this._points)
  }

  get lines(): Line[] {
    return Array.from(this._lines)
  }

  get planes(): IPlane[] {
    return Array.from(this._planes)
  }

  get allEntities(): { points: WorldPoint[], lines: Line[], planes: IPlane[] } {
    return {
      points: this.points,
      lines: this.lines,
      planes: this.planes
    }
  }

  preloadEntities(): void {
    if (!this._entitiesPreloaded) {
      const refManager = this.repo.getReferenceManager?.()
      if (refManager) {
        const allIds = [
          ...(this.data.entities.points || []),
          ...(this.data.entities.lines || []),
          ...(this.data.entities.planes || [])
        ] as EntityId[]

        refManager.preloadReferences(allIds, { depth: 1 })
        this._entitiesPreloaded = true
      }
    }

    // Force load all references
    this.allEntities
  }

  protected invalidateReferences(): void {
    this._points.clear()
    this._lines.clear()
    this._planes.clear()
    this._entitiesPreloaded = false
  }

  // Utility methods
  isSatisfied(): boolean {
    return this.data.status === 'satisfied'
  }

  isViolated(): boolean {
    return this.data.status === 'violated'
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

  protected updateTimestamp(): void {
    this.data.updatedAt = new Date().toISOString()
  }

  setVisible(visible: boolean): void {
    this.data.isEnabled = visible
    this.updateTimestamp()
  }

  updateFromEvaluation(value: number, satisfied: boolean): void {
    this.data.currentValue = value
    this.data.error = this.getTargetValue() !== undefined
      ? Math.abs(value - this.getTargetValue()!)
      : undefined
    this.data.status = satisfied ? 'satisfied' : 'violated'
    this.updateTimestamp()
  }

  // Helper method for getting target value (implemented by subclasses as needed)
  protected getTargetValue(): number | undefined {
    return undefined
  }

  // Static batch evaluation for performance
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

  // Helper method for checking satisfaction
  protected checkSatisfaction(value: number, target?: number): boolean {
    if (target === undefined) return true
    return Math.abs(value - target) <= this.tolerance
  }

  // Helper method for calculating angle between three points (in degrees)
  protected calculateAngleBetweenPoints(pointA: WorldPoint, vertex: WorldPoint, pointC: WorldPoint): number {
    const aCoords = pointA.getDefinedCoordinates()
    const vCoords = vertex.getDefinedCoordinates()
    const cCoords = pointC.getDefinedCoordinates()

    if (!aCoords || !vCoords || !cCoords) {
      return 0
    }

    const [x1, y1, z1] = aCoords
    const [x2, y2, z2] = vCoords
    const [x3, y3, z3] = cCoords

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
}