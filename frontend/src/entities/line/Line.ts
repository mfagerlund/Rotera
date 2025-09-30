// Core Line domain class - refactored with composition

import type { LineId, EntityId } from '../../types/ids'
import type { ISelectable, SelectableType } from '../../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult } from '../../validation/validator'
import type { WorldPoint, IConstraint } from '../world-point'
import type { ILine } from '../world-point/WorldPointRelationships'
import { LineDto, LineDirection, LineConstraintSettings } from './LineDto'
import { LineValidator } from './LineValidation'
import { LineGeometry } from './LineGeometry'
import { LineRelationshipManager } from './LineRelationships'

// Line implements ILine interface for WorldPoint compatibility
export class Line implements ISelectable, IValidatable, ILine {
  private _selected = false
  private _relationshipManager: LineRelationshipManager

  private constructor(
    private _id: LineId,
    private _name: string,
    private _pointA: WorldPoint,
    private _pointB: WorldPoint,
    private _color: string,
    private _isVisible: boolean,
    private _isConstruction: boolean,
    private _lineStyle: 'solid' | 'dashed' | 'dotted',
    private _thickness: number,
    private _constraints: LineConstraintSettings,
    private _group: string | undefined,
    private _tags: string[], // TODO: Remove completely
    private _createdAt: string,
    private _updatedAt: string
  ) {
    // Initialize relationship manager
    this._relationshipManager = new LineRelationshipManager(this._pointA, this._pointB, this)
  }

  // Factory methods
  static fromDTO(dto: LineDto, pointA: WorldPoint, pointB: WorldPoint): Line {
    const validation = LineValidator.validateDto(dto)
    if (!validation.isValid) {
      throw new Error(`Invalid Line DTO: ${validation.errors.map(e => e.message).join(', ')}`)
    }
    return new Line(
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

  static create(
    id: LineId,
    name: string,
    pointA: WorldPoint,
    pointB: WorldPoint,
    options: {
      color?: string
      isVisible?: boolean
      isConstruction?: boolean
      lineStyle?: 'solid' | 'dashed' | 'dotted'
      thickness?: number
      constraints?: LineConstraintSettings
      group?: string
      tags?: string[]
    } = {}
  ): Line {
    const now = new Date().toISOString()
    const defaultConstraints: LineConstraintSettings = {
      direction: 'free',
      tolerance: 0.001
    }
    return new Line(
      id,
      name,
      pointA,
      pointB,
      options.color || '#ffffff',
      options.isVisible ?? true,
      options.isConstruction ?? false,
      options.lineStyle || 'solid',
      options.thickness || 1,
      options.constraints || defaultConstraints,
      options.group,
      options.tags || [],
      now,
      now
    )
  }

  // Serialization
  toDTO(): LineDto {
    return {
      id: this._id,
      name: this._name,
      pointA: this._pointA.getId(),
      pointB: this._pointB.getId(),
      color: this._color,
      isVisible: this._isVisible,
      isConstruction: this._isConstruction,
      lineStyle: this._lineStyle,
      thickness: this._thickness,
      constraints: { ...this._constraints },
      group: this._group,
      tags: [...this._tags],
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    }
  }

  // ISelectable implementation
  getId(): LineId {
    return this._id
  }

  getType(): SelectableType {
    return 'line'
  }

  getName(): string {
    return this._name
  }

  isVisible(): boolean {
    return this._isVisible
  }

  isLocked(): boolean {
    // Lines are locked if either point is locked
    return this._pointA.isLocked() || this._pointB.isLocked()
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
    return LineValidator.validateLine(
      this._id,
      this._name,
      this._pointA,
      this._pointB,
      this._color,
      this._thickness
    )
  }

  // Domain getters/setters
  get name(): string {
    return this._name
  }

  set name(value: string) {
    this._name = value
    this.updateTimestamp()
  }

  get pointA(): WorldPoint {
    return this._pointA
  }

  get pointB(): WorldPoint {
    return this._pointB
  }

  get points(): [WorldPoint, WorldPoint] {
    return this._relationshipManager.points
  }

  get referencingConstraints(): IConstraint[] {
    return this._relationshipManager.referencingConstraints
  }

  get color(): string {
    return this._color
  }

  set color(value: string) {
    this._color = value
    this.updateTimestamp()
  }

  get isConstruction(): boolean {
    return this._isConstruction
  }

  set isConstruction(value: boolean) {
    this._isConstruction = value
    this.updateTimestamp()
  }

  get lineStyle(): 'solid' | 'dashed' | 'dotted' {
    return this._lineStyle
  }

  set lineStyle(value: 'solid' | 'dashed' | 'dotted') {
    this._lineStyle = value
    this.updateTimestamp()
  }

  get thickness(): number {
    return this._thickness
  }

  set thickness(value: number) {
    if (value <= 0) {
      throw new Error('Thickness must be greater than 0')
    }
    this._thickness = value
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

  // Constraint properties
  get constraints(): LineConstraintSettings {
    return { ...this._constraints }
  }

  set constraints(value: LineConstraintSettings) {
    this._constraints = { ...value }
    this.updateTimestamp()
  }

  get direction(): LineDirection {
    return this._constraints.direction
  }

  set direction(value: LineDirection) {
    this._constraints.direction = value
    this.updateTimestamp()
  }

  get hasDistanceConstraint(): boolean {
    return this._constraints.targetLength !== undefined
  }

  get targetLength(): number | undefined {
    return this._constraints.targetLength
  }

  set targetLength(value: number | undefined) {
    this._constraints.targetLength = value
    this.updateTimestamp()
  }

  get constraintTolerance(): number {
    return this._constraints.tolerance ?? 0.001
  }

  set constraintTolerance(value: number) {
    if (value < 0) {
      throw new Error('Constraint tolerance must be non-negative')
    }
    this._constraints.tolerance = value
    this.updateTimestamp()
  }

  // Constraint evaluation methods
  isDirectionConstrained(): boolean {
    return this._constraints.direction !== 'free'
  }

  isDistanceConstrained(): boolean {
    return this._constraints.targetLength !== undefined
  }

  isHorizontal(): boolean {
    return this._constraints.direction === 'horizontal'
  }

  isVertical(): boolean {
    return this._constraints.direction === 'vertical'
  }

  isXAligned(): boolean {
    return this._constraints.direction === 'x-aligned'
  }

  isZAligned(): boolean {
    return this._constraints.direction === 'z-aligned'
  }

  isAxisAligned(): boolean {
    return this._constraints.direction !== 'free'
  }

  hasFixedLength(): boolean {
    return this._constraints.targetLength !== undefined
  }

  // Constraint satisfaction check
  satisfiesConstraints(tolerance?: number): { satisfied: boolean; violations: string[] } {
    const violations: string[] = []
    const tol = tolerance ?? this.constraintTolerance

    // Check direction constraints
    if (this.isDirectionConstrained()) {
      const dir = this.getDirection()
      if (dir) {
        const [dx, dy, dz] = dir

        switch (this._constraints.direction) {
          case 'horizontal':
            if (Math.abs(dy) > tol || Math.abs(dz) > tol) {
              violations.push('Line is not horizontal')
            }
            break
          case 'vertical':
            if (Math.abs(dx) > tol || Math.abs(dz) > tol) {
              violations.push('Line is not vertical')
            }
            break
          case 'x-aligned':
            if (Math.abs(dy) > tol || Math.abs(dz) > tol) {
              violations.push('Line is not X-axis aligned')
            }
            break
          case 'z-aligned':
            if (Math.abs(dx) > tol || Math.abs(dy) > tol) {
              violations.push('Line is not Z-axis aligned')
            }
            break
        }
      }
    }

    // Check distance constraints
    if (this.hasFixedLength()) {
      const currentLength = this.length()
      if (currentLength !== null && this._constraints.targetLength !== undefined) {
        const lengthDiff = Math.abs(currentLength - this._constraints.targetLength)
        if (lengthDiff > tol) {
          violations.push(`Line length ${currentLength.toFixed(3)} does not match target ${this._constraints.targetLength.toFixed(3)}`)
        }
      }
    }

    return {
      satisfied: violations.length === 0,
      violations
    }
  }

  // Geometric methods (delegated to LineGeometry)
  length(): number | null {
    return LineGeometry.calculateLength(this._pointA, this._pointB)
  }

  getDirection(): [number, number, number] | null {
    return LineGeometry.getDirection(this._pointA, this._pointB)
  }

  getMidpoint(): [number, number, number] | null {
    return LineGeometry.getMidpoint(this._pointA, this._pointB)
  }

  containsPoint(point: [number, number, number], tolerance: number = 1e-6): boolean {
    return LineGeometry.containsPoint(this._pointA, this._pointB, point, tolerance)
  }

  distanceToPoint(point: [number, number, number]): number | null {
    return LineGeometry.distanceToPoint(this._pointA, this._pointB, point)
  }

  // Relationship methods (delegated to LineRelationshipManager)
  addReferencingConstraint(constraint: IConstraint): void {
    this._relationshipManager.addReferencingConstraint(constraint)
  }

  removeReferencingConstraint(constraint: IConstraint): void {
    this._relationshipManager.removeReferencingConstraint(constraint)
  }

  connectsTo(point: WorldPoint): boolean {
    return this._relationshipManager.connectsTo(point)
  }

  getOtherPoint(point: WorldPoint): WorldPoint | null {
    return this._relationshipManager.getOtherPoint(point)
  }

  // Utility methods
  clone(newId: LineId, newName?: string): Line {
    const now = new Date().toISOString()
    return new Line(
      newId,
      newName || `${this._name} (copy)`,
      this._pointA,
      this._pointB,
      this._color,
      this._isVisible,
      this._isConstruction,
      this._lineStyle,
      this._thickness,
      { ...this._constraints },
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

  cleanup(): void {
    this._relationshipManager.cleanup()
  }

  private updateTimestamp(): void {
    this._updatedAt = new Date().toISOString()
  }
}