// Test setup configuration
import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'

// Configure testing library
configure({ testIdAttribute: 'data-testid' })

// Mock canvas for 3D visualization tests
interface MockCanvasRenderingContext2D extends Partial<CanvasRenderingContext2D> {
  fillRect: jest.Mock
  clearRect: jest.Mock
  getImageData: jest.Mock
  putImageData: jest.Mock
  createImageData: jest.Mock
  setTransform: jest.Mock
  drawImage: jest.Mock
  save: jest.Mock
  fillText: jest.Mock
  restore: jest.Mock
  beginPath: jest.Mock
  moveTo: jest.Mock
  lineTo: jest.Mock
  closePath: jest.Mock
  stroke: jest.Mock
  translate: jest.Mock
  scale: jest.Mock
  rotate: jest.Mock
  arc: jest.Mock
  fill: jest.Mock
  measureText: jest.Mock
  transform: jest.Mock
  rect: jest.Mock
  clip: jest.Mock
}

HTMLCanvasElement.prototype.getContext = jest.fn((contextId: string): MockCanvasRenderingContext2D | null => {
  if (contextId === '2d') {
    return {
      fillRect: jest.fn(),
      clearRect: jest.fn(),
      getImageData: jest.fn(() => ({ data: new Array(4) })),
      putImageData: jest.fn(),
      createImageData: jest.fn(() => ({ data: new Array(4) })),
      setTransform: jest.fn(),
      drawImage: jest.fn(),
      save: jest.fn(),
      fillText: jest.fn(),
      restore: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      closePath: jest.fn(),
      stroke: jest.fn(),
      translate: jest.fn(),
      scale: jest.fn(),
      rotate: jest.fn(),
      arc: jest.fn(),
      fill: jest.fn(),
      measureText: jest.fn(() => ({ width: 0 })),
      transform: jest.fn(),
      rect: jest.fn(),
      clip: jest.fn(),
    } as MockCanvasRenderingContext2D
  }
  return null
})

// Mock File API
global.File = class File {
  name: string
  type: string
  size: number
  lastModified: number

  constructor(chunks: (string | ArrayBuffer | ArrayBufferView | Blob)[], filename: string, options: FilePropertyBag = {}) {
    this.name = filename
    this.type = options.type || ''
    this.size = chunks.reduce((acc, chunk) => {
      if (typeof chunk === 'string') return acc + chunk.length
      if (chunk instanceof ArrayBuffer) return acc + chunk.byteLength
      if ('byteLength' in chunk) return acc + chunk.byteLength
      if (chunk instanceof Blob) return acc + chunk.size
      return acc
    }, 0)
    this.lastModified = Date.now()
  }

  text() {
    return Promise.resolve('')
  }
}

// Mock Blob
global.Blob = class Blob {
  size: number
  type: string

  constructor(chunks: (string | ArrayBuffer | ArrayBufferView | Blob)[] = [], options: BlobPropertyBag = {}) {
    this.size = chunks.reduce((acc, chunk) => {
      if (typeof chunk === 'string') return acc + chunk.length
      if (chunk instanceof ArrayBuffer) return acc + chunk.byteLength
      if ('byteLength' in chunk) return acc + chunk.byteLength
      if (chunk instanceof Blob) return acc + chunk.size
      return acc
    }, 0)
    this.type = options.type || ''
  }
}

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'mock-url')
global.URL.revokeObjectURL = jest.fn()

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substr(2, 9)
  }
})

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value.toString()
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key]
    }),
    clear: jest.fn(() => {
      store = {}
    }),
    get length() {
      return Object.keys(store).length
    },
    key: jest.fn((index: number) => Object.keys(store)[index] || null)
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Suppress console warnings in tests
const originalError = console.error
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is deprecated')
    ) {
      return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
})