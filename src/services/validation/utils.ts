import { Vec3Utils } from 'scalar-autograd'

export function calculateDistance(pointA: (number | null)[], pointB: (number | null)[]): number {
  const ax = pointA[0] ?? 0
  const ay = pointA[1] ?? 0
  const az = pointA[2] ?? 0
  const bx = pointB[0] ?? 0
  const by = pointB[1] ?? 0
  const bz = pointB[2] ?? 0

  return Vec3Utils.distance([ax, ay, az], [bx, by, bz])
}

export function calculateAngle(pointA: (number | null)[], vertex: (number | null)[], pointC: (number | null)[]): number {
  const ax = pointA[0] ?? 0
  const ay = pointA[1] ?? 0
  const az = pointA[2] ?? 0
  const vx = vertex[0] ?? 0
  const vy = vertex[1] ?? 0
  const vz = vertex[2] ?? 0
  const cx = pointC[0] ?? 0
  const cy = pointC[1] ?? 0
  const cz = pointC[2] ?? 0

  const va: [number, number, number] = [ax - vx, ay - vy, az - vz]
  const vc: [number, number, number] = [cx - vx, cy - vy, cz - vz]

  const angleRad = Vec3Utils.angleBetween(va, vc)
  return angleRad * (180 / Math.PI)
}

export function calculateVectorAngle(vector1: number[], vector2: number[]): number {
  const v1: [number, number, number] = [vector1[0], vector1[1], vector1[2]]
  const v2: [number, number, number] = [vector2[0], vector2[1], vector2[2]]

  const angleRad = Vec3Utils.angleBetween(v1, v2)
  return angleRad * (180 / Math.PI)
}
