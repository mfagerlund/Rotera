// Export dialog component for project data

import React, { useState, useCallback } from 'react'
import { Project } from '../types/project'
import { ExportService, ExportFormat, ExportOptions, defaultExportOptions, downloadFile } from '../services/export'

interface ExportDialogProps {
  isOpen: boolean
  project: Project
  onClose: () => void
  onExportComplete: (success: boolean, message: string) => void
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  project,
  onClose,
  onExportComplete
}) => {
  const [options, setOptions] = useState<ExportOptions>(defaultExportOptions)
  const [isExporting, setIsExporting] = useState(false)
  const [previewData, setPreviewData] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const formatOptions: { value: ExportFormat; label: string; description: string }[] = [
    { value: 'json', label: 'JSON', description: 'Complete project data in JSON format' },
    { value: 'csv', label: 'CSV', description: 'Point coordinates and metadata in CSV format' },
    { value: 'xlsx', label: 'Excel', description: 'Point data in Excel spreadsheet format' },
    { value: 'ply', label: 'PLY', description: '3D point cloud in Stanford PLY format' },
    { value: 'obj', label: 'OBJ', description: '3D points in Wavefront OBJ format' },
    { value: 'dxf', label: 'DXF', description: 'CAD drawing exchange format' },
    { value: 'pdf', label: 'PDF', description: 'Project report in PDF format' },
    { value: 'xml', label: 'XML', description: 'Structured data in XML format' }
  ]

  const handleOptionChange = useCallback((key: keyof ExportOptions, value: any) => {
    setOptions(prev => ({ ...prev, [key]: value }))
    setPreviewData(null)
    setShowPreview(false)
  }, [])

  const handlePreview = useCallback(async () => {
    if (isExporting) return

    setIsExporting(true)
    try {
      const exportService = new ExportService(project)
      const result = await exportService.export(options)

      if (result.success && result.data) {
        setPreviewData(typeof result.data === 'string' ? result.data : 'Binary data preview not available')
        setShowPreview(true)
      } else {
        onExportComplete(false, result.message)
      }
    } catch (error) {
      onExportComplete(false, (error as Error)?.message || 'Preview failed')
    } finally {
      setIsExporting(false)
    }
  }, [project, options, isExporting, onExportComplete])

  const handleExport = useCallback(async () => {
    if (isExporting) return

    setIsExporting(true)
    try {
      const exportService = new ExportService(project)
      const result = await exportService.export(options)

      if (result.success && result.url) {
        downloadFile(result.url, result.filename)
        onExportComplete(true, result.message)
        onClose()
      } else {
        onExportComplete(false, result.message)
      }
    } catch (error) {
      onExportComplete(false, (error as Error)?.message || 'Export failed')
    } finally {
      setIsExporting(false)
    }
  }, [project, options, isExporting, onExportComplete, onClose])

  const resetOptions = useCallback(() => {
    setOptions(defaultExportOptions)
    setPreviewData(null)
    setShowPreview(false)
  }, [])

  const getEstimatedFileSize = useCallback(() => {
    const pointCount = Object.keys(project.worldPoints).length
    const constraintCount = project.constraints?.length || 0
    const imageCount = Object.keys(project.images || {}).length

    let sizeKB = pointCount * 0.5 // Base point data

    if (options.includeConstraints) {
      sizeKB += constraintCount * 0.2
    }

    if (options.includeImages) {
      sizeKB += imageCount * 2 // Image metadata
    }

    if (options.includeMetadata) {
      sizeKB += 5 // Project metadata
    }

    switch (options.format) {
      case 'json':
      case 'xml':
        sizeKB *= 1.5 // Text overhead
        break
      case 'csv':
        sizeKB *= 0.8 // More compact
        break
      case 'ply':
      case 'obj':
        sizeKB *= 1.2 // 3D format overhead
        break
    }

    if (sizeKB < 1) return '<1 KB'
    if (sizeKB < 1024) return `${Math.round(sizeKB)} KB`
    return `${(sizeKB / 1024).toFixed(1)} MB`
  }, [project, options])

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="export-dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Export Project</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="dialog-content">
          <div className="export-options">
            <div className="option-section">
              <h3>Format</h3>
              <div className="format-grid">
                {formatOptions.map(format => (
                  <label key={format.value} className="format-option">
                    <input
                      type="radio"
                      name="format"
                      value={format.value}
                      checked={options.format === format.value}
                      onChange={(e) => handleOptionChange('format', e.target.value)}
                    />
                    <div className="format-info">
                      <div className="format-label">{format.label}</div>
                      <div className="format-description">{format.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="option-section">
              <h3>Content Options</h3>
              <div className="content-options">
                <label className="option-checkbox">
                  <input
                    type="checkbox"
                    checked={options.includeConstraints}
                    onChange={(e) => handleOptionChange('includeConstraints', e.target.checked)}
                  />
                  <span>Include constraints ({project.constraints?.length || 0})</span>
                </label>
                <label className="option-checkbox">
                  <input
                    type="checkbox"
                    checked={options.includeImages}
                    onChange={(e) => handleOptionChange('includeImages', e.target.checked)}
                  />
                  <span>Include image metadata ({Object.keys(project.images || {}).length})</span>
                </label>
                <label className="option-checkbox">
                  <input
                    type="checkbox"
                    checked={options.includeMetadata}
                    onChange={(e) => handleOptionChange('includeMetadata', e.target.checked)}
                  />
                  <span>Include project metadata</span>
                </label>
              </div>
            </div>

            <div className="option-section">
              <h3>Coordinate System</h3>
              <div className="coordinate-options">
                <label className="option-radio">
                  <input
                    type="radio"
                    name="coordinateSystem"
                    value="local"
                    checked={options.coordinateSystem === 'local'}
                    onChange={(e) => handleOptionChange('coordinateSystem', e.target.value)}
                  />
                  <span>Local coordinates (as measured)</span>
                </label>
                <label className="option-radio">
                  <input
                    type="radio"
                    name="coordinateSystem"
                    value="world"
                    checked={options.coordinateSystem === 'world'}
                    onChange={(e) => handleOptionChange('coordinateSystem', e.target.value)}
                    disabled={!project.coordinateSystem?.origin}
                  />
                  <span>World coordinates (relative to origin)</span>
                  {!project.coordinateSystem?.origin && (
                    <span className="option-note">No origin set</span>
                  )}
                </label>
              </div>
            </div>

            <div className="option-section">
              <h3>Advanced Settings</h3>
              <div className="advanced-options">
                <label className="option-field">
                  <span>Decimal precision:</span>
                  <input
                    type="number"
                    min="0"
                    max="12"
                    value={options.precision}
                    onChange={(e) => handleOptionChange('precision', parseInt(e.target.value))}
                  />
                </label>
                <label className="option-field">
                  <span>Units:</span>
                  <select
                    value={options.units}
                    onChange={(e) => handleOptionChange('units', e.target.value)}
                  >
                    <option value="mm">Millimeters</option>
                    <option value="cm">Centimeters</option>
                    <option value="m">Meters</option>
                    <option value="in">Inches</option>
                    <option value="ft">Feet</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="export-summary">
            <h3>Export Summary</h3>
            <div className="summary-stats">
              <div className="stat-item">
                <span>Points to export:</span>
                <span>{Object.keys(project.worldPoints).length}</span>
              </div>
              <div className="stat-item">
                <span>Estimated file size:</span>
                <span>{getEstimatedFileSize()}</span>
              </div>
              <div className="stat-item">
                <span>Format:</span>
                <span>{formatOptions.find(f => f.value === options.format)?.label}</span>
              </div>
            </div>
          </div>

          {showPreview && previewData && (
            <div className="export-preview">
              <h3>Preview</h3>
              <div className="preview-content">
                <pre>{previewData.substring(0, 1000)}{previewData.length > 1000 ? '...' : ''}</pre>
              </div>
            </div>
          )}
        </div>

        <div className="dialog-actions">
          <button
            className="btn-secondary"
            onClick={resetOptions}
            disabled={isExporting}
          >
            Reset
          </button>
          <button
            className="btn-secondary"
            onClick={handlePreview}
            disabled={isExporting}
          >
            {isExporting ? 'Generating...' : 'Preview'}
          </button>
          <button
            className="btn-primary"
            onClick={handleExport}
            disabled={isExporting || Object.keys(project.worldPoints).length === 0}
          >
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
          <button
            className="btn-secondary"
            onClick={onClose}
            disabled={isExporting}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default ExportDialog