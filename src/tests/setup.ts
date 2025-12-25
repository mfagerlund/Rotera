// Essential test setup configuration
import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'

// Configure testing library
configure({ testIdAttribute: 'data-testid' })

// Mock crypto.randomUUID for ID generation
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substr(2, 9)
  }
})

// Mock localStorage for project persistence
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

// Mock ResizeObserver for responsive components
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Suppress console output in tests (unless Rotera_VERBOSE_TESTS is set)
const originalLog = console.log
const originalWarn = console.warn
const originalError = console.error
const originalInfo = console.info
const originalDebug = console.debug

const isVerbose = process.env.Rotera_VERBOSE_TESTS === 'true'

beforeAll(() => {
  if (!isVerbose) {
    console.log = () => {}
    console.warn = () => {}
    console.info = () => {}
    console.debug = () => {}
  }

  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is deprecated')
    ) {
      return
    }
    if (!isVerbose) {
      return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.log = originalLog
  console.warn = originalWarn
  console.error = originalError
  console.info = originalInfo
  console.debug = originalDebug
})