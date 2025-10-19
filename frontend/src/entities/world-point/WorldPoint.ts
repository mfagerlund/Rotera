// Core WorldPoint domain class - refactored with composition

import type { PointId, EntityId } from '../../types/ids'
import type { ISelectable, SelectableType } from '../../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult } from '../../validation/validator'
import type { ValueProvenance, IValueMapContributor, ValueMap } from '../../optimization/IOptimizable'
import { V, Value, Vec3 } from 'scalar-autograd'
import { WorldPointDto, type AxisLock } from './WorldPointDto'
import { WorldPointValidator } from './WorldPointValidation'
import { WorldPointGeometry } from './WorldPointGeometry'
import { WorldPointRelationshipManager, type ILine, type IConstraint, type IWorldPoint } from './WorldPointRelationships'

export class WorldPoint implements ISelectable, IValidatable, IWorldPoint, IValueMapContributor {
  private _selected = false
  private _relationshipManager: WorldPointRelationshipManager

  // Store residuals from intrinsic constraints (currently none for points, but infrastructure for future)
  private _lastResiduals: number[] = []

  private constructor(
    private _id: PointId,
    private _name: string,
    private _xyz: [number | null, number | null, number | null] | undefined,
    private _xyzProvenance: ValueProvenance | undefined,
    private _color: string,
    private _isVisible: boolean,
    private _isOrigin: boolean,
    private _isLocked: boolean,
    private _lockedAxes: AxisLock | undefined,
    private _group: string | undefined,
    private _tags: string[],
    private _createdAt: string,
    private _updatedAt: string
  ) {
    // Initialize relationship manager
    this._relationshipManager = new WorldPointRelationshipManager()
  }

  // Factory methods
  static fromDTO(dto: WorldPointDto): WorldPoint {
    const validation = WorldPointValidator.validateDto(dto)
    if (!validation.isValid) {
      throw new Error(`Invalid WorldPoint DTO: ${validation.errors.map(e => e.message).join(', ')}`)
    }
    return new WorldPoint(
      dto.id,
      dto.name,
      dto.xyz,
      dto.xyzProvenance,
      dto.color,
      dto.isVisible,
      dto.isOrigin,
      dto.isLocked,
      dto.lockedAxes,
      dto.group,
      dto.tags || [],
      dto.createdAt,
      dto.updatedAt
    )
  }

  static create(
    id: PointId,
    name: string,
    options: {
      xyz?: [number | null, number | null, number | null]
      xyzProvenance?: ValueProvenance
      color?: string
      isVisible?: boolean
      isOrigin?: boolean
      isLocked?: boolean
      lockedAxes?: AxisLock
      group?: string
      tags?: string[]
    } = {}
  ): WorldPoint {
    const now = new Date().toISOString()
    return new WorldPoint(
      id,
      name,
      options.xyz,
      options.xyzProvenance,
      options.color || '#ffffff',
      options.isVisible ?? true,
      options.isOrigin ?? false,
      options.isLocked ?? false,
      options.lockedAxes,
      options.group,
      options.tags || [],
      now,
      now
    )
  }

  // Serialization
  toDTO(): WorldPointDto {
    return {
      id: this._id,
      name: this._name,
      xyz: this._xyz,
      xyzProvenance: this._xyzProvenance,
      color: this._color,
      isVisible: this._isVisible,
      isOrigin: this._isOrigin,
      isLocked: this._isLocked,
      lockedAxes: this._lockedAxes,
      group: this._group,
      tags: [...this._tags],
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    }
  }

  // ISelectable implementation
  getId(): PointId {
    return this._id
  }

  getType(): SelectableType {
    return 'point'
  }

  getName(): string {
    return this._name
  }

  isVisible(): boolean {
    return this._isVisible
  }

  /**
   * Check if point is locked (backward compatible - returns true if any axis is locked).
   */
  isLocked(): boolean {
    // If using new per-axis locking, check if any axis is locked
    if (this._lockedAxes) {
      return this._lockedAxes.x === true || this._lockedAxes.y === true || this._lockedAxes.z === true
    }
    // Fall back to legacy isLocked
    return this._isLocked
  }

  /**
   * Check if X axis is locked.
   */
  isXLocked(): boolean {
    return this._lockedAxes?.x === true || (this._isLocked && !this._lockedAxes)
  }

  /**
   * Check if Y axis is locked.
   */
  isYLocked(): boolean {
    return this._lockedAxes?.y === true || (this._isLocked && !this._lockedAxes)
  }

  /**
   * Check if Z axis is locked.
   */
  isZLocked(): boolean {
    return this._lockedAxes?.z === true || (this._isLocked && !this._lockedAxes)
  }

  getDependencies(): EntityId[] {
    return this._relationshipManager.getDependencies() as EntityId[]
  }

  getDependents(): EntityId[] {
    return this._relationshipManager.getDependents() as EntityId[]
  }

  isSelected(): boolean {
    return this._selected
  }

  setSelected(selected: boolean): void {
    this._selected = selected
  }

  canDelete(): boolean {
    return this._relationshipManager.canDelete()
  }

