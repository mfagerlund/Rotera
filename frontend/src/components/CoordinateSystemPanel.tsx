// Coordinate system and origin management panel

import React, { useState } from 'react'
import { WorldPoint, Project } from '../types/project'

interface CoordinateSystemPanelProps {
  project: Project
  worldPoints: Record<string, WorldPoint>
  onSetOrigin: (pointId: string) => void
  onSetScale: (scale: number) => void
  onDefineGroundPlane: (pointA: string, pointB: string, pointC: string) => void
  onRunOptimization: () => void
}

export const CoordinateSystemPanel: React.FC<CoordinateSystemPanelProps> = ({
  project,
  worldPoints,
  onSetOrigin,
  onSetScale,
  onDefineGroundPlane,
  onRunOptimization
}) => {
  const [selectedGroundPoints, setSelectedGroundPoints] = useState<string[]>([])
  const [scaleValue, setScaleValue] = useState(project.coordinateSystem?.scale || 1.0)

  const originPoint = project.coordinateSystem?.origin ? worldPoints[project.coordinateSystem.origin] : null
  const groundPlane = project.coordinateSystem?.groundPlane

  const handleSetOrigin = (pointId: string) => {
    onSetOrigin(pointId)
  }

  const handleGroundPointSelect = (pointId: string) => {
    setSelectedGroundPoints(prev => {
      if (prev.includes(pointId)) {
        return prev.filter(id => id !== pointId)
      } else if (prev.length < 3) {
        return [...prev, pointId]
      } else {
        return [prev[1], prev[2], pointId] // Replace first point
      }
    })
  }

  const handleDefineGroundPlane = () => {
    if (selectedGroundPoints.length === 3) {
      onDefineGroundPlane(selectedGroundPoints[0], selectedGroundPoints[1], selectedGroundPoints[2])
      setSelectedGroundPoints([])
    }
  }

  const worldPointsList = Object.values(worldPoints).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="coordinate-system-panel">
      <div className="panel-header">
        <h3>Coordinate System</h3>
        {project.optimization?.status && (
          <div className={`optimization-status ${project.optimization.status}`}>
            {project.optimization.status === 'running' && '⏳ Optimizing...'}
            {project.optimization.status === 'converged' && '✅ Solved'}
            {project.optimization.status === 'failed' && '❌ Failed'}
            {project.optimization.status === 'not_run' && '⚪ Not Run'}
          </div>
        )}
      </div>

      <div className="panel-content">
        {/* Origin Point Section */}
        <div className="section">
          <div className="section-header">
            <h4>Origin Point</h4>
            {originPoint && (
              <span className="origin-indicator">
                📌 {originPoint.name}
              </span>
            )}
          </div>

          {!originPoint ? (
            <div className="origin-setup">
              <p className="help-text">
                Select a world point to serve as the coordinate system origin (0,0,0).
              </p>
              <div className="point-selector">
                {worldPointsList.map(wp => (
                  <button
                    key={wp.id}
                    className="point-option"
                    onClick={() => handleSetOrigin(wp.id)}
                  >
                    <div className="point-color" style={{ backgroundColor: wp.color }} />
                    <span>{wp.name}</span>
                    <span className="point-images">{wp.imagePoints.length} img</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="origin-info">
              <div className="origin-details">
                <div className="detail-item">
                  <span className="label">Point:</span>
                  <span className="value">{originPoint.name}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Images:</span>
                  <span className="value">{originPoint.imagePoints.length}</span>
                </div>
                {originPoint.xyz && (
                  <div className="detail-item">
                    <span className="label">Position:</span>
                    <span className="value">
                      ({originPoint.xyz[0].toFixed(3)}, {originPoint.xyz[1].toFixed(3)}, {originPoint.xyz[2].toFixed(3)})
                    </span>
                  </div>
                )}
              </div>
              <button
                className="btn-change"
                onClick={() => onSetOrigin('')}
              >
                Change Origin
              </button>
            </div>
          )}
        </div>

        {/* Scale Section */}
        <div className="section">
          <div className="section-header">
            <h4>Scale & Units</h4>
          </div>
          <div className="scale-controls">
            <div className="form-field">
              <label>Scale (units per meter)</label>
              <input
                type="number"
                step="0.001"
                value={scaleValue}
                onChange={(e) => setScaleValue(parseFloat(e.target.value) || 1.0)}
                onBlur={() => onSetScale(scaleValue)}
                placeholder="1.0"
              />
            </div>
            <div className="scale-presets">
              <button onClick={() => { setScaleValue(1.0); onSetScale(1.0); }}>Meters</button>
              <button onClick={() => { setScaleValue(3.28084); onSetScale(3.28084); }}>Feet</button>
              <button onClick={() => { setScaleValue(39.3701); onSetScale(39.3701); }}>Inches</button>
            </div>
          </div>
        </div>

        {/* Ground Plane Section */}
        <div className="section">
          <div className="section-header">
            <h4>Ground Plane</h4>
            {groundPlane && (
              <span className="ground-plane-indicator">
                ✅ Defined
              </span>
            )}
          </div>

          {!groundPlane ? (
            <div className="ground-plane-setup">
              <p className="help-text">
                Select 3 world points that define the ground plane (Z=0).
              </p>
              <div className="ground-point-selection">
                <div className="selected-points">
                  {[0, 1, 2].map(index => (
                    <div key={index} className={`ground-point-slot ${selectedGroundPoints[index] ? 'filled' : 'empty'}`}>
                      {selectedGroundPoints[index] ? (
                        <span>{worldPoints[selectedGroundPoints[index]]?.name}</span>
                      ) : (
                        <span>Point {index + 1}</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="point-grid">
                  {worldPointsList.map(wp => {
                    const isSelected = selectedGroundPoints.includes(wp.id)
                    const isOrigin = wp.id === project.coordinateSystem?.origin
                    return (
                      <button
                        key={wp.id}
                        className={`point-grid-item ${isSelected ? 'selected' : ''} ${isOrigin ? 'origin' : ''}`}
                        onClick={() => handleGroundPointSelect(wp.id)}
                        disabled={isOrigin}
                        title={isOrigin ? 'Origin point (cannot be used for ground plane)' : ''}
                      >
                        <div className="point-color" style={{ backgroundColor: wp.color }} />
                        <span>{wp.name}</span>
                      </button>
                    )
                  })}
                </div>
                <button
                  className="btn-define-ground"
                  onClick={handleDefineGroundPlane}
                  disabled={selectedGroundPoints.length !== 3}
                >
                  Define Ground Plane
                </button>
              </div>
            </div>
          ) : (
            <div className="ground-plane-info">
              <div className="ground-points">
                <div className="ground-point">
                  <span className="label">Point A:</span>
                  <span className="value">{worldPoints[groundPlane.pointA]?.name}</span>
                </div>
                <div className="ground-point">
                  <span className="label">Point B:</span>
                  <span className="value">{worldPoints[groundPlane.pointB]?.name}</span>
                </div>
                <div className="ground-point">
                  <span className="label">Point C:</span>
                  <span className="value">{worldPoints[groundPlane.pointC]?.name}</span>
                </div>
              </div>
              <button
                className="btn-change"
                onClick={() => setSelectedGroundPoints([])}
              >
                Redefine Ground Plane
              </button>
            </div>
          )}
        </div>

        {/* Optimization Section */}
        <div className="section">
          <div className="section-header">
            <h4>Optimization</h4>
          </div>
          <div className="optimization-controls">
            <div className="optimization-info">
              <div className="info-item">
                <span className="label">Constraints:</span>
                <span className="value">{project.constraints.filter(c => c.enabled).length} active</span>
              </div>
              <div className="info-item">
                <span className="label">World Points:</span>
                <span className="value">{Object.keys(worldPoints).length}</span>
              </div>
              {project.optimization?.residuals && (
                <div className="info-item">
                  <span className="label">RMS Error:</span>
                  <span className="value">{project.optimization.residuals.toFixed(4)}</span>
                </div>
              )}
            </div>
            <button
              className="btn-optimize"
              onClick={onRunOptimization}
              disabled={!originPoint || project.constraints.filter(c => c.enabled).length === 0}
            >
              {project.optimization?.status === 'running' ? 'Optimizing...' : 'Run Optimization'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CoordinateSystemPanel