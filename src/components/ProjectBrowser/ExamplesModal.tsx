import React, { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faSpinner,
  faCheck,
  faExclamationTriangle,
  faGraduationCap,
  faStar,
  faRocket
} from '@fortawesome/free-solid-svg-icons'
import { ExampleProject, ExampleManifest, ExampleProjectService } from '../../services/example-projects'

interface ExamplesModalProps {
  isVisible: boolean
  onClose: () => void
  onImportComplete: () => void
}

type LoadState = 'loading' | 'loaded' | 'error'
type ImportState = 'idle' | 'importing' | 'done'

const difficultyIcons = {
  beginner: faGraduationCap,
  intermediate: faStar,
  advanced: faRocket
}

const difficultyLabels = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced'
}

export const ExamplesModal: React.FC<ExamplesModalProps> = ({
  isVisible,
  onClose,
  onImportComplete
}) => {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [manifest, setManifest] = useState<ExampleManifest | null>(null)
  const [importedNames, setImportedNames] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [importState, setImportState] = useState<ImportState>('idle')
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isVisible) {
      loadManifest()
    }
  }, [isVisible])

  const loadManifest = async () => {
    setLoadState('loading')
    setError(null)
    try {
      const [fetchedManifest, imported] = await Promise.all([
        ExampleProjectService.getManifest(),
        ExampleProjectService.getImportedExampleNames()
      ])
      setManifest(fetchedManifest)
      setImportedNames(imported)

      // Pre-select examples that aren't already imported
      const notImported = fetchedManifest.examples
        .filter(e => !imported.has(e.name))
        .map(e => e.id)
      setSelectedIds(new Set(notImported))

      setLoadState('loaded')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load examples')
      setLoadState('error')
    }
  }

  const toggleExample = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAll = () => {
    if (manifest) {
      const notImported = manifest.examples
        .filter(e => !importedNames.has(e.name))
        .map(e => e.id)
      setSelectedIds(new Set(notImported))
    }
  }

  const selectNone = () => {
    setSelectedIds(new Set())
  }

  const handleImport = async () => {
    if (!manifest) return

    const toImport = manifest.examples.filter(e => selectedIds.has(e.id))
    if (toImport.length === 0) return

    setImportState('importing')
    setImportProgress({ current: 0, total: toImport.length })

    const result = await ExampleProjectService.importExamples(
      toImport,
      (current, total) => setImportProgress({ current, total })
    )

    setImportResult(result)
    setImportState('done')

    // Refresh imported names
    const imported = await ExampleProjectService.getImportedExampleNames()
    setImportedNames(imported)
    setSelectedIds(new Set())

    onImportComplete()
  }

  const handleClose = () => {
    if (importState !== 'importing') {
      setImportState('idle')
      setImportResult(null)
      onClose()
    }
  }

  if (!isVisible) return null

  const notImportedCount = manifest?.examples.filter(e => !importedNames.has(e.name)).length ?? 0

  return (
    <div className="project-browser__modal-overlay" onClick={handleClose}>
      <div
        className="project-browser__modal project-browser__modal--wide"
        onClick={e => e.stopPropagation()}
      >
        <h3>Example Projects</h3>

        {loadState === 'loading' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <FontAwesomeIcon icon={faSpinner} spin size="2x" />
            <p style={{ marginTop: '12px', color: '#888' }}>Loading examples...</p>
          </div>
        )}

        {loadState === 'error' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <FontAwesomeIcon icon={faExclamationTriangle} size="2x" style={{ color: '#e74c3c' }} />
            <p style={{ marginTop: '12px', color: '#e74c3c' }}>{error}</p>
            <button onClick={loadManifest} style={{ marginTop: '12px' }}>Retry</button>
          </div>
        )}

        {loadState === 'loaded' && manifest && (
          <>
            <p style={{ marginBottom: '12px', color: '#888' }}>
              Select example projects to import. They'll be added to an "Examples" folder.
            </p>

            {importState === 'idle' && notImportedCount > 0 && (
              <div style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
                <button onClick={selectAll} className="project-browser__btn--small">
                  Select All
                </button>
                <button onClick={selectNone} className="project-browser__btn--small">
                  Select None
                </button>
              </div>
            )}

            <div className="examples-modal__list">
              {manifest.examples.map(example => {
                const isImported = importedNames.has(example.name)
                const isSelected = selectedIds.has(example.id)

                return (
                  <label
                    key={example.id}
                    className={`examples-modal__item ${isImported ? 'examples-modal__item--imported' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleExample(example.id)}
                      disabled={isImported || importState !== 'idle'}
                    />
                    <div className="examples-modal__item-content">
                      <div className="examples-modal__item-header">
                        <span className="examples-modal__item-name">{example.name}</span>
                        <span className={`examples-modal__difficulty examples-modal__difficulty--${example.difficulty}`}>
                          <FontAwesomeIcon icon={difficultyIcons[example.difficulty]} />
                          {difficultyLabels[example.difficulty]}
                        </span>
                        {isImported && (
                          <span className="examples-modal__imported-badge">
                            <FontAwesomeIcon icon={faCheck} /> Imported
                          </span>
                        )}
                      </div>
                      <p className="examples-modal__item-description">{example.description}</p>
                      {example.concepts.length > 0 && (
                        <div className="examples-modal__concepts">
                          {example.concepts.map(c => (
                            <span key={c} className="examples-modal__concept">{c}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>

            {importState === 'importing' && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <FontAwesomeIcon icon={faSpinner} spin size="lg" />
                <p style={{ marginTop: '8px' }}>
                  Importing {importProgress.current} of {importProgress.total}...
                </p>
              </div>
            )}

            {importState === 'done' && importResult && (
              <div style={{
                textAlign: 'center',
                padding: '12px',
                background: importResult.failed > 0 ? '#2d2a1a' : '#1a2d1a',
                borderRadius: '4px',
                marginTop: '12px'
              }}>
                <FontAwesomeIcon
                  icon={importResult.failed > 0 ? faExclamationTriangle : faCheck}
                  style={{ color: importResult.failed > 0 ? '#f39c12' : '#27ae60' }}
                />
                <span style={{ marginLeft: '8px' }}>
                  Imported {importResult.success} project{importResult.success !== 1 ? 's' : ''}
                  {importResult.failed > 0 && ` (${importResult.failed} failed)`}
                </span>
              </div>
            )}
          </>
        )}

        <div className="project-browser__modal-actions">
          <button onClick={handleClose} disabled={importState === 'importing'}>
            {importState === 'done' ? 'Close' : 'Cancel'}
          </button>
          {importState === 'idle' && selectedIds.size > 0 && (
            <button
              onClick={handleImport}
              className="project-browser__btn--primary"
            >
              Import {selectedIds.size} Project{selectedIds.size !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
