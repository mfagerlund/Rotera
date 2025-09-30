// Core WorldPoint domain class - refactored with composition

import type { PointId, EntityId } from '../../types/ids'
import type { ISelectable, SelectableType } from '../../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult } from '../../validation/validator'
import { WorldPointDto } from './WorldPointDto'
import { WorldPointValidator } from './WorldPointValidation'
import { WorldPointGeometry } from './WorldPointGeometry'
import { WorldPointRelationshipManager, type ILine, type IConstraint, type IWorldPoint } from './WorldPointRelationships'

export class WorldPoint implements ISelectable, IValidatable, IWorldPoint {
  private _selected = false
  private _relationshipManager: WorldPointRelationshipManager

  private constructor(
    private _id: PointId,
    private _name: string,
    private _xyz: [number | null, number | null, number | null] | undefined,
    private _color: string,
    private _isVisible: boolean,
    private _isOrigin: boolean,
    private _isLocked: boolean,
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
      dto.color,
      dto.isVisible,
      dto.isOrigin,
      dto.isLocked,
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
      color?: string
      isVisible?: boolean
      isOrigin?: boolean
      isLocked?: boolean
      group?: string
      tags?: string[]
    } = {}
  ): WorldPoint {
    const now = new Date().toISOString()
    return new WorldPoint(
      id,
      name,
      options.xyz,
      options.color || '#ffffff',
      options.isVisible ?? true,
      options.isOrigin ?? false,
      options.isLocked ?? false,
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
      color: this._color,
      isVisible: this._isVisible,
      isOrigin: this._isOrigin,
      isLocked: this._isLocked,
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

  isLocked(): boolean {
    return this._isLocked
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

  // Utility methods
  clone(newId: PointId, newName?: string): WorldPoint {
    const now = new Date().toISOString()
    return new WorldPoint(
      newId,
      newName || `${this._name} (copy)`,
      this._xyz ? [...this._xyz] : undefined,
      this._color,
      this._isVisible,
      this._isOrigin,
      this._isLocked,
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

  setLocked(locked: boolean): void {
    this._isLocked = locked
    this.updateTimestamp()
  }

  applyOptimizationResult(result: { xyz: [number, number, number], residual?: number }): void {
    this._xyz = [...result.xyz] as [number | null, number | null, number | null]
    this.updateTimestamp()
  }

  private updateTimestamp(): void {
    this._updatedAt = new Date().toISOString()
  }
}