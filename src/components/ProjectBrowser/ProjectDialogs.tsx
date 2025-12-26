import React, { useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faFolder,
  faSpinner,
  faFileExport,
  faUpload
} from '@fortawesome/free-solid-svg-icons'
import { ProjectSummary, Folder } from '../../services/project-db'

interface MoveDialogProps {
  project: ProjectSummary | null
  allFolders: Folder[]
  onMove: (projectId: string, targetFolderId: string | null) => void
  onClose: () => void
  buildFolderPath: (folderId: string | null) => string
}

export const MoveDialog: React.FC<MoveDialogProps> = ({
  project,
  allFolders,
  onMove,
  onClose,
  buildFolderPath
}) => {
  if (!project) return null

  return (
    <div className="project-browser__modal-overlay" onClick={onClose}>
      <div className="project-browser__modal" onClick={e => e.stopPropagation()}>
        <h3>Move "{project.name}" to...</h3>
        <div className="project-browser__modal-folders">
          <button
            className={`project-browser__modal-folder ${project.folderId === null ? 'project-browser__modal-folder--current' : ''}`}
            onClick={() => onMove(project.id, null)}
            disabled={project.folderId === null}
          >
            <FontAwesomeIcon icon={faFolder} /> Root
            {project.folderId === null && <span className="project-browser__modal-current">(current)</span>}
          </button>
          {allFolders.map(folder => (
            <button
              key={folder.id}
              className={`project-browser__modal-folder ${project.folderId === folder.id ? 'project-browser__modal-folder--current' : ''}`}
              onClick={() => onMove(project.id, folder.id)}
              disabled={project.folderId === folder.id}
            >
              <FontAwesomeIcon icon={faFolder} /> {buildFolderPath(folder.id)}
              {project.folderId === folder.id && <span className="project-browser__modal-current">(current)</span>}
            </button>
          ))}
        </div>
        <div className="project-browser__modal-actions">
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

interface CopyDialogProps {
  project: ProjectSummary | null
  copyName: string
  onCopyNameChange: (name: string) => void
  onCopy: () => void
  onClose: () => void
}

export const CopyDialog: React.FC<CopyDialogProps> = ({
  project,
  copyName,
  onCopyNameChange,
  onCopy,
  onClose
}) => {
  if (!project) return null

  return (
    <div className="project-browser__modal-overlay" onClick={onClose}>
      <div className="project-browser__modal" onClick={e => e.stopPropagation()}>
        <h3>Copy "{project.name}"</h3>
        <input
          type="text"
          value={copyName}
          onChange={e => onCopyNameChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onCopy()
            if (e.key === 'Escape') onClose()
          }}
          placeholder="New project name..."
          autoFocus
          className="project-browser__modal-input"
        />
        <div className="project-browser__modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button
            onClick={onCopy}
            disabled={!copyName.trim()}
            className="project-browser__btn--primary"
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  )
}

interface ExportDialogProps {
  isVisible: boolean
  projectCount: number
  excludeImages: boolean
  isExporting: boolean
  onExcludeImagesChange: (exclude: boolean) => void
  onExport: () => void
  onClose: () => void
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  isVisible,
  projectCount,
  excludeImages,
  isExporting,
  onExcludeImagesChange,
  onExport,
  onClose
}) => {
  if (!isVisible) return null

  return (
    <div className="project-browser__modal-overlay" onClick={onClose}>
      <div className="project-browser__modal" onClick={e => e.stopPropagation()}>
        <h3>Export {projectCount} Project{projectCount !== 1 ? 's' : ''}</h3>
        <p style={{ marginBottom: '16px', color: '#888' }}>
          Export all projects in this folder and subfolders as a ZIP file.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={excludeImages}
            onChange={e => onExcludeImagesChange(e.target.checked)}
          />
          Exclude images (smaller file size, for fixtures)
        </label>
        <div className="project-browser__modal-actions">
          <button onClick={onClose} disabled={isExporting}>Cancel</button>
          <button
            onClick={onExport}
            disabled={isExporting}
            className="project-browser__btn--primary"
          >
            {isExporting ? (
              <><FontAwesomeIcon icon={faSpinner} spin /> Exporting...</>
            ) : (
              <>Export</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

interface ImportDialogProps {
  isVisible: boolean
  isImporting: boolean
  progress: { current: number; total: number; errors: number }
  onImport: (file: File) => void
  onClose: () => void
}

export const ImportDialog: React.FC<ImportDialogProps> = ({
  isVisible,
  isImporting,
  progress,
  onImport,
  onClose
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isVisible) return null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onImport(file)
    }
  }

  const handleSelectFile = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="project-browser__modal-overlay" onClick={isImporting ? undefined : onClose}>
      <div className="project-browser__modal" onClick={e => e.stopPropagation()}>
        <h3>Import Projects</h3>
        <p style={{ marginBottom: '16px', color: '#888' }}>
          Import projects from a ZIP file exported from Rotera.
          Folder structure will be preserved.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        {isImporting ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <FontAwesomeIcon icon={faSpinner} spin size="2x" style={{ marginBottom: '12px' }} />
            <p>Importing {progress.current} of {progress.total} projects...</p>
            {progress.errors > 0 && (
              <p style={{ color: '#e74c3c', marginTop: '8px' }}>
                {progress.errors} error{progress.errors !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        ) : (
          <div
            style={{
              border: '2px dashed #555',
              borderRadius: '8px',
              padding: '32px',
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: '16px'
            }}
            onClick={handleSelectFile}
          >
            <FontAwesomeIcon icon={faUpload} size="2x" style={{ marginBottom: '12px', color: '#888' }} />
            <p style={{ margin: 0 }}>Click to select a ZIP file</p>
          </div>
        )}
        <div className="project-browser__modal-actions">
          <button onClick={onClose} disabled={isImporting}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
