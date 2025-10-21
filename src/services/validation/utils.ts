// Validation utility functions

export function calculateDistance(pointA: (number | null)[], pointB: (number | null)[]): number {
  // Filter out nulls - validation should have already checked for this
  const ax = pointA[0] ?? 0
  const ay = pointA[1] ?? 0
  const az = pointA[2] ?? 0
  const bx = pointB[0] ?? 0
  const by = pointB[1] ?? 0
  const bz = pointB[2] ?? 0

  const dx = ax - bx
  const dy = ay - by
  const dz = az - bz
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export function calculateAngle(pointA: (number | null)[], vertex: (number | null)[], pointC: (number | null)[]): number {
  // Filter out nulls
  const ax = pointA[0] ?? 0
  const ay = pointA[1] ?? 0
  const az = pointA[2] ?? 0
  const vx = vertex[0] ?? 0
  const vy = vertex[1] ?? 0
  const vz = vertex[2] ?? 0
  const cx = pointC[0] ?? 0
  const cy = pointC[1] ?? 0
  const cz = pointC[2] ?? 0

  const va = [ax - vx, ay - vy, az - vz]
  const vc = [cx - vx, cy - vy, cz - vz]

  const dotProduct = va[0] * vc[0] + va[1] * vc[1] + va[2] * vc[2]
  const magA = Math.sqrt(va[0] * va[0] + va[1] * va[1] + va[2] * va[2])
  const magC = Math.sqrt(vc[0] * vc[0] + vc[1] * vc[1] + vc[2] * vc[2])

  if (magA === 0 || magC === 0) return 0

  const cosAngle = Math.max(-1, Math.min(1, dotProduct / (magA * magC)))
  return Math.acos(cosAngle) * (180 / Math.PI)
}

export function calculateVectorAngle(vector1: number[], vector2: number[]): number {
  const dotProduct = vector1[0] * vector2[0] + vector1[1] * vector2[1] + vector1[2] * vector2[2]
  const mag1 = Math.sqrt(vector1[0] * vector1[0] + vector1[1] * vector1[1] + vector1[2] * vector1[2])
  const mag2 = Math.sqrt(vector2[0] * vector2[0] + vector2[1] * vector2[1] + vector2[2] * vector2[2])

  if (mag1 === 0 || mag2 === 0) return 0

  const cosAngle = Math.max(-1, Math.min(1, dotProduct / (mag1 * mag2)))
  return Math.acos(cosAngle) * (180 / Math.PI)
}
