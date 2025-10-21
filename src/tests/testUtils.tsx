// Test utilities and mock data
import React from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { Project, ProjectSettings } from '../entities/project'
import { WorldPoint } from '../entities/world-point/WorldPoint'
import { Viewpoint } from '../entities/viewpoint/Viewpoint'
import { ImagePoint } from '../entities/imagePoint/ImagePoint'
import { DistanceConstraint } from '../entities/constraints/distance-constraint'
import { ParallelLinesConstraint } from '../entities/constraints/parallel-lines-constraint'
// Mock ConstraintRepository no longer needed - constraints use object references
// Kept for backwards compatibility with existing tests
class MockConstraintRepository {}
const mockRepo = new MockConstraintRepository()
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
const mockPoint1 = WorldPoint.create('Test Point 1', {
  lockedXyz: [0, 0, 0],
  color: '#2196F3',
  isVisible: true
})

const mockPoint2 = WorldPoint.create('Test Point 2', {
  lockedXyz: [1, 0, 0],
  color: '#2196F3',
  isVisible: true
})

const mockPoint3 = WorldPoint.create('Test Point 3', {
  lockedXyz: [0, 1, 0],
  color: '#2196F3',
  isVisible: true
})

// Mock viewpoint for testing
const mockViewpoint1 = Viewpoint.create(
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
const ip1 = ImagePoint.create(mockPoint1, mockViewpoint1, 100, 100, {
  isVisible: true,
  confidence: 1.0
})
mockViewpoint1.addImagePoint(ip1)
mockPoint1.addImagePoint(ip1)

const ip2 = ImagePoint.create(mockPoint2, mockViewpoint1, 150, 100, {
  isVisible: true,
  confidence: 1.0
})
mockViewpoint1.addImagePoint(ip2)
mockPoint2.addImagePoint(ip2)

const ip3 = ImagePoint.create(mockPoint3, mockViewpoint1, 100, 150, {
  isVisible: true,
  confidence: 1.0
})
mockViewpoint1.addImagePoint(ip3)
mockPoint3.addImagePoint(ip3)

// Mock constraints for testing
const mockConstraint1 = DistanceConstraint.create(
  'Distance P1-P2',
  mockPoint1,
  mockPoint2,
  1.0,
  {
    tolerance: 0.01
  }
)

const mockConstraint2 = DistanceConstraint.create(
  'Distance P2-P3',
  mockPoint2,
  mockPoint3,
  1.0,
  {
    tolerance: 0.01
  }
)

// Mock project data for testing
export const mockProject = {
  id: 'test-project-1',
  name: 'Test Project',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...mockSettings,
  history: [],
  worldPoints: new Set([mockPoint1, mockPoint2, mockPoint3]),
  lines: new Set(),
  viewpoints: new Set([mockViewpoint1]),
  constraints: [mockConstraint1, mockConstraint2],
  // Mock Project methods for testing
  addWorldPoint: jest.fn(),
  removeWorldPoint: jest.fn(),
  addLine: jest.fn(),
  removeLine: jest.fn(),
  addViewpoint: jest.fn(),
  removeViewpoint: jest.fn(),
  addConstraint: jest.fn(),
  removeConstraint: jest.fn(),
  getStats: jest.fn(() => ({ worldPoints: 3, lines: 0, viewpoints: 1, constraints: 2 })),
  clone: jest.fn()
} as unknown as Project

export const mockWorldPoint = WorldPoint.create('Test Point', {
  lockedXyz: [1, 2, 3],
  color: '#2196F3',
  isVisible: true
})

export const mockConstraint = DistanceConstraint.create(
  'Test Distance Constraint',
  mockPoint1,
  mockPoint2,
  5.0,
  {
    tolerance: 0.1
  }
)

export const mockViewpoint = Viewpoint.create(
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
  project?: Project
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