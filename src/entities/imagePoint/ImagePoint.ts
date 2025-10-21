import type {ISelectable, SelectableType} from '../../types/selectable'
import type {IWorldPoint, IImagePoint, IViewpoint} from '../interfaces'
import type { ISerializable } from '../serialization/ISerializable'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { ImagePointDto } from './ImagePointDto'
import {makeAutoObservable} from 'mobx'

export class ImagePoint implements ISelectable, IImagePoint, ISerializable<ImagePointDto> {
    selected = false

    worldPoint: IWorldPoint
    viewpoint: IViewpoint
    u: number
    v: number
    isVisible: boolean
    confidence: number

    public constructor(
        worldPoint: IWorldPoint,
        viewpoint: IViewpoint,
        u: number,
        v: number,
        isVisible: boolean,
        confidence: number,
    ) {
        this.worldPoint = worldPoint
        this.viewpoint = viewpoint
        this.u = u
        this.v = v
        this.isVisible = isVisible
        this.confidence = confidence

        makeAutoObservable(this, {}, { autoBind: true })
    }

    static create(
        worldPoint: IWorldPoint,
        viewpoint: IViewpoint,
        u: number,
        v: number,
        options: {
            id?: string
            isVisible?: boolean
            confidence?: number
        } = {}
    ): ImagePoint {
        const now = new Date().toISOString()
        return new ImagePoint(
            worldPoint,
            viewpoint,
            u,
            v,
            options.isVisible ?? true,
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

    setVisible(visible: boolean): void {
        this.isVisible = visible
    }

    setConfidence(confidence: number): void {
        if (confidence < 0 || confidence > 1) {
            throw new Error('Confidence must be between 0 and 1')
        }
        this.confidence = confidence
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
            isVisible: this.isVisible,
            confidence: this.confidence
        }
    }

    static deserialize(dto: ImagePointDto, context: SerializationContext): ImagePoint {
        const worldPoint = context.getEntity<IWorldPoint>(dto.worldPointId)
        const viewpoint = context.getEntity<IViewpoint>(dto.viewpointId)

        if (!worldPoint || !viewpoint) {
            throw new Error(
                `ImagePoint: Cannot deserialize - dependencies not found in context. ` +
                `Missing: ${!worldPoint ? dto.worldPointId : ''}${!worldPoint && !viewpoint ? ', ' : ''}${!viewpoint ? dto.viewpointId : ''}`
            )
        }

        const imagePoint = ImagePoint.create(worldPoint, viewpoint, dto.u, dto.v, {
            isVisible: dto.isVisible,
            confidence: dto.confidence
        })

        context.registerEntity(imagePoint, dto.id)

        if ('addImagePoint' in worldPoint && typeof worldPoint.addImagePoint === 'function') {
            worldPoint.addImagePoint(imagePoint)
        }
        if ('addImagePoint' in viewpoint && typeof viewpoint.addImagePoint === 'function') {
            viewpoint.addImagePoint(imagePoint)
        }

        return imagePoint
    }
}
