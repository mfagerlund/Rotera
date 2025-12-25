import type {ISelectable, SelectableType} from '../../types/selectable'
import type {IValueMapContributor, ValueMap, CameraValues, IOptimizableCamera} from '../../optimization/IOptimizable'
import type {IWorldPoint, IViewpoint} from '../interfaces'
import type {ImagePoint} from '../imagePoint'
import {V, Value, Vec3} from 'scalar-autograd'
import {Vec4} from 'scalar-autograd'
import {Quaternion} from '../../optimization/Quaternion'
import {quaternionNormalizationResidual} from '../../optimization/residuals/quaternion-normalization-residual'
import type { ISerializable } from '../serialization/ISerializable'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { ViewpointDto } from './ViewpointDto'
import type { VanishingLine } from '../vanishing-line'
import type { ViewpointMetadata } from './ViewpointMetadata'
import {makeAutoObservable} from 'mobx'

export class Viewpoint implements ISelectable, IValueMapContributor, IOptimizableCamera, IViewpoint, ISerializable<ViewpointDto> {
    selected = false
    isPoseLocked = false
    lastResiduals: number[] = []
    /**
     * When true, this viewpoint has been Z-reflected + Rz_180 transformed for right-handed output.
     * After this transformation, cam' = -cam, so points in front have camZ < 0 (not > 0).
     * The rendering code must use camZ < -0.01 as the "in front" check.
     * This flag is NOT serialized - it's a runtime property set by the solver.
     */
    isZReflected = false

    name: string
    filename: string
    url: string
    imageWidth: number
    imageHeight: number
    focalLength: number
    principalPointX: number
    principalPointY: number
    skewCoefficient: number
    aspectRatio: number
    /**
     * When true (default), optimization only varies f, cx, cy.
     * Skew is fixed at 0 and aspectRatio is fixed at 1.
     * This is appropriate for modern digital cameras with square pixels.
     * Set to false for unusual sensors or historical images.
     */
    useSimpleIntrinsics: boolean
    /**
     * When true, the principal point (cx, cy) can be optimized.
     * When false (default), the principal point is locked to the image center.
     * Most images are uncropped, so PP should be at center. Only set to true
     * if the image was cropped and the original center is unknown.
     */
    isPossiblyCropped: boolean
    radialDistortion: [number, number, number]
    tangentialDistortion: [number, number]
    position: [number, number, number]
    rotation: [number, number, number, number]
    calibrationAccuracy: number
    calibrationDate?: string
    calibrationNotes?: string
    isProcessed: boolean
    processingNotes?: string
    metadata?: ViewpointMetadata
    opacity: number
    color: string
    imagePoints: Set<ImagePoint> = new Set()
    vanishingLines: Set<VanishingLine> = new Set()

    private constructor(
        name: string,
        filename: string,
        url: string,
        imageWidth: number,
        imageHeight: number,
        focalLength: number,
        principalPointX: number,
        principalPointY: number,
        skewCoefficient: number,
        aspectRatio: number,
        useSimpleIntrinsics: boolean,
        isPossiblyCropped: boolean,
        radialDistortion: [number, number, number],
        tangentialDistortion: [number, number],
        position: [number, number, number],
        rotation: [number, number, number, number],
        calibrationAccuracy: number,
        calibrationDate: string | undefined,
        calibrationNotes: string | undefined,
        isProcessed: boolean,
        processingNotes: string | undefined,
        metadata: ViewpointMetadata | undefined,
        opacity: number,
        color: string
    ) {
        this.name = name
        this.filename = filename
        this.url = url
        this.imageWidth = imageWidth
        this.imageHeight = imageHeight
        this.focalLength = focalLength
        this.principalPointX = principalPointX
        this.principalPointY = principalPointY
        this.skewCoefficient = skewCoefficient
        this.aspectRatio = aspectRatio
        this.useSimpleIntrinsics = useSimpleIntrinsics
        this.isPossiblyCropped = isPossiblyCropped
        this.radialDistortion = radialDistortion
        this.tangentialDistortion = tangentialDistortion
        this.position = position
        this.rotation = rotation
        this.calibrationAccuracy = calibrationAccuracy
        this.calibrationDate = calibrationDate
        this.calibrationNotes = calibrationNotes
        this.isProcessed = isProcessed
        this.processingNotes = processingNotes
        this.metadata = metadata
        this.opacity = opacity
        this.color = color

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
        filename: string,
        url: string,
        imageWidth: number,
        imageHeight: number,
        focalLength: number,
        principalPointX: number,
        principalPointY: number,
        skewCoefficient: number,
        aspectRatio: number,
        useSimpleIntrinsics: boolean,
        isPossiblyCropped: boolean,
        radialDistortion: [number, number, number],
        tangentialDistortion: [number, number],
        position: [number, number, number],
        rotation: [number, number, number, number],
        calibrationAccuracy: number,
        calibrationDate: string | undefined,
        calibrationNotes: string | undefined,
        isProcessed: boolean,
        processingNotes: string | undefined,
        metadata: ViewpointMetadata | undefined,
        opacity: number,
        color: string
    ): Viewpoint {
        return new Viewpoint(
            name,
            filename,
            url,
            imageWidth,
            imageHeight,
            focalLength,
            principalPointX,
            principalPointY,
            skewCoefficient,
            aspectRatio,
            useSimpleIntrinsics,
            isPossiblyCropped,
            radialDistortion,
            tangentialDistortion,
            position,
            rotation,
            calibrationAccuracy,
            calibrationDate,
            calibrationNotes,
            isProcessed,
            processingNotes,
            metadata,
            opacity,
            color
        )
    }

