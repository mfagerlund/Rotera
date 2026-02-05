import type {ISelectable, SelectableType} from '../../types/selectable'
import type {IImagePoint} from '../interfaces'
import type { WorldPoint } from '../world-point'
import type { Viewpoint } from '../viewpoint'
import type { ISerializable } from '../serialization/ISerializable'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { ImagePointDto } from './ImagePointDto'
import type { IResidualProvider, IOptimizationResultReceiver, ValueMap } from '../../optimization/IOptimizable'
import { V, Value } from 'scalar-autograd'
import { projectWorldPointToPixelQuaternion } from '../../optimization/camera-projection'
import { Quaternion } from '../../optimization/Quaternion'
import {makeAutoObservable} from 'mobx'

export class ImagePoint implements ISelectable, IImagePoint, IResidualProvider, IOptimizationResultReceiver, ISerializable<ImagePointDto> {
    selected = false
    lastResiduals: number[] = []
    isOutlier = false
    reprojectedU?: number
    reprojectedV?: number

    worldPoint: WorldPoint
    viewpoint: Viewpoint
    u: number
    v: number
    confidence: number

    public constructor(
        worldPoint: WorldPoint,
        viewpoint: Viewpoint,
        u: number,
        v: number,
        confidence: number,
    ) {
        this.worldPoint = worldPoint
        this.viewpoint = viewpoint
        this.u = u
        this.v = v
        this.confidence = confidence

        makeAutoObservable(this, {}, { autoBind: true })
    }

    static create(
        worldPoint: WorldPoint,
        viewpoint: Viewpoint,
        u: number,
        v: number,
        options: {
            id?: string
            confidence?: number
        } = {}
    ): ImagePoint {
        const now = new Date().toISOString()
        return new ImagePoint(
            worldPoint,
            viewpoint,
            u,
            v,
            options.confidence ?? 1.0
        )
    }

    getType(): SelectableType {
        return 'imagePoint' as SelectableType
    }

    getName(): string {
        return `${this.worldPoint.getName()} @ ${this.viewpoint.getName()}`
    }

    isLocked(): boolean {
        return false
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
        return null
    }
    
    setPosition(u: number, v: number): void {
        this.u = u
        this.v = v
    }

    setConfidence(confidence: number): void {
        if (confidence < 0 || confidence > 1) {
            throw new Error('Confidence must be between 0 and 1')
        }
        this.confidence = confidence
    }

    computeResiduals(valueMap: ValueMap): Value[] {
        const worldPointVec = valueMap.points.get(this.worldPoint)
        if (!worldPointVec) {
            return []
        }

        const cameraValues = valueMap.cameras.get(this.viewpoint)
        if (!cameraValues) {
            return []
        }

        // Use isZReflected only when valueMap.useIsZReflected is true.
        // - During calibration: false (isZReflected changes mid-optimization)
        // - During fine-tune: true (isZReflected is already set correctly)
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
            // Point is behind camera (Z < 0.1).
            // Different handling for calibration vs fine-tune:
            // - Calibration (useIsZReflected=false): Use differentiable penalty to guide solver
            // - Fine-tune (useIsZReflected=true): Skip this point (cameras are already correct)
            if (valueMap.useIsZReflected) {
                // During fine-tune, points should be in front. If not, it's likely a numerical
                // artifact - skip this point rather than adding a destabilizing penalty.
                return []
            }

            // During calibration, use differentiable penalty based on camera Z to guide the solver.
            const translated = worldPointVec.sub(cameraValues.position)
            const rotated = Quaternion.rotateVector(cameraValues.rotation, translated)
            const camZ = isZReflected ? V.neg(rotated.z) : rotated.z

            // Soft penalty that pushes points towards Z > 0.1
            // The penalty should be differentiable and guide the solver to move points forward.
            const NEAR_PLANE = 0.1
            const SCALE = 500  // Moderate penalty scale

            // Compute penalty: scale * (NEAR_PLANE - z) for z < NEAR_PLANE
            // The penalty increases as the point goes further behind
            const deficit = V.sub(V.C(NEAR_PLANE), camZ)  // How far below threshold
            const penalty = V.mul(deficit, V.C(SCALE))

            return [penalty, penalty]
        }

        const [projected_u, projected_v] = projection

        const residual_u = V.sub(projected_u, V.C(this.u))
        const residual_v = V.sub(projected_v, V.C(this.v))

        return [residual_u, residual_v]
    }

    /**
     * Apply optimization result and compute residuals.
     * @deprecated Use applyOptimizationResultWithoutResiduals + distributeResiduals instead
     */
    applyOptimizationResult(_valueMap: ValueMap): void {
        const residuals = this.computeResiduals(_valueMap)
        this.lastResiduals = residuals.map(r => r.data)
        this.applyOptimizationResultWithoutResiduals(_valueMap)
    }

    /**
     * Apply optimization result without computing residuals.
     * Residuals are set separately via analytical provider results.
     */
    applyOptimizationResultWithoutResiduals(_valueMap: ValueMap): void {
        const worldPointVec = _valueMap.points.get(this.worldPoint)
        const cameraValues = _valueMap.cameras.get(this.viewpoint)

        if (worldPointVec && cameraValues) {
            const isZReflected = _valueMap.useIsZReflected ? cameraValues.isZReflected : false

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

            if (projection) {
                this.reprojectedU = projection[0].data
                this.reprojectedV = projection[1].data
            }
        }
    }

    getOptimizationInfo() {
        const residuals = this.lastResiduals
        const totalResidual = residuals.length > 0
            ? Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0))
            : 0

        return {
            residuals: residuals,
            totalResidual,
            rmsResidual: residuals.length > 0 ? totalResidual / Math.sqrt(residuals.length) : 0
        }
    }

    serialize(context: SerializationContext): ImagePointDto {
        const id = context.getEntityId(this) || context.registerEntity(this)

        const worldPointId = context.getEntityId(this.worldPoint)
        const viewpointId = context.getEntityId(this.viewpoint)

        if (!worldPointId || !viewpointId) {
            throw new Error(
                `ImagePoint: Cannot serialize - dependencies must be serialized first. ` +
                `Missing: ${!worldPointId ? 'WorldPoint' : ''}${!worldPointId && !viewpointId ? ', ' : ''}${!viewpointId ? 'Viewpoint' : ''}`
            )
        }

        return {
            id,
            worldPointId,
            viewpointId,
            u: this.u,
            v: this.v,
            confidence: this.confidence,
            lastResiduals: this.lastResiduals.length > 0 ? [...this.lastResiduals] : undefined
        }
    }

    static deserialize(dto: ImagePointDto, context: SerializationContext): ImagePoint {
        const worldPoint = context.getEntity<WorldPoint>(dto.worldPointId)
        const viewpoint = context.getEntity<Viewpoint>(dto.viewpointId)

        if (!worldPoint || !viewpoint) {
            throw new Error(
                `ImagePoint: Cannot deserialize - dependencies not found in context. ` +
                `Missing: ${!worldPoint ? dto.worldPointId : ''}${!worldPoint && !viewpoint ? ', ' : ''}${!viewpoint ? dto.viewpointId : ''}`
            )
        }

        const imagePoint = ImagePoint.create(worldPoint, viewpoint, dto.u, dto.v, {
            confidence: dto.confidence
        })

        if (dto.lastResiduals) {
            imagePoint.lastResiduals = [...dto.lastResiduals]
        }

        context.registerEntity(imagePoint, dto.id)

        worldPoint.addImagePoint(imagePoint)
        viewpoint.addImagePoint(imagePoint)

        return imagePoint
    }
}
