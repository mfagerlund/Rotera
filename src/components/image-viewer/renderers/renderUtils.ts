// Utility functions for rendering

export interface Point2D {
  x: number
  y: number
}

export interface ImagePoint {
  u: number
  v: number
}

export interface Offset {
  x: number
  y: number
}

/**
 * Convert image coordinates (u, v) to canvas coordinates (x, y)
 * @param u - Image x coordinate in pixels
 * @param v - Image y coordinate in pixels
 * @param scale - Zoom scale factor
 * @param offset - Pan offset in canvas space
 * @returns Canvas coordinates
 */
export function imageToCanvas(u: number, v: number, scale: number, offset: Offset): Point2D {
  return {
    x: u * scale + offset.x,
    y: v * scale + offset.y
  }
}

/**
 * Convert an image point to canvas coordinates
 * @param point - Image point with u, v coordinates
 * @param scale - Zoom scale factor
 * @param offset - Pan offset in canvas space
 * @returns Canvas coordinates
 */
export function imagePointToCanvas(point: ImagePoint, scale: number, offset: Offset): Point2D {
  return imageToCanvas(point.u, point.v, scale, offset)
}
