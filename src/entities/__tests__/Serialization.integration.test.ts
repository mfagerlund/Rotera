import { Serialization } from '../Serialization'
import { Project } from '../project/Project'
import { WorldPoint } from '../world-point/WorldPoint'
import { Line } from '../line/Line'
import { Viewpoint } from '../viewpoint/Viewpoint'
import { ImagePoint } from '../imagePoint/ImagePoint'
import { DistanceConstraint } from '../constraints/distance-constraint'
import { AngleConstraint } from '../constraints/angle-constraint'

describe('Serialization Integration Tests', () => {
  test('empty project round-trip', () => {
    const original = Project.create('Empty Project')

    const json = Serialization.serialize(original)
    const deserialized = Serialization.deserialize(json)

    expect(deserialized.name).toBe('Empty Project')
    expect(deserialized.worldPoints.size).toBe(0)
    expect(deserialized.lines.size).toBe(0)
    expect(deserialized.viewpoints.size).toBe(0)
  })

  test('project with points and lines round-trip', () => {
    const project = Project.create('Test Project')

    const p1 = WorldPoint.create('P1', { lockedXyz: [0, 0, 0], optimizedXyz: [0, 0, 0] })
    const p2 = WorldPoint.create('P2', { lockedXyz: [10, 0, 0], optimizedXyz: [10, 0, 0] })
    const p3 = WorldPoint.create('P3', { lockedXyz: [5, 5, 0], optimizedXyz: [5, 5, 0] })

    project.addWorldPoint(p1)
    project.addWorldPoint(p2)
    project.addWorldPoint(p3)

    const line1 = Line.create('L1', p1, p2, { color: '#ff0000' })
    const line2 = Line.create('L2', p2, p3, { direction: 'y' })

    project.addLine(line1)
    project.addLine(line2)

    const json = Serialization.serialize(project)
    const deserialized = Serialization.deserialize(json)

    expect(deserialized.worldPoints.size).toBe(3)
    expect(deserialized.lines.size).toBe(2)

    const deserializedPoints = Array.from(deserialized.worldPoints)
    expect(deserializedPoints.find(p => p.name === 'P1')).toBeTruthy()
    expect(deserializedPoints.find(p => p.name === 'P2')).toBeTruthy()
    expect(deserializedPoints.find(p => p.name === 'P3')).toBeTruthy()

    const deserializedLines = Array.from(deserialized.lines)
    const l1 = deserializedLines.find(l => l.name === 'L1')
    expect(l1?.color).toBe('#ff0000')

    const l2 = deserializedLines.find(l => l.name === 'L2')
    expect(l2?.direction).toBe('y')
  })

  test('project with viewpoints and image points round-trip', () => {
    const project = Project.create('Photo Project')

    const wp = WorldPoint.create('Corner', { lockedXyz: [0, 0, 0] })
    project.addWorldPoint(wp)

    const vp1 = Viewpoint.create('IMG_001', 'img1.jpg', 'url1', 1920, 1080)
    const vp2 = Viewpoint.create('IMG_002', 'img2.jpg', 'url2', 1920, 1080)

    project.addViewpoint(vp1)
    project.addViewpoint(vp2)

    const ip1 = ImagePoint.create(wp, vp1, 500, 600)
    const ip2 = ImagePoint.create(wp, vp2, 700, 800)

    project.addImagePoint(ip1)
    project.addImagePoint(ip2)

    const json = Serialization.serialize(project)
    const deserialized = Serialization.deserialize(json)

    expect(deserialized.viewpoints.size).toBe(2)
    expect(deserialized.imagePoints.size).toBe(2)

    const deserializedWP = Array.from(deserialized.worldPoints)[0]
    expect(deserializedWP.imagePoints.size).toBe(2)

    const deserializedVP1 = Array.from(deserialized.viewpoints).find(v => v.name === 'IMG_001')
    expect(deserializedVP1?.imagePoints.size).toBe(1)
  })

  test('project with constraints round-trip', () => {
    const project = Project.create('Constrained Project')

    const p1 = WorldPoint.create('P1', { lockedXyz: [0, 0, 0], optimizedXyz: [0, 0, 0] })
    const p2 = WorldPoint.create('P2', { lockedXyz: [10, 0, 0], optimizedXyz: [10, 0, 0] })
    const p3 = WorldPoint.create('P3', { lockedXyz: [5, 5, 0], optimizedXyz: [5, 5, 0] })

    project.addWorldPoint(p1)
    project.addWorldPoint(p2)
    project.addWorldPoint(p3)

    const distConstraint = DistanceConstraint.create('D1', p1, p2, 10)
    const angleConstraint = AngleConstraint.create('A1', p1, p2, p3, 90)

    project.addConstraint(distConstraint)
    project.addConstraint(angleConstraint)

    const json = Serialization.serialize(project)
    const deserialized = Serialization.deserialize(json)

    expect(deserialized.constraints.size).toBe(2)

    const constraints = Array.from(deserialized.constraints)
    const dc = constraints.find(c => c.name === 'D1') as DistanceConstraint
    expect(dc).toBeInstanceOf(DistanceConstraint)
    expect(dc.targetDistance).toBe(10)

    const ac = constraints.find(c => c.name === 'A1') as AngleConstraint
    expect(ac).toBeInstanceOf(AngleConstraint)
    expect(ac.targetAngle).toBe(90)
  })

  test('complex project round-trip preserves all data', () => {
    const project = Project.create('Complex Project')
    project.theme = 'dark'
    project.measurementUnits = 'meters'
    project.showPointNames = true

    const p1 = WorldPoint.create('Corner1', { lockedXyz: [0, 0, 0], optimizedXyz: [0, 0, 0] })
    const p2 = WorldPoint.create('Corner2', { lockedXyz: [10, 0, 0], optimizedXyz: [10, 0, 0] })
    const p3 = WorldPoint.create('Corner3', { lockedXyz: [10, 10, 0], optimizedXyz: [10, 10, 0] })
    const p4 = WorldPoint.create('Corner4', { lockedXyz: [0, 10, 0], optimizedXyz: [0, 10, 0] })

    ;[p1, p2, p3, p4].forEach(p => project.addWorldPoint(p))

    const l1 = Line.create('Side1', p1, p2)
    const l2 = Line.create('Side2', p2, p3)
    const l3 = Line.create('Side3', p3, p4)
    const l4 = Line.create('Side4', p4, p1)

    ;[l1, l2, l3, l4].forEach(l => project.addLine(l))

    const vp1 = Viewpoint.create('Front', 'front.jpg', 'url1', 1920, 1080)
    const vp2 = Viewpoint.create('Side', 'side.jpg', 'url2', 1920, 1080)

    project.addViewpoint(vp1)
    project.addViewpoint(vp2)

    const ip1 = ImagePoint.create(p1, vp1, 100, 100)
    const ip2 = ImagePoint.create(p2, vp1, 900, 100)

    project.addImagePoint(ip1)
    project.addImagePoint(ip2)

    const dc1 = DistanceConstraint.create('D1', p1, p2, 10)
    const dc2 = DistanceConstraint.create('D2', p2, p3, 10)
    const ac1 = AngleConstraint.create('A1', p1, p2, p3, 90)

    project.addConstraint(dc1)
    project.addConstraint(dc2)
    project.addConstraint(ac1)

    const json = Serialization.serialize(project)
    const deserialized = Serialization.deserialize(json)

    expect(deserialized.name).toBe('Complex Project')
    expect(deserialized.theme).toBe('dark')
    expect(deserialized.measurementUnits).toBe('meters')
    expect(deserialized.showPointNames).toBe(true)

    expect(deserialized.worldPoints.size).toBe(4)
    expect(deserialized.lines.size).toBe(4)
    expect(deserialized.viewpoints.size).toBe(2)
    expect(deserialized.imagePoints.size).toBe(2)
    expect(deserialized.constraints.size).toBe(3)

    const json2 = Serialization.serialize(deserialized)
    expect(JSON.parse(json)).toEqual(JSON.parse(json2))
  })

  test('JSON structure is clean and readable', () => {
    const project = Project.create('Test')
    const p1 = WorldPoint.create('P1', { lockedXyz: [0, 0, 0] })
    project.addWorldPoint(p1)

    const json = Serialization.serialize(project)
    const parsed = JSON.parse(json)

    expect(parsed).toHaveProperty('name')
    expect(parsed).toHaveProperty('worldPoints')
    expect(parsed).toHaveProperty('lines')
    expect(parsed).toHaveProperty('viewpoints')
    expect(parsed).toHaveProperty('imagePoints')
    expect(parsed).toHaveProperty('constraints')

    expect(Array.isArray(parsed.worldPoints)).toBe(true)
    expect(parsed.worldPoints[0]).toHaveProperty('id')
    expect(parsed.worldPoints[0]).toHaveProperty('name')
  })
})
