declare module 'js-aruco2' {
  interface MarkerCorner {
    x: number
    y: number
  }

  interface DetectedMarker {
    id: number
    corners: [MarkerCorner, MarkerCorner, MarkerCorner, MarkerCorner]
    hammingDistance: number
  }

  interface DetectorConfig {
    dictionaryName?: string
    maxHammingDistance?: number
  }

  interface ImageLike {
    width: number
    height: number
    data: Uint8ClampedArray
  }

  class Detector {
    constructor(config?: DetectorConfig)
    detect(image: ImageLike): DetectedMarker[]
    detectImage(width: number, height: number, data: Uint8ClampedArray): DetectedMarker[]
  }

  class Dictionary {
    constructor(dicName: string)
    codeList: string[]
    markSize: number
    generateSVG(id: number): string
    find(bits: number[][]): { id: number; distance: number } | undefined
  }

  export const AR: {
    Detector: typeof Detector
    Dictionary: typeof Dictionary
    DICTIONARIES: Record<string, { nBits: number; tau: number; codeList: number[] }>
  }
}
