import { WorldPoint } from '../WorldPoint'
import { Line } from '../../line'
import { Viewpoint } from '../../viewpoint'
import { ImagePoint } from '../../imagePoint'
import { propagateCoordinateInferences } from '../coordinate-inference'

describe('coordinate-inference', () => {
  describe('axis-aligned lines should only infer perpendicular coordinates', () => {
    it('X-aligned line: should infer Y and Z, but NOT X (ambiguous sign)', () => {
      // Fixed point at origin
      const origin = WorldPoint.create('Origin', { lockedXyz: [0, 0, 0] })

      // Point connected via X-aligned line with length 10
      // We know: P2.Y = 0, P2.Z = 0 (same as origin)
      // We DON'T know: P2.X could be +10 or -10
      const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null] })

      const line = Line.create('L1', origin, p2, {
        direction: 'x',
        targetLength: 10
      })

      const points = new Set([origin, p2])
      const lines = new Set([line])

      propagateCoordinateInferences(points, lines)

      // Y and Z should be inferred (same as origin)
      expect(p2.inferredXyz[1]).toBe(0)
      expect(p2.inferredXyz[2]).toBe(0)

      // X should NOT be inferred - it's ambiguous (+10 or -10)
      expect(p2.inferredXyz[0]).toBeNull()
    })

    it('Y-aligned line: should infer X and Z, but NOT Y (ambiguous sign)', () => {
      const origin = WorldPoint.create('Origin', { lockedXyz: [0, 0, 0] })
      const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null] })

      const line = Line.create('L1', origin, p2, {
        direction: 'y',
        targetLength: 10
      })

      const points = new Set([origin, p2])
      const lines = new Set([line])

      propagateCoordinateInferences(points, lines)

      // X and Z should be inferred (same as origin)
      expect(p2.inferredXyz[0]).toBe(0)
      expect(p2.inferredXyz[2]).toBe(0)

      // Y should NOT be inferred - it's ambiguous (+10 or -10)
      expect(p2.inferredXyz[1]).toBeNull()
    })

    it('Z-aligned line: should infer X and Y, but NOT Z (ambiguous sign)', () => {
      const origin = WorldPoint.create('Origin', { lockedXyz: [0, 0, 0] })
      const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null] })

      const line = Line.create('L1', origin, p2, {
        direction: 'z',
        targetLength: 10
      })

      const points = new Set([origin, p2])
      const lines = new Set([line])

      propagateCoordinateInferences(points, lines)

      // X and Y should be inferred (same as origin)
      expect(p2.inferredXyz[0]).toBe(0)
      expect(p2.inferredXyz[1]).toBe(0)

      // Z should NOT be inferred - it's ambiguous (+10 or -10)
      expect(p2.inferredXyz[2]).toBeNull()
    })
  })

  describe('chained inference should not propagate ambiguous values', () => {
    it('should not infer coordinates from points that have ambiguous coordinates', () => {
      // Origin fully locked
      const origin = WorldPoint.create('Origin', { lockedXyz: [0, 0, 0] })

      // P2 connected via X-aligned line - X is ambiguous
      const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null] })

      const line1 = Line.create('L1', origin, p2, {
        direction: 'x',
        targetLength: 10
      })

      // P3 connected to P2 via Y-aligned line
      // Even if P2's Y and Z are known, P3 shouldn't get full inference
      // because P2's X is unknown, and P3's Y would be ambiguous too
      const p3 = WorldPoint.create('P3', { lockedXyz: [null, null, null] })

      const line2 = Line.create('L2', p2, p3, {
        direction: 'y',
        targetLength: 10
      })

      const points = new Set([origin, p2, p3])
      const lines = new Set([line1, line2])

      propagateCoordinateInferences(points, lines)

      // P2: Y=0, Z=0 inferred, X=null (ambiguous)
      expect(p2.inferredXyz[0]).toBeNull()
      expect(p2.inferredXyz[1]).toBe(0)
      expect(p2.inferredXyz[2]).toBe(0)

      // P3: X should be null (inherited from P2 which is null)
      // Z=0 (same as P2), Y=null (ambiguous)
      expect(p3.inferredXyz[0]).toBeNull() // Can't infer from P2's null X
      expect(p3.inferredXyz[1]).toBeNull() // Ambiguous (+10 or -10 from P2)
      expect(p3.inferredXyz[2]).toBe(0)    // Same as P2's Z
    })
  })

  describe('perpendicular axis inference should work correctly', () => {
    it('should propagate known perpendicular coordinates through chain', () => {
      // Origin at (0, 5, 3)
      const origin = WorldPoint.create('Origin', { lockedXyz: [0, 5, 3] })

      // P2 connected via X-aligned line
      const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null] })

      const line = Line.create('L1', origin, p2, {
        direction: 'x',
        targetLength: 10
      })

      const points = new Set([origin, p2])
      const lines = new Set([line])

      propagateCoordinateInferences(points, lines)

      // Y and Z should match origin
      expect(p2.inferredXyz[1]).toBe(5)
      expect(p2.inferredXyz[2]).toBe(3)

      // X is still ambiguous
      expect(p2.inferredXyz[0]).toBeNull()
    })

    it('should infer axis coord when endpoint has it locked', () => {
      // Origin fully locked
      const origin = WorldPoint.create('Origin', { lockedXyz: [0, 0, 0] })

      // P2 has X locked to 10, connected via X-aligned line
      const p2 = WorldPoint.create('P2', { lockedXyz: [10, null, null] })

      const line = Line.create('L1', origin, p2, {
        direction: 'x',
        targetLength: 10
      })

      const points = new Set([origin, p2])
      const lines = new Set([line])

      propagateCoordinateInferences(points, lines)

      // P2: X=10 (locked), Y=0, Z=0 (inferred from origin)
      expect(p2.inferredXyz[0]).toBe(10) // Copied from locked
      expect(p2.inferredXyz[1]).toBe(0)
      expect(p2.inferredXyz[2]).toBe(0)
    })
  })

  describe('plane-constrained lines', () => {
    it('XY-plane line: should only infer Z (the normal axis)', () => {
      const origin = WorldPoint.create('Origin', { lockedXyz: [0, 0, 5] })
      const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null] })

      const line = Line.create('L1', origin, p2, {
        direction: 'xy'
      })

      const points = new Set([origin, p2])
      const lines = new Set([line])

      propagateCoordinateInferences(points, lines)

      // Only Z should be inferred
      expect(p2.inferredXyz[0]).toBeNull()
      expect(p2.inferredXyz[1]).toBeNull()
      expect(p2.inferredXyz[2]).toBe(5)
    })

    it('XZ-plane line: should only infer Y (the normal axis)', () => {
      const origin = WorldPoint.create('Origin', { lockedXyz: [0, 7, 0] })
      const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null] })

      const line = Line.create('L1', origin, p2, {
        direction: 'xz'
      })

      const points = new Set([origin, p2])
      const lines = new Set([line])

      propagateCoordinateInferences(points, lines)

      // Only Y should be inferred
      expect(p2.inferredXyz[0]).toBeNull()
      expect(p2.inferredXyz[1]).toBe(7)
      expect(p2.inferredXyz[2]).toBeNull()
    })

    it('YZ-plane line: should only infer X (the normal axis)', () => {
      const origin = WorldPoint.create('Origin', { lockedXyz: [3, 0, 0] })
      const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null] })

      const line = Line.create('L1', origin, p2, {
        direction: 'yz'
      })

      const points = new Set([origin, p2])
      const lines = new Set([line])

      propagateCoordinateInferences(points, lines)

      // Only X should be inferred
      expect(p2.inferredXyz[0]).toBe(3)
      expect(p2.inferredXyz[1]).toBeNull()
      expect(p2.inferredXyz[2]).toBeNull()
    })
  })

  describe('single-camera scenarios with image points', () => {
    // Helper to create a viewpoint and add image points
    function setupSingleCameraWithImagePoints(
      viewpoint: Viewpoint,
      worldPoints: WorldPoint[]
    ): void {
      // Add an image point for each world point in the single camera
      for (const wp of worldPoints) {
        const ip = ImagePoint.create(wp, viewpoint, 100, 100)
        wp.addImagePoint(ip)
        viewpoint.addImagePoint(ip)
      }
    }

    it('should NOT infer axis coordinate even with single camera (ambiguous sign)', () => {
      // This test reproduces the actual bug scenario:
      // - Origin at (0,0,0) visible in a single camera
      // - Point connected via X-aligned line with length 10
      // - The X coordinate could be +10 or -10, we don't know which!

      const viewpoint = Viewpoint.create('Cam1', 'cam1.jpg', 'url', 1920, 1080)

      const origin = WorldPoint.create('Origin', { lockedXyz: [0, 0, 0] })
      const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null] })

      const line = Line.create('L1', origin, p2, {
        direction: 'x',
        targetLength: 10
      })

      // Both points visible in the same single camera
      setupSingleCameraWithImagePoints(viewpoint, [origin, p2])

      const points = new Set([origin, p2])
      const lines = new Set([line])

      propagateCoordinateInferences(points, lines)

      // Y and Z should be inferred (same as origin)
      expect(p2.inferredXyz[1]).toBe(0)
      expect(p2.inferredXyz[2]).toBe(0)

      // X should NOT be inferred - the sign is ambiguous!
      // It could be +10 or -10, and inference should not guess
      expect(p2.inferredXyz[0]).toBeNull()
    })

    it('should NOT infer Y for Y-aligned line with single camera', () => {
      const viewpoint = Viewpoint.create('Cam1', 'cam1.jpg', 'url', 1920, 1080)

      const origin = WorldPoint.create('Origin', { lockedXyz: [0, 0, 0] })
      const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null] })

      const line = Line.create('L1', origin, p2, {
        direction: 'y',
        targetLength: 10
      })

      setupSingleCameraWithImagePoints(viewpoint, [origin, p2])

      const points = new Set([origin, p2])
      const lines = new Set([line])

      propagateCoordinateInferences(points, lines)

      // X and Z should be inferred
      expect(p2.inferredXyz[0]).toBe(0)
      expect(p2.inferredXyz[2]).toBe(0)

      // Y should NOT be inferred - ambiguous sign!
      expect(p2.inferredXyz[1]).toBeNull()
    })

    it('should NOT infer Z for Z-aligned line with single camera', () => {
      const viewpoint = Viewpoint.create('Cam1', 'cam1.jpg', 'url', 1920, 1080)

      const origin = WorldPoint.create('Origin', { lockedXyz: [0, 0, 0] })
      const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null] })

      const line = Line.create('L1', origin, p2, {
        direction: 'z',
        targetLength: 10
      })

      setupSingleCameraWithImagePoints(viewpoint, [origin, p2])

      const points = new Set([origin, p2])
      const lines = new Set([line])

      propagateCoordinateInferences(points, lines)

      // X and Y should be inferred
      expect(p2.inferredXyz[0]).toBe(0)
      expect(p2.inferredXyz[1]).toBe(0)

      // Z should NOT be inferred - ambiguous sign!
      expect(p2.inferredXyz[2]).toBeNull()
    })

    it('should NOT chain-infer from points with ambiguous coordinates', () => {
      // Complex scenario matching user's bug report:
      // O (origin) -> WP2 (Z-aligned, length 10) -> WP6 (Y-aligned, length 10)
      // O -> WP4 (X-aligned, length 10) -> WP7 (Y-aligned, length 10)
      // O -> OY (Y-aligned, length 10)

      const viewpoint = Viewpoint.create('Cam1', 'cam1.jpg', 'url', 1920, 1080)

      const O = WorldPoint.create('O', { lockedXyz: [0, 0, 0] })
      const WP2 = WorldPoint.create('WP2', { lockedXyz: [0, 0, null] }) // X and Y locked, Z free
      const WP4 = WorldPoint.create('WP4', { lockedXyz: [null, 0, 0] }) // Y and Z locked, X free
      const OY = WorldPoint.create('OY', { lockedXyz: [0, null, 0] }) // X and Z locked, Y free
      const WP6 = WorldPoint.create('WP6', { lockedXyz: [null, null, null] })
      const WP7 = WorldPoint.create('WP7', { lockedXyz: [null, null, null] })

      // Lines from origin
      const lineZ = Line.create('Z-line', O, WP2, { direction: 'z', targetLength: 10 })
      const lineX = Line.create('X-line', O, WP4, { direction: 'x', targetLength: 10 })
      const lineY = Line.create('Y-line', O, OY, { direction: 'y', targetLength: 10 })

      // Lines from intermediate points
      const lineWP2toWP6 = Line.create('WP2-WP6', WP2, WP6, { direction: 'y', targetLength: 10 })
      const lineWP4toWP7 = Line.create('WP4-WP7', WP4, WP7, { direction: 'y', targetLength: 10 })

      setupSingleCameraWithImagePoints(viewpoint, [O, WP2, WP4, OY, WP6, WP7])

      const points = new Set([O, WP2, WP4, OY, WP6, WP7])
      const lines = new Set([lineZ, lineX, lineY, lineWP2toWP6, lineWP4toWP7])

      propagateCoordinateInferences(points, lines)

      // WP2: X=0 (locked), Y=0 (locked), Z=null (ambiguous, could be +10 or -10)
      expect(WP2.inferredXyz[0]).toBe(0)
      expect(WP2.inferredXyz[1]).toBe(0)
      expect(WP2.inferredXyz[2]).toBeNull()

      // WP4: X=null (ambiguous), Y=0 (locked), Z=0 (locked)
      expect(WP4.inferredXyz[0]).toBeNull()
      expect(WP4.inferredXyz[1]).toBe(0)
      expect(WP4.inferredXyz[2]).toBe(0)

      // OY: X=0 (locked), Y=null (ambiguous), Z=0 (locked)
      expect(OY.inferredXyz[0]).toBe(0)
      expect(OY.inferredXyz[1]).toBeNull()
      expect(OY.inferredXyz[2]).toBe(0)

      // WP6: connected to WP2 via Y-line
      // X=0 (from WP2), Z=null (from WP2, ambiguous), Y=null (ambiguous from line)
      expect(WP6.inferredXyz[0]).toBe(0)
      expect(WP6.inferredXyz[1]).toBeNull()
      expect(WP6.inferredXyz[2]).toBeNull()

      // WP7: connected to WP4 via Y-line
      // X=null (from WP4, ambiguous), Z=0 (from WP4), Y=null (ambiguous from line)
      expect(WP7.inferredXyz[0]).toBeNull()
      expect(WP7.inferredXyz[1]).toBeNull()
      expect(WP7.inferredXyz[2]).toBe(0)
    })
  })
})
