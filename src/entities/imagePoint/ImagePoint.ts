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
            cameraValues.p2
        )

        if (!projection) {
            return [V.C(1000), V.C(1000)]
        }

        const [projected_u, projected_v] = projection

        const residual_u = V.sub(projected_u, V.C(this.u))
        const residual_v = V.sub(projected_v, V.C(this.v))

        return [residual_u, residual_v]
    }

    applyOptimizationResult(_valueMap: ValueMap): void {
        const residuals = this.computeResiduals(_valueMap)
        this.lastResiduals = residuals.map(r => r.data)

        const worldPointVec = _valueMap.points.get(this.worldPoint)
        const cameraValues = _valueMap.cameras.get(this.viewpoint)

        if (worldPointVec && cameraValues) {
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
                cameraValues.p2
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
            confidence: this.confidence
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

        context.registerEntity(imagePoint, dto.id)

        worldPoint.addImagePoint(imagePoint)
        viewpoint.addImagePoint(imagePoint)

        return imagePoint
    }
}
