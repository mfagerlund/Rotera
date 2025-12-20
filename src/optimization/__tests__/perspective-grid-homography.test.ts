// Test perspective grid homography with real vanishing line data from three-boxes.jpg

describe('Perspective Grid Homography', () => {
  // Real data from three-boxes.jpg (1920x1080)
  const imageWidth = 1920
  const imageHeight = 1080

  // X-axis lines (red, `<`)
  const xLines = [
    { p1: { u: 540, v: 10.5 }, p2: { u: 69, v: 357.5 } },
    { p1: { u: 540, v: 711.5 }, p2: { u: 126, v: 431.5 } }
  ]

  // Z-axis lines (blue, `>`)
  const zLines = [
    { p1: { u: 546, v: 706.5 }, p2: { u: 1007, v: 402.5 } },
    { p1: { u: 541, v: 12.5 }, p2: { u: 1021, v: 351.5 } }
  ]

  // Math helpers (from the grid code)
  type Pt = { x: number; y: number }
  type HLine = [number, number, number]
  type HMat = number[][]

  const toH = (p: Pt): [number, number, number] => [p.x, p.y, 1]

  const cross3 = (a: [number,number,number], b: [number,number,number]): [number,number,number] => [
    a[1]*b[2]-a[2]*b[1],
    a[2]*b[0]-a[0]*b[2],
    a[0]*b[1]-a[1]*b[0]
  ]

  const lineThrough = (p: Pt, q: Pt): HLine => cross3(toH(p), toH(q))

  const interLL = (l1: HLine, l2: HLine): Pt | null => {
    const p = cross3(l1, l2)
    if (Math.abs(p[2]) < 1e-9) return null
    return { x: p[0]/p[2], y: p[1]/p[2] }
  }

  const solve2 = (A: number[][], b: number[]): [number,number] => {
    const [a,b1] = A[0], [c,d] = A[1]
    const det = a*d - b1*c
    if (Math.abs(det) < 1e-12) return [0,0]
    const x = ( d*b[0] - b1*b[1]) / det
    const y = (-c*b[0] + a *b[1]) / det
    return [x,y]
  }

  const homographyUnitToQuad = (P00: Pt, P10: Pt, P01: Pt, P11: Pt): HMat => {
    const M = [
      [P10.x - P00.x, P01.x - P00.x, P00.x],
      [P10.y - P00.y, P01.y - P00.y, P00.y],
      [0,             0,             1    ],
    ]
    const vx = (P10.x + P01.x) - (P11.x + P00.x)
    const vy = (P10.y + P01.y) - (P11.y + P00.y)
    const [h31, h32] = solve2(
      [[P10.x - P00.x, P01.x - P00.x],
       [P10.y - P00.y, P01.y - P00.y]],
      [vx, vy]
    )
    return [
      [M[0][0] + M[0][2]*h31, M[0][1] + M[0][2]*h32, M[0][2]],
      [M[1][0] + M[1][2]*h31, M[1][1] + M[1][2]*h32, M[1][2]],
      [h31,                   h32,                   1      ],
    ]
  }

  const mapUV = (H: HMat, u: number, v: number): Pt => {
    const x = H[0][0]*u + H[0][1]*v + H[0][2]
    const y = H[1][0]*u + H[1][1]*v + H[1][2]
    const w = H[2][0]*u + H[2][1]*v + H[2][2]
    return { x: x/w, y: y/w }
  }

  const computeVanishingPoint = (lines: Array<{p1:{u:number;v:number}, p2:{u:number;v:number}}>): Pt | null => {
    if (lines.length < 2) return null

    const l1 = lineThrough(
      { x: lines[0].p1.u, y: lines[0].p1.v },
      { x: lines[0].p2.u, y: lines[0].p2.v }
    )
    const l2 = lineThrough(
      { x: lines[1].p1.u, y: lines[1].p1.v },
      { x: lines[1].p2.u, y: lines[1].p2.v }
    )

    return interLL(l1, l2)
  }

  it('should compute vanishing points from three-boxes.jpg lines', async () => {
    const vpX = computeVanishingPoint(xLines)
    const vpZ = computeVanishingPoint(zLines)

    expect(vpX).not.toBeNull()
    expect(vpZ).not.toBeNull()

    console.log('VP X (red, `<`):', vpX)
    console.log('VP Z (blue, `>`):', vpZ)

    // VPs might be outside image bounds - that's OK for perspective
  })

  it('should compute quad corners from line intersections', async () => {
    // Pick the two extreme lines for each axis (already provided as xLines and zLines)
    const [LX0, LX1] = xLines
    const [LZ0, LZ1] = zLines

    const x0 = lineThrough(
      { x: LX0.p1.u, y: LX0.p1.v },
      { x: LX0.p2.u, y: LX0.p2.v }
    )
    const x1 = lineThrough(
      { x: LX1.p1.u, y: LX1.p1.v },
      { x: LX1.p2.u, y: LX1.p2.v }
    )
    const z0 = lineThrough(
      { x: LZ0.p1.u, y: LZ0.p1.v },
      { x: LZ0.p2.u, y: LZ0.p2.v }
    )
    const z1 = lineThrough(
      { x: LZ1.p1.u, y: LZ1.p1.v },
      { x: LZ1.p2.u, y: LZ1.p2.v }
    )

    const P00 = interLL(x0, z0)
    const P10 = interLL(x1, z0)
    const P01 = interLL(x0, z1)
    const P11 = interLL(x1, z1)

    expect(P00).not.toBeNull()
    expect(P10).not.toBeNull()
    expect(P01).not.toBeNull()
    expect(P11).not.toBeNull()

    console.log('\n=== QUAD CORNERS ===')
    console.log('P00 (x0 ∩ z0):', P00)
    console.log('P10 (x1 ∩ z0):', P10)
    console.log('P01 (x0 ∩ z1):', P01)
    console.log('P11 (x1 ∩ z1):', P11)

    // Check if corners are reasonable (within reasonable bounds of image)
    const maxReasonableDistance = imageWidth * 10 // 10x image width

    const checkPoint = (p: Pt | null, name: string) => {
      if (!p) return
      const distFromCenter = Math.sqrt(
        Math.pow(p.x - imageWidth/2, 2) +
        Math.pow(p.y - imageHeight/2, 2)
      )
      console.log(`${name} distance from center: ${distFromCenter.toFixed(0)}px`)
      if (distFromCenter > maxReasonableDistance) {
        console.warn(`⚠️  ${name} is VERY far from image center!`)
      }
    }

    checkPoint(P00, 'P00')
    checkPoint(P10, 'P10')
    checkPoint(P01, 'P01')
    checkPoint(P11, 'P11')
  })

  it('should generate reasonable grid lines', async () => {
    const [LX0, LX1] = xLines
    const [LZ0, LZ1] = zLines

    const x0 = lineThrough({ x: LX0.p1.u, y: LX0.p1.v }, { x: LX0.p2.u, y: LX0.p2.v })
    const x1 = lineThrough({ x: LX1.p1.u, y: LX1.p1.v }, { x: LX1.p2.u, y: LX1.p2.v })
    const z0 = lineThrough({ x: LZ0.p1.u, y: LZ0.p1.v }, { x: LZ0.p2.u, y: LZ0.p2.v })
    const z1 = lineThrough({ x: LZ1.p1.u, y: LZ1.p1.v }, { x: LZ1.p2.u, y: LZ1.p2.v })

    const P00 = interLL(x0, z0)!
    const P10 = interLL(x1, z0)!
    const P01 = interLL(x0, z1)!
    const P11 = interLL(x1, z1)!

    const H = homographyUnitToQuad(P00, P10, P01, P11)

    console.log('\n=== GRID LINES ===')
    const nx = 5, ny = 5

    // Generate a few grid lines
    console.log('U-constant lines (vertical in unit square):')
    for (let i = 0; i <= nx; i++) {
      const u = i / nx
      const a = mapUV(H, u, 0)
      const b = mapUV(H, u, 1)
      console.log(`  u=${u.toFixed(2)}: (${a.x.toFixed(0)}, ${a.y.toFixed(0)}) -> (${b.x.toFixed(0)}, ${b.y.toFixed(0)})`)

      // Check if endpoints are reasonable
      const inBounds = (p: Pt) => {
        const margin = imageWidth * 2 // Allow 2x outside for vanishing perspective
        return Math.abs(p.x - imageWidth/2) < margin && Math.abs(p.y - imageHeight/2) < margin
      }

      if (!inBounds(a) || !inBounds(b)) {
        console.warn(`    ⚠️  Line extends far outside image bounds!`)
      }
    }

    console.log('V-constant lines (horizontal in unit square):')
    for (let j = 0; j <= ny; j++) {
      const v = j / ny
      const a = mapUV(H, 0, v)
      const b = mapUV(H, 1, v)
      console.log(`  v=${v.toFixed(2)}: (${a.x.toFixed(0)}, ${a.y.toFixed(0)}) -> (${b.x.toFixed(0)}, ${b.y.toFixed(0)})`)
    }
  })

  it('should verify vanishing lines actually pass through image canvas', async () => {
    console.log('\n=== LINE SEGMENT BOUNDS CHECK ===')

    // Check where actual line SEGMENTS (not infinite lines) are located
    const allLines = [...xLines, ...zLines]

    allLines.forEach((line, idx) => {
      const axis = idx < 2 ? 'X' : 'Z'
      console.log(`\n${axis}-axis line ${idx}:`)
      console.log(`  p1: (${line.p1.u}, ${line.p1.v})`)
      console.log(`  p2: (${line.p2.u}, ${line.p2.v})`)

      const inCanvas = (p: {u: number, v: number}) => {
        return p.u >= 0 && p.u <= imageWidth && p.v >= 0 && p.v <= imageHeight
      }

      console.log(`  p1 in canvas: ${inCanvas(line.p1)}`)
      console.log(`  p2 in canvas: ${inCanvas(line.p2)}`)
    })

    // All endpoints should be in canvas
    allLines.forEach(line => {
      expect(line.p1.u).toBeGreaterThanOrEqual(0)
      expect(line.p1.u).toBeLessThanOrEqual(imageWidth)
      expect(line.p1.v).toBeGreaterThanOrEqual(0)
      expect(line.p1.v).toBeLessThanOrEqual(imageHeight)
      expect(line.p2.u).toBeGreaterThanOrEqual(0)
      expect(line.p2.u).toBeLessThanOrEqual(imageWidth)
      expect(line.p2.v).toBeGreaterThanOrEqual(0)
      expect(line.p2.v).toBeLessThanOrEqual(imageHeight)
    })
  })

  it('should find which line intersections are actually on-canvas', async () => {
    console.log('\n=== ALL LINE INTERSECTIONS ===')

    const isOnCanvas = (p: Pt) => {
      return p.x >= 0 && p.x <= imageWidth && p.y >= 0 && p.y <= imageHeight
    }

    // Compute ALL 4 intersections
    for (let i = 0; i < xLines.length; i++) {
      for (let j = 0; j < zLines.length; j++) {
        const xLine = xLines[i]
        const zLine = zLines[j]

        const x = lineThrough({ x: xLine.p1.u, y: xLine.p1.v }, { x: xLine.p2.u, y: xLine.p2.v })
        const z = lineThrough({ x: zLine.p1.u, y: zLine.p1.v }, { x: zLine.p2.u, y: zLine.p2.v })

        const intersection = interLL(x, z)

        if (intersection) {
          const onCanvas = isOnCanvas(intersection)
          console.log(`X-line ${i} × Z-line ${j}: (${intersection.x.toFixed(1)}, ${intersection.y.toFixed(1)}) - ${onCanvas ? 'ON CANVAS' : 'OFF CANVAS'}`)
        }
      }
    }
  })

  it('DISABLED - old test using line endpoints', async () => {
    const [LX0, LX1] = xLines
    const [LZ0, LZ1] = zLines

    console.log('\n=== OLD TEST - DISABLED ===')

    const x0 = lineThrough({ x: LX0.p1.u, y: LX0.p1.v }, { x: LX0.p2.u, y: LX0.p2.v })
    const x1 = lineThrough({ x: LX1.p1.u, y: LX1.p1.v }, { x: LX1.p2.u, y: LX1.p2.v })
    const z0 = lineThrough({ x: LZ0.p1.u, y: LZ0.p1.v }, { x: LZ0.p2.u, y: LZ0.p2.v })
    const z1 = lineThrough({ x: LZ1.p1.u, y: LZ1.p1.v }, { x: LZ1.p2.u, y: LZ1.p2.v })

    const P00 = { x: LX0.p2.u, y: LX0.p2.v }
    const P10 = { x: LX1.p2.u, y: LX1.p2.v }
    const P01 = { x: LX0.p1.u, y: LX0.p1.v }
    const P11 = { x: LX1.p1.u, y: LX1.p1.v }

    const H = homographyUnitToQuad(P00, P10, P01, P11)

    // Cohen-Sutherland line clipping
    const INSIDE = 0, LEFT = 1, RIGHT = 2, BOTTOM = 4, TOP = 8

    const computeOutCode = (x: number, y: number): number => {
      let code = INSIDE
      if (x < 0) code |= LEFT
      else if (x > imageWidth) code |= RIGHT
      if (y < 0) code |= TOP
      else if (y > imageHeight) code |= BOTTOM
      return code
    }

    const clipLine = (x0: number, y0: number, x1: number, y1: number): [number, number, number, number] | null => {
      let code0 = computeOutCode(x0, y0)
      let code1 = computeOutCode(x1, y1)

      // eslint-disable-next-line no-constant-condition
      while (true) {
        if ((code0 | code1) === 0) {
          return [x0, y0, x1, y1]
        }
        if ((code0 & code1) !== 0) {
          return null
        }

        const codeOut = code0 !== 0 ? code0 : code1
        let x: number, y: number

        if (codeOut & TOP) {
          x = x0 + (x1 - x0) * (0 - y0) / (y1 - y0)
          y = 0
        } else if (codeOut & BOTTOM) {
          x = x0 + (x1 - x0) * (imageHeight - y0) / (y1 - y0)
          y = imageHeight
        } else if (codeOut & RIGHT) {
          y = y0 + (y1 - y0) * (imageWidth - x0) / (x1 - x0)
          x = imageWidth
        } else {
          y = y0 + (y1 - y0) * (0 - x0) / (x1 - x0)
          x = 0
        }

        if (codeOut === code0) {
          x0 = x
          y0 = y
          code0 = computeOutCode(x0, y0)
        } else {
          x1 = x
          y1 = y
          code1 = computeOutCode(x1, y1)
        }
      }
    }

    const nx = 20, ny = 20
    let clippedCount = 0
    let visibleCount = 0

    console.log('\nU-constant grid lines (clipped):')
    for (let i = 0; i <= nx; i++) {
      const u = i / nx
      const a = mapUV(H, u, 0)
      const b = mapUV(H, u, 1)

      const clipped = clipLine(a.x, a.y, b.x, b.y)
      if (clipped) {
        const [cx0, cy0, cx1, cy1] = clipped
        console.log(`  u=${u.toFixed(2)}: (${cx0.toFixed(0)}, ${cy0.toFixed(0)}) -> (${cx1.toFixed(0)}, ${cy1.toFixed(0)})`)
        visibleCount++

        // Verify clipped endpoints are within bounds
        expect(cx0).toBeGreaterThanOrEqual(0)
        expect(cx0).toBeLessThanOrEqual(imageWidth)
        expect(cy0).toBeGreaterThanOrEqual(0)
        expect(cy0).toBeLessThanOrEqual(imageHeight)
        expect(cx1).toBeGreaterThanOrEqual(0)
        expect(cx1).toBeLessThanOrEqual(imageWidth)
        expect(cy1).toBeGreaterThanOrEqual(0)
        expect(cy1).toBeLessThanOrEqual(imageHeight)
      } else {
        clippedCount++
        console.log(`  u=${u.toFixed(2)}: FULLY OUTSIDE (clipped)`)
      }
    }

    console.log('\nV-constant grid lines (clipped):')
    for (let j = 0; j <= ny; j++) {
      const v = j / ny
      const a = mapUV(H, 0, v)
      const b = mapUV(H, 1, v)

      const clipped = clipLine(a.x, a.y, b.x, b.y)
      if (clipped) {
        const [cx0, cy0, cx1, cy1] = clipped
        console.log(`  v=${v.toFixed(2)}: (${cx0.toFixed(0)}, ${cy0.toFixed(0)}) -> (${cx1.toFixed(0)}, ${cy1.toFixed(0)})`)
        visibleCount++

        // Verify clipped endpoints are within bounds
        expect(cx0).toBeGreaterThanOrEqual(0)
        expect(cx0).toBeLessThanOrEqual(imageWidth)
        expect(cy0).toBeGreaterThanOrEqual(0)
        expect(cy0).toBeLessThanOrEqual(imageHeight)
        expect(cx1).toBeGreaterThanOrEqual(0)
        expect(cx1).toBeLessThanOrEqual(imageWidth)
        expect(cy1).toBeGreaterThanOrEqual(0)
        expect(cy1).toBeLessThanOrEqual(imageHeight)
      } else {
        clippedCount++
        console.log(`  v=${v.toFixed(2)}: FULLY OUTSIDE (clipped)`)
      }
    }

    console.log(`\nSummary: ${visibleCount} visible lines, ${clippedCount} fully outside`)
    expect(visibleCount).toBeGreaterThan(0) // At least some lines should be visible
  })
})
