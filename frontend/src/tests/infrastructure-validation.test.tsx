// Test to validate that our testing infrastructure is working perfectly
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Test our mock infrastructure
describe('🧪 Testing Infrastructure Validation', () => {
  describe('Mock Infrastructure', () => {
    it('provides working localStorage mock', () => {
      localStorage.setItem('test-key', 'test-value')
      expect(localStorage.getItem('test-key')).toBe('test-value')

      localStorage.removeItem('test-key')
      expect(localStorage.getItem('test-key')).toBeNull()

      localStorage.setItem('key1', 'value1')
      localStorage.setItem('key2', 'value2')
      expect(localStorage.length).toBe(2)

      localStorage.clear()
      expect(localStorage.length).toBe(0)
    })

    it('provides working crypto.randomUUID mock', () => {
      const uuid1 = crypto.randomUUID()
      const uuid2 = crypto.randomUUID()

      expect(uuid1).toMatch(/^mock-uuid-/)
      expect(uuid2).toMatch(/^mock-uuid-/)
      expect(uuid1).not.toBe(uuid2)
    })

    it('provides working canvas context mock', () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      expect(ctx).toBeDefined()
      expect(typeof ctx.fillRect).toBe('function')
      expect(typeof ctx.clearRect).toBe('function')
      expect(typeof ctx.arc).toBe('function')

      // Test that methods can be called without error
      ctx.fillRect(0, 0, 100, 100)
      ctx.clearRect(0, 0, 100, 100)
      ctx.arc(50, 50, 25, 0, Math.PI * 2)
    })

    it('provides working File and Blob mocks', () => {
      const blob = new Blob(['test content'], { type: 'text/plain' })
      expect(blob.size).toBeGreaterThan(0)
      expect(blob.type).toBe('text/plain')

      const file = new File(['test content'], 'test.txt', { type: 'text/plain' })
      expect(file.name).toBe('test.txt')
      expect(file.type).toBe('text/plain')
      expect(file.size).toBeGreaterThan(0)
    })

    it('provides working URL.createObjectURL mock', () => {
      const blob = new Blob(['test'])
      const url = URL.createObjectURL(blob)

      expect(url).toBe('mock-url')
      expect(() => URL.revokeObjectURL(url)).not.toThrow()
    })
  })

  describe('React Testing Library Integration', () => {
    it('renders React components correctly', () => {
      const TestComponent = () => (
        <div data-testid="test-component">
          <h1>Test Component</h1>
          <button data-testid="test-button">Click me</button>
        </div>
      )

      render(<TestComponent />)

      expect(screen.getByTestId('test-component')).toBeInTheDocument()
      expect(screen.getByText('Test Component')).toBeInTheDocument()
      expect(screen.getByTestId('test-button')).toBeInTheDocument()
    })

    it('handles user interactions', async () => {
      const user = userEvent.setup()
      const mockHandler = jest.fn()

      const InteractiveComponent = () => {
        const [count, setCount] = React.useState(0)

        return (
          <div>
            <span data-testid="count">{count}</span>
            <button
              data-testid="increment"
              onClick={() => {
                setCount(c => c + 1)
                mockHandler()
              }}
            >
              Increment
            </button>
            <input data-testid="text-input" placeholder="Type here" />
          </div>
        )
      }

      render(<InteractiveComponent />)

      // Test initial state
      expect(screen.getByTestId('count')).toHaveTextContent('0')

      // Test button click
      await user.click(screen.getByTestId('increment'))
      expect(screen.getByTestId('count')).toHaveTextContent('1')
      expect(mockHandler).toHaveBeenCalledTimes(1)

      // Test typing
      const input = screen.getByTestId('text-input')
      await user.type(input, 'Hello World')
      expect(input).toHaveValue('Hello World')
    })

    it('handles async operations and waiting', async () => {
      const AsyncComponent = () => {
        const [loading, setLoading] = React.useState(false)
        const [result, setResult] = React.useState('')

        const handleAsyncOperation = async () => {
          setLoading(true)
          await new Promise(resolve => setTimeout(resolve, 100))
          setResult('Operation completed')
          setLoading(false)
        }

        return (
          <div>
            <button onClick={handleAsyncOperation} data-testid="async-button">
              Start Operation
            </button>
            {loading && <div data-testid="loading">Loading...</div>}
            {result && <div data-testid="result">{result}</div>}
          </div>
        )
      }

      render(<AsyncComponent />)

      const button = screen.getByTestId('async-button')
      fireEvent.click(button)

      // Check loading state appears
      expect(screen.getByTestId('loading')).toBeInTheDocument()

      // Wait for completion
      await waitFor(() => {
        expect(screen.getByTestId('result')).toHaveTextContent('Operation completed')
      })

      // Check loading state is gone
      expect(screen.queryByTestId('loading')).not.toBeInTheDocument()
    })
  })

  describe('Jest Testing Features', () => {
    it('supports mocking functions', () => {
      const mockFn = jest.fn()
      const mockFnWithReturn = jest.fn(() => 'mocked value')
      const mockFnWithImplementation = jest.fn((x: number) => x * 2)

      mockFn()
      expect(mockFn).toHaveBeenCalledTimes(1)

      const result1 = mockFnWithReturn()
      expect(result1).toBe('mocked value')

      const result2 = mockFnWithImplementation(5)
      expect(result2).toBe(10)
    })

    it('supports snapshot testing concepts', () => {
      const data = {
        id: 'test-123',
        name: 'Test Object',
        values: [1, 2, 3],
        nested: {
          property: 'value'
        }
      }

      // Instead of toMatchSnapshot, we test structure
      expect(data).toMatchObject({
        id: expect.stringMatching(/test-\d+/),
        name: expect.stringContaining('Test'),
        values: expect.arrayContaining([1, 2]),
        nested: expect.objectContaining({
          property: expect.any(String)
        })
      })
    })

    it('supports advanced matchers', () => {
      expect('hello world').toMatch(/hello/)
      expect(['apple', 'banana', 'cherry']).toContain('banana')
      expect({ a: 1, b: 2, c: 3 }).toHaveProperty('b', 2)

      const fn = jest.fn()
      fn('arg1', 'arg2')
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2')

      expect(3.14159).toBeCloseTo(3.14, 2)
      expect([1, 2, 3]).toHaveLength(3)
    })
  })

  describe('Error Handling', () => {
    it('handles and tests error conditions', () => {
      const errorFunction = () => {
        throw new Error('Test error')
      }

      expect(errorFunction).toThrow('Test error')
      expect(errorFunction).toThrow(Error)
    })

    it('handles async errors', async () => {
      const asyncErrorFunction = async () => {
        throw new Error('Async test error')
      }

      await expect(asyncErrorFunction()).rejects.toThrow('Async test error')
    })
  })

  describe('Performance and Coverage', () => {
    it('supports performance testing concepts', () => {
      const startTime = Date.now()

      // Simulate some work
      for (let i = 0; i < 1000; i++) {
        Math.sqrt(i)
      }

      const endTime = Date.now()
      const duration = endTime - startTime

      // Performance test - should complete quickly
      expect(duration).toBeLessThan(100) // 100ms
    })

    it('demonstrates test coverage concepts', () => {
      const complexFunction = (input: string, option: boolean) => {
        if (!input) {
          return 'empty'
        }

        if (option) {
          return input.toUpperCase()
        } else {
          return input.toLowerCase()
        }
      }

      // Test all code paths for coverage
      expect(complexFunction('', true)).toBe('empty')
      expect(complexFunction('', false)).toBe('empty')
      expect(complexFunction('Hello', true)).toBe('HELLO')
      expect(complexFunction('Hello', false)).toBe('hello')
    })
  })

  describe('Integration Testing Concepts', () => {
    it('demonstrates component integration testing', () => {
      const Parent = () => {
        const [data, setData] = React.useState('')

        return (
          <div>
            <Child onDataChange={setData} />
            <Display data={data} />
          </div>
        )
      }

      const Child = ({ onDataChange }: { onDataChange: (data: string) => void }) => (
        <button onClick={() => onDataChange('Updated!')} data-testid="update-btn">
          Update
        </button>
      )

      const Display = ({ data }: { data: string }) => (
        <div data-testid="display">{data || 'No data'}</div>
      )

      render(<Parent />)

      expect(screen.getByTestId('display')).toHaveTextContent('No data')

      fireEvent.click(screen.getByTestId('update-btn'))

      expect(screen.getByTestId('display')).toHaveTextContent('Updated!')
    })
  })
})