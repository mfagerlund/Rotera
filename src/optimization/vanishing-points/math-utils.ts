/**
 * Math utilities for vanishing point calculations
 */

export function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0))
  if (norm < 1e-10) {
    return v
  }
  return v.map(x => x / norm)
}

export function cross(a: number[], b: number[]): number[] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
}

export function matrixToQuaternion(R: number[][]): [number, number, number, number] {
  const trace = R[0][0] + R[1][1] + R[2][2]

  let w: number, x: number, y: number, z: number

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0)
    w = 0.25 / s
    x = (R[2][1] - R[1][2]) * s
    y = (R[0][2] - R[2][0]) * s
    z = (R[1][0] - R[0][1]) * s
  } else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
    const s = 2.0 * Math.sqrt(1.0 + R[0][0] - R[1][1] - R[2][2])
    w = (R[2][1] - R[1][2]) / s
    x = 0.25 * s
    y = (R[0][1] + R[1][0]) / s
    z = (R[0][2] + R[2][0]) / s
  } else if (R[1][1] > R[2][2]) {
    const s = 2.0 * Math.sqrt(1.0 + R[1][1] - R[0][0] - R[2][2])
    w = (R[0][2] - R[2][0]) / s
    x = (R[0][1] + R[1][0]) / s
    y = 0.25 * s
    z = (R[1][2] + R[2][1]) / s
  } else {
    const s = 2.0 * Math.sqrt(1.0 + R[2][2] - R[0][0] - R[1][1])
    w = (R[1][0] - R[0][1]) / s
    x = (R[0][2] + R[2][0]) / s
    y = (R[1][2] + R[2][1]) / s
    z = 0.25 * s
  }

  const mag = Math.sqrt(w * w + x * x + y * y + z * z)
  return [w / mag, x / mag, y / mag, z / mag]
}

export function quaternionToEulerDegrees(q: [number, number, number, number]): { rollDeg: number; pitchDeg: number; yawDeg: number } {
  const [w, x, y, z] = q

  // Roll (X-axis rotation)
  const sinr_cosp = 2 * (w * x + y * z)
  const cosr_cosp = 1 - 2 * (x * x + y * y)
  const roll = Math.atan2(sinr_cosp, cosr_cosp)

  // Pitch (Y-axis rotation)
  const sinp = 2 * (w * y - z * x)
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp)

  // Yaw (Z-axis rotation)
  const siny_cosp = 2 * (w * z + x * y)
  const cosy_cosp = 1 - 2 * (y * y + z * z)
  const yaw = Math.atan2(siny_cosp, cosy_cosp)

  const toDeg = (rad: number) => rad * 180 / Math.PI
  return { rollDeg: toDeg(roll), pitchDeg: toDeg(pitch), yawDeg: toDeg(yaw) }
}

function simpleSVD(A: number[][]): { V: number[][] } | null {
  const m = A.length
  const n = A[0].length

  const AtA: number[][] = Array(n).fill(0).map(() => Array(n).fill(0))

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0
      for (let k = 0; k < m; k++) {
        sum += A[k][i] * A[k][j]
      }
      AtA[i][j] = sum
    }
  }

  const eigResult = inversePowerIteration(AtA, 100)
  if (!eigResult) {
    return null
  }

  return { V: [[0, 0, 1], [0, 1, 0], eigResult.vector] }
}

function inversePowerIteration(A: number[][], maxIter: number): { vector: number[] } | null {
  const n = A.length

  const shift = 1e-6
  const AShifted: number[][] = Array(n).fill(0).map((_, i) =>
    Array(n).fill(0).map((_, j) =>
      i === j ? A[i][j] + shift : A[i][j]
    )
  )

  let v = Array(n).fill(1 / Math.sqrt(n))

  for (let iter = 0; iter < maxIter; iter++) {
    const y = solveLinearSystem(AShifted, v)
    if (!y) {
      return null
    }

    const norm = Math.sqrt(y.reduce((sum, x) => sum + x * x, 0))
    if (norm < 1e-10) {
      return null
    }

    v = y.map(x => x / norm)
  }

  return { vector: v }
}

function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length
  const aug: number[][] = A.map((row, i) => [...row, b[i]])

  for (let i = 0; i < n; i++) {
    let maxRow = i
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) {
        maxRow = k
      }
    }

    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]]

    if (Math.abs(aug[i][i]) < 1e-10) {
      return null
    }

    for (let k = i + 1; k < n; k++) {
      const factor = aug[k][i] / aug[i][i]
      for (let j = i; j <= n; j++) {
        aug[k][j] -= factor * aug[i][j]
      }
    }
  }

  const x = Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n]
    for (let j = i + 1; j < n; j++) {
      x[i] -= aug[i][j] * x[j]
    }
    x[i] /= aug[i][i]
  }

  return x
}

export function solveLinearSystem3x3(A: number[][], b: number[]): number[] | null {
  const det =
    A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
    A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
    A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0])

  if (Math.abs(det) < 1e-10) {
    return null
  }

  const invA: number[][] = [
    [
      (A[1][1] * A[2][2] - A[1][2] * A[2][1]) / det,
      (A[0][2] * A[2][1] - A[0][1] * A[2][2]) / det,
      (A[0][1] * A[1][2] - A[0][2] * A[1][1]) / det
    ],
    [
      (A[1][2] * A[2][0] - A[1][0] * A[2][2]) / det,
      (A[0][0] * A[2][2] - A[0][2] * A[2][0]) / det,
      (A[0][2] * A[1][0] - A[0][0] * A[1][2]) / det
    ],
    [
      (A[1][0] * A[2][1] - A[1][1] * A[2][0]) / det,
      (A[0][1] * A[2][0] - A[0][0] * A[2][1]) / det,
      (A[0][0] * A[1][1] - A[0][1] * A[1][0]) / det
    ]
  ]

  const x = [
    invA[0][0] * b[0] + invA[0][1] * b[1] + invA[0][2] * b[2],
    invA[1][0] * b[0] + invA[1][1] * b[1] + invA[1][2] * b[2],
    invA[2][0] * b[0] + invA[2][1] * b[1] + invA[2][2] * b[2]
  ]

  return x
}

function powerIteration(A: number[][], maxIter: number): { vector: number[] } | null {
  const n = A.length
  let v = Array(n).fill(1 / Math.sqrt(n))

  for (let iter = 0; iter < maxIter; iter++) {
    const Av = Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        Av[i] += A[i][j] * v[j]
      }
    }

    const norm = Math.sqrt(Av.reduce((sum, x) => sum + x * x, 0))
    if (norm < 1e-10) {
      return null
    }

    v = Av.map(x => x / norm)
  }

  return { vector: v }
}

/**
 * Compute SVD and return vanishing point from line equations
 */
export function computeVPFromSVD(lines: Array<{ p1: { u: number; v: number }; p2: { u: number; v: number } }>): { u: number; v: number } | null {
  const homogeneousLines: Array<[number, number, number]> = lines.map(line => {
    const p1 = [line.p1.u, line.p1.v, 1]
    const p2 = [line.p2.u, line.p2.v, 1]

    const a = p1[1] * p2[2] - p1[2] * p2[1]
    const b = p1[2] * p2[0] - p1[0] * p2[2]
    const c = p1[0] * p2[1] - p1[1] * p2[0]

    return [a, b, c]
  })

  const A: number[][] = homogeneousLines.map(l => [l[0], l[1], l[2]])

  const svdResult = simpleSVD(A)
  if (!svdResult) {
    return null
  }

  const vp = svdResult.V[2]

  if (Math.abs(vp[2]) < 1e-10) {
    return null
  }

  return {
    u: vp[0] / vp[2],
    v: vp[1] / vp[2]
  }
}
