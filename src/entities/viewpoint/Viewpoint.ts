// Viewpoint entity - a photograph with camera parameters and pose
import type {ISelectable, SelectableType} from '../../types/selectable'
import type {IValueMapContributor, ValueMap, CameraValues} from '../../optimization/IOptimizable'
import type {IWorldPoint, IImagePoint, IViewpoint} from '../interfaces'
import {V, Value, Vec3} from 'scalar-autograd'
import {Vec4} from 'scalar-autograd'
import {Quaternion} from '../../optimization/Quaternion'
import {quaternionNormalizationResidual} from '../../optimization/residuals/quaternion-normalization-residual'

export class Viewpoint implements ISelectable, IValueMapContributor, IViewpoint {
    selected = false
    isPoseLocked = false
    lastResiduals: number[] = []

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
    radialDistortion: [number, number, number]
    tangentialDistortion: [number, number]
    position: [number, number, number]
    rotation: [number, number, number, number]
    calibrationAccuracy: number
    calibrationDate?: string
    calibrationNotes?: string
    isProcessed: boolean
    processingNotes?: string
    metadata?: any
    isVisible: boolean
    opacity: number
    color: string
    imagePoints: Set<IImagePoint> = new Set()

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
        radialDistortion: [number, number, number],
        tangentialDistortion: [number, number],
        position: [number, number, number],
        rotation: [number, number, number, number],
        calibrationAccuracy: number,
        calibrationDate: string | undefined,
        calibrationNotes: string | undefined,
        isProcessed: boolean,
        processingNotes: string | undefined,
        metadata: any | undefined,
        isVisible: boolean,
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
        this.isVisible = isVisible
        this.opacity = opacity
        this.color = color
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
        radialDistortion: [number, number, number],
        tangentialDistortion: [number, number],
        position: [number, number, number],
        rotation: [number, number, number, number],
        calibrationAccuracy: number,
        calibrationDate: string | undefined,
        calibrationNotes: string | undefined,
        isProcessed: boolean,
        processingNotes: string | undefined,
        metadata: any,
        isVisible: boolean,
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
            isVisible,
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
            radialDistortion?: [number, number, number]
            tangentialDistortion?: [number, number]

            // Camera extrinsics
            position?: [number, number, number]
            rotation?: [number, number, number, number]
            rotationEuler?: [number, number, number]
            isPoseLocked?: boolean

            // Metadata
            calibrationAccuracy?: number
            calibrationDate?: string
            calibrationNotes?: string
            isProcessed?: boolean
            processingNotes?: string
            metadata?: any

            // Display
            isVisible?: boolean
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
            isVisible: options.isVisible ?? true,
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
            dto.isVisible,
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
    addImagePoint(imagePoint: IImagePoint): void {
        this.imagePoints.add(imagePoint)
    }

    removeImagePoint(imagePoint: IImagePoint): void {
        this.imagePoints.delete(imagePoint)
    }

    getImagePointCount(): number {
        return this.imagePoints.size
    }

    getImagePointsForWorldPoint(worldPoint: IWorldPoint): IImagePoint[] {
        return Array.from(this.imagePoints).filter(ip => ip.worldPoint === worldPoint)
    }

    getVisibleImagePoints(): IImagePoint[] {
        return Array.from(this.imagePoints).filter(ip => ip.isVisible)
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

    setVisible(visible: boolean): void {
        this.isVisible = visible
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

        const focalLength = optimizeIntrinsics ? V.W(this.focalLength) : V.C(this.focalLength)
        const aspectRatio = optimizeIntrinsics ? V.W(this.aspectRatio) : V.C(this.aspectRatio)
        const principalPointX = optimizeIntrinsics ? V.W(this.principalPointX) : V.C(this.principalPointX)
        const principalPointY = optimizeIntrinsics ? V.W(this.principalPointY) : V.C(this.principalPointY)
        const skew = optimizeIntrinsics ? V.W(this.skewCoefficient) : V.C(this.skewCoefficient)
        if (optimizeIntrinsics) variables.push(focalLength, aspectRatio, principalPointX, principalPointY, skew)

        const k1 = optimizeDistortion ? V.W(this.radialDistortion[0]) : V.C(this.radialDistortion[0])
        const k2 = optimizeDistortion ? V.W(this.radialDistortion[1]) : V.C(this.radialDistortion[1])
        const k3 = optimizeDistortion ? V.W(this.radialDistortion[2]) : V.C(this.radialDistortion[2])
        const p1 = optimizeDistortion ? V.W(this.tangentialDistortion[0]) : V.C(this.tangentialDistortion[0])
        const p2 = optimizeDistortion ? V.W(this.tangentialDistortion[1]) : V.C(this.tangentialDistortion[1])
        if (optimizeDistortion) variables.push(k1, k2, k3, p1, p2)

        const cameraValues: CameraValues = {
            lockedXyz: position,
            rotation,
            focalLength,
            aspectRatio,
            principalPointX,
            principalPointY,
            skew,
            k1, k2, k3, p1, p2
        }

        valueMap.cameras.set(this as any, cameraValues)
        return variables
    }

    computeResiduals(valueMap: ValueMap): Value[] {
        const cameraValues = valueMap.cameras.get(this as any)
        if (!cameraValues) return []

        return [quaternionNormalizationResidual(cameraValues.rotation)]
    }

    applyOptimizationResultFromValueMap(valueMap: ValueMap): void {
        const cameraValues = valueMap.cameras.get(this as any)
        if (!cameraValues) return

        this.position = [cameraValues.position.x.data, cameraValues.position.y.data, cameraValues.position.z.data]
        this.rotation = [cameraValues.rotation.w.data, cameraValues.rotation.x.data, cameraValues.rotation.y.data, cameraValues.rotation.z.data]
        this.focalLength = cameraValues.focalLength.data
        this.aspectRatio = cameraValues.aspectRatio.data
        this.principalPointX = cameraValues.principalPointX.data
        this.principalPointY = cameraValues.principalPointY.data
        this.skewCoefficient = cameraValues.skew.data
        this.radialDistortion = [cameraValues.k1.data, cameraValues.k2.data, cameraValues.k3.data]
        this.tangentialDistortion = [cameraValues.p1.data, cameraValues.p2.data]

        const residuals = this.computeResiduals(valueMap)
        this.lastResiduals = residuals.map(r => r.data)
    }
}
