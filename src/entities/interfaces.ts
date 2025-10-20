export interface IWorldPoint {
    getName(): string
    hasCoordinates(): boolean
    lockedXyz?: [number | null, number | null, number | null]
}

export interface ILine {
    pointA: IWorldPoint
    pointB: IWorldPoint
}

export interface IConstraint {
}

export interface IImagePoint {
    worldPoint: IWorldPoint
    viewpoint: IViewpoint
    u: number
    v: number
    isVisible: boolean
    confidence: number
}

export interface IViewpoint {
    getName(): string
    imageWidth: number
    imageHeight: number
}