    static create(
        name: string,
        filename: string,
        url: string,
        imageWidth: number,
        imageHeight: number,
        options: {
            id?: string
            // Camera intrinsics
            focalLength?: number
            principalPointX?: number
            principalPointY?: number
            skewCoefficient?: number
            aspectRatio?: number
            useSimpleIntrinsics?: boolean
            radialDistortion?: [number, number, number]
            tangentialDistortion?: [number, number]

            // Camera extrinsics
            position?: [number, number, number]
            rotation?: [number, number, number, number]
            rotationEuler?: [number, number, number]
            isPoseLocked?: boolean
            isPossiblyCropped?: boolean

            // Metadata
            calibrationAccuracy?: number
            calibrationDate?: string
            calibrationNotes?: string
            isProcessed?: boolean
            processingNotes?: string
            metadata?: ViewpointMetadata

            // Display
            opacity?: number
            color?: string
            group?: string
            tags?: string[]
        } = {}
    ): Viewpoint {
        const now = new Date().toISOString()

        // Estimate focal length from image dimensions if not provided
        const defaultFocalLength = Math.max(imageWidth, imageHeight)

        // Handle rotation
        let rotation: [number, number, number, number]
        if (options.rotation) {
            rotation = options.rotation
        } else if (options.rotationEuler) {
            const quat = Quaternion.fromEuler(...options.rotationEuler)
            rotation = quat.toArray()
        } else {
            rotation = [1, 0, 0, 0] // Identity quaternion
        }

        const dto: any = {
            name,
            filename,
            url,
            imageWidth,
            imageHeight,
            focalLength: options.focalLength ?? defaultFocalLength,
            principalPointX: options.principalPointX ?? imageWidth / 2,
            principalPointY: options.principalPointY ?? imageHeight / 2,
            skewCoefficient: options.skewCoefficient ?? 0,
            aspectRatio: options.aspectRatio ?? 1,
            useSimpleIntrinsics: options.useSimpleIntrinsics ?? true,
            isPossiblyCropped: options.isPossiblyCropped ?? false,
            radialDistortion: options.radialDistortion ?? [0, 0, 0],
            tangentialDistortion: options.tangentialDistortion ?? [0, 0],
            position: options.position ?? [0, 0, 0],
            rotation,
            imagePoints: {},
            calibrationAccuracy: options.calibrationAccuracy ?? 0,
            calibrationDate: options.calibrationDate,
            calibrationNotes: options.calibrationNotes,
            isProcessed: options.isProcessed ?? false,
            processingNotes: options.processingNotes,
            metadata: options.metadata,
            opacity: options.opacity ?? 1.0,
            color: options.color || '#ffff00',
            group: options.group,
            tags: options.tags,
            createdAt: now,
            updatedAt: now
        }

        const viewpoint = new Viewpoint(
            dto.name,
            dto.filename,
            dto.url,
            dto.imageWidth,
            dto.imageHeight,
            dto.focalLength,
            dto.principalPointX,
            dto.principalPointY,
            dto.skewCoefficient,
            dto.aspectRatio,
            dto.useSimpleIntrinsics,
            dto.isPossiblyCropped,
            dto.radialDistortion,
            dto.tangentialDistortion,
            dto.position,
            dto.rotation,
            dto.calibrationAccuracy,
            dto.calibrationDate,
            dto.calibrationNotes,
            dto.isProcessed,
            dto.processingNotes,
            dto.metadata,
            dto.opacity,
            dto.color
        )
        viewpoint.isPoseLocked = options.isPoseLocked ?? false
        return viewpoint
    }

