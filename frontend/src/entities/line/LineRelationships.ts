// Line relationship management

import type { WorldPoint, IConstraint, ILine } from '../world-point'

export class LineRelationshipManager {
  private _referencingConstraints: Set<IConstraint> = new Set()

  constructor(
    private _pointA: WorldPoint,
    private _pointB: WorldPoint,
    private _line: ILine
  ) {
    // Establish bidirectional relationships with points
    this._pointA.addConnectedLine(this._line)
    this._pointB.addConnectedLine(this._line)
  }

  // Constraint relationship management
  addReferencingConstraint(constraint: IConstraint): void {
    this._referencingConstraints.add(constraint)
  }

  removeReferencingConstraint(constraint: IConstraint): void {
    this._referencingConstraints.delete(constraint)
  }

  get referencingConstraints(): IConstraint[] {
    return Array.from(this._referencingConstraints)
  }

  // Point relationship queries
  connectsTo(point: WorldPoint): boolean {
    return this._pointA === point || this._pointB === point
  }

  getOtherPoint(point: WorldPoint): WorldPoint | null {
    if (this._pointA === point) {
      return this._pointB
    } else if (this._pointB === point) {
      return this._pointA
    }
    return null
  }

  // Dependency management
  getDependencies(): string[] {
    // Lines depend on their two points
    return [this._pointA.getId(), this._pointB.getId()]
  }

  getDependents(): string[] {
    // Return IDs of dependent entities
    const dependents: string[] = []
    this._referencingConstraints.forEach(constraint => dependents.push(constraint.getId()))
    return dependents
  }

  // Deletion checks
  canDelete(): boolean {
    // Can delete if no other entities depend on this line
    return this._referencingConstraints.size === 0
  }

  getDeleteWarning(): string | null {
    if (this._referencingConstraints.size === 0) {
      return null
    }

    return `Deleting this line will also delete ${this._referencingConstraints.size} constraint${this._referencingConstraints.size === 1 ? '' : 's'}`
  }

  // Cleanup method called when line is deleted
  cleanup(): void {
    // Remove self from points
    this._pointA.removeConnectedLine(this._line)
    this._pointB.removeConnectedLine(this._line)
  }

  // Point accessors
  get pointA(): WorldPoint {
    return this._pointA
  }

  get pointB(): WorldPoint {
    return this._pointB
  }

  get points(): [WorldPoint, WorldPoint] {
    return [this._pointA, this._pointB]
  }
}