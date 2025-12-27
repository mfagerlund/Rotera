import type {ISelectable, SelectableType} from '../../types/selectable'
import type {IValueMapContributor, ValueMap} from '../../optimization/IOptimizable'
import type {IWorldPoint, ILine, IConstraint} from '../interfaces'
import type {ImagePoint} from '../imagePoint'
import {V, Value, Vec3} from 'scalar-autograd'
import * as vec3 from '../../utils/vec3'
import type { ISerializable } from '../serialization/ISerializable'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { WorldPointDto } from './WorldPointDto'
import {makeAutoObservable} from 'mobx'
import { projectWorldPointToPixelQuaternion } from '../../optimization/camera-projection'


export class WorldPoint implements ISelectable, IWorldPoint, IValueMapContributor, IWorldPoint, ISerializable<WorldPointDto> {
    selected = false
    connectedLines: Set<ILine> = new Set()
    referencingConstraints: Set<IConstraint> = new Set()
    imagePoints: Set<ImagePoint> = new Set()
    lastResiduals: number[] = []
    name: string
    lockedXyz: [number | null, number | null, number | null]
    inferredXyz: [number | null, number | null, number | null]
    optimizedXyz?: [number, number, number]
    color: string

    private constructor(
        name: string,
        lockedXyz: [number | null, number | null, number | null],
        color: string,
        optimizedXyz?: [number, number, number],
        inferredXyz?: [number | null, number | null, number | null]
    ) {
        this.name = name
        this.lockedXyz = lockedXyz
        this.inferredXyz = inferredXyz || [null, null, null]
        this.color = color
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
        optimizedXyz?: [number, number, number],
        inferredXyz?: [number | null, number | null, number | null]
    ): WorldPoint {
        return new WorldPoint(
            name,
            lockedXyz,
            color,
            optimizedXyz,
            inferredXyz
        )
    }

    static create(
        name: string,
        options: {
            lockedXyz: [number | null, number | null, number | null]
            color?: string
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

    isFullyLocked(): boolean {
        return this.lockedXyz[0] !== null && this.lockedXyz[1] !== null && this.lockedXyz[2] !== null
    }

    getEffectiveXyz(): [number | null, number | null, number | null] {
        return [
            this.lockedXyz[0] ?? this.inferredXyz[0],
            this.lockedXyz[1] ?? this.inferredXyz[1],
            this.lockedXyz[2] ?? this.inferredXyz[2]
        ]
    }

    isFullyConstrained(): boolean {
        const effective = this.getEffectiveXyz()
        return effective.every(v => v !== null)
    }

    getConstraintStatus(): 'free' | 'partial' | 'inferred' | 'locked' {
        const effective = this.getEffectiveXyz()
        const nullCount = effective.filter(v => v === null).length

        if (nullCount === 3) return 'free'
        if (nullCount === 0) {
            return this.lockedXyz.every(v => v !== null) ? 'locked' : 'inferred'
        }
        return 'partial'
    }

    isXLocked(): boolean {
        return this.lockedXyz[0] !== null || this.inferredXyz[0] !== null
    }

    isYLocked(): boolean {
        return this.lockedXyz[1] !== null || this.inferredXyz[1] !== null
    }

    isZLocked(): boolean {
        return this.lockedXyz[2] !== null || this.inferredXyz[2] !== null
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

    addImagePoint(imagePoint: ImagePoint): void {
        this.imagePoints.add(imagePoint)
    }

    removeImagePoint(imagePoint: ImagePoint): void {
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
        return vec3.distance(pointA, pointB)
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
        const v1 = vec3.subtract(pointB, pointA)
        const v2 = vec3.subtract(pointC, pointA)
        const cross = vec3.cross(v1, v2)
        const magnitude = vec3.magnitude(cross)
        return magnitude < tolerance
    }

    static calculateAngle(
        pointA: [number, number, number],
        vertex: [number, number, number],
        pointC: [number, number, number]
    ): number {
        const vec1 = vec3.subtract(pointA, vertex)
        const vec2 = vec3.subtract(pointC, vertex)
        const angleRad = vec3.angleBetween(vec1, vec2)
        return angleRad * (180 / Math.PI)
    }

    static projectOntoPlane(
        point: [number, number, number],
        planePoint: [number, number, number],
        planeNormal: [number, number, number]
    ): [number, number, number] {
        const vec = vec3.subtract(point, planePoint)
        const dotProduct = vec3.dot(vec, planeNormal)
        const normalMagSquared = vec3.sqrMagnitude(planeNormal)

        if (normalMagSquared === 0) {
            return point
        }

        const projectionFactor = dotProduct / normalMagSquared
        const offset = vec3.scale(planeNormal, projectionFactor)
        return vec3.subtract(point, offset)
    }

    static distanceToPlane(
        point: [number, number, number],
        planePoint: [number, number, number],
        planeNormal: [number, number, number]
    ): number {
        const vec = vec3.subtract(point, planePoint)
        const dotProduct = vec3.dot(vec, planeNormal)
        const normalMag = vec3.magnitude(planeNormal)

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
        const v1 = vec3.subtract(p2, p1)
        const v2 = vec3.subtract(p3, p1)
        const normal = vec3.cross(v1, v2)

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

    applyOptimizationResult(result: { xyz: [number, number, number], residual?: number }): void {
        this.optimizedXyz = [...result.xyz] as [number , number , number ]
    }

    // ============================================================================
    // IValueMapContributor implementation (optimization system)
    // ============================================================================

    /**
     * Add this point to the ValueMap for optimization.
     * Locked axes become constants (V.C), unlocked axes become variables (V.W).
     * Priority: lockedXyz > inferredXyz > optimizedXyz
     */
    addToValueMap(valueMap: ValueMap): Value[] {
        const lockedXyz = this.lockedXyz;
        const inferredXyz = this.inferredXyz;
        const optimizedXyz = this.optimizedXyz;

        const variables: Value[] = []

        const xLocked = this.isXLocked()
        const yLocked = this.isYLocked()
        const zLocked = this.isZLocked()

        const xValue = lockedXyz[0] ?? inferredXyz[0]
        const yValue = lockedXyz[1] ?? inferredXyz[1]
        const zValue = lockedXyz[2] ?? inferredXyz[2]

        const x = xLocked ? V.C(xValue!) : V.W(optimizedXyz?.[0] ?? 0)
        const y = yLocked ? V.C(yValue!) : V.W(optimizedXyz?.[1] ?? 0)
        const z = zLocked ? V.C(zValue!) : V.W(optimizedXyz?.[2] ?? 0)

        const vec = new Vec3(x, y, z)
        valueMap.points.set(this, vec)

        if (!xLocked) variables.push(x)
        if (!yLocked) variables.push(y)
        if (!zLocked) variables.push(z)

        return variables
    }

    computeResiduals(valueMap: ValueMap): Value[] {
        const residuals: Value[] = []

        const worldPointVec = valueMap.points.get(this)
        if (!worldPointVec) {
            return residuals
        }

        // Aggregate reprojection residuals for every observation of this world point
        for (const imagePoint of this.imagePoints) {
            const cameraValues = valueMap.cameras.get(imagePoint.viewpoint)
            if (!cameraValues) continue

            // Use isZReflected only when valueMap.useIsZReflected is true
            const isZReflected = valueMap.useIsZReflected ? cameraValues.isZReflected : false

            const projection = projectWorldPointToPixelQuaternion(
                worldPointVec,
                cameraValues.position,
                cameraValues.rotation,
                cameraValues.focalLength,
                cameraValues.aspectRatio,
                cameraValues.principalPointX,
                cameraValues.principalPointY,
                cameraValues.skew,
                cameraValues.k1,
                cameraValues.k2,
                cameraValues.k3,
                cameraValues.p1,
                cameraValues.p2,
                isZReflected
            )

            if (!projection) {
                // Behind camera - push large residual to flag the issue
                residuals.push(V.C(1000), V.C(1000))
                continue
            }

            const [projectedU, projectedV] = projection
            residuals.push(
                V.sub(projectedU, V.C(imagePoint.u)),
                V.sub(projectedV, V.C(imagePoint.v))
            )
        }

        return residuals
    }

    /**
     * Apply optimization results from ValueMap.
     */
    applyOptimizationResultFromValueMap(valueMap: ValueMap): void {
        const vec = valueMap.points.get(this)
        if (!vec) {
            return
        }

        const xLocked = this.isXLocked()
        const yLocked = this.isYLocked()
        const zLocked = this.isZLocked()

        const xValue = this.lockedXyz[0] ?? this.inferredXyz[0]
        const yValue = this.lockedXyz[1] ?? this.inferredXyz[1]
        const zValue = this.lockedXyz[2] ?? this.inferredXyz[2]

        const xyz: [number, number, number] = [
            xLocked ? xValue! : vec.x.data,
            yLocked ? yValue! : vec.y.data,
            zLocked ? zValue! : vec.z.data
        ]

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
            inferredXyz: [...this.inferredXyz] as [number | null, number | null, number | null],
            optimizedXyz: this.optimizedXyz ? [...this.optimizedXyz] as [number, number, number] : undefined,
            color: this.color,
            lastResiduals: this.lastResiduals.length > 0 ? [...this.lastResiduals] : undefined
        }
    }

    static deserialize(dto: WorldPointDto, context: SerializationContext): WorldPoint {
        const point = WorldPoint.createFromSerialized(
            dto.name,
            dto.lockedXyz,
            dto.color,
            dto.optimizedXyz,
            dto.inferredXyz
        )

        if (dto.lastResiduals) {
            point.lastResiduals = [...dto.lastResiduals]
        }

        context.registerEntity(point, dto.id)
        return point
    }
}
