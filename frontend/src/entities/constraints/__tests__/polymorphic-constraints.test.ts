import {
  createConstraintFromDto,
  convertFrontendConstraintToDto,
  DistanceConstraint,
  AngleConstraint,
  ParallelLinesConstraint,
  PerpendicularLinesConstraint,
  FixedPointConstraint,
  CollinearPointsConstraint,
  CoplanarPointsConstraint,
  EqualDistancesConstraint,
  EqualAnglesConstraint,
  type ConstraintDto,
  type ConstraintRepository
} from '../index'
import { WorldPoint } from '../../world-point'
import { Line } from '../../line'

// Mock repository for testing
const mockRepo: ConstraintRepository = {
  getPoint: (pointId: string) => WorldPoint.create(pointId, `Point ${pointId}`, { xyz: [0, 0, 0] }) as any,
  getLine: (lineId: string) => {
    const pointA = WorldPoint.create('p1', 'Point A', { xyz: [0, 0, 0] })
    const pointB = WorldPoint.create('p2', 'Point B', { xyz: [1, 0, 0] })
    return Line.create(lineId, `Line ${lineId}`, pointA, pointB) as any
  },
  getPlane: (planeId: string) => ({ id: planeId, name: `Plane ${planeId}` } as any),
  entityExists: (id: string) => true,
  pointExists: (pointId: string) => true,
  lineExists: (lineId: string) => true,
  planeExists: (planeId: string) => true,
  getReferenceManager: () => ({
    resolve: <T>(id: string, type: string) => ({ id, name: `${type} ${id}` } as any),
    batchResolve: <T>(ids: string[], type: string) => ids.map(id => ({ id, name: `${type} ${id}` } as any)),
    preloadReferences: () => {}
  })
}

