// Camera calibration panel for intrinsic and extrinsic parameters

import React, { useState, useCallback, useMemo } from 'react'
import { Project, Camera, CameraIntrinsics, CameraExtrinsics } from '../types/project'

export interface CalibrationPattern {
  type: 'checkerboard' | 'circles' | 'asymmetric_circles'
  width: number
  height: number
  squareSize: number
  unit: 'mm' | 'cm' | 'm' | 'in'
}

export interface CalibrationResult {
  intrinsics: CameraIntrinsics
  extrinsics?: CameraExtrinsics
  reprojectionError: number
  calibrationPoints: number
  distortionModel: string
}

interface CameraCalibrationPanelProps {
  project: Project
  onCameraUpdate: (cameraId: string, updates: Partial<Camera>) => void
  onCalibrationStart: (cameraId: string, pattern: CalibrationPattern) => void
  onCalibrationComplete: (cameraId: string, result: CalibrationResult) => void
  selectedCameraId: string | null
  onCameraSelect: (cameraId: string | null) => void
}

export const CameraCalibrationPanel: React.FC<CameraCalibrationPanelProps> = ({
  project,
  onCameraUpdate,
  onCalibrationStart,
  onCalibrationComplete,
  selectedCameraId,
  onCameraSelect
}) => {
  const [calibrationMode, setCalibrationMode] = useState<'intrinsic' | 'extrinsic' | null>(null)
  const [calibrationPattern, setCalibrationPattern] = useState<CalibrationPattern>({
    type: 'checkerboard',
    width: 9,
    height: 6,
    squareSize: 25,
    unit: 'mm'
  })
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [calibrationProgress, setCalibrationProgress] = useState(0)
  const [manualIntrinsics, setManualIntrinsics] = useState<CameraIntrinsics>({
    fx: 1000,
    fy: 1000,
    cx: 640,
    cy: 480,
    k1: 0,
    k2: 0,
    k3: 0,
    p1: 0,
    p2: 0
  })
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)

  // Get available cameras
  const cameras = useMemo(() => {
    return Object.values(project.cameras || {})
  }, [project.cameras])

  // Get selected camera
  const selectedCamera = useMemo(() => {
    return selectedCameraId ? project.cameras?.[selectedCameraId] : null
  }, [selectedCameraId, project.cameras])

  // Get images for selected camera
  const cameraImages = useMemo(() => {
    if (!selectedCameraId) return []
    return Object.values(project.images || {}).filter(img => img.cameraId === selectedCameraId)
  }, [selectedCameraId, project.images])

  // Check calibration status
  const getCalibrationStatus = useCallback((camera: Camera) => {
    const hasIntrinsics = camera.intrinsics &&
                         camera.intrinsics.fx > 0 &&
                         camera.intrinsics.fy > 0
    const hasExtrinsics = camera.extrinsics &&
                         camera.extrinsics.translation &&
                         camera.extrinsics.rotation

    return {
      hasIntrinsics,
      hasExtrinsics,
      isFullyCalibrated: hasIntrinsics && hasExtrinsics,
      quality: camera.calibrationQuality ? camera.calibrationQuality.toString() : 'unknown'
    }
  }, [])

  // Start intrinsic calibration
  const startIntrinsicCalibration = useCallback(() => {
    if (!selectedCameraId) return

    setCalibrationMode('intrinsic')
    setIsCalibrating(true)
    setCalibrationProgress(0)

    onCalibrationStart(selectedCameraId, calibrationPattern)

    // Simulate calibration progress
    const interval = setInterval(() => {
      setCalibrationProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          setIsCalibrating(false)

          // Simulate calibration result
          const result: CalibrationResult = {
            intrinsics: {
              fx: 1000 + Math.random() * 200,
              fy: 1000 + Math.random() * 200,
              cx: 640 + Math.random() * 40,
              cy: 480 + Math.random() * 40,
              k1: (Math.random() - 0.5) * 0.2,
              k2: (Math.random() - 0.5) * 0.1,
              k3: (Math.random() - 0.5) * 0.05,
              p1: (Math.random() - 0.5) * 0.01,
              p2: (Math.random() - 0.5) * 0.01
            },
            reprojectionError: Math.random() * 2,
            calibrationPoints: cameraImages.length * 50,
            distortionModel: 'Brown-Conrady'
          }

          onCalibrationComplete(selectedCameraId, result)
          setCalibrationMode(null)
          return 100
        }
        return prev + Math.random() * 10
      })
    }, 500)
  }, [selectedCameraId, calibrationPattern, cameraImages.length, onCalibrationStart, onCalibrationComplete])

  // Start extrinsic calibration
  const startExtrinsicCalibration = useCallback(() => {
    if (!selectedCameraId || !selectedCamera?.intrinsics) return

    setCalibrationMode('extrinsic')
    setIsCalibrating(true)
    setCalibrationProgress(0)

    // Simulate extrinsic calibration
    const interval = setInterval(() => {
      setCalibrationProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          setIsCalibrating(false)

          // Simulate extrinsic result
          const result: CalibrationResult = {
            intrinsics: selectedCamera.intrinsics!,
            extrinsics: {
              translation: [
                Math.random() * 10 - 5,
                Math.random() * 10 - 5,
                Math.random() * 10 - 5
              ],
              rotation: [
                Math.random() * 0.5 - 0.25,
                Math.random() * 0.5 - 0.25,
                Math.random() * 0.5 - 0.25
              ]
            },
            reprojectionError: Math.random() * 1.5,
            calibrationPoints: cameraImages.length * 30,
            distortionModel: 'Brown-Conrady'
          }

          onCalibrationComplete(selectedCameraId, result)
          setCalibrationMode(null)
          return 100
        }
        return prev + Math.random() * 8
      })
    }, 600)
  }, [selectedCameraId, selectedCamera, cameraImages.length, onCalibrationComplete])

  // Apply manual intrinsics
  const applyManualIntrinsics = useCallback(() => {
    if (!selectedCameraId) return

    onCameraUpdate(selectedCameraId, {
      intrinsics: manualIntrinsics,
      calibrationMethod: 'manual',
      calibrationQuality: 0
    })
  }, [selectedCameraId, manualIntrinsics, onCameraUpdate])

  // Reset calibration
  const resetCalibration = useCallback((type: 'intrinsic' | 'extrinsic' | 'all') => {
    if (!selectedCameraId) return

    const updates: Partial<Camera> = {}

    if (type === 'intrinsic' || type === 'all') {
      updates.intrinsics = undefined
      updates.calibrationMethod = undefined
      updates.calibrationQuality = undefined
    }

    if (type === 'extrinsic' || type === 'all') {
      updates.extrinsics = undefined
    }

    onCameraUpdate(selectedCameraId, updates)
  }, [selectedCameraId, onCameraUpdate])

  // Get pattern description
  const getPatternDescription = useCallback((pattern: CalibrationPattern) => {
    switch (pattern.type) {
      case 'checkerboard':
        return `${pattern.width}×${pattern.height} checkerboard, ${pattern.squareSize}${pattern.unit} squares`
      case 'circles':
        return `${pattern.width}×${pattern.height} circles, ${pattern.squareSize}${pattern.unit} spacing`
      case 'asymmetric_circles':
        return `${pattern.width}×${pattern.height} asymmetric circles, ${pattern.squareSize}${pattern.unit} spacing`
      default:
        return 'Unknown pattern'
    }
  }, [])

  return (
    <div className="camera-calibration-panel">
      <div className="panel-header">
        <h3>Camera Calibration</h3>
        <div className="camera-count">
          {cameras.length} camera{cameras.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="camera-selector">
        <label>
          <span>Select Camera:</span>
          <select
            value={selectedCameraId || ''}
            onChange={(e) => onCameraSelect(e.target.value || null)}
          >
            <option value="">Select a camera...</option>
            {cameras.map(camera => (
              <option key={camera.id} value={camera.id}>
                {camera.name || `Camera ${camera.id}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedCamera && (
        <div className="camera-details">
          <div className="calibration-status">
            <h4>Calibration Status</h4>
            {(() => {
              const status = getCalibrationStatus(selectedCamera)
              return (
                <div className="status-grid">
                  <div className={`status-item ${status.hasIntrinsics ? 'calibrated' : 'not-calibrated'}`}>
                    <span className="status-icon">
                      {status.hasIntrinsics ? '✓' : '○'}
                    </span>
                    <span className="status-label">Intrinsic Parameters</span>
                  </div>
                  <div className={`status-item ${status.hasExtrinsics ? 'calibrated' : 'not-calibrated'}`}>
                    <span className="status-icon">
                      {status.hasExtrinsics ? '✓' : '○'}
                    </span>
                    <span className="status-label">Extrinsic Parameters</span>
                  </div>
                  <div className="status-summary">
                    <span>Overall Status:</span>
                    <span className={status.isFullyCalibrated ? 'fully-calibrated' : 'partially-calibrated'}>
                      {status.isFullyCalibrated ? 'Fully Calibrated' : 'Needs Calibration'}
                    </span>
                  </div>
                  {status.quality !== 'unknown' && (
                    <div className="status-quality">
                      <span>Quality:</span>
                      <span className={`quality-${status.quality}`}>
                        {status.quality.charAt(0).toUpperCase() + status.quality.slice(1)}
                      </span>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          <div className="calibration-pattern">
            <h4>Calibration Pattern</h4>
            <div className="pattern-settings">
              <div className="pattern-row">
                <label>
                  <span>Pattern Type:</span>
                  <select
                    value={calibrationPattern.type}
                    onChange={(e) => setCalibrationPattern(prev => ({
                      ...prev,
                      type: e.target.value as CalibrationPattern['type']
                    }))}
                  >
                    <option value="checkerboard">Checkerboard</option>
                    <option value="circles">Circles</option>
                    <option value="asymmetric_circles">Asymmetric Circles</option>
                  </select>
                </label>
              </div>
              <div className="pattern-row">
                <label>
                  <span>Width:</span>
                  <input
                    type="number"
                    min="3"
                    max="20"
                    value={calibrationPattern.width}
                    onChange={(e) => setCalibrationPattern(prev => ({
                      ...prev,
                      width: parseInt(e.target.value) || 9
                    }))}
                  />
                </label>
                <label>
                  <span>Height:</span>
                  <input
                    type="number"
                    min="3"
                    max="20"
                    value={calibrationPattern.height}
                    onChange={(e) => setCalibrationPattern(prev => ({
                      ...prev,
                      height: parseInt(e.target.value) || 6
                    }))}
                  />
                </label>
              </div>
              <div className="pattern-row">
                <label>
                  <span>Square/Circle Size:</span>
                  <input
                    type="number"
                    min="1"
                    step="0.1"
                    value={calibrationPattern.squareSize}
                    onChange={(e) => setCalibrationPattern(prev => ({
                      ...prev,
                      squareSize: parseFloat(e.target.value) || 25
                    }))}
                  />
                </label>
                <label>
                  <span>Unit:</span>
                  <select
                    value={calibrationPattern.unit}
                    onChange={(e) => setCalibrationPattern(prev => ({
                      ...prev,
                      unit: e.target.value as CalibrationPattern['unit']
                    }))}
                  >
                    <option value="mm">mm</option>
                    <option value="cm">cm</option>
                    <option value="m">m</option>
                    <option value="in">in</option>
                  </select>
                </label>
              </div>
              <div className="pattern-description">
                Pattern: {getPatternDescription(calibrationPattern)}
              </div>
            </div>
          </div>

          {isCalibrating ? (
            <div className="calibration-progress">
              <h4>Calibrating {calibrationMode === 'intrinsic' ? 'Intrinsic' : 'Extrinsic'} Parameters</h4>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${calibrationProgress}%` }}
                />
              </div>
              <div className="progress-text">
                {Math.round(calibrationProgress)}% complete
              </div>
            </div>
          ) : (
            <div className="calibration-actions">
              <div className="action-section">
                <h4>Intrinsic Calibration</h4>
                <p>Calibrate focal length, principal point, and distortion parameters.</p>
                <div className="action-buttons">
                  <button
                    className="btn-calibrate intrinsic"
                    onClick={startIntrinsicCalibration}
                    disabled={cameraImages.length < 5}
                  >
                    📷 Calibrate Intrinsics
                  </button>
                  <button
                    className="btn-reset"
                    onClick={() => resetCalibration('intrinsic')}
                    disabled={!selectedCamera.intrinsics}
                  >
                    Reset
                  </button>
                </div>
                {cameraImages.length < 5 && (
                  <div className="requirement-note">
                    Need at least 5 images for calibration (have {cameraImages.length})
                  </div>
                )}
              </div>

              <div className="action-section">
                <h4>Extrinsic Calibration</h4>
                <p>Calibrate camera position and orientation in world coordinates.</p>
                <div className="action-buttons">
                  <button
                    className="btn-calibrate extrinsic"
                    onClick={startExtrinsicCalibration}
                    disabled={!selectedCamera.intrinsics || cameraImages.length < 3}
                  >
                    🌍 Calibrate Extrinsics
                  </button>
                  <button
                    className="btn-reset"
                    onClick={() => resetCalibration('extrinsic')}
                    disabled={!selectedCamera.extrinsics}
                  >
                    Reset
                  </button>
                </div>
                {!selectedCamera.intrinsics && (
                  <div className="requirement-note">
                    Intrinsic calibration required first
                  </div>
                )}
                {selectedCamera.intrinsics && cameraImages.length < 3 && (
                  <div className="requirement-note">
                    Need at least 3 images for extrinsic calibration
                  </div>
                )}
              </div>

              <div className="action-section">
                <button
                  className="btn-advanced"
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                >
                  ⚙️ Advanced Settings
                </button>
              </div>
            </div>
          )}

          {showAdvancedSettings && (
            <div className="advanced-settings">
              <h4>Manual Intrinsic Parameters</h4>
              <div className="manual-intrinsics">
                <div className="intrinsics-row">
                  <label>
                    <span>fx (focal length X):</span>
                    <input
                      type="number"
                      step="0.1"
                      value={manualIntrinsics.fx}
                      onChange={(e) => setManualIntrinsics(prev => ({
                        ...prev,
                        fx: parseFloat(e.target.value) || 0
                      }))}
                    />
                  </label>
                  <label>
                    <span>fy (focal length Y):</span>
                    <input
                      type="number"
                      step="0.1"
                      value={manualIntrinsics.fy}
                      onChange={(e) => setManualIntrinsics(prev => ({
                        ...prev,
                        fy: parseFloat(e.target.value) || 0
                      }))}
                    />
                  </label>
                </div>
                <div className="intrinsics-row">
                  <label>
                    <span>cx (principal point X):</span>
                    <input
                      type="number"
                      step="0.1"
                      value={manualIntrinsics.cx}
                      onChange={(e) => setManualIntrinsics(prev => ({
                        ...prev,
                        cx: parseFloat(e.target.value) || 0
                      }))}
                    />
                  </label>
                  <label>
                    <span>cy (principal point Y):</span>
                    <input
                      type="number"
                      step="0.1"
                      value={manualIntrinsics.cy}
                      onChange={(e) => setManualIntrinsics(prev => ({
                        ...prev,
                        cy: parseFloat(e.target.value) || 0
                      }))}
                    />
                  </label>
                </div>
                <div className="intrinsics-row">
                  <label>
                    <span>k1 (radial distortion):</span>
                    <input
                      type="number"
                      step="0.001"
                      value={manualIntrinsics.k1}
                      onChange={(e) => setManualIntrinsics(prev => ({
                        ...prev,
                        k1: parseFloat(e.target.value) || 0
                      }))}
                    />
                  </label>
                  <label>
                    <span>k2 (radial distortion):</span>
                    <input
                      type="number"
                      step="0.001"
                      value={manualIntrinsics.k2}
                      onChange={(e) => setManualIntrinsics(prev => ({
                        ...prev,
                        k2: parseFloat(e.target.value) || 0
                      }))}
                    />
                  </label>
                </div>
                <div className="intrinsics-actions">
                  <button
                    className="btn-apply"
                    onClick={applyManualIntrinsics}
                  >
                    Apply Manual Parameters
                  </button>
                </div>
              </div>
            </div>
          )}

          {selectedCamera.intrinsics && (
            <div className="current-calibration">
              <h4>Current Calibration</h4>
              <div className="calibration-details">
                <div className="detail-section">
                  <h5>Intrinsic Parameters</h5>
                  <div className="parameter-grid">
                    <div className="param-item">
                      <span>fx:</span>
                      <span>{selectedCamera.intrinsics.fx.toFixed(2)}</span>
                    </div>
                    <div className="param-item">
                      <span>fy:</span>
                      <span>{selectedCamera.intrinsics.fy.toFixed(2)}</span>
                    </div>
                    <div className="param-item">
                      <span>cx:</span>
                      <span>{selectedCamera.intrinsics.cx.toFixed(2)}</span>
                    </div>
                    <div className="param-item">
                      <span>cy:</span>
                      <span>{selectedCamera.intrinsics.cy.toFixed(2)}</span>
                    </div>
                    <div className="param-item">
                      <span>k1:</span>
                      <span>{selectedCamera.intrinsics.k1?.toFixed(4) || '0.0000'}</span>
                    </div>
                    <div className="param-item">
                      <span>k2:</span>
                      <span>{selectedCamera.intrinsics.k2?.toFixed(4) || '0.0000'}</span>
                    </div>
                  </div>
                </div>

                {selectedCamera.extrinsics && (
                  <div className="detail-section">
                    <h5>Extrinsic Parameters</h5>
                    <div className="parameter-grid">
                      <div className="param-item">
                        <span>Translation:</span>
                        <span>
                          ({selectedCamera.extrinsics.translation.map(v => v.toFixed(3)).join(', ')})
                        </span>
                      </div>
                      <div className="param-item">
                        <span>Rotation:</span>
                        <span>
                          ({selectedCamera.extrinsics.rotation.map(v => v.toFixed(3)).join(', ')})
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="calibration-info">
                  <div className="info-item">
                    <span>Method:</span>
                    <span>{selectedCamera.calibrationMethod || 'Unknown'}</span>
                  </div>
                  <div className="info-item">
                    <span>Quality:</span>
                    <span className={`quality-${selectedCamera.calibrationQuality || 'unknown'}`}>
                      {selectedCamera.calibrationQuality || 'Unknown'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!selectedCameraId && cameras.length > 0 && (
        <div className="no-camera-selected">
          <div className="no-camera-icon">📷</div>
          <div className="no-camera-text">Select a camera to begin calibration</div>
        </div>
      )}

      {cameras.length === 0 && (
        <div className="no-cameras">
          <div className="no-cameras-icon">📷</div>
          <div className="no-cameras-text">No cameras available</div>
          <div className="no-cameras-hint">
            Import images to automatically create cameras
          </div>
        </div>
      )}
    </div>
  )
}

export default CameraCalibrationPanel