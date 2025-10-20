// Viewpoint entity - a photograph with camera parameters and pose

import type {ISelectable, SelectableType} from '../../types/selectable'
import type {IValidatable, ValidationContext, ValidationResult, ValidationError} from '../../validation/validator'
import type {IValueMapContributor, ValueMap, CameraValues} from '../../optimization/IOptimizable'
import type {ViewpointId, ImagePointId, EntityId} from '../../types/ids'
import {ValidationHelpers} from '../../validation/validator'
import {V, Value, Vec3} from 'scalar-autograd'
import {Vec4} from '../../optimization/Vec4'
import {Quaternion} from '../../optimization/Quaternion'
import {quaternionNormalizationResidual} from '../../optimization/residuals/quaternion-normalization-residual'

// ImagePoint DTO
export interface ImagePointDto {
    id: string
    worldPointId: string
    u: number // pixel coordinate x
    v: number // pixel coordinate y
    isVisible: boolean
    isManuallyPlaced: boolean
    confidence: number // 0-1
    createdAt: string
    updatedAt: string
}

export class Viewpoint implements ISelectable, IValidatable, IValueMapContributor {
    readonly id: string  // For serialization and React keys only - do NOT use for runtime references!
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
    group?: string
    tags?: string[]
    createdAt: string
    updatedAt: string
    imagePoints: Record<ImagePointId, ImagePointDto>


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
        radialDistortion: [number, number, number],
        tangentialDistortion: [number, number],
        position: [number, number, number],
        rotation: [number, number, number, number],
        imagePoints: Record<ImagePointId, ImagePointDto>,
        calibrationAccuracy: number,
        calibrationDate: string | undefined,
        calibrationNotes: string | undefined,
        isProcessed: boolean,
        processingNotes: string | undefined,
        metadata: any | undefined,
        isVisible: boolean,
        opacity: number,
        color: string,
        group: string | undefined,
        tags: string[] | undefined,
        createdAt: string,
        updatedAt: string
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
        this.radialDistortion = radialDistortion
        this.tangentialDistortion = tangentialDistortion
        this.position = position
        this.rotation = rotation
        this.imagePoints = imagePoints
        this.calibrationAccuracy = calibrationAccuracy
        this.calibrationDate = calibrationDate
        this.calibrationNotes = calibrationNotes
        this.isProcessed = isProcessed
        this.processingNotes = processingNotes
        this.metadata = metadata
        this.isVisible = isVisible
        this.opacity = opacity
        this.color = color
        this.group = group
        this.tags = tags
        this.createdAt = createdAt
        this.updatedAt = updatedAt
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
        radialDistortion: [number, number, number],
        tangentialDistortion: [number, number],
        position: [number, number, number],
        rotation: [number, number, number, number],
        imagePoints: Record<ImagePointId, ImagePointDto>,
        calibrationAccuracy: number,
        calibrationDate: string | undefined,
        calibrationNotes: string | undefined,
        isProcessed: boolean,
        processingNotes: string | undefined,
        metadata: any,
        isVisible: boolean,
        opacity: number,
        color: string,
        group: string | undefined,
        tags: string[] | undefined,
        createdAt: string,
        updatedAt: string
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
            radialDistortion,
            tangentialDistortion,
            position,
            rotation,
            imagePoints,
            calibrationAccuracy,
            calibrationDate,
            calibrationNotes,
            isProcessed,
            processingNotes,
            metadata,
            isVisible,
            opacity,
            color,
            group,
            tags,
            createdAt,
            updatedAt
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
            id: options.id || crypto.randomUUID(),
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
            dto.radialDistortion,
            dto.tangentialDistortion,
            dto.position,
            dto.rotation,
            dto.imagePoints,
            dto.calibrationAccuracy,
            dto.calibrationDate,
            dto.calibrationNotes,
            dto.isProcessed,
            dto.processingNotes,
            dto.metadata,
            dto.isVisible,
            dto.opacity,
            dto.color,
            dto.group,
            dto.tags,
            dto.createdAt,
            dto.updatedAt
        )
        viewpoint.isPoseLocked = options.isPoseLocked ?? false
        return viewpoint
    }

    // ============================================================================
    // ISelectable implementation
    // ============================================================================

    getId(): ViewpointId {
        return this.id
    }

    getType(): SelectableType {
        return 'viewpoint'
    }

    getName(): string {
        return this.name
    }

    isLocked(): boolean {
        return this.isPoseLocked
    }

    getDependencies(): EntityId[] {
        return Object.values(this.imagePoints).map(ip => ip.worldPointId as EntityId)
    }

    getDependents(): EntityId[] {
        return []
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
        const count = Object.keys(this.imagePoints).length
        if (count > 0) {
            return `Deleting viewpoint "${this.name}" will remove ${count} image point${count === 1 ? '' : 's'}`
        }
        return null
    }

    // ============================================================================
    // IValidatable implementation
    // ============================================================================

    validate(context: ValidationContext): ValidationResult {
        const errors: ValidationError[] = []
        const warnings: ValidationError[] = []

        const nameError = ValidationHelpers.validateRequiredField(this.name, 'name', this.id, 'viewpoint')
        if (nameError) errors.push(nameError)

        const idError = ValidationHelpers.validateIdFormat(this.id, 'viewpoint')
        if (idError) errors.push(idError)

        if (this.imageWidth <= 0) {
            errors.push(ValidationHelpers.createError('INVALID_WIDTH', 'imageWidth must be > 0', this.id, 'viewpoint', 'imageWidth'))
        }
        if (this.imageHeight <= 0) {
            errors.push(ValidationHelpers.createError('INVALID_HEIGHT', 'imageHeight must be > 0', this.id, 'viewpoint', 'imageHeight'))
        }

        if (this.focalLength <= 0) {
            errors.push(ValidationHelpers.createError('INVALID_FOCAL_LENGTH', 'focalLength must be > 0', this.id, 'viewpoint', 'focalLength'))
        }
        if (this.aspectRatio <= 0) {
            errors.push(ValidationHelpers.createError('INVALID_ASPECT_RATIO', 'aspectRatio must be > 0', this.id, 'viewpoint', 'aspectRatio'))
        }

        if (this.rotation.length === 4) {
            const [w, x, y, z] = this.rotation
            const magSq = w * w + x * x + y * y + z * z
            if (Math.abs(magSq - 1.0) > 0.01) {
                warnings.push(ValidationHelpers.createWarning('NON_UNIT_QUATERNION', `rotation quaternion not unit length (|q|² = ${magSq.toFixed(4)})`, this.id, 'viewpoint', 'rotation'))
            }
        }

        Object.entries(this.imagePoints).forEach(([imagePointId, imagePoint]) => {
            if (imagePoint.u < 0 || imagePoint.u > this.imageWidth) {
                warnings.push(ValidationHelpers.createWarning('IMAGE_POINT_OUT_OF_BOUNDS', `Image point ${imagePointId} u-coordinate outside bounds`, this.id, 'viewpoint', 'imagePoints'))
            }
            if (imagePoint.v < 0 || imagePoint.v > this.imageHeight) {
                warnings.push(ValidationHelpers.createWarning('IMAGE_POINT_OUT_OF_BOUNDS', `Image point ${imagePointId} v-coordinate outside bounds`, this.id, 'viewpoint', 'imagePoints'))
            }
            if (imagePoint.confidence < 0 || imagePoint.confidence > 1) {
                errors.push(ValidationHelpers.createError('INVALID_CONFIDENCE', `Image point ${imagePointId} confidence must be 0-1`, this.id, 'viewpoint', 'imagePoints'))
            }
        })

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            summary: errors.length === 0 ? 'Viewpoint validation passed' : `Viewpoint validation failed: ${errors.length} errors`
        }
    }

    private static validateDto(dto: any): ValidationResult {
        const errors: ValidationError[] = []

        if (!dto.id) errors.push(ValidationHelpers.createError('MISSING_REQUIRED_FIELD', 'id required', dto.id, 'viewpoint', 'id'))
        if (!dto.name) errors.push(ValidationHelpers.createError('MISSING_REQUIRED_FIELD', 'name required', dto.id, 'viewpoint', 'name'))
        if (!dto.filename) errors.push(ValidationHelpers.createError('MISSING_REQUIRED_FIELD', 'filename required', dto.id, 'viewpoint', 'filename'))
        if (!dto.url) errors.push(ValidationHelpers.createError('MISSING_REQUIRED_FIELD', 'url required', dto.id, 'viewpoint', 'url'))

        return {
            isValid: errors.length === 0,
            errors,
            warnings: [],
            summary: errors.length === 0 ? 'DTO validation passed' : `DTO validation failed: ${errors.length} errors`
        }
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
        this.updatedAt = new Date().toISOString()
    }
    addImagePoint(imagePoint: ImagePointDto): void {
        this.imagePoints[imagePoint.id] = imagePoint
        this.updatedAt = new Date().toISOString()
    }

    updateImagePoint(id: ImagePointId, updates: Partial<ImagePointDto>): void {
        const existing = this.imagePoints[id]
        if (existing) {
            this.imagePoints[id] = {
                ...existing,
                ...updates,
                updatedAt: new Date().toISOString()
            }
            this.updatedAt = new Date().toISOString()
        }
    }

    removeImagePoint(id: ImagePointId): void {
        delete this.imagePoints[id]
        this.updatedAt = new Date().toISOString()
    }

    getImagePointCount(): number {
        return Object.keys(this.imagePoints).length
    }

    getImagePointsForWorldPoint(worldPointId: string): ImagePointDto[] {
        return Object.values(this.imagePoints).filter(ip => ip.worldPointId === worldPointId)
    }

    getVisibleImagePoints(): ImagePointDto[] {
        return Object.values(this.imagePoints).filter(ip => ip.isVisible)
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

    clone(newId: ViewpointId, newName?: string): Viewpoint {
        const now = new Date().toISOString()
        return new Viewpoint(
            newId,
            newName || `${this.name} (copy)`,
            this.filename,
            this.url,
            this.imageWidth,
            this.imageHeight,
            this.focalLength,
            this.principalPointX,
            this.principalPointY,
            this.skewCoefficient,
            this.aspectRatio,
            [...this.radialDistortion],
            [...this.tangentialDistortion],
            [...this.position],
            [...this.rotation],
            {...this.imagePoints},
            this.calibrationAccuracy,
            this.calibrationDate,
            this.calibrationNotes,
            this.isProcessed,
            this.processingNotes,
            this.metadata ? {...this.metadata} : undefined,
            this.isVisible,
            this.opacity,
            this.color,
            this.group,
            this.tags,
            now,
            now
        )
    }

    setVisible(visible: boolean): void {
        this.isVisible = visible
        this.updatedAt = new Date().toISOString()
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
            position,
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
        this.updatedAt = new Date().toISOString()
    }
}
