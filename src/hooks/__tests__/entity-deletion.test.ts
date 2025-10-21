import { Project } from '../../entities/project/Project'
import { WorldPoint } from '../../entities/world-point/WorldPoint'
import { Viewpoint } from '../../entities/viewpoint/Viewpoint'
import { Serialization } from '../../entities/Serialization'
import { useDomainOperations } from '../useDomainOperations'
import { DistanceConstraint } from '../../entities/constraints/distance-constraint'

describe('Entity Deletion Cleanup Tests', () => {
  let project: Project
  let ops: ReturnType<typeof useDomainOperations>

  beforeEach(() => {
    project = Project.create('Test Project')
    ops = useDomainOperations(project, () => {})
  })

  describe('Viewpoint deletion', () => {
    test('deleting viewpoint removes all associated image points', () => {
      const wp1 = ops.createWorldPoint('WP1', [0, 0, 0])
      const wp2 = ops.createWorldPoint('WP2', [10, 0, 0])

      const vp = Viewpoint.create('VP1', 'vp1.jpg', 'url1', 1920, 1080)
      project.addViewpoint(vp)

      ops.addImagePointToWorldPoint(wp1, vp, 100, 100)
      ops.addImagePointToWorldPoint(wp2, vp, 200, 200)

      expect(project.imagePoints.size).toBe(2)
      expect(vp.imagePoints.size).toBe(2)
      expect(wp1.imagePoints.size).toBe(1)
      expect(wp2.imagePoints.size).toBe(1)

      ops.deleteImage(vp)

      expect(project.viewpoints.size).toBe(0)
      expect(project.imagePoints.size).toBe(0)
      expect(wp1.imagePoints.size).toBe(0)
      expect(wp2.imagePoints.size).toBe(0)
    })

    test('deleting viewpoint allows serialization', () => {
      const wp = ops.createWorldPoint('WP', [0, 0, 0])
      const vp = Viewpoint.create('VP', 'vp.jpg', 'url', 1920, 1080)
      project.addViewpoint(vp)
      ops.addImagePointToWorldPoint(wp, vp, 100, 100)

      ops.deleteImage(vp)

      expect(() => Serialization.serialize(project)).not.toThrow()

      const json = Serialization.serialize(project)
      const deserialized = Serialization.deserialize(json)

      expect(deserialized.viewpoints.size).toBe(0)
      expect(deserialized.imagePoints.size).toBe(0)
      expect(deserialized.worldPoints.size).toBe(1)
    })

    test('deleting viewpoint with multiple image points cleans up all references', () => {
      const wp = ops.createWorldPoint('WP', [0, 0, 0])
      const vp1 = Viewpoint.create('VP1', 'vp1.jpg', 'url1', 1920, 1080)
      const vp2 = Viewpoint.create('VP2', 'vp2.jpg', 'url2', 1920, 1080)

      project.addViewpoint(vp1)
      project.addViewpoint(vp2)

      ops.addImagePointToWorldPoint(wp, vp1, 100, 100)
      ops.addImagePointToWorldPoint(wp, vp2, 200, 200)

      expect(wp.imagePoints.size).toBe(2)
      expect(project.imagePoints.size).toBe(2)

      ops.deleteImage(vp1)

      expect(wp.imagePoints.size).toBe(1)
      expect(project.imagePoints.size).toBe(1)

      const remainingIP = Array.from(wp.imagePoints)[0]
      expect(remainingIP.viewpoint).toBe(vp2)
    })
  })

  describe('WorldPoint deletion', () => {
    test('deleting world point removes all connected lines', () => {
      const wp1 = ops.createWorldPoint('WP1', [0, 0, 0])
      const wp2 = ops.createWorldPoint('WP2', [10, 0, 0])
      const wp3 = ops.createWorldPoint('WP3', [5, 5, 0])

      const line1 = ops.createLine(wp1, wp2, { name: 'L1' })
      const line2 = ops.createLine(wp2, wp3, { name: 'L2' })

      expect(project.lines.size).toBe(2)
      expect(wp1.connectedLines.size).toBe(1)
      expect(wp2.connectedLines.size).toBe(2)
      expect(wp3.connectedLines.size).toBe(1)

      ops.deleteWorldPoint(wp2)

      expect(project.worldPoints.size).toBe(2)
      expect(project.lines.size).toBe(0)
      expect(wp1.connectedLines.size).toBe(0)
      expect(wp3.connectedLines.size).toBe(0)
    })

    test('deleting world point removes all associated image points', () => {
      const wp = ops.createWorldPoint('WP', [0, 0, 0])
      const vp1 = Viewpoint.create('VP1', 'vp1.jpg', 'url1', 1920, 1080)
      const vp2 = Viewpoint.create('VP2', 'vp2.jpg', 'url2', 1920, 1080)

      project.addViewpoint(vp1)
      project.addViewpoint(vp2)

      ops.addImagePointToWorldPoint(wp, vp1, 100, 100)
      ops.addImagePointToWorldPoint(wp, vp2, 200, 200)

      expect(project.imagePoints.size).toBe(2)
      expect(vp1.imagePoints.size).toBe(1)
      expect(vp2.imagePoints.size).toBe(1)

      ops.deleteWorldPoint(wp)

      expect(project.worldPoints.size).toBe(0)
      expect(project.imagePoints.size).toBe(0)
      expect(vp1.imagePoints.size).toBe(0)
      expect(vp2.imagePoints.size).toBe(0)
    })

    test('deleting world point removes all referencing constraints', () => {
      const wp1 = ops.createWorldPoint('WP1', [0, 0, 0])
      const wp2 = ops.createWorldPoint('WP2', [10, 0, 0])

      const constraint = DistanceConstraint.create('C1', wp1, wp2, 10)
      ops.addConstraint(constraint)

      expect(project.constraints.size).toBe(1)
      expect(wp1.referencingConstraints.size).toBe(1)
      expect(wp2.referencingConstraints.size).toBe(1)

      ops.deleteWorldPoint(wp1)

      expect(project.worldPoints.size).toBe(1)
      expect(project.constraints.size).toBe(0)
      expect(wp2.referencingConstraints.size).toBe(0)
    })

    test('deleting world point allows serialization', () => {
      const wp1 = ops.createWorldPoint('WP1', [0, 0, 0])
      const wp2 = ops.createWorldPoint('WP2', [10, 0, 0])
      const vp = Viewpoint.create('VP', 'vp.jpg', 'url', 1920, 1080)

      project.addViewpoint(vp)
      ops.createLine(wp1, wp2, { name: 'L1' })
      ops.addImagePointToWorldPoint(wp1, vp, 100, 100)

      const constraint = DistanceConstraint.create('C1', wp1, wp2, 10)
      ops.addConstraint(constraint)

      ops.deleteWorldPoint(wp1)

      expect(() => Serialization.serialize(project)).not.toThrow()

      const json = Serialization.serialize(project)
      const deserialized = Serialization.deserialize(json)

      expect(deserialized.worldPoints.size).toBe(1)
      expect(deserialized.lines.size).toBe(0)
      expect(deserialized.imagePoints.size).toBe(0)
      expect(deserialized.constraints.size).toBe(0)
    })
  })

  describe('Line deletion', () => {
    test('deleting line removes references from connected points', () => {
      const wp1 = ops.createWorldPoint('WP1', [0, 0, 0])
      const wp2 = ops.createWorldPoint('WP2', [10, 0, 0])
      const line = ops.createLine(wp1, wp2, { name: 'L1' })

      expect(wp1.connectedLines.size).toBe(1)
      expect(wp2.connectedLines.size).toBe(1)

      ops.deleteLine(line)

      expect(project.lines.size).toBe(0)
      expect(wp1.connectedLines.size).toBe(0)
      expect(wp2.connectedLines.size).toBe(0)
    })

    test('deleting line allows serialization', () => {
      const wp1 = ops.createWorldPoint('WP1', [0, 0, 0])
      const wp2 = ops.createWorldPoint('WP2', [10, 0, 0])
      const line = ops.createLine(wp1, wp2, { name: 'L1' })

      ops.deleteLine(line)

      expect(() => Serialization.serialize(project)).not.toThrow()

      const json = Serialization.serialize(project)
      const deserialized = Serialization.deserialize(json)

      expect(deserialized.worldPoints.size).toBe(2)
      expect(deserialized.lines.size).toBe(0)
    })
  })

  describe('Full project teardown', () => {
    test('can delete all entities in any order without orphans', () => {
      const wp1 = ops.createWorldPoint('WP1', [0, 0, 0])
      const wp2 = ops.createWorldPoint('WP2', [10, 0, 0])
      const wp3 = ops.createWorldPoint('WP3', [5, 5, 0])

      const line1 = ops.createLine(wp1, wp2, { name: 'L1' })
      const line2 = ops.createLine(wp2, wp3, { name: 'L2' })

      const vp1 = Viewpoint.create('VP1', 'vp1.jpg', 'url1', 1920, 1080)
      const vp2 = Viewpoint.create('VP2', 'vp2.jpg', 'url2', 1920, 1080)

      project.addViewpoint(vp1)
      project.addViewpoint(vp2)

      ops.addImagePointToWorldPoint(wp1, vp1, 100, 100)
      ops.addImagePointToWorldPoint(wp2, vp1, 200, 200)
      ops.addImagePointToWorldPoint(wp1, vp2, 150, 150)

      const c1 = DistanceConstraint.create('C1', wp1, wp2, 10)
      ops.addConstraint(c1)

      expect(project.worldPoints.size).toBe(3)
      expect(project.lines.size).toBe(2)
      expect(project.viewpoints.size).toBe(2)
      expect(project.imagePoints.size).toBe(3)
      expect(project.constraints.size).toBe(1)

      ops.deleteImage(vp1)
      expect(() => Serialization.serialize(project)).not.toThrow()
      expect(project.imagePoints.size).toBe(1)

      ops.deleteWorldPoint(wp2)
      expect(() => Serialization.serialize(project)).not.toThrow()
      expect(project.worldPoints.size).toBe(2)
      expect(project.lines.size).toBe(0)
      expect(project.constraints.size).toBe(0)

      ops.deleteImage(vp2)
      expect(() => Serialization.serialize(project)).not.toThrow()
      expect(project.imagePoints.size).toBe(0)

      ops.deleteWorldPoint(wp1)
      expect(() => Serialization.serialize(project)).not.toThrow()
      expect(project.worldPoints.size).toBe(1)

      ops.deleteWorldPoint(wp3)
      expect(() => Serialization.serialize(project)).not.toThrow()

      expect(project.worldPoints.size).toBe(0)
      expect(project.lines.size).toBe(0)
      expect(project.viewpoints.size).toBe(0)
      expect(project.imagePoints.size).toBe(0)
      expect(project.constraints.size).toBe(0)
    })

    test('deleting in reverse order of creation', () => {
      const wp1 = ops.createWorldPoint('WP1', [0, 0, 0])
      const wp2 = ops.createWorldPoint('WP2', [10, 0, 0])
      const line = ops.createLine(wp1, wp2, { name: 'L1' })
      const vp = Viewpoint.create('VP', 'vp.jpg', 'url', 1920, 1080)
      project.addViewpoint(vp)
      ops.addImagePointToWorldPoint(wp1, vp, 100, 100)
      const constraint = DistanceConstraint.create('C1', wp1, wp2, 10)
      ops.addConstraint(constraint)

      ops.deleteConstraint(constraint)
      expect(() => Serialization.serialize(project)).not.toThrow()

      ops.deleteImage(vp)
      expect(() => Serialization.serialize(project)).not.toThrow()

      ops.deleteLine(line)
      expect(() => Serialization.serialize(project)).not.toThrow()

      ops.deleteWorldPoint(wp2)
      expect(() => Serialization.serialize(project)).not.toThrow()

      ops.deleteWorldPoint(wp1)
      expect(() => Serialization.serialize(project)).not.toThrow()

      expect(project.worldPoints.size).toBe(0)
      expect(project.lines.size).toBe(0)
      expect(project.viewpoints.size).toBe(0)
      expect(project.imagePoints.size).toBe(0)
      expect(project.constraints.size).toBe(0)
    })

    test('serialization round-trip after partial deletion', () => {
      const wp1 = ops.createWorldPoint('WP1', [0, 0, 0])
      const wp2 = ops.createWorldPoint('WP2', [10, 0, 0])
      const wp3 = ops.createWorldPoint('WP3', [5, 5, 0])
      const line1 = ops.createLine(wp1, wp2, { name: 'L1' })
      const line2 = ops.createLine(wp2, wp3, { name: 'L2' })
      const vp = Viewpoint.create('VP', 'vp.jpg', 'url', 1920, 1080)
      project.addViewpoint(vp)
      ops.addImagePointToWorldPoint(wp1, vp, 100, 100)
      ops.addImagePointToWorldPoint(wp2, vp, 200, 200)

      ops.deleteWorldPoint(wp2)

      const json = Serialization.serialize(project)
      const deserialized = Serialization.deserialize(json)

      expect(deserialized.worldPoints.size).toBe(2)
      expect(deserialized.lines.size).toBe(0)
      expect(deserialized.imagePoints.size).toBe(1)

      const deserializedWP1 = Array.from(deserialized.worldPoints).find(p => p.name === 'WP1')
      expect(deserializedWP1?.imagePoints.size).toBe(1)
      expect(deserializedWP1?.connectedLines.size).toBe(0)
    })
  })

  describe('Edge cases', () => {
    test('deleting non-existent entity is safe', () => {
      const otherProject = Project.create('Other')
      const wp = WorldPoint.create('WP', { lockedXyz: [0, 0, 0] })
      otherProject.addWorldPoint(wp)

      expect(() => ops.deleteWorldPoint(wp)).not.toThrow()
      expect(project.worldPoints.size).toBe(0)
    })

    test('deleting world point with no connections', () => {
      const wp = ops.createWorldPoint('WP', [0, 0, 0])

      ops.deleteWorldPoint(wp)

      expect(project.worldPoints.size).toBe(0)
      expect(() => Serialization.serialize(project)).not.toThrow()
    })

    test('deleting viewpoint with no image points', () => {
      const vp = Viewpoint.create('VP', 'vp.jpg', 'url', 1920, 1080)
      project.addViewpoint(vp)

      ops.deleteImage(vp)

      expect(project.viewpoints.size).toBe(0)
      expect(() => Serialization.serialize(project)).not.toThrow()
    })
  })
})
