// Test utilities and mock data
import React from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { EntityProject, ProjectSettings } from '../types/project-entities'
import { WorldPoint } from '../entities/world-point/WorldPoint'
import { Viewpoint } from '../entities/viewpoint/Viewpoint'
import { DistanceConstraint } from '../entities/constraints/distance-constraint'
import { ParallelLinesConstraint } from '../entities/constraints/parallel-lines-constraint'
import type { ConstraintRepository } from '../entities/constraints/base-constraint'
import type { PointId, LineId, PlaneId, EntityId } from '../types/ids'

// Mock ConstraintRepository for testing
class MockConstraintRepository implements ConstraintRepository {
  private points = new Map<string, WorldPoint>()
  private lines = new Map<string, any>()
  private planes = new Map<string, any>()

  addPoint(id: string, point: WorldPoint) {
    this.points.set(id, point)
  }

  getPoint(pointId: PointId): EntityId | undefined {
    return this.points.get(pointId) as any
  }

  getLine(lineId: LineId): EntityId | undefined {
    return this.lines.get(lineId) as any
  }

  getPlane(planeId: PlaneId): EntityId | undefined {
    return this.planes.get(planeId) as any
  }

  entityExists(id: EntityId): boolean {
    return this.points.has(id) || this.lines.has(id) || this.planes.has(id)
  }

  pointExists(pointId: PointId): boolean {
    return this.points.has(pointId)
  }

  lineExists(lineId: LineId): boolean {
    return this.lines.has(lineId)
  }

  planeExists(planeId: PlaneId): boolean {
    return this.planes.has(planeId)
  }
}

const mockRepo = new MockConstraintRepository()

// Export mock repository for tests that need it
export { mockRepo }

// Mock project settings for testing
const mockSettings: ProjectSettings = {
  showPointNames: true,
  autoSave: false,
  theme: 'dark',
  measurementUnits: 'meters',
  precisionDigits: 2,
  showConstraintGlyphs: true,
  showMeasurements: true,
  autoOptimize: false,
  gridVisible: true,
  snapToGrid: false,
  defaultWorkspace: 'image',
  showConstructionGeometry: false,
  enableSmartSnapping: true,
  constraintPreview: true,
  visualFeedbackLevel: 'standard'
}

// Mock world points for testing
const mockPoint1 = WorldPoint.create('point-1', 'Test Point 1', {
  xyz: [0, 0, 0],
  color: '#2196F3',
  isVisible: true
})

const mockPoint2 = WorldPoint.create('point-2', 'Test Point 2', {
  xyz: [1, 0, 0],
  color: '#2196F3',
  isVisible: true
})

const mockPoint3 = WorldPoint.create('point-3', 'Test Point 3', {
  xyz: [0, 1, 0],
  color: '#2196F3',
  isVisible: true
})

// Add points to mock repository
mockRepo.addPoint('point-1', mockPoint1)
mockRepo.addPoint('point-2', mockPoint2)
mockRepo.addPoint('point-3', mockPoint3)

// Mock viewpoint for testing
const mockViewpoint1 = Viewpoint.create(
  'viewpoint-1',
  'Test Image',
  'test-image.jpg',
  'data:image/jpeg;base64,mock-test-data',
  1920,
  1080,
  {
    focalLength: 1000,
    principalPointX: 960,
    principalPointY: 540,
    isVisible: true
  }
)

// Add image points to viewpoint
const now = new Date().toISOString()
mockViewpoint1.addImagePoint({
  id: 'ip-1',
  worldPointId: 'point-1',
  u: 100,
  v: 100,
  isVisible: true,
  isManuallyPlaced: true,
  confidence: 1.0,
  createdAt: now,
  updatedAt: now
})
mockViewpoint1.addImagePoint({
  id: 'ip-2',
  worldPointId: 'point-2',
  u: 150,
  v: 100,
  isVisible: true,
  isManuallyPlaced: true,
  confidence: 1.0,
  createdAt: now,
  updatedAt: now
})
mockViewpoint1.addImagePoint({
  id: 'ip-3',
  worldPointId: 'point-3',
  u: 100,
  v: 150,
  isVisible: true,
  isManuallyPlaced: true,
  confidence: 1.0,
  createdAt: now,
  updatedAt: now
})

// Mock constraints for testing
const mockConstraint1 = DistanceConstraint.create(
  'constraint-1',
  'Distance P1-P2',
  'point-1' as PointId,
  'point-2' as PointId,
  1.0,
  mockRepo,
  {
    tolerance: 0.01,
    isEnabled: true,
    isDriving: false
  }
)

const mockConstraint2 = DistanceConstraint.create(
  'constraint-2',
  'Distance P2-P3',
  'point-2' as PointId,
  'point-3' as PointId,
  1.0,
  mockRepo,
  {
    tolerance: 0.01,
    isEnabled: true,
    isDriving: false
  }
)

// Mock project data for testing
export const mockProject: EntityProject = {
  id: 'test-project-1',
  name: 'Test Project',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  settings: mockSettings,
  history: [],
  worldPoints: new Map([
    ['point-1', mockPoint1],
    ['point-2', mockPoint2],
    ['point-3', mockPoint3]
  ]),
  lines: new Map(),
  viewpoints: new Map([
    ['viewpoint-1', mockViewpoint1]
  ]),
  constraints: [mockConstraint1, mockConstraint2]
}

export const mockWorldPoint = WorldPoint.create('test-point', 'Test Point', {
  xyz: [1, 2, 3],
  color: '#2196F3',
  isVisible: true
})

export const mockConstraint = DistanceConstraint.create(
  'test-constraint',
  'Test Distance Constraint',
  'point-1' as PointId,
  'point-2' as PointId,
  5.0,
  mockRepo,
  {
    tolerance: 0.1,
    isEnabled: true,
    isDriving: false
  }
)

export const mockViewpoint = Viewpoint.create(
  'test-viewpoint',
  'Test Image',
  'test.jpg',
  'data:image/jpeg;base64,mock-data',
  1920,
  1080,
  {
    focalLength: 1000,
    principalPointX: 960,
    principalPointY: 540,
    isVisible: true
  }
)

// Custom render function for components that need project context
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  project?: EntityProject
}

export const renderWithProject = (
  ui: React.ReactElement,
  { project = mockProject, ...options }: CustomRenderOptions = {}
) => {
  // Mock project context if needed
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="project-wrapper">
      {children}
    </div>
  )

  return render(ui, { wrapper, ...options })
}

// Mock event handlers
export const mockHandlers = {
  onProjectChange: jest.fn(),
  onPointSelect: jest.fn(),
  onConstraintCreate: jest.fn(),
  onConstraintUpdate: jest.fn(),
  onConstraintDelete: jest.fn(),
  onImageLoad: jest.fn(),
  onClearSelection: jest.fn(),
  onUndo: jest.fn(),
  onRedo: jest.fn(),
  onZoom: jest.fn(),
  onPan: jest.fn()
}

// Reset all mocks
export const resetMocks = () => {
  Object.values(mockHandlers).forEach(mock => mock.mockClear())
  jest.clearAllMocks()
}

// Mock canvas context for 3D tests
export const mockCanvasContext = {
  canvas: document.createElement('canvas'),
  fillRect: jest.fn(),
  clearRect: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  arc: jest.fn(),
  fill: jest.fn(),
  stroke: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  translate: jest.fn(),
  scale: jest.fn(),
  rotate: jest.fn(),
  setTransform: jest.fn(),
  fillText: jest.fn(),
  measureText: jest.fn(() => ({ width: 100 })),
  strokeStyle: '#000000',
  fillStyle: '#000000',
  lineWidth: 1,
  font: '12px Arial'
}

// Wait for async operations in tests
export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Create mock file for testing file operations
export const createMockFile = (
  content: string,
  filename: string,
  type: string = 'text/plain'
): File => {
  const blob = new Blob([content], { type })
  return new File([blob], filename, { type })
}

// Mock optimization results
export const mockOptimizationResults = {
  totalError: 0.5,
  pointAccuracy: 0.02,
  cameraAccuracy: 0.01,
  iterations: 25,
  converged: true,
  processingTime: 1500,
  pointErrors: {
    'point-1': 0.01,
    'point-2': 0.02,
    'point-3': 0.015
  },
  constraintErrors: {
    'constraint-1': 0.005,
    'constraint-2': 0.003
  }
}

// Mock measurement data
export const mockMeasurements = {
  distance: {
    pointIds: ['point-1', 'point-2'],
    value: 1.414,
    unit: 'mm'
  },
  angle: {
    pointIds: ['point-1', 'point-2', 'point-3'],
    value: 90.0,
    unit: 'degrees'
  },
  area: {
    pointIds: ['point-1', 'point-2', 'point-3'],
    value: 0.5,
    unit: 'mm²'
  }
}