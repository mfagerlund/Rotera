// Test utilities and mock data
import React from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { Project, WorldPoint, Constraint, ProjectImage } from '../types/project'

// Mock project data for testing
export const mockProject: Project = {
  id: 'test-project-1',
  name: 'Test Project',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  lines: {},
  planes: {},
  nextWpNumber: 4,
  nextLineNumber: 1,
  nextPlaneNumber: 1,
  settings: {
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
  },
  history: [],
  worldPoints: {
    'point-1': {
      id: 'point-1',
      name: 'Test Point 1',
      xyz: [0, 0, 0],
      imagePoints: [
        { imageId: 'image-1', u: 100, v: 100, wpId: 'point-1' }
      ],
      isVisible: true,
      color: '#2196F3'
    },
    'point-2': {
      id: 'point-2',
      name: 'Test Point 2',
      xyz: [1, 0, 0],
      imagePoints: [
        { imageId: 'image-1', u: 150, v: 100, wpId: 'point-2' }
      ],
      isVisible: true,
      color: '#2196F3'
    },
    'point-3': {
      id: 'point-3',
      name: 'Test Point 3',
      xyz: [0, 1, 0],
      imagePoints: [
        { imageId: 'image-1', u: 100, v: 150, wpId: 'point-3' }
      ],
      isVisible: true,
      color: '#2196F3'
    }
  },
  images: {
    'image-1': {
      id: 'image-1',
      name: 'test-image.jpg',
      blob: 'data:image/jpeg;base64,mock-test-data',
      width: 1920,
      height: 1080,
      cameraId: 'camera-1'
    }
  },
  constraints: [
    {
      id: 'constraint-1',
      type: 'distance',
      enabled: true,
      isDriving: true,
      weight: 1.0,
      status: 'satisfied',
      entities: {
        points: ['point-1', 'point-2']
      },
      parameters: { distance: 1.0, tolerance: 0.01 },
      createdAt: new Date().toISOString()
    },
    {
      id: 'constraint-2',
      type: 'parallel',
      enabled: true,
      isDriving: true,
      weight: 1.0,
      status: 'satisfied',
      entities: {
        points: ['point-1', 'point-2']
      },
      parameters: { tolerance: 0.01 },
      createdAt: new Date().toISOString()
    }
  ],
  cameras: {
    'camera-1': {
      id: 'camera-1',
      name: 'Test Camera',
      make: 'Test',
      intrinsics: {
        fx: 1000,
        fy: 1000,
        cx: 960,
        cy: 540,
        k1: 0,
        k2: 0,
        k3: 0,
        p1: 0,
        p2: 0
      }
    }
  },
  optimization: undefined,
  groundPlanes: [],
  pointGroups: {
    'group-1': {
      id: 'group-1',
      name: 'Test Group',
      color: '#FF0000',
      visible: true,
      points: ['point-1', 'point-2']
    }
  }
}

export const mockWorldPoint: WorldPoint = {
  id: 'test-point',
  name: 'Test Point',
  xyz: [1, 2, 3],
  imagePoints: [
    { imageId: 'image-1', u: 100, v: 200, wpId: 'test-point' }
  ],
  isVisible: true,
  color: '#2196F3'
}

export const mockConstraint: Constraint = {
  id: 'test-constraint',
  type: 'distance',
  enabled: true,
  isDriving: true,
  weight: 1.0,
  status: 'satisfied',
  entities: {
    points: ['point-1', 'point-2']
  },
  parameters: { distance: 5.0, tolerance: 0.1 },
  createdAt: new Date().toISOString()
}

export const mockImage: ProjectImage = {
  id: 'test-image',
  name: 'test.jpg',
  blob: 'data:image/jpeg;base64,mock-data',
  width: 1920,
  height: 1080,
  cameraId: 'test-camera'
}

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