    // ============================================================================
    // ISelectable implementation
    // ============================================================================

    getType(): SelectableType {
        return 'viewpoint'
    }

    getName(): string {
        return this.name
    }

    isLocked(): boolean {
        return this.isPoseLocked
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
        const count = this.imagePoints.size
        if (count > 0) {
            return `Deleting viewpoint "${this.name}" will remove ${count} image point${count === 1 ? '' : 's'}`
        }
        return null
    }
    
    // ============================================================================
    // Computed properties
    // ============================================================================

    // Removed getter - access fields directly: use [viewpoint.imageWidth, viewpoint.imageHeight]

    getRotationEuler(): [number, number, number] {
        const quat = Vec4.fromData(...this.rotation)
        return Quaternion.toEuler(quat)
    }

    setRotationEuler(roll: number, pitch: number, yaw: number): void {
        const quat = Quaternion.fromEuler(roll, pitch, yaw)
        this.rotation = quat.toArray()
    }
    addImagePoint(imagePoint: ImagePoint): void {
        this.imagePoints.add(imagePoint)
    }

    removeImagePoint(imagePoint: ImagePoint): void {
        this.imagePoints.delete(imagePoint)
    }

    getImagePointCount(): number {
        return this.imagePoints.size
    }

    getImagePointsForWorldPoint(worldPoint: IWorldPoint): ImagePoint[] {
        return Array.from(this.imagePoints).filter(ip => ip.worldPoint === worldPoint)
    }

    addVanishingLine(line: VanishingLine): void {
        this.vanishingLines.add(line)
    }

    removeVanishingLine(line: VanishingLine): void {
        this.vanishingLines.delete(line)
    }

    getVanishingLineCount(): number {
        return this.vanishingLines.size
    }

    // ============================================================================
    // Utility methods
    // ============================================================================

    getIntrinsicMatrix(): number[][] {
        const fx = this.focalLength
        const fy = this.focalLength * this.aspectRatio
        const cx = this.principalPointX
        const cy = this.principalPointY
        const s = this.skewCoefficient

        return [
            [fx, s, cx],
            [0, fy, cy],
            [0, 0, 1]
        ]
    }

    getAspectRatio(): number {
        return this.imageWidth / this.imageHeight
    }

    isInBounds(u: number, v: number): boolean {
        return u >= 0 && u <= this.imageWidth && v >= 0 && v <= this.imageHeight
    }

    pixelToNormalized(u: number, v: number): [number, number] {
        return [u / this.imageWidth, v / this.imageHeight]
    }

    normalizedToPixel(u: number, v: number): [number, number] {
        return [u * this.imageWidth, v * this.imageHeight]
    }

    setPoseLocked(locked: boolean): void {
        this.isPoseLocked = locked
    }

    // ============================================================================
    // IValueMapContributor implementation
    // ============================================================================

