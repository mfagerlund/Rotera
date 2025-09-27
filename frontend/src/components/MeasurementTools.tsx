// Measurement tools for distance, angle, and area calculations

import React, { useState, useCallback, useMemo } from 'react'
import { WorldPoint, ProjectImage, Constraint } from '../types/project'

export type MeasurementType = 'distance' | 'angle' | 'area' | 'perimeter'

export interface Measurement {
  id: string
  type: MeasurementType
  pointIds: string[]
  value: number
  unit: string
  label: string
  createdAt: string
}

interface MeasurementToolsProps {
  worldPoints: Record<string, WorldPoint>
  currentImage: ProjectImage | null
  constraints: Constraint[]
  activeTool: MeasurementType | null
  onToolChange: (tool: MeasurementType | null) => void
  onMeasurementCreate: (measurement: Measurement) => void
  onMeasurementDelete: (measurementId: string) => void
  measurements: Measurement[]
  selectedPointIds: string[]
  onPointSelect: (pointId: string, multiSelect: boolean) => void
}

export const MeasurementTools: React.FC<MeasurementToolsProps> = ({
  worldPoints,
  currentImage,
  constraints,
  activeTool,
  onToolChange,
  onMeasurementCreate,
  onMeasurementDelete,
  measurements,
  selectedPointIds,
  onPointSelect
}) => {
  const [tempMeasurement, setTempMeasurement] = useState<Partial<Measurement> | null>(null)
  const [unit, setUnit] = useState<'mm' | 'cm' | 'm' | 'in' | 'ft'>('mm')
  const [showMeasurements, setShowMeasurements] = useState(true)

  // Get available points for current measurement
  const availablePoints = useMemo(() => {
    return Object.values(worldPoints).filter(wp => wp.xyz)
  }, [worldPoints])

  // Calculate distance between two points
  const calculateDistance = useCallback((pointA: WorldPoint, pointB: WorldPoint): number => {
    if (!pointA.xyz || !pointB.xyz) return 0

    const dx = pointA.xyz[0] - pointB.xyz[0]
    const dy = pointA.xyz[1] - pointB.xyz[1]
    const dz = pointA.xyz[2] - pointB.xyz[2]

    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }, [])

  // Calculate angle between three points (vertex is the middle point)
  const calculateAngle = useCallback((pointA: WorldPoint, vertex: WorldPoint, pointC: WorldPoint): number => {
    if (!pointA.xyz || !vertex.xyz || !pointC.xyz) return 0

    // Vectors from vertex to the other points
    const va = [
      pointA.xyz[0] - vertex.xyz[0],
      pointA.xyz[1] - vertex.xyz[1],
      pointA.xyz[2] - vertex.xyz[2]
    ]

    const vc = [
      pointC.xyz[0] - vertex.xyz[0],
      pointC.xyz[1] - vertex.xyz[1],
      pointC.xyz[2] - vertex.xyz[2]
    ]

    // Calculate dot product and magnitudes
    const dotProduct = va[0] * vc[0] + va[1] * vc[1] + va[2] * vc[2]
    const magA = Math.sqrt(va[0] * va[0] + va[1] * va[1] + va[2] * va[2])
    const magC = Math.sqrt(vc[0] * vc[0] + vc[1] * vc[1] + vc[2] * vc[2])

    if (magA === 0 || magC === 0) return 0

    // Calculate angle in radians, then convert to degrees
    const cosAngle = Math.max(-1, Math.min(1, dotProduct / (magA * magC)))
    return Math.acos(cosAngle) * (180 / Math.PI)
  }, [])

  // Calculate area of polygon using 3D cross product
  const calculateArea = useCallback((points: WorldPoint[]): number => {
    if (points.length < 3 || !points.every(p => p.xyz)) return 0

    let area = 0
    const n = points.length

    for (let i = 0; i < n; i++) {
      const current = points[i].xyz!
      const next = points[(i + 1) % n].xyz!

      // Cross product for area calculation
      area += current[0] * next[1] - next[0] * current[1]
    }

    return Math.abs(area) / 2
  }, [])

  // Calculate perimeter of polygon
  const calculatePerimeter = useCallback((points: WorldPoint[]): number => {
    if (points.length < 2 || !points.every(p => p.xyz)) return 0

    let perimeter = 0
    for (let i = 0; i < points.length; i++) {
      const current = points[i]
      const next = points[(i + 1) % points.length]
      perimeter += calculateDistance(current, next)
    }

    return perimeter
  }, [calculateDistance])

  // Convert measurement value to different units
  const convertUnit = useCallback((value: number, fromUnit: string, toUnit: string): number => {
    const mmValue = (() => {
      switch (fromUnit) {
        case 'mm': return value
        case 'cm': return value * 10
        case 'm': return value * 1000
        case 'in': return value * 25.4
        case 'ft': return value * 304.8
        default: return value
      }
    })()

    switch (toUnit) {
      case 'mm': return mmValue
      case 'cm': return mmValue / 10
      case 'm': return mmValue / 1000
      case 'in': return mmValue / 25.4
      case 'ft': return mmValue / 304.8
      default: return mmValue
    }
  }, [])

  // Handle point selection for measurements
  const handlePointClick = useCallback((pointId: string) => {
    if (!activeTool) return

    const isSelected = selectedPointIds.includes(pointId)

    switch (activeTool) {
      case 'distance':
        if (selectedPointIds.length === 0) {
          onPointSelect(pointId, false)
        } else if (selectedPointIds.length === 1 && !isSelected) {
          onPointSelect(pointId, true)
          // Create distance measurement
          const pointA = worldPoints[selectedPointIds[0]]
          const pointB = worldPoints[pointId]
          const distance = calculateDistance(pointA, pointB)

          const measurement: Measurement = {
            id: crypto.randomUUID(),
            type: 'distance',
            pointIds: [selectedPointIds[0], pointId],
            value: distance,
            unit,
            label: `${pointA.name} ↔ ${pointB.name}`,
            createdAt: new Date().toISOString()
          }

          onMeasurementCreate(measurement)
          onPointSelect('', false) // Clear selection
          onToolChange(null)
        }
        break

      case 'angle':
        if (selectedPointIds.length === 0) {
          onPointSelect(pointId, false)
        } else if (selectedPointIds.length === 1 && !isSelected) {
          onPointSelect(pointId, true)
        } else if (selectedPointIds.length === 2 && !isSelected) {
          onPointSelect(pointId, true)
          // Create angle measurement (middle point is vertex)
          const pointA = worldPoints[selectedPointIds[0]]
          const vertex = worldPoints[selectedPointIds[1]]
          const pointC = worldPoints[pointId]
          const angle = calculateAngle(pointA, vertex, pointC)

          const measurement: Measurement = {
            id: crypto.randomUUID(),
            type: 'angle',
            pointIds: [selectedPointIds[0], selectedPointIds[1], pointId],
            value: angle,
            unit: '°',
            label: `∠${pointA.name}-${vertex.name}-${pointC.name}`,
            createdAt: new Date().toISOString()
          }

          onMeasurementCreate(measurement)
          onPointSelect('', false) // Clear selection
          onToolChange(null)
        }
        break

      case 'area':
      case 'perimeter':
        onPointSelect(pointId, true) // Always multi-select for area/perimeter
        break
    }
  }, [activeTool, selectedPointIds, worldPoints, calculateDistance, calculateAngle, unit, onPointSelect, onMeasurementCreate, onToolChange])

  // Complete area or perimeter measurement
  const completePolygonMeasurement = useCallback(() => {
    if (!activeTool || selectedPointIds.length < 3) return

    const points = selectedPointIds.map(id => worldPoints[id]).filter(Boolean)

    if (activeTool === 'area') {
      const area = calculateArea(points)
      const measurement: Measurement = {
        id: crypto.randomUUID(),
        type: 'area',
        pointIds: selectedPointIds,
        value: convertUnit(area, 'mm', unit === 'mm' ? 'mm' : unit) * (unit === 'mm' ? 1 : unit === 'cm' ? 0.01 : unit === 'm' ? 0.000001 : 1),
        unit: unit === 'mm' ? 'mm²' : unit === 'cm' ? 'cm²' : unit === 'm' ? 'm²' : unit === 'in' ? 'in²' : 'ft²',
        label: `Area (${points.map(p => p.name).join('-')})`,
        createdAt: new Date().toISOString()
      }
      onMeasurementCreate(measurement)
    } else if (activeTool === 'perimeter') {
      const perimeter = calculatePerimeter(points)
      const measurement: Measurement = {
        id: crypto.randomUUID(),
        type: 'perimeter',
        pointIds: selectedPointIds,
        value: convertUnit(perimeter, 'mm', unit),
        unit,
        label: `Perimeter (${points.map(p => p.name).join('-')})`,
        createdAt: new Date().toISOString()
      }
      onMeasurementCreate(measurement)
    }

    onPointSelect('', false) // Clear selection
    onToolChange(null)
  }, [activeTool, selectedPointIds, worldPoints, calculateArea, calculatePerimeter, convertUnit, unit, onMeasurementCreate, onPointSelect, onToolChange])

  // Cancel current measurement
  const cancelMeasurement = useCallback(() => {
    onPointSelect('', false)
    onToolChange(null)
    setTempMeasurement(null)
  }, [onPointSelect, onToolChange])

  // Format measurement value for display
  const formatMeasurementValue = useCallback((measurement: Measurement): string => {
    const precision = measurement.unit.includes('°') ? 1 :
                     measurement.unit.includes('mm') ? 2 :
                     measurement.unit.includes('cm') ? 3 :
                     measurement.unit.includes('m') ? 6 : 3

    return `${measurement.value.toFixed(precision)} ${measurement.unit}`
  }, [])

  return (
    <div className="measurement-tools">
      <div className="tools-header">
        <h3>Measurement Tools</h3>
        <div className="tools-controls">
          <label className="unit-selector">
            <span>Unit:</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value as any)}>
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
              <option value="in">in</option>
              <option value="ft">ft</option>
            </select>
          </label>
          <button
            className="toggle-visibility-btn"
            onClick={() => setShowMeasurements(!showMeasurements)}
            title={showMeasurements ? 'Hide measurements' : 'Show measurements'}
          >
            {showMeasurements ? '👁️' : '👁️‍🗨️'}
          </button>
        </div>
      </div>

      <div className="tool-buttons">
        <button
          className={`tool-btn ${activeTool === 'distance' ? 'active' : ''}`}
          onClick={() => onToolChange(activeTool === 'distance' ? null : 'distance')}
          disabled={availablePoints.length < 2}
        >
          📏 Distance
        </button>
        <button
          className={`tool-btn ${activeTool === 'angle' ? 'active' : ''}`}
          onClick={() => onToolChange(activeTool === 'angle' ? null : 'angle')}
          disabled={availablePoints.length < 3}
        >
          📐 Angle
        </button>
        <button
          className={`tool-btn ${activeTool === 'area' ? 'active' : ''}`}
          onClick={() => onToolChange(activeTool === 'area' ? null : 'area')}
          disabled={availablePoints.length < 3}
        >
          🔳 Area
        </button>
        <button
          className={`tool-btn ${activeTool === 'perimeter' ? 'active' : ''}`}
          onClick={() => onToolChange(activeTool === 'perimeter' ? null : 'perimeter')}
          disabled={availablePoints.length < 3}
        >
          ⭕ Perimeter
        </button>
      </div>

      {activeTool && (
        <div className="active-measurement">
          <div className="measurement-status">
            <span className="status-text">
              {activeTool === 'distance' && `Select 2 points (${selectedPointIds.length}/2)`}
              {activeTool === 'angle' && `Select 3 points (${selectedPointIds.length}/3)`}
              {(activeTool === 'area' || activeTool === 'perimeter') &&
                `Select points for polygon (${selectedPointIds.length} selected)`}
            </span>
          </div>

          <div className="measurement-actions">
            {(activeTool === 'area' || activeTool === 'perimeter') && selectedPointIds.length >= 3 && (
              <button
                className="btn-complete"
                onClick={completePolygonMeasurement}
              >
                Complete {activeTool}
              </button>
            )}
            <button
              className="btn-cancel"
              onClick={cancelMeasurement}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showMeasurements && (
        <div className="measurements-list">
          <div className="list-header">
            <span>Measurements ({measurements.length})</span>
            {measurements.length > 0 && (
              <button
                className="clear-all-btn"
                onClick={() => measurements.forEach(m => onMeasurementDelete(m.id))}
              >
                Clear All
              </button>
            )}
          </div>

          {measurements.length === 0 ? (
            <div className="no-measurements">
              <div className="no-measurements-icon">📏</div>
              <div className="no-measurements-text">No measurements yet</div>
              <div className="no-measurements-hint">
                Select a tool above to start measuring
              </div>
            </div>
          ) : (
            <div className="measurement-items">
              {measurements.map(measurement => (
                <div key={measurement.id} className="measurement-item">
                  <div className="measurement-main">
                    <div className="measurement-icon">
                      {measurement.type === 'distance' && '📏'}
                      {measurement.type === 'angle' && '📐'}
                      {measurement.type === 'area' && '🔳'}
                      {measurement.type === 'perimeter' && '⭕'}
                    </div>
                    <div className="measurement-info">
                      <div className="measurement-label">{measurement.label}</div>
                      <div className="measurement-value">
                        {formatMeasurementValue(measurement)}
                      </div>
                    </div>
                    <button
                      className="delete-measurement-btn"
                      onClick={() => onMeasurementDelete(measurement.id)}
                      title="Delete measurement"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="measurement-details">
                    <span className="measurement-points">
                      Points: {measurement.pointIds.map(id => worldPoints[id]?.name || id).join(', ')}
                    </span>
                    <span className="measurement-time">
                      {new Date(measurement.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {availablePoints.length < 2 && (
        <div className="measurement-requirements">
          <div className="requirement-icon">⚠️</div>
          <div className="requirement-text">
            At least 2 points with 3D coordinates are required for measurements
          </div>
        </div>
      )}
    </div>
  )
}

export default MeasurementTools