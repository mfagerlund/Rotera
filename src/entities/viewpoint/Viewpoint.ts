import type {ISelectable, SelectableType} from '../../types/selectable'
import type {IOptimizableCamera} from '../../optimization/IOptimizable'
import type {IWorldPoint, IViewpoint} from '../interfaces'
import type {ImagePoint} from '../imagePoint'
import {Vec4} from 'scalar-autograd'
import {Quaternion} from '../../optimization/Quaternion'
import type { ISerializable } from '../serialization/ISerializable'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { ViewpointDto } from './ViewpointDto'
import type { VanishingLine } from '../vanishing-line'
import type { ViewpointMetadata } from './ViewpointMetadata'
import {makeAutoObservable} from 'mobx'
import {generateId} from '../../services/project-db/utils'

export class Viewpoint implements ISelectable, IOptimizableCamera, IViewpoint, ISerializable<ViewpointDto> {
    /** Unique identifier - stable across sessions */
    readonly id: string
    selected = false
    isPoseLocked = false
    /**
     * When true (default), this viewpoint is included in optimization.
     * Set to false to exclude this viewpoint's image points from the solve.
     */
    enabledInSolve = true
    lastResiduals: number[] = []
    /**
     * When true, this viewpoint has been Z-reflected + Rz_180 transformed for right-handed output.
     * After this transformation, cam' = -cam, so points in front have camZ < 0 (not > 0).
     * The rendering code must use camZ < -0.01 as the "in front" check.
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
        id: string,
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
        this.id = id
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
        id: string,
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
            id,
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
        const id = options.id ?? generateId()

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
            id,
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

    /**
     * Apply optimization results from variables array and layout.
     * This is the new Phase 4 method that doesn't require ValueMap/scalar-autograd.
     */
    applyOptimizationResultFromVariables(
        variables: Float64Array,
        posIndices: readonly [number, number, number],
        quatIndices: readonly [number, number, number, number],
        intrinsicsIndices: { focalLength: number; aspectRatio: number; principalPointX: number; principalPointY: number; skew: number; k1: number; k2: number; k3: number; p1: number; p2: number } | undefined,
        intrinsicsValues: { focalLength: number; aspectRatio: number; principalPointX: number; principalPointY: number; skew: number; k1: number; k2: number; k3: number; p1: number; p2: number } | undefined
    ): void {
        // Apply position (from variables if optimized, otherwise keep current)
        if (posIndices[0] >= 0) {
            this.position = [
                variables[posIndices[0]],
                variables[posIndices[1]],
                variables[posIndices[2]]
            ]
        }

        // Apply rotation (from variables if optimized, otherwise keep current)
        if (quatIndices[0] >= 0) {
            this.rotation = [
                variables[quatIndices[0]],
                variables[quatIndices[1]],
                variables[quatIndices[2]],
                variables[quatIndices[3]]
            ]
        }

        // Apply intrinsics
        if (intrinsicsIndices && intrinsicsValues) {
            // Apply focal length with hard bounds
            const maxDim = Math.max(this.imageWidth, this.imageHeight)
            const minF = maxDim * 0.3
            const maxF = maxDim * 5.0
            const rawFocalLength = intrinsicsIndices.focalLength >= 0
                ? variables[intrinsicsIndices.focalLength]
                : intrinsicsValues.focalLength
            this.focalLength = Math.max(minF, Math.min(maxF, rawFocalLength))

            // Aspect ratio
            this.aspectRatio = intrinsicsIndices.aspectRatio >= 0
                ? variables[intrinsicsIndices.aspectRatio]
                : intrinsicsValues.aspectRatio

            // Principal point (only update if image might be cropped)
            if (this.isPossiblyCropped) {
                this.principalPointX = intrinsicsIndices.principalPointX >= 0
                    ? variables[intrinsicsIndices.principalPointX]
                    : intrinsicsValues.principalPointX
                this.principalPointY = intrinsicsIndices.principalPointY >= 0
                    ? variables[intrinsicsIndices.principalPointY]
                    : intrinsicsValues.principalPointY
            } else {
                this.principalPointX = this.imageWidth / 2
                this.principalPointY = this.imageHeight / 2
            }

            // Skew
            this.skewCoefficient = intrinsicsIndices.skew >= 0
                ? variables[intrinsicsIndices.skew]
                : intrinsicsValues.skew

            // Distortion (currently never optimized in analytical solver)
            this.radialDistortion = [
                intrinsicsIndices.k1 >= 0 ? variables[intrinsicsIndices.k1] : intrinsicsValues.k1,
                intrinsicsIndices.k2 >= 0 ? variables[intrinsicsIndices.k2] : intrinsicsValues.k2,
                intrinsicsIndices.k3 >= 0 ? variables[intrinsicsIndices.k3] : intrinsicsValues.k3
            ]
            this.tangentialDistortion = [
                intrinsicsIndices.p1 >= 0 ? variables[intrinsicsIndices.p1] : intrinsicsValues.p1,
                intrinsicsIndices.p2 >= 0 ? variables[intrinsicsIndices.p2] : intrinsicsValues.p2
            ]
        }
    }

    serialize(context: SerializationContext): ViewpointDto {
        // Use our stable id and register with context
        context.registerEntity(this, this.id)

        const vanishingLineIds = Array.from(this.vanishingLines).map(line => {
            const lineId = context.getEntityId(line) || context.registerEntity(line)
            return lineId
        })

        return {
            id: this.id,
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
            isZReflected: this.isZReflected || undefined,  // Only serialize if true
            enabledInSolve: this.enabledInSolve === false ? false : undefined,  // Only serialize if false
            vanishingLineIds: vanishingLineIds.length > 0 ? vanishingLineIds : undefined,
            lastResiduals: this.lastResiduals.length > 0 ? [...this.lastResiduals] : undefined
        }
    }

    static deserialize(dto: ViewpointDto, context: SerializationContext): Viewpoint {
        const viewpoint = Viewpoint.createFromSerialized(
            dto.id,
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

        if (dto.lastResiduals) {
            viewpoint.lastResiduals = [...dto.lastResiduals]
        }

        if (dto.isZReflected) {
            viewpoint.isZReflected = dto.isZReflected
        }

        if (dto.enabledInSolve === false) {
            viewpoint.enabledInSolve = false
        }

        return viewpoint
    }
}