    addToValueMap(
        valueMap: ValueMap,
        options: {
            optimizePose?: boolean
            optimizeIntrinsics?: boolean
            optimizeDistortion?: boolean
        } = {}
    ): Value[] {
        const variables: Value[] = []
        const {
            optimizePose = !this.isPoseLocked,
            optimizeIntrinsics = false,
            optimizeDistortion = false
        } = options

        const px = optimizePose ? V.W(this.position[0]) : V.C(this.position[0])
        const py = optimizePose ? V.W(this.position[1]) : V.C(this.position[1])
        const pz = optimizePose ? V.W(this.position[2]) : V.C(this.position[2])
        const position = new Vec3(px, py, pz)
        if (optimizePose) variables.push(px, py, pz)

        const qw = optimizePose ? V.W(this.rotation[0]) : V.C(this.rotation[0])
        const qx = optimizePose ? V.W(this.rotation[1]) : V.C(this.rotation[1])
        const qy = optimizePose ? V.W(this.rotation[2]) : V.C(this.rotation[2])
        const qz = optimizePose ? V.W(this.rotation[3]) : V.C(this.rotation[3])
        const rotation = new Vec4(qw, qx, qy, qz)
        if (optimizePose) variables.push(qw, qx, qy, qz)

        // When useSimpleIntrinsics=true (default), only optimize f, cx, cy
        // aspectRatio and skew stay fixed at their current values (typically 1 and 0)
        const optimizeFullIntrinsics = optimizeIntrinsics && !this.useSimpleIntrinsics
        // Only optimize principal point if the image might be cropped
        // For uncropped images, PP should be locked to the image center
        const optimizePrincipalPoint = optimizeIntrinsics && this.isPossiblyCropped

        const focalLength = optimizeIntrinsics ? V.W(this.focalLength) : V.C(this.focalLength)
        const aspectRatio = optimizeFullIntrinsics ? V.W(this.aspectRatio) : V.C(this.aspectRatio)
        // For uncropped images, force PP to image center regardless of stored value
        const effectivePPX = this.isPossiblyCropped ? this.principalPointX : this.imageWidth / 2
        const effectivePPY = this.isPossiblyCropped ? this.principalPointY : this.imageHeight / 2
        const principalPointX = optimizePrincipalPoint ? V.W(effectivePPX) : V.C(effectivePPX)
        const principalPointY = optimizePrincipalPoint ? V.W(effectivePPY) : V.C(effectivePPY)
        const skew = optimizeFullIntrinsics ? V.W(this.skewCoefficient) : V.C(this.skewCoefficient)
        if (optimizeIntrinsics) {
            variables.push(focalLength)
            if (optimizePrincipalPoint) {
                variables.push(principalPointX, principalPointY)
            }
            if (optimizeFullIntrinsics) {
                variables.push(aspectRatio, skew)
            }
        }

        const k1 = optimizeDistortion ? V.W(this.radialDistortion[0]) : V.C(this.radialDistortion[0])
        const k2 = optimizeDistortion ? V.W(this.radialDistortion[1]) : V.C(this.radialDistortion[1])
        const k3 = optimizeDistortion ? V.W(this.radialDistortion[2]) : V.C(this.radialDistortion[2])
        const p1 = optimizeDistortion ? V.W(this.tangentialDistortion[0]) : V.C(this.tangentialDistortion[0])
        const p2 = optimizeDistortion ? V.W(this.tangentialDistortion[1]) : V.C(this.tangentialDistortion[1])
        if (optimizeDistortion) variables.push(k1, k2, k3, p1, p2)

        const cameraValues: CameraValues = {
            position,
            rotation,
            focalLength,
            aspectRatio,
            principalPointX,
            principalPointY,
            skew,
            k1, k2, k3, p1, p2
        }

        valueMap.cameras.set(this, cameraValues)
        return variables
    }

    computeResiduals(valueMap: ValueMap): Value[] {
        const cameraValues = valueMap.cameras.get(this)
        if (!cameraValues) return []

        const residuals: Value[] = [quaternionNormalizationResidual(cameraValues.rotation)]

        // Focal length regularization: penalize deviation from reasonable range
        // For most cameras, f is roughly 0.8x to 2.5x the max image dimension
        // This prevents focal length from going negative or exploding during under-constrained solves
        const maxDim = Math.max(this.imageWidth, this.imageHeight)
        const minF = maxDim * 0.3   // Very wide angle (allows some fisheye)
        const maxF = maxDim * 5.0   // Very telephoto
        const f = cameraValues.focalLength

        // Soft bounds: penalize when f goes outside reasonable range
        // The residual should be strong enough to prevent runaway focal length
        // Weight needs to be high enough to overcome ill-conditioned Jacobians
        // Using 500 because negative focal length must NEVER happen
        const weight = V.C(500.0)
        const belowMin = V.max(V.sub(V.C(minF), f), V.C(0))
        const aboveMax = V.max(V.sub(f, V.C(maxF)), V.C(0))
        residuals.push(V.mul(V.div(belowMin, V.C(maxDim)), weight))
        residuals.push(V.mul(V.div(aboveMax, V.C(maxDim)), weight))

        return residuals
    }

    applyOptimizationResultFromValueMap(valueMap: ValueMap): void {
        const cameraValues = valueMap.cameras.get(this)
        if (!cameraValues) return

        this.position = [cameraValues.position.x.data, cameraValues.position.y.data, cameraValues.position.z.data]
        this.rotation = [cameraValues.rotation.w.data, cameraValues.rotation.x.data, cameraValues.rotation.y.data, cameraValues.rotation.z.data]

        // Apply focal length with hard bounds to prevent invalid values
        const maxDim = Math.max(this.imageWidth, this.imageHeight)
        const minF = maxDim * 0.3   // Very wide angle
        const maxF = maxDim * 5.0   // Very telephoto
        const rawFocalLength = cameraValues.focalLength.data
        this.focalLength = Math.max(minF, Math.min(maxF, rawFocalLength))
        this.aspectRatio = cameraValues.aspectRatio.data
        // Only update principal point if the image might be cropped
        // For uncropped images, PP should stay at image center
        if (this.isPossiblyCropped) {
            this.principalPointX = cameraValues.principalPointX.data
            this.principalPointY = cameraValues.principalPointY.data
        } else {
            // Enforce centered PP for uncropped images
            this.principalPointX = this.imageWidth / 2
            this.principalPointY = this.imageHeight / 2
        }
        this.skewCoefficient = cameraValues.skew.data
        this.radialDistortion = [cameraValues.k1.data, cameraValues.k2.data, cameraValues.k3.data]
        this.tangentialDistortion = [cameraValues.p1.data, cameraValues.p2.data]

        const residuals = this.computeResiduals(valueMap)
        this.lastResiduals = residuals.map(r => r.data)
    }

    serialize(context: SerializationContext): ViewpointDto {
        const id = context.getEntityId(this) || context.registerEntity(this)

        const vanishingLineIds = Array.from(this.vanishingLines).map(line => {
            const lineId = context.getEntityId(line) || context.registerEntity(line)
            return lineId
        })

        return {
            id,
            name: this.name,
            filename: this.filename,
            url: context.options.excludeImages ? '' : this.url,
            imageWidth: this.imageWidth,
            imageHeight: this.imageHeight,
            focalLength: this.focalLength,
            principalPointX: this.principalPointX,
            principalPointY: this.principalPointY,
            skewCoefficient: this.skewCoefficient,
            aspectRatio: this.aspectRatio,
            useSimpleIntrinsics: this.useSimpleIntrinsics,
            isPossiblyCropped: this.isPossiblyCropped,
            radialDistortion: [...this.radialDistortion] as [number, number, number],
            tangentialDistortion: [...this.tangentialDistortion] as [number, number],
            position: [...this.position] as [number, number, number],
            rotation: [...this.rotation] as [number, number, number, number],
            calibrationAccuracy: this.calibrationAccuracy,
            calibrationDate: this.calibrationDate,
            calibrationNotes: this.calibrationNotes,
            isProcessed: this.isProcessed,
            processingNotes: this.processingNotes,
            metadata: this.metadata ? { ...this.metadata } : undefined,
            opacity: this.opacity,
            color: this.color,
            isPoseLocked: this.isPoseLocked,
            vanishingLineIds: vanishingLineIds.length > 0 ? vanishingLineIds : undefined
        }
    }

    static deserialize(dto: ViewpointDto, context: SerializationContext): Viewpoint {
        const viewpoint = Viewpoint.createFromSerialized(
            dto.name,
            dto.filename,
            dto.url,
            dto.imageWidth,
            dto.imageHeight,
            dto.focalLength,
            dto.principalPointX,
            dto.principalPointY,
            dto.skewCoefficient,
            dto.aspectRatio,
            dto.useSimpleIntrinsics ?? true,  // Default to true for backwards compatibility
            dto.isPossiblyCropped ?? false,   // Default to false (PP locked to center) for backwards compatibility
            dto.radialDistortion,
            dto.tangentialDistortion,
            dto.position,
            dto.rotation,
            dto.calibrationAccuracy,
            dto.calibrationDate,
            dto.calibrationNotes,
            dto.isProcessed,
            dto.processingNotes,
            dto.metadata,
            dto.opacity,
            dto.color
        )

        context.registerEntity(viewpoint, dto.id)

        if (dto.isPoseLocked !== undefined) {
            viewpoint.isPoseLocked = dto.isPoseLocked
        }

        return viewpoint
    }
}
