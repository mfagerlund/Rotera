// Test for Line creation functionality

import { useLines } from '../hooks/useLines'
import { renderHook, act } from '@testing-library/react'

describe('Line Creation', () => {
  it('should create a line between two different points', () => {
    const { result } = renderHook(() => useLines())

    let lineId: string | null = null

    act(() => {
      lineId = result.current.createLine(['point1', 'point2'], 'segment')
    })

    // Check the result after the state update has been applied
    expect(lineId).toBeTruthy()
    expect(result.current.lineCount).toBe(1)
    expect(Object.keys(result.current.lines)).toHaveLength(1)
  })

  it('should not create a line between the same point', () => {
    const { result } = renderHook(() => useLines())

    act(() => {
      const lineId = result.current.createLine(['point1', 'point1'], 'segment')
      expect(lineId).toBeNull()
      expect(result.current.lineCount).toBe(0)
    })
  })

  it('should not create duplicate lines between same points', () => {
    const { result } = renderHook(() => useLines())

    let lineId1: string | null = null
    let lineId2: string | null = null
    let lineId3: string | null = null

    act(() => {
      // Create first line
      lineId1 = result.current.createLine(['point1', 'point2'], 'segment')
    })

    expect(lineId1).toBeTruthy()
    expect(result.current.lineCount).toBe(1)

    act(() => {
      // Try to create duplicate line
      lineId2 = result.current.createLine(['point1', 'point2'], 'infinite')
    })

    expect(lineId2).toBeNull()
    expect(result.current.lineCount).toBe(1)

    act(() => {
      // Try reverse order
      lineId3 = result.current.createLine(['point2', 'point1'], 'segment')
    })

    expect(lineId3).toBeNull()
    expect(result.current.lineCount).toBe(1)
  })

  it('should create line with correct geometry type', () => {
    const { result } = renderHook(() => useLines())

    let lineId: string | null = null

    act(() => {
      lineId = result.current.createLine(['point1', 'point2'], 'infinite', 'TestLine')
    })

    expect(lineId).toBeTruthy()

    const line = result.current.getLineById(lineId!)
    expect(line).toBeTruthy()
    expect(line!.geometry).toBe('infinite')
    expect(line!.name).toBe('TestLine')
    expect(line!.pointA).toBe('point1')
    expect(line!.pointB).toBe('point2')
  })

  it('should delete lines correctly', () => {
    const { result } = renderHook(() => useLines())

    let lineId: string = ''

    act(() => {
      lineId = result.current.createLine(['point1', 'point2'], 'segment')!
    })

    expect(result.current.lineCount).toBe(1)

    act(() => {
      const deleted = result.current.deleteLine(lineId)
      expect(deleted).toBe(true)
    })

    expect(result.current.lineCount).toBe(0)
  })

  it('should update line properties', () => {
    const { result } = renderHook(() => useLines())

    let lineId: string = ''

    act(() => {
      lineId = result.current.createLine(['point1', 'point2'], 'segment')!
    })

    let updated: boolean = false

    act(() => {
      updated = result.current.updateLine(lineId, {
        geometry: 'infinite',
        name: 'Updated Line'
      })
    })

    expect(updated!).toBe(true)

    const line = result.current.getLineById(lineId)
    expect(line!.geometry).toBe('infinite')
    expect(line!.name).toBe('Updated Line')
  })

  it('should find lines for points', () => {
    const { result } = renderHook(() => useLines())

    act(() => {
      result.current.createLine(['point1', 'point2'], 'segment')
      result.current.createLine(['point2', 'point3'], 'segment')
      result.current.createLine(['point3', 'point4'], 'segment')
    })

    expect(result.current.lineCount).toBe(3)

    const linesForPoint2 = result.current.getLinesForPoints(['point2'])
    expect(linesForPoint2).toHaveLength(2)

    const linesForPoints23 = result.current.getLinesForPoints(['point2', 'point3'])
    expect(linesForPoints23).toHaveLength(3) // All lines connect to either point2 or point3
  })
})