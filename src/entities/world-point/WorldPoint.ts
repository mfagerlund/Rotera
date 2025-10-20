import type {ISelectable, SelectableType} from '../../types/selectable'
import type {IValueMapContributor, ValueMap} from '../../optimization/IOptimizable'
import type {IWorldPoint, ILine, IConstraint, IImagePoint} from '../interfaces'
import {V, Value, Vec3} from 'scalar-autograd'


export class WorldPoint implements ISelectable, IWorldPoint, IValueMapContributor, IWorldPoint {
    selected = false
    connectedLines: Set<ILine> = new Set()
    referencingConstraints: Set<IConstraint> = new Set()
    imagePoints: Set<IImagePoint> = new Set()
    lastResiduals: number[] = []
    name: string
    lockedXyz: [number | null, number | null, number | null]
    optimizedXyz?: [number, number, number]
    color: string
    isVisible: boolean
    isOrigin: boolean

    private constructor(
        name: string,
        lockedXyz: [number | null, number | null, number | null],
        color: string,
        isVisible: boolean,
        isOrigin: boolean,
        optimizedXyz?: [number, number, number],
    ) {
        this.name = name
        this.lockedXyz = lockedXyz
        this.color = color
        this.isVisible = isVisible
        this.isOrigin = isOrigin
        this.optimizedXyz = optimizedXyz
    }

    // ============================================================================
    // Factory methods
    // ============================================================================

    /**
     * @internal Used only by Serialization class - do not use directly
     */
    static createFromSerialized(
        name: string,
        lockedXyz: [number | null, number | null, number | null],
        color: string,
        isVisible: boolean,
        isOrigin: boolean,
        optimizedXyz?: [number, number, number]
    ): WorldPoint {
        return new WorldPoint(
            name,
            lockedXyz,
            color,
            isVisible,
            isOrigin,
            optimizedXyz
        )
    }

    static create(
        name: string,
        options: {
            lockedXyz: [number | null, number | null, number | null]
            color?: string
            isVisible?: boolean
            isOrigin?: boolean
            optimizedXyz?: [number, number, number]
        } = {
            lockedXyz: [null, null, null],
            optimizedXyz: undefined
        }
    ): WorldPoint {
        return new WorldPoint(
            name,
            options.lockedXyz,
            options.color || '#ffffff',
            options.isVisible ?? true,
            options.isOrigin ?? false,
            options.optimizedXyz
        )
    }

    // ============================================================================
    // ISelectable implementation
    // ============================================================================

    getType(): SelectableType {
        return 'point'
    }

    getName(): string {
        return this.name
    }

    isLocked(): boolean {
        if (this.lockedXyz) {
            return this.lockedXyz[0] !== null || this.lockedXyz[1] !== null || this.lockedXyz[2] !== null
        }
        return false
    }

    isXLocked(): boolean {
        return this.lockedXyz[0] !== null
    }

    isYLocked(): boolean {
        return this.lockedXyz[1] !== null
    }

    isZLocked(): boolean {
        return this.lockedXyz[2] !== null
    }

    isSelected(): boolean {
        return this.selected
    }

    setSelected(selected: boolean): void {
        this.selected = selected
    }

    canDelete(): boolean {
        return this.connectedLines.size === 0 && this.referencingConstraints.size === 0
    }

    getDeleteWarning(): string | null {
        if (this.connectedLines.size === 0 && this.referencingConstraints.size === 0) {
            return null
        }

        const parts: string[] = []
        if (this.connectedLines.size > 0) {
            parts.push(`${this.connectedLines.size} line${this.connectedLines.size === 1 ? '' : 's'}`)
        }
        if (this.referencingConstraints.size > 0) {
            parts.push(`${this.referencingConstraints.size} constraint${this.referencingConstraints.size === 1 ? '' : 's'}`)
        }

        return `Deleting this point will also delete ${parts.join(' and ')}`
    }

    // ============================================================================
    // Relationship management
    // ============================================================================
    addConnectedLine(line: ILine): void {
        this.connectedLines.add(line)
    }

    removeConnectedLine(line: ILine): void {
        this.connectedLines.delete(line)
    }

    addReferencingConstraint(constraint: IConstraint): void {
        this.referencingConstraints.add(constraint)
    }

    removeReferencingConstraint(constraint: IConstraint): void {
        this.referencingConstraints.delete(constraint)
    }

    addImagePoint(imagePoint: IImagePoint): void {
        this.imagePoints.add(imagePoint)
    }

    removeImagePoint(imagePoint: IImagePoint): void {
        this.imagePoints.delete(imagePoint)
    }

    getDegree(): number {
        return this.connectedLines.size
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

    // ============================================================================
    // Geometric methods (inlined from WorldPointGeometry)
    // ============================================================================

    hasCoordinates(): boolean {
        return this.lockedXyz !== undefined &&
            this.lockedXyz[0] !== null &&
            this.lockedXyz[1] !== null &&
            this.lockedXyz[2] !== null
    }

    distanceTo(other: WorldPoint): number | null {
        const thisXyz = this.optimizedXyz;
        const otherXyz = other.optimizedXyz;
        if (!thisXyz || !otherXyz) {
            return null
        }
        return WorldPoint.distanceBetween(thisXyz, otherXyz)
    }
    
    // ============================================================================
    // Static geometry utility methods
    // ============================================================================

    static distanceBetween(
        pointA: [number, number, number],
        pointB: [number, number, number]
    ): number {
        const [x1, y1, z1] = pointA
        const [x2, y2, z2] = pointB

        return Math.sqrt(
            Math.pow(x2 - x1, 2) +
            Math.pow(y2 - y1, 2) +
            Math.pow(z2 - z1, 2)
        )
    }

    static calculateCentroid(points: Array<[number, number, number]>): [number, number, number] | null {
        if (points.length === 0) return null

        let sumX = 0, sumY = 0, sumZ = 0
        for (const [x, y, z] of points) {
            sumX += x
            sumY += y
            sumZ += z
        }

        return [
            sumX / points.length,
            sumY / points.length,
            sumZ / points.length
        ]
    }

    static areCollinear(
        pointA: [number, number, number],
        pointB: [number, number, number],
        pointC: [number, number, number],
        tolerance: number = 1e-6
    ): boolean {
        const [x1, y1, z1] = pointA
        const [x2, y2, z2] = pointB
        const [x3, y3, z3] = pointC

        // Calculate cross product vectors
        const v1 = [x2 - x1, y2 - y1, z2 - z1]
        const v2 = [x3 - x1, y3 - y1, z3 - z1]

        // Cross product
        const cross = [
            v1[1] * v2[2] - v1[2] * v2[1],
            v1[2] * v2[0] - v1[0] * v2[2],
            v1[0] * v2[1] - v1[1] * v2[0]
        ]

        const magnitude = Math.sqrt(cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2)
        return magnitude < tolerance
    }

    static calculateAngle(
        pointA: [number, number, number],
        vertex: [number, number, number],
        pointC: [number, number, number]
    ): number {
        const [x1, y1, z1] = pointA
        const [x2, y2, z2] = vertex
        const [x3, y3, z3] = pointC

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

    static projectOntoPlane(
        point: [number, number, number],
        planePoint: [number, number, number],
        planeNormal: [number, number, number]
    ): [number, number, number] {
        const [px, py, pz] = point
        const [planePx, planePy, planePz] = planePoint
        const [nx, ny, nz] = planeNormal

        // Vector from plane point to the point
        const vec = [px - planePx, py - planePy, pz - planePz]

        // Dot product of vector with normal
        const dot = vec[0] * nx + vec[1] * ny + vec[2] * nz

        // Normal magnitude squared
        const normalMagSquared = nx * nx + ny * ny + nz * nz

        if (normalMagSquared === 0) {
            // Degenerate normal, return original point
            return point
        }

        // Project point onto plane
        const projectionFactor = dot / normalMagSquared
        return [
            px - projectionFactor * nx,
            py - projectionFactor * ny,
            pz - projectionFactor * nz
        ]
    }

    static distanceToPlane(
        point: [number, number, number],
        planePoint: [number, number, number],
        planeNormal: [number, number, number]
    ): number {
        const [px, py, pz] = point
        const [planePx, planePy, planePz] = planePoint
        const [nx, ny, nz] = planeNormal

        // Vector from plane point to the point
        const vec = [px - planePx, py - planePy, pz - planePz]

        // Dot product of vector with normal
        const dot = vec[0] * nx + vec[1] * ny + vec[2] * nz

        // Normal magnitude
        const normalMag = Math.sqrt(nx * nx + ny * ny + nz * nz)

        if (normalMag === 0) {
            return 0 // Degenerate normal
        }

        return Math.abs(dot) / normalMag
    }

    static areCoplanar(
        points: Array<[number, number, number]>,
        tolerance: number = 1e-6
    ): boolean {
        if (points.length < 4) {
            return true // Less than 4 points are always coplanar
        }

        // Use first 3 points to define the plane
        const [p1, p2, p3] = points

        // Calculate normal vector using cross product
        const v1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]]
        const v2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]]

        const normal: [number, number, number] = [
            v1[1] * v2[2] - v1[2] * v2[1],
            v1[2] * v2[0] - v1[0] * v2[2],
            v1[0] * v2[1] - v1[1] * v2[0]
        ]

        // Check if all other points lie on the same plane
        for (let i = 3; i < points.length; i++) {
            const distance = this.distanceToPlane(points[i], p1, normal)
            if (distance > tolerance) {
                return false
            }
        }

        return true
    }

    static getBoundingBox(points: Array<[number, number, number]>): {
        min: [number, number, number]
        max: [number, number, number]
        center: [number, number, number]
        size: [number, number, number]
    } | null {
        if (points.length === 0) return null

        let minX = points[0][0], maxX = points[0][0]
        let minY = points[0][1], maxY = points[0][1]
        let minZ = points[0][2], maxZ = points[0][2]

        for (const [x, y, z] of points) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
            if (z < minZ) minZ = z
            if (z > maxZ) maxZ = z
        }

        return {
            min: [minX, minY, minZ],
            max: [maxX, maxY, maxZ],
            center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
            size: [maxX - minX, maxY - minY, maxZ - minZ]
        }
    }

    // ============================================================================
    // Utility methods
    // ============================================================================
    setVisible(visible: boolean): void {
        this.isVisible = visible
    }
    
    applyOptimizationResult(result: { xyz: [number, number, number], residual?: number }): void {
        this.optimizedXyz = [...result.xyz] as [number , number , number ]
    }

    // ============================================================================
    // IValueMapContributor implementation (optimization system)
    // ============================================================================

    /**
     * Add this point to the ValueMap for optimization.
     * Locked axes become constants (V.C), unlocked axes become variables (V.W).
     */
    addToValueMap(valueMap: ValueMap): Value[] {
        const lockedXyz = this.lockedXyz;
        const optimizedXyz = this.optimizedXyz;

        const variables: Value[] = []

        const xLocked = this.isXLocked()
        const yLocked = this.isYLocked()
        const zLocked = this.isZLocked()
        
        const x = xLocked ? V.C(lockedXyz[0]!) : V.W(optimizedXyz![0])
        const y = yLocked ? V.C(lockedXyz[1]!) : V.W(optimizedXyz![1])
        const z = zLocked ? V.C(lockedXyz[2]!) : V.W(optimizedXyz![2])

        const vec = new Vec3(x, y, z)
        valueMap.points.set(this, vec)

        if (!xLocked) variables.push(x)
        if (!yLocked) variables.push(y)
        if (!zLocked) variables.push(z)

        return variables
    }

    computeResiduals(_valueMap: ValueMap): Value[] {
        return []
    }

    /**
     * Apply optimization results from ValueMap.
     */
    applyOptimizationResultFromValueMap(valueMap: ValueMap): void {
        const vec = valueMap.points.get(this)
        if (!vec) {
            return
        }

        const xyz: [number, number, number] = [vec.x.data, vec.y.data, vec.z.data]
        const residuals = this.computeResiduals(valueMap)
        this.lastResiduals = residuals.map(r => r.data)
        this.applyOptimizationResult({xyz})
    }

    getOptimizationInfo() {
        const residuals = this.lastResiduals
        const totalResidual = residuals.length > 0
            ? Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0))
            : 0

        return {
            lockedXyz: this.lockedXyz,
            residuals: residuals,
            totalResidual: totalResidual,
            rmsResidual: residuals.length > 0 ? totalResidual / Math.sqrt(residuals.length) : 0,
            optimizedXyz: this.optimizedXyz
        }
    }
}
