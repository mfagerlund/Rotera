// WorldPoint relationship management

// Forward declarations to avoid circular dependencies
export interface IWorldPoint {
  getId(): string
  getName(): string
  hasCoordinates(): boolean
  xyz?: [number, number, number]
}

export interface ILine {
  getId(): string
  pointA: IWorldPoint
  pointB: IWorldPoint
}

export interface IConstraint {
  getId(): string
}

export class WorldPointRelationshipManager {
  private _connectedLines: Set<ILine> = new Set()
  private _referencingConstraints: Set<IConstraint> = new Set()

  // Line relationship management
  addConnectedLine(line: ILine): void {
    this._connectedLines.add(line)
  }

  removeConnectedLine(line: ILine): void {
    this._connectedLines.delete(line)
  }

  get connectedLines(): ILine[] {
    return Array.from(this._connectedLines)
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

  // Get all connected points through lines
  getConnectedPoints(currentPoint: IWorldPoint): IWorldPoint[] {
    const connectedPoints: IWorldPoint[] = []
    const seenPoints = new Set<IWorldPoint>()

    for (const line of this._connectedLines) {
      if (line.pointA !== currentPoint) {
        if (!seenPoints.has(line.pointA)) {
          connectedPoints.push(line.pointA)
          seenPoints.add(line.pointA)
        }
      }
      if (line.pointB !== currentPoint) {
        if (!seenPoints.has(line.pointB)) {
          connectedPoints.push(line.pointB)
          seenPoints.add(line.pointB)
        }
      }
    }

    return connectedPoints
  }

  // Dependency management
  getDependencies(): string[] {
    // Points don't depend on other entities (they're leaf nodes)
    return []
  }

  getDependents(): string[] {
    // Return IDs of connected entities
    const dependents: string[] = []
    this._connectedLines.forEach(line => dependents.push(line.getId()))
    this._referencingConstraints.forEach(constraint => dependents.push(constraint.getId()))
    return dependents
  }

  // Deletion checks
  canDelete(): boolean {
    // Can delete if no other entities depend on this point
    return this._connectedLines.size === 0 && this._referencingConstraints.size === 0
  }

  getDeleteWarning(): string | null {
    if (this._connectedLines.size === 0 && this._referencingConstraints.size === 0) {
      return null
    }

    const parts: string[] = []
    if (this._connectedLines.size > 0) {
      parts.push(`${this._connectedLines.size} line${this._connectedLines.size === 1 ? '' : 's'}`)
    }
    if (this._referencingConstraints.size > 0) {
      parts.push(`${this._referencingConstraints.size} constraint${this._referencingConstraints.size === 1 ? '' : 's'}`)
    }

    return `Deleting this point will also delete ${parts.join(' and ')}`
  }

  // Backward compatibility - return IDs
  getConnectedLineIds(): string[] {
    return Array.from(this._connectedLines).map(line => line.getId())
  }

  getReferencingConstraintIds(): string[] {
    return Array.from(this._referencingConstraints).map(constraint => constraint.getId())
  }

  // Connection analysis
  getDegree(): number {
    return this._connectedLines.size
  }

  isIsolated(): boolean {
    return this.getDegree() === 0
  }

  isVertex(): boolean {
    return this.getDegree() === 2
  }

  isJunction(): boolean {
    return this.getDegree() >= 3
  }
}