describe('🧪 Polymorphic Constraint System', () => {
  describe('Factory Function', () => {
    it('should create distance constraint from DTO', () => {
      const dto: ConstraintDto = {
        id: 'test-distance',
        name: 'Test Distance',
        type: 'distance_point_point',
        status: 'satisfied',
        entities: { points: ['p1', 'p2'] },
        parameters: { tolerance: 0.001, priority: 5 },
        isEnabled: true,
        isDriving: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        distanceConstraint: { targetDistance: 5.0 },
        angleConstraint: undefined,
        parallelLinesConstraint: undefined,
        perpendicularLinesConstraint: undefined,
        fixedPointConstraint: undefined,
        collinearPointsConstraint: undefined,
        coplanarPointsConstraint: undefined,
        equalDistancesConstraint: undefined,
        equalAnglesConstraint: undefined
      }

      const constraint = createConstraintFromDto(dto, mockRepo)
      expect(constraint).toBeInstanceOf(DistanceConstraint)
      expect(constraint.getId()).toBe('test-distance')
      expect(constraint.getName()).toBe('Test Distance')
    })

    it('should create angle constraint from DTO', () => {
      const dto: ConstraintDto = {
        id: 'test-angle',
        name: 'Test Angle',
        type: 'angle_point_point_point',
        status: 'satisfied',
        entities: { points: ['p1', 'p2', 'p3'] },
        parameters: { tolerance: 0.001, priority: 5 },
        isEnabled: true,
        isDriving: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        distanceConstraint: undefined,
        angleConstraint: { targetAngle: 90.0 },
        parallelLinesConstraint: undefined,
        perpendicularLinesConstraint: undefined,
        fixedPointConstraint: undefined,
        collinearPointsConstraint: undefined,
        coplanarPointsConstraint: undefined,
        equalDistancesConstraint: undefined,
        equalAnglesConstraint: undefined
      }

      const constraint = createConstraintFromDto(dto, mockRepo)
      expect(constraint).toBeInstanceOf(AngleConstraint)
      expect(constraint.getId()).toBe('test-angle')
    })

    it('should throw error for unknown constraint type', () => {
      const dto: ConstraintDto = {
        id: 'test-unknown',
        name: 'Unknown',
        type: 'unknown_type' as any,
        status: 'satisfied',
        entities: {},
        parameters: {},
        isEnabled: true,
        isDriving: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        distanceConstraint: undefined,
        angleConstraint: undefined,
        parallelLinesConstraint: undefined,
        perpendicularLinesConstraint: undefined,
        fixedPointConstraint: undefined,
        collinearPointsConstraint: undefined,
        coplanarPointsConstraint: undefined,
        equalDistancesConstraint: undefined,
        equalAnglesConstraint: undefined
      }

      expect(() => createConstraintFromDto(dto, mockRepo)).toThrow('Unknown constraint type: unknown_type')
    })
  })

  describe('DTO Conversion Round Trip', () => {
    it('should convert distance constraint through legacy format', () => {
      const legacyConstraint = {
        id: 'legacy-distance',
        type: 'distance_point_point',
        entities: { points: ['p1', 'p2'] },
        parameters: { targetDistance: 3.5, priority: 7 },
        isEnabled: true
      }

      const dto = convertFrontendConstraintToDto(legacyConstraint)
      expect(dto.type).toBe('distance_point_point')
      expect(dto.distanceConstraint?.targetDistance).toBe(3.5)
      expect(dto.parameters.priority).toBe(7)

      const constraint = createConstraintFromDto(dto, mockRepo)
      expect(constraint).toBeInstanceOf(DistanceConstraint)
    })

    it('should convert angle constraint through legacy format', () => {
      const legacyConstraint = {
        id: 'legacy-angle',
        type: 'angle_point_point_point',
        entities: { points: ['p1', 'p2', 'p3'] },
        parameters: { targetAngle: 45.0 },
        isEnabled: false
      }

      const dto = convertFrontendConstraintToDto(legacyConstraint)
      expect(dto.angleConstraint?.targetAngle).toBe(45.0)
      expect(dto.isEnabled).toBe(false)

      const constraint = createConstraintFromDto(dto, mockRepo)
      expect(constraint).toBeInstanceOf(AngleConstraint)
    })

    it('should convert fixed point constraint with xyz coordinates', () => {
      const legacyConstraint = {
        id: 'legacy-fixed',
        type: 'fixed_point',
        entities: { points: ['p1'] },
        parameters: { x: 1.0, y: 2.0, z: 3.0 }
      }

      const dto = convertFrontendConstraintToDto(legacyConstraint)
      expect(dto.fixedPointConstraint?.targetXyz).toEqual([1.0, 2.0, 3.0])

      const constraint = createConstraintFromDto(dto, mockRepo)
      expect(constraint).toBeInstanceOf(FixedPointConstraint)
    })
  })

  describe('Constraint Type Validation', () => {
    it('should validate all supported constraint types can be created', () => {
      const constraintTypes = [
        'distance_point_point',
        'angle_point_point_point',
        'parallel_lines',
        'perpendicular_lines',
        'fixed_point',
        'collinear_points',
        'coplanar_points',
        'equal_distances',
        'equal_angles'
      ]

      constraintTypes.forEach(type => {
        const dto = createBasicDto(type)
        expect(() => createConstraintFromDto(dto, mockRepo)).not.toThrow()
      })
    })

    it('should create proper instance types for each constraint', () => {
      const expectedTypes = [
        ['distance_point_point', DistanceConstraint],
        ['angle_point_point_point', AngleConstraint],
        ['parallel_lines', ParallelLinesConstraint],
        ['perpendicular_lines', PerpendicularLinesConstraint],
        ['fixed_point', FixedPointConstraint],
        ['collinear_points', CollinearPointsConstraint],
        ['coplanar_points', CoplanarPointsConstraint],
        ['equal_distances', EqualDistancesConstraint],
        ['equal_angles', EqualAnglesConstraint]
      ] as const

      expectedTypes.forEach(([type, expectedClass]) => {
        const dto = createBasicDto(type)
        const constraint = createConstraintFromDto(dto, mockRepo)
        expect(constraint).toBeInstanceOf(expectedClass)
      })
    })
  })

  describe('DTO to Constraint Round Trip', () => {
    it('should preserve all data through DTO conversion for distance constraint', () => {
      const originalDto = createBasicDto('distance_point_point')
      originalDto.distanceConstraint = { targetDistance: 7.5 }

      const constraint = createConstraintFromDto(originalDto, mockRepo)
      const convertedDto = constraint.toConstraintDto()

      expect(convertedDto.id).toBe(originalDto.id)
      expect(convertedDto.type).toBe(originalDto.type)
      expect(convertedDto.entities.points).toEqual(originalDto.entities.points)
      expect(convertedDto.distanceConstraint?.targetDistance).toBe(7.5)
    })

    it('should preserve all data through DTO conversion for angle constraint', () => {
      const originalDto = createBasicDto('angle_point_point_point')
      originalDto.entities.points = ['p1', 'p2', 'p3']
      originalDto.angleConstraint = { targetAngle: 60.0 }

      const constraint = createConstraintFromDto(originalDto, mockRepo)
      const convertedDto = constraint.toConstraintDto()

      expect(convertedDto.angleConstraint?.targetAngle).toBe(60.0)
      expect(convertedDto.entities.points).toEqual(['p1', 'p2', 'p3'])
    })
  })
})