  getDeleteWarning(): string | null {
    return this._relationshipManager.getDeleteWarning()
  }

  // IValidatable implementation
  validate(context: ValidationContext): ValidationResult {
    return WorldPointValidator.validateWorldPoint(this._id, this._name, this._xyz, this._color)
  }

  // Domain getters/setters
  get name(): string {
    return this._name
  }

  set name(value: string) {
    this._name = value
    this.updateTimestamp()
  }

  get xyz(): [number | null, number | null, number | null] | undefined {
    return this._xyz ? [...this._xyz] : undefined
  }

  set xyz(value: [number | null, number | null, number | null] | undefined) {
    this._xyz = value ? [...value] : undefined
    this.updateTimestamp()
  }

  get color(): string {
    return this._color
  }

  set color(value: string) {
    this._color = value
    this.updateTimestamp()
  }

  get isOrigin(): boolean {
    return this._isOrigin
  }

  set isOrigin(value: boolean) {
    this._isOrigin = value
    this.updateTimestamp()
  }

  get group(): string | undefined {
    return this._group
  }

  set group(value: string | undefined) {
    this._group = value
    this.updateTimestamp()
  }

  get tags(): string[] {
    return [...this._tags]
  }

  set tags(value: string[]) {
    this._tags = [...value]
    this.updateTimestamp()
  }

  get createdAt(): string {
    return this._createdAt
  }

  get updatedAt(): string {
    return this._updatedAt
  }

  // Relationship accessors (delegated to RelationshipManager)
  get connectedLines(): ILine[] {
    return this._relationshipManager.connectedLines
  }

  get referencingConstraints(): IConstraint[] {
    return this._relationshipManager.referencingConstraints
  }

  get connectedPoints(): IWorldPoint[] {
    return this._relationshipManager.getConnectedPoints(this)
  }

  // Relationship management (delegated to RelationshipManager)
  addConnectedLine(line: ILine): void {
    this._relationshipManager.addConnectedLine(line)
  }

  removeConnectedLine(line: ILine): void {
    this._relationshipManager.removeConnectedLine(line)
  }

  addReferencingConstraint(constraint: IConstraint): void {
    this._relationshipManager.addReferencingConstraint(constraint)
  }

  removeReferencingConstraint(constraint: IConstraint): void {
    this._relationshipManager.removeReferencingConstraint(constraint)
  }

  // Backward compatibility - return IDs
  getConnectedLineIds(): EntityId[] {
    return this._relationshipManager.getConnectedLineIds() as EntityId[]
  }

  getReferencingConstraintIds(): EntityId[] {
    return this._relationshipManager.getReferencingConstraintIds() as EntityId[]
  }

  // Geometric methods (delegated to WorldPointGeometry)
  hasCoordinates(): boolean {
    return this._xyz !== undefined &&
           this._xyz[0] !== null &&
           this._xyz[1] !== null &&
           this._xyz[2] !== null
  }

  // Get fully-defined coordinates (all non-null), or undefined
  getDefinedCoordinates(): [number, number, number] | undefined {
    if (!this.hasCoordinates()) {
      return undefined
    }
    return this._xyz as [number, number, number]
  }

  distanceTo(other: WorldPoint): number | null {
    const thisXyz = this.getDefinedCoordinates()
    const otherXyz = other.getDefinedCoordinates()
    if (!thisXyz || !otherXyz) {
      return null
    }
    return WorldPointGeometry.distanceBetween(thisXyz, otherXyz)
  }

  getCentroidWithConnected(): [number, number, number] | null {
    const thisXyz = this.getDefinedCoordinates()
    if (!thisXyz) {
      return null
    }

    const connectedPoints = this.connectedPoints
      .map(p => p.getDefinedCoordinates())
      .filter((xyz): xyz is [number, number, number] => xyz !== undefined)

    const allPoints = [thisXyz, ...connectedPoints]

    return WorldPointGeometry.calculateCentroid(allPoints)
  }

  isColinearWith(pointA: WorldPoint, pointB: WorldPoint, tolerance: number = 1e-6): boolean {
    const thisXyz = this.getDefinedCoordinates()
    const aXyz = pointA.getDefinedCoordinates()
    const bXyz = pointB.getDefinedCoordinates()

    if (!thisXyz || !aXyz || !bXyz) {
      return false
    }
    return WorldPointGeometry.areCollinear(thisXyz, aXyz, bXyz, tolerance)
  }

  // Connection analysis (delegated to RelationshipManager)
  getDegree(): number {
    return this._relationshipManager.getDegree()
  }

  isIsolated(): boolean {
    return this._relationshipManager.isIsolated()
  }

  isVertex(): boolean {
    return this._relationshipManager.isVertex()
  }

  isJunction(): boolean {
    return this._relationshipManager.isJunction()
  }

  // Provenance and locking accessors
  get xyzProvenance(): ValueProvenance | undefined {
    return this._xyzProvenance
  }

  get lockedAxes(): AxisLock | undefined {
    return this._lockedAxes ? { ...this._lockedAxes } : undefined
  }

  // Utility methods
  clone(newId: PointId, newName?: string): WorldPoint {
    const now = new Date().toISOString()
    return new WorldPoint(
      newId,
      newName || `${this._name} (copy)`,
      this._xyz ? [...this._xyz] : undefined,
      this._xyzProvenance,
      this._color,
      this._isVisible,
      this._isOrigin,
      this._isLocked,
      this._lockedAxes ? { ...this._lockedAxes } : undefined,
      this._group,
      [...this._tags],
      now,
      now
    )
  }

  setVisible(visible: boolean): void {
    this._isVisible = visible
    this.updateTimestamp()
  }

  /**
   * Set locked state for all axes (backward compatible).
   */
  setLocked(locked: boolean): void {
    this._isLocked = locked
    // Clear per-axis locks if setting global lock
    if (locked) {
      this._lockedAxes = undefined
    }
    this.updateTimestamp()
  }

  /**
   * Set per-axis locking.
   */
  setLockedAxes(lockedAxes: AxisLock | undefined): void {
    this._lockedAxes = lockedAxes ? { ...lockedAxes } : undefined
    // Clear legacy lock if using per-axis
    if (lockedAxes) {
      this._isLocked = false
    }
    this.updateTimestamp()
  }

  /**
   * Apply optimization results and mark coordinates as optimized.
   * Supports both old signature (for backward compatibility) and new signature with ValueMap.
   */
  applyOptimizationResult(result: { xyz: [number, number, number], residual?: number }): void {
    this._xyz = [...result.xyz] as [number | null, number | null, number | null]

    // Mark as optimized with provenance
    this._xyzProvenance = {
      source: 'optimized',
      timestamp: new Date(),
      metadata: {
        residual: result.residual,
      },
    }

    this.updateTimestamp()
  }

  private updateTimestamp(): void {
    this._updatedAt = new Date().toISOString()
  }

  // IValueMapContributor implementation
  /**
   * Add this point to the ValueMap for optimization.
   * Locked axes become constants (V.C), unlocked axes become variables (V.W).
   *
   * @param valueMap - The ValueMap to add this point to
   * @returns Array of Value objects that are optimization variables (unlocked axes only)
   */
  addToValueMap(valueMap: ValueMap): Value[] {
    const coords = this.getDefinedCoordinates()
    if (!coords) {
      // Point has no coordinates - skip
      return []
    }

    const variables: Value[] = []

    // Create Value for each axis - constant if locked, variable if unlocked
    const xLocked = this.isXLocked()
    const yLocked = this.isYLocked()
    const zLocked = this.isZLocked()

    const x = xLocked ? V.C(coords[0]) : V.W(coords[0])
    const y = yLocked ? V.C(coords[1]) : V.W(coords[1])
    const z = zLocked ? V.C(coords[2]) : V.W(coords[2])

    // Build Vec3 and add to map
    const vec = new Vec3(x, y, z)
    valueMap.points.set(this, vec)

    // Only return unlocked axes as variables
    if (!xLocked) variables.push(x)
    if (!yLocked) variables.push(y)
    if (!zLocked) variables.push(z)

    return variables
  }

  /**
   * Compute residuals for this point.
   * WorldPoint has no intrinsic constraints (point position is defined by external constraints).
   *
   * @param _valueMap - The ValueMap (unused)
   * @returns Empty array - no intrinsic residuals
   */
  computeResiduals(_valueMap: ValueMap): Value[] {
    return []
  }

  /**
   * Apply optimization results from ValueMap.
   * Extracts solved coordinates and marks them as optimized.
   *
   * @param valueMap - The ValueMap with solved values
   */
  applyOptimizationResultFromValueMap(valueMap: ValueMap): void {
    const vec = valueMap.points.get(this)
    if (!vec) {
      return
    }

    // Extract solved coordinates
    const xyz: [number, number, number] = [vec.x.data, vec.y.data, vec.z.data]

    // Compute and store residuals from intrinsic constraints
    const residuals = this.computeResiduals(valueMap)
    this._lastResiduals = residuals.map(r => r.data)

    // Use existing method which sets provenance
    this.applyOptimizationResult({ xyz })
  }

  /**
   * Get the last computed residuals from intrinsic constraints.
   * These are stored after each optimization run.
   *
   * @returns Array of residual values (should be near zero if well-optimized)
   */
  getLastResiduals(): number[] {
    return [...this._lastResiduals]
  }

  /**
   * Get optimization information for this point
   *
   * @returns Object with optimized values and residuals
   */
  getOptimizationInfo() {
    const residuals = this.getLastResiduals()
    const totalResidual = residuals.length > 0
      ? Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0))
      : 0

    return {
      // Optimized values
      position: this.xyz,
      provenance: this._xyzProvenance,

      // Residuals
      residuals: residuals,
      totalResidual: totalResidual,
      rmsResidual: residuals.length > 0 ? totalResidual / Math.sqrt(residuals.length) : 0,

      // Metadata
      isOptimized: this._xyzProvenance?.source === 'optimized',
      lastOptimizedAt: this._xyzProvenance?.timestamp,
    }
  }
}