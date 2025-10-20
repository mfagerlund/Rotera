import type {ISelectable, SelectableType} from '../../types/selectable'
import type {IWorldPoint, IImagePoint, IViewpoint} from '../interfaces'

export class ImagePoint implements ISelectable, IImagePoint {
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
}
