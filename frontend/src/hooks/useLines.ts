// Hook for managing Line entities in the enhanced paradigm

import { useState, useCallback, useMemo } from 'react'
import { Line } from '../types/geometry'

interface LineData {
  id: string
  name: string
  pointA: string
  pointB: string
  geometry: 'segment' | 'infinite'
  length?: number
  color: string
  isVisible: boolean
  isConstruction: boolean
  createdAt: string
  updatedAt?: string
}

interface UseLinesReturn {
  lines: Record<string, LineData>
  createLine: (pointIds: [string, string], geometry: 'segment' | 'infinite', name?: string) => string | null
  updateLine: (lineId: string, updates: Partial<LineData>) => boolean
  deleteLine: (lineId: string) => boolean
  toggleLineVisibility: (lineId: string) => boolean
  getLinesForPoints: (pointIds: string[]) => LineData[]
  getLineById: (lineId: string) => LineData | null
  lineCount: number
}

export const useLines = (
  initialLines: Record<string, LineData> = {}
): UseLinesReturn => {
  const [lines, setLines] = useState<Record<string, LineData>>(initialLines)
  const [nextLineCounter, setNextLineCounter] = useState(1)

  // Create a new line
  const createLine = useCallback((
    pointIds: [string, string],
    geometry: 'segment' | 'infinite' = 'segment',
    name?: string
  ): string | null => {
    const [pointA, pointB] = pointIds

    // Validate points are different
    if (pointA === pointB) {
      console.warn('Cannot create line: same point provided twice')
      return null
    }

    // Check if line already exists between these points
    const existingLine = Object.values(lines).find(line =>
      (line.pointA === pointA && line.pointB === pointB) ||
      (line.pointA === pointB && line.pointB === pointA)
    )

    if (existingLine) {
      console.warn('Line already exists between these points:', existingLine.name)
      return null
    }

    const id = crypto?.randomUUID?.() || `line_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const lineName = name || `L${nextLineCounter}`
    const timestamp = new Date().toISOString()

    const newLine: LineData = {
      id,
      name: lineName,
      pointA,
      pointB,
      geometry,
      color: '#4CAF50', // Green for lines according to visual language
      isVisible: true,
      isConstruction: false,
      createdAt: timestamp
    }

    setLines(prev => ({
      ...prev,
      [id]: newLine
    }))

    setNextLineCounter(prev => prev + 1)

    console.log(`Created line ${lineName} between points ${pointA} and ${pointB} (${geometry})`)
    return id
  }, [lines, nextLineCounter])

  // Update an existing line
  const updateLine = useCallback((lineId: string, updates: Partial<LineData>): boolean => {
    if (!lines[lineId]) {
      console.warn('Line not found:', lineId)
      return false
    }

    setLines(prev => ({
      ...prev,
      [lineId]: {
        ...prev[lineId],
        ...updates,
        updatedAt: new Date().toISOString()
      }
    }))

    return true
  }, [lines])

  // Delete a line
  const deleteLine = useCallback((lineId: string): boolean => {
    if (!lines[lineId]) {
      console.warn('Line not found:', lineId)
      return false
    }

    setLines(prev => {
      const { [lineId]: deleted, ...rest } = prev
      return rest
    })

    console.log('Deleted line:', lineId)
    return true
  }, [lines])

  // Toggle line visibility
  const toggleLineVisibility = useCallback((lineId: string): boolean => {
    if (!lines[lineId]) {
      console.warn('Line not found:', lineId)
      return false
    }

    return updateLine(lineId, { isVisible: !lines[lineId].isVisible })
  }, [lines, updateLine])

  // Get lines that connect to any of the given points
  const getLinesForPoints = useCallback((pointIds: string[]): LineData[] => {
    return Object.values(lines).filter(line =>
      pointIds.includes(line.pointA) || pointIds.includes(line.pointB)
    )
  }, [lines])

  // Get line by ID
  const getLineById = useCallback((lineId: string): LineData | null => {
    return lines[lineId] || null
  }, [lines])

  // Memoized computed values
  const lineCount = useMemo(() => Object.keys(lines).length, [lines])

  return {
    lines,
    createLine,
    updateLine,
    deleteLine,
    toggleLineVisibility,
    getLinesForPoints,
    getLineById,
    lineCount
  }
}

export default useLines