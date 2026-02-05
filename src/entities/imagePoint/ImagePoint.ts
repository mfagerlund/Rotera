import type {ISelectable, SelectableType} from '../../types/selectable'
import type {IImagePoint} from '../interfaces'
import type { WorldPoint } from '../world-point'
import type { Viewpoint } from '../viewpoint'
import type { ISerializable } from '../serialization/ISerializable'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { ImagePointDto } from './ImagePointDto'
import { projectPointToPixel } from '../../optimization/analytical/project-point-plain'
import {makeAutoObservable} from 'mobx'

export class ImagePoint implements ISelectable, IImagePoint, ISerializable<ImagePointDto> {
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

    /**
     * Compute reprojected position from entity properties (no autodiff).
     * Call this after WorldPoint and Viewpoint have been updated from variables.
     */
    computeReprojectedPositionFromEntities(useIsZReflected: boolean): void {
        const wpXyz = this.worldPoint.optimizedXyz
        if (!wpXyz) return

        const vp = this.viewpoint

        const intrinsics = {
            fx: vp.focalLength,
            fy: vp.focalLength * vp.aspectRatio,
            cx: vp.principalPointX,
            cy: vp.principalPointY,
            k1: vp.radialDistortion[0],
            k2: vp.radialDistortion[1],
            k3: vp.radialDistortion[2],
            p1: vp.tangentialDistortion[0],
            p2: vp.tangentialDistortion[1],
        }

        const isZReflected = useIsZReflected ? vp.isZReflected : false

        const projected = projectPointToPixel(
            wpXyz,
            vp.position,
            vp.rotation,
            intrinsics,
            isZReflected
        )

        if (projected) {
            this.reprojectedU = projected[0]
            this.reprojectedV = projected[1]
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
