// Project file management dialog
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Project } from '../types/project'
import { FileManagerService, ProjectFile, ProjectFileMetadata } from '../services/fileManager'

interface ProjectFileDialogProps {
  isOpen: boolean
  onClose: () => void
  mode: 'save' | 'load' | 'export' | 'import'
  project: Project
  onProjectLoad?: (projectFile: ProjectFile) => void
  onProjectImport?: (project: Project) => void
}

export const ProjectFileDialog: React.FC<ProjectFileDialogProps> = ({
  isOpen,
  onClose,
  mode,
  project,
  onProjectLoad,
  onProjectImport
}) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Save mode state
  const [saveMetadata, setSaveMetadata] = useState<Partial<ProjectFileMetadata>>({
    name: project.name || 'Untitled Project',
    description: '',
    author: '',
    tags: []
  })

  // Export mode state
  const [exportFormat, setExportFormat] = useState<'json' | 'backup'>('json')

  // Auto-save recovery state
  const [autoSaveData, setAutoSaveData] = useState<{ project: Project; savedAt: string } | null>(null)

  useEffect(() => {
    if (mode === 'load') {
      const recovered = FileManagerService.recoverAutoSavedProject()
      setAutoSaveData(recovered)
    }
  }, [mode])

  const clearMessages = useCallback(() => {
    setError(null)
    setSuccess(null)
  }, [])

  const handleSave = useCallback(async () => {
    setLoading(true)
    clearMessages()

    try {
      await FileManagerService.saveProjectToFile(project, saveMetadata)
      setSuccess('Project saved successfully!')
      setTimeout(() => {
        onClose()
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save project')
    } finally {
      setLoading(false)
    }
  }, [project, saveMetadata, onClose])

  const handleLoad = useCallback(async (file: File) => {
    setLoading(true)
    clearMessages()

    try {
      const projectFile = await FileManagerService.loadProjectFromFile(file)
      setSuccess('Project loaded successfully!')
      onProjectLoad?.(projectFile)
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [onProjectLoad, onClose])

  const handleExport = useCallback(async () => {
    setLoading(true)
    clearMessages()

    try {
      await FileManagerService.exportProjectData(project, exportFormat)
      setSuccess('Project data exported successfully!')
      setTimeout(() => {
        onClose()
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export project')
    } finally {
      setLoading(false)
    }
  }, [project, exportFormat, onClose])

  const handleImport = useCallback(async (file: File) => {
    setLoading(true)
    clearMessages()

    try {
      const importedProject = await FileManagerService.importProjectData(file)
      setSuccess('Project data imported successfully!')
      onProjectImport?.(importedProject)
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import project')
    } finally {
      setLoading(false)
    }
  }, [onProjectImport, onClose])

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (mode === 'load') {
        handleLoad(file)
      } else if (mode === 'import') {
        handleImport(file)
      }
    }
  }, [mode, handleLoad, handleImport])

  const handleRecoverAutoSave = useCallback(() => {
    if (autoSaveData) {
      const projectFile: ProjectFile = {
        metadata: {
          name: autoSaveData.project.name || 'Recovered Project',
          version: '1.0.0',
          createdAt: autoSaveData.project.createdAt || autoSaveData.savedAt,
          modifiedAt: autoSaveData.savedAt,
          description: 'Recovered from auto-save'
        },
        project: autoSaveData.project
      }
      onProjectLoad?.(projectFile)
      FileManagerService.clearAutoSave()
      onClose()
    }
  }, [autoSaveData, onProjectLoad, onClose])

  const addTag = useCallback((tag: string) => {
    if (tag.trim() && !saveMetadata.tags?.includes(tag.trim())) {
      setSaveMetadata(prev => ({
        ...prev,
        tags: [...(prev.tags || []), tag.trim()]
      }))
    }
  }, [saveMetadata.tags])

  const removeTag = useCallback((tagToRemove: string) => {
    setSaveMetadata(prev => ({
      ...prev,
      tags: (prev.tags || []).filter(tag => tag !== tagToRemove)
    }))
  }, [])

  if (!isOpen) return null

  const getTitle = () => {
    switch (mode) {
      case 'save': return 'Save Project'
      case 'load': return 'Load Project'
      case 'export': return 'Export Project Data'
      case 'import': return 'Import Project Data'
      default: return 'Project File'
    }
  }

  return (
    <div className="dialog-overlay">
      <div className="dialog project-file-dialog">
        <div className="dialog-header">
          <h3>{getTitle()}</h3>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="dialog-content">
          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="success-message">
              <span className="success-icon">✅</span>
              <span>{success}</span>
            </div>
          )}

          {mode === 'save' && (
            <div className="save-form">
              <div className="form-group">
                <label>Project Name</label>
                <input
                  type="text"
                  value={saveMetadata.name || ''}
                  onChange={(e) => setSaveMetadata(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter project name"
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={saveMetadata.description || ''}
                  onChange={(e) => setSaveMetadata(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional project description"
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label>Author</label>
                <input
                  type="text"
                  value={saveMetadata.author || ''}
                  onChange={(e) => setSaveMetadata(prev => ({ ...prev, author: e.target.value }))}
                  placeholder="Your name (optional)"
                />
              </div>

              <div className="form-group">
                <label>Tags</label>
                <div className="tag-input">
                  <input
                    type="text"
                    placeholder="Add tag and press Enter"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        addTag(e.currentTarget.value)
                        e.currentTarget.value = ''
                      }
                    }}
                  />
                  <div className="tags-list">
                    {(saveMetadata.tags || []).map(tag => (
                      <span key={tag} className="tag">
                        {tag}
                        <button onClick={() => removeTag(tag)}>×</button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="project-stats">
                <h4>Project Statistics</h4>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span>Points:</span>
                    <span>{Object.keys(project.worldPoints || {}).length}</span>
                  </div>
                  <div className="stat-item">
                    <span>Images:</span>
                    <span>{Object.keys(project.images || {}).length}</span>
                  </div>
                  <div className="stat-item">
                    <span>Constraints:</span>
                    <span>{(project.constraints || []).length}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === 'load' && (
            <div className="load-form">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pictorigo"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />

              <div className="file-selection">
                <button
                  className="btn-select-file"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  📁 Select Project File
                </button>
                <p className="file-info">
                  Select a .pictorigo file to load your project
                </p>
              </div>

              {autoSaveData && (
                <div className="auto-save-recovery">
                  <h4>⚡ Auto-Save Recovery</h4>
                  <p>
                    Found an auto-saved project from {new Date(autoSaveData.savedAt).toLocaleString()}
                  </p>
                  <div className="recovery-actions">
                    <button
                      className="btn-recover"
                      onClick={handleRecoverAutoSave}
                    >
                      Recover Auto-Saved Project
                    </button>
                    <button
                      className="btn-discard"
                      onClick={() => {
                        FileManagerService.clearAutoSave()
                        setAutoSaveData(null)
                      }}
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === 'export' && (
            <div className="export-form">
              <div className="form-group">
                <label>Export Format</label>
                <div className="format-options">
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="exportFormat"
                      value="json"
                      checked={exportFormat === 'json'}
                      onChange={(e) => setExportFormat(e.target.value as 'json')}
                    />
                    <span>JSON Data</span>
                    <small>Project data only (for data exchange)</small>
                  </label>
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="exportFormat"
                      value="backup"
                      checked={exportFormat === 'backup'}
                      onChange={(e) => setExportFormat(e.target.value as 'backup')}
                    />
                    <span>Backup Format</span>
                    <small>Includes version and export metadata</small>
                  </label>
                </div>
              </div>

              <div className="export-preview">
                <h4>Export Preview</h4>
                <div className="preview-details">
                  <div className="detail-item">
                    <span>Format:</span>
                    <span>{exportFormat.toUpperCase()}</span>
                  </div>
                  <div className="detail-item">
                    <span>Estimated size:</span>
                    <span>~{Math.ceil(JSON.stringify(project).length / 1024)} KB</span>
                  </div>
                  <div className="detail-item">
                    <span>Includes:</span>
                    <span>Points, Images, Constraints</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === 'import' && (
            <div className="import-form">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />

              <div className="file-selection">
                <button
                  className="btn-select-file"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  📄 Select Data File
                </button>
                <p className="file-info">
                  Select a JSON file containing project data to import
                </p>
              </div>

              <div className="import-warning">
                <span className="warning-icon">⚠️</span>
                <span>
                  Importing will replace the current project data.
                  Make sure to save your current work first.
                </span>
              </div>
            </div>
          )}

          {loading && (
            <div className="loading-indicator">
              <div className="spinner"></div>
              <span>Processing...</span>
            </div>
          )}
        </div>

        <div className="dialog-actions">
          {mode === 'save' && (
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={loading || !saveMetadata.name?.trim()}
            >
              {loading ? 'Saving...' : 'Save Project'}
            </button>
          )}

          {mode === 'export' && (
            <button
              className="btn-primary"
              onClick={handleExport}
              disabled={loading}
            >
              {loading ? 'Exporting...' : 'Export Data'}
            </button>
          )}

          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProjectFileDialog