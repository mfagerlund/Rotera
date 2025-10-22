import type {ISelectable, SelectableType} from '../../types/selectable'
import type {IValueMapContributor, ValueMap} from '../../optimization/IOptimizable'
import type {IWorldPoint, ILine, IConstraint, IImagePoint} from '../interfaces'
import {V, Value, Vec3, Vec3Utils} from 'scalar-autograd'
import type { ISerializable } from '../serialization/ISerializable'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { WorldPointDto } from './WorldPointDto'
import {makeAutoObservable} from 'mobx'


export class WorldPoint implements ISelectable, IWorldPoint, IValueMapContributor, IWorldPoint, ISerializable<WorldPointDto> {
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

    private constructor(
        name: string,
        lockedXyz: [number | null, number | null, number | null],
        color: string,
        isVisible: boolean,
        optimizedXyz?: [number, number, number],
    ) {
        this.name = name
        this.lockedXyz = lockedXyz
        this.color = color
        this.isVisible = isVisible
        this.optimizedXyz = optimizedXyz

        makeAutoObservable(this, {}, { autoBind: true })
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
        optimizedXyz?: [number, number, number]
    ): WorldPoint {
        return new WorldPoint(
            name,
            lockedXyz,
            color,
            isVisible,
            optimizedXyz
        )
    }

    static create(
        name: string,
        options: {
            lockedXyz: [number | null, number | null, number | null]
            color?: string
            isVisible?: boolean
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
        return Vec3Utils.distance(pointA, pointB)
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
        const v1 = Vec3Utils.subtract(pointB, pointA)
        const v2 = Vec3Utils.subtract(pointC, pointA)
        const cross = Vec3Utils.cross(v1, v2)
        const magnitude = Vec3Utils.magnitude(cross)
        return magnitude < tolerance
    }

    static calculateAngle(
        pointA: [number, number, number],
        vertex: [number, number, number],
        pointC: [number, number, number]
    ): number {
        const vec1 = Vec3Utils.subtract(pointA, vertex)
        const vec2 = Vec3Utils.subtract(pointC, vertex)
        const angleRad = Vec3Utils.angleBetween(vec1, vec2)
        return angleRad * (180 / Math.PI)
    }

    static projectOntoPlane(
        point: [number, number, number],
        planePoint: [number, number, number],
        planeNormal: [number, number, number]
    ): [number, number, number] {
        const vec = Vec3Utils.subtract(point, planePoint)
        const dotProduct = Vec3Utils.dot(vec, planeNormal)
        const normalMagSquared = Vec3Utils.sqrMagnitude(planeNormal)

        if (normalMagSquared === 0) {
            return point
        }

        const projectionFactor = dotProduct / normalMagSquared
        const offset = Vec3Utils.scale(planeNormal, projectionFactor)
        return Vec3Utils.subtract(point, offset)
    }

    static distanceToPlane(
        point: [number, number, number],
        planePoint: [number, number, number],
        planeNormal: [number, number, number]
    ): number {
        const vec = Vec3Utils.subtract(point, planePoint)
        const dotProduct = Vec3Utils.dot(vec, planeNormal)
        const normalMag = Vec3Utils.magnitude(planeNormal)

        if (normalMag === 0) {
            return 0
        }

        return Math.abs(dotProduct) / normalMag
    }

    static areCoplanar(
        points: Array<[number, number, number]>,
        tolerance: number = 1e-6
    ): boolean {
        if (points.length < 4) {
            return true
        }

        const [p1, p2, p3] = points
        const v1 = Vec3Utils.subtract(p2, p1)
        const v2 = Vec3Utils.subtract(p3, p1)
        const normal = Vec3Utils.cross(v1, v2)

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

    serialize(context: SerializationContext): WorldPointDto {
        const id = context.getEntityId(this) || context.registerEntity(this)

        return {
            id,
            name: this.name,
            lockedXyz: [...this.lockedXyz] as [number | null, number | null, number | null],
            optimizedXyz: this.optimizedXyz ? [...this.optimizedXyz] as [number, number, number] : undefined,
            color: this.color,
            isVisible: this.isVisible
        }
    }

    static deserialize(dto: WorldPointDto, context: SerializationContext): WorldPoint {
        const point = WorldPoint.createFromSerialized(
            dto.name,
            dto.lockedXyz,
            dto.color,
            dto.isVisible,
            dto.optimizedXyz
        )

        context.registerEntity(point, dto.id)
        return point
    }
}
