export interface IWorldPoint {
    getName(): string
    hasCoordinates(): boolean
    lockedXyz?: [number | null, number | null, number | null]
    color: string
    getEffectiveXyz(): [number | null, number | null, number | null]
}

export interface ILine {
    pointA: IWorldPoint
    pointB: IWorldPoint
}

export interface IConstraint {
}

export interface IImagePoint {
    worldPoint: IWorldPoint  // Use interfaces here to avoid circular imports
    viewpoint: IViewpoint    // Concrete class has concrete types
    u: number
    v: number
    isVisible: boolean
    confidence: number
    isOutlier: boolean
    reprojectedU?: number
    reprojectedV?: number
}

export interface IViewpoint {
    getName(): string
    imageWidth: number
    imageHeight: number
    imagePoints: Set<IImagePoint>
}