// Helper function to create basic DTO structure
function createBasicDto(type: string): ConstraintDto {
  const baseDto: ConstraintDto = {
    id: `test-${type}`,
    name: `Test ${type}`,
    type: type as any,
    status: 'satisfied',
    entities: {},
    parameters: { tolerance: 0.001, priority: 5 },
    isEnabled: true,
    isDriving: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    distanceConstraint: undefined,
    angleConstraint: undefined,
    parallelLinesConstraint: undefined,
    perpendicularLinesConstraint: undefined,
    fixedPointConstraint: undefined,
    collinearPointsConstraint: undefined,
    coplanarPointsConstraint: undefined,
    equalDistancesConstraint: undefined,
    equalAnglesConstraint: undefined
  }

  // Set up entities based on constraint type
  switch (type) {
    case 'distance_point_point':
      baseDto.entities.points = ['p1', 'p2']
      baseDto.distanceConstraint = { targetDistance: 1.0 }
      break
    case 'angle_point_point_point':
      baseDto.entities.points = ['p1', 'p2', 'p3']
      baseDto.angleConstraint = { targetAngle: 90.0 }
      break
    case 'parallel_lines':
    case 'perpendicular_lines':
      baseDto.entities.lines = ['l1', 'l2']
      if (type === 'parallel_lines') {
        baseDto.parallelLinesConstraint = {}
      } else {
        baseDto.perpendicularLinesConstraint = {}
      }
      break
    case 'fixed_point':
      baseDto.entities.points = ['p1']
      baseDto.fixedPointConstraint = { targetXyz: [0, 0, 0] }
      break
    case 'collinear_points':
      baseDto.entities.points = ['p1', 'p2', 'p3']
      baseDto.collinearPointsConstraint = {}
      break
    case 'coplanar_points':
      baseDto.entities.points = ['p1', 'p2', 'p3', 'p4']
      baseDto.coplanarPointsConstraint = {}
      break
    case 'equal_distances':
      baseDto.entities.points = ['p1', 'p2', 'p3', 'p4']
      baseDto.equalDistancesConstraint = { distancePairs: [['p1', 'p2'], ['p3', 'p4']] }
      break
    case 'equal_angles':
      baseDto.entities.points = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']
      baseDto.equalAnglesConstraint = { angleTriplets: [['p1', 'p2', 'p3'], ['p4', 'p5', 'p6']] }
      break
  }

  return baseDto
}