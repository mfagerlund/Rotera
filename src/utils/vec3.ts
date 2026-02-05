/**
 * Utility functions for 3D vector operations on plain number arrays.
 * All vector operations in the codebase use plain numbers.
 */

export type Vec3Array = [number, number, number]

export function add(a: Vec3Array, b: Vec3Array): Vec3Array {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export function subtract(a: Vec3Array, b: Vec3Array): Vec3Array {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function scale(v: Vec3Array, s: number): Vec3Array {
  return [v[0] * s, v[1] * s, v[2] * s]
}

export function sqrMagnitude(v: Vec3Array): number {
  return v[0] * v[0] + v[1] * v[1] + v[2] * v[2]
}

export function magnitude(v: Vec3Array): number {
  return Math.sqrt(sqrMagnitude(v))
}

export function normalize(v: Vec3Array, epsilon: number = 1e-10): Vec3Array {
  const mag = magnitude(v)
  if (mag < epsilon) {
    return [0, 0, 0]
  }
  return [v[0] / mag, v[1] / mag, v[2] / mag]
}

export function dot(a: Vec3Array, b: Vec3Array): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function cross(a: Vec3Array, b: Vec3Array): Vec3Array {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
}

export function distance(a: Vec3Array, b: Vec3Array): number {
  return magnitude(subtract(a, b))
}

export function sqrDistance(a: Vec3Array, b: Vec3Array): number {
  return sqrMagnitude(subtract(a, b))
}

export function midpoint(a: Vec3Array, b: Vec3Array): Vec3Array {
  return [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2
  ]
}

export function lerp(a: Vec3Array, b: Vec3Array, t: number): Vec3Array {
  return [
    a[0] + t * (b[0] - a[0]),
    a[1] + t * (b[1] - a[1]),
    a[2] + t * (b[2] - a[2])
  ]
}

export function project(a: Vec3Array, b: Vec3Array): Vec3Array {
  const bMagSq = sqrMagnitude(b)
  if (bMagSq < 1e-10) {
    return [0, 0, 0]
  }
  const scalar = dot(a, b) / bMagSq
  return scale(b, scalar)
}

export function angleBetween(a: Vec3Array, b: Vec3Array): number {
  const dotProduct = dot(a, b)
  const magProduct = magnitude(a) * magnitude(b)

  if (magProduct < 1e-10) {
    return 0
  }

  const cosAngle = Math.max(-1, Math.min(1, dotProduct / magProduct))
  return Math.acos(cosAngle)
}

export function equals(a: Vec3Array, b: Vec3Array, tolerance: number = 1e-6): boolean {
  return (
    Math.abs(a[0] - b[0]) < tolerance &&
    Math.abs(a[1] - b[1]) < tolerance &&
    Math.abs(a[2] - b[2]) < tolerance
  )
}

export function isZero(v: Vec3Array, tolerance: number = 1e-10): boolean {
  return sqrMagnitude(v) < tolerance * tolerance
}

export function min(a: Vec3Array, b: Vec3Array): Vec3Array {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.min(a[2], b[2])
  ]
}

export function max(a: Vec3Array, b: Vec3Array): Vec3Array {
  return [
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
    Math.max(a[2], b[2])
  ]
}

export function clamp(v: Vec3Array, minVal: number, maxVal: number): Vec3Array {
  return [
    Math.max(minVal, Math.min(maxVal, v[0])),
    Math.max(minVal, Math.min(maxVal, v[1])),
    Math.max(minVal, Math.min(maxVal, v[2]))
  ]
}

export function toString(v: Vec3Array, decimals: number = 3): string {
  return `[${v[0].toFixed(decimals)}, ${v[1].toFixed(decimals)}, ${v[2].toFixed(decimals)}]`
}

export function fromArray(arr: number[]): Vec3Array {
  if (arr.length !== 3) {
    throw new Error(`vec3.fromArray: Expected array of length 3, got ${arr.length}`)
  }
  return [arr[0], arr[1], arr[2]]
}

export function distanceToLineSegment(
  point: Vec3Array,
  lineStart: Vec3Array,
  lineEnd: Vec3Array
): number {
  const lineVec = subtract(lineEnd, lineStart)
  const pointVec = subtract(point, lineStart)

  const lineLengthSq = sqrMagnitude(lineVec)

  if (lineLengthSq < 1e-10) {
    return distance(point, lineStart)
  }

  const t = Math.max(0, Math.min(1, dot(pointVec, lineVec) / lineLengthSq))
  const closestPoint = add(lineStart, scale(lineVec, t))

  return distance(point, closestPoint)
}

export function distanceToLine(
  point: Vec3Array,
  linePoint: Vec3Array,
  lineDirection: Vec3Array
): number {
  const pointVec = subtract(point, linePoint)
  const dir = normalize(lineDirection)

  const proj = scale(dir, dot(pointVec, dir))
  const perp = subtract(pointVec, proj)

  return magnitude(perp)
}
