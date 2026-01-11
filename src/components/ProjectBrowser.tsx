import React, { useRef } from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowUp,
  faSpinner,
  faPlus,
  faFolderPlus,
  faFileExport,
  faFileImport,
  faBolt,
  faDownload,
  faBookOpen,
  faQuestionCircle,
  faChevronDown,
  faChevronRight
} from '@fortawesome/free-solid-svg-icons'
import { Project } from '../entities/project'
import { useConfirm } from './ConfirmDialog'
import { AppBranding } from './AppBranding'
import { useProjectBrowser } from './ProjectBrowser/useProjectBrowser'
import { ProjectDB } from '../services/project-db'
import { ProjectCard } from './ProjectBrowser/ProjectCard'
import { FolderCard } from './ProjectBrowser/FolderCard'
import { MoveDialog, CopyDialog, ExportDialog, ImportDialog } from './ProjectBrowser/ProjectDialogs'
import { ExamplesModal } from './ProjectBrowser/ExamplesModal'
import { AboutModal } from './AboutModal'

interface ProjectBrowserProps {
  onOpenProject: (project: Project) => void
  onCreateProject: () => void
}

export const ProjectBrowser: React.FC<ProjectBrowserProps> = observer(({
  onOpenProject,
  onCreateProject
}) => {
  const { confirm, dialog } = useConfirm()
  const [isImporting, setIsImporting] = React.useState(false)
  const [hasOldDb, setHasOldDb] = React.useState(false)
  const [showExamplesModal, setShowExamplesModal] = React.useState(false)
  const [showAboutModal, setShowAboutModal] = React.useState(false)
  const [gettingStartedExpanded, setGettingStartedExpanded] = React.useState<boolean | null>(null)
  const importProjectInputRef = useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    ProjectDB.hasOldDatabase().then(setHasOldDb)
  }, [])
  const {
    // State
    folders,
    projects,
    currentFolderId,
    lastOpenedProjectId,
    folderPath,
    isLoading,
    loadingProjectId,
    editingItem,
    newFolderName,
    isCreatingFolder,
    draggedProject,
    dragOverFolderId,
    moveModalProject,
    copyModalProject,
    copyName,
    allFolders,
    showExportModal,
    exportExcludeImages,
    isExporting,
    batchResults,
    isBatchOptimizing,
    batchProgress,
    folderStats,
    totalProjectCount,
    optimizingProjectId,
    queuedProjectIds,
    justCompletedProjectIds,
    folderProgress,
    justCompletedFolderIds,
    showImportModal,
    isImportingFolder,
    importProgress,

    // Setters
    setCurrentFolderId,
    setEditingItem,
    setNewFolderName,
    setIsCreatingFolder,
    setMoveModalProject,
    setCopyModalProject,
    setCopyName,
    setShowExportModal,
    setShowImportModal,
    setExportExcludeImages,

    // Handlers
    handleOpenFolder,
    handleGoUp,
    handleOpenProject,
    handleCreateFolder,
    handleRenameItem,
    handleDeleteFolder,
    handleDeleteProject,
    handleMoveProject,
    handleCopyProject,
    openCopyModal,
    handleExportFolder,
    handleImportFolder,
    handleImportProject,
    handleBatchOptimize,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    buildFolderPath,
    formatDate,
    loadContents,
  } = useProjectBrowser()

  const handleImportOldDatabase = async () => {
    setIsImporting(true)
    try {
      const count = await ProjectDB.migrateFromOldDatabase()
      if (count > 0) {
        await loadContents()
      }
      setHasOldDb(false)
    } catch (error) {
      console.error('Import failed:', error)
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="project-browser">
      <input
        ref={importProjectInputRef}
        type="file"
        accept=".rotera,.json"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            handleImportProject(file)
          }
          e.target.value = ''
        }}
        style={{ display: 'none' }}
      />
      <div className="top-toolbar">
        <AppBranding size="small" />
        <div className="project-browser__actions">
          <button
            className="project-browser__btn project-browser__btn--primary"
            onClick={onCreateProject}
          >
            <FontAwesomeIcon icon={faPlus} /> New Project
          </button>
          <button
            className="project-browser__btn"
            onClick={() => setIsCreatingFolder(true)}
          >
            <FontAwesomeIcon icon={faFolderPlus} /> New Folder
          </button>
          <button
            className="project-browser__btn"
            onClick={() => setShowExportModal(true)}
            disabled={totalProjectCount === 0}
            title="Export all projects in this folder and subfolders"
          >
            <FontAwesomeIcon icon={faFileExport} /> Export Folder
          </button>
          <button
            className="project-browser__btn"
            onClick={() => setShowImportModal(true)}
            title="Import projects from a ZIP file"
          >
            <FontAwesomeIcon icon={faFileImport} /> Import Folder
          </button>
          <button
            className="project-browser__btn"
            onClick={() => importProjectInputRef.current?.click()}
            title="Import a single project file"
          >
            <FontAwesomeIcon icon={faFileImport} /> Import Project
          </button>
          <button
            className="project-browser__btn"
            onClick={() => setShowExamplesModal(true)}
            title="Load example projects to learn Rotera"
          >
            <FontAwesomeIcon icon={faBookOpen} /> Examples
          </button>
          <button
            className="project-browser__btn"
            onClick={() => setShowAboutModal(true)}
            title="Learn about Rotera"
          >
            <FontAwesomeIcon icon={faQuestionCircle} /> Help
          </button>
          <button
            className="project-browser__btn project-browser__btn--optimize"
            onClick={handleBatchOptimize}
            disabled={totalProjectCount === 0 || isBatchOptimizing}
            title="Run optimization on all projects in this folder and subfolders"
          >
            {isBatchOptimizing ? (
              <><FontAwesomeIcon icon={faSpinner} spin /> Optimizing {batchProgress.current}/{batchProgress.total}...</>
            ) : (
              <><FontAwesomeIcon icon={faBolt} /> Optimize All ({totalProjectCount})</>
            )}
          </button>
          {hasOldDb && (
            <button
              className="project-browser__btn"
              onClick={handleImportOldDatabase}
              disabled={isImporting}
              title="Import projects from old Pictorigo database"
            >
              {isImporting ? (
                <><FontAwesomeIcon icon={faSpinner} spin /> Importing...</>
              ) : (
                <><FontAwesomeIcon icon={faDownload} /> Import Old Database</>
              )}
            </button>
          )}
        </div>
      </div>

      <nav className="project-browser__breadcrumb">
        <button
          className={`project-browser__breadcrumb-item ${dragOverFolderId === 'root' ? 'project-browser__breadcrumb-item--drag-over' : ''}`}
          onClick={() => setCurrentFolderId(null)}
          onDragOver={e => handleDragOver(e, 'root')}
          onDragLeave={handleDragLeave}
          onDrop={e => handleDrop(e, null)}
        >
          Projects
        </button>
        {folderPath.map((folder) => (
          <React.Fragment key={folder.id}>
            <span className="project-browser__breadcrumb-separator">/</span>
            <button
              className="project-browser__breadcrumb-item"
              onClick={() => setCurrentFolderId(folder.id)}
            >
              {folder.name}
            </button>
          </React.Fragment>
        ))}
      </nav>

      {isCreatingFolder && (
        <div className="project-browser__new-folder">
          <input
            type="text"
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreateFolder()
              if (e.key === 'Escape') {
                setIsCreatingFolder(false)
                setNewFolderName('')
              }
            }}
            placeholder="Folder name..."
            autoFocus
          />
          <button onClick={handleCreateFolder}>Create</button>
          <button onClick={() => {
            setIsCreatingFolder(false)
            setNewFolderName('')
          }}>Cancel</button>
        </div>
      )}

      <div className="project-browser__content">
        {isLoading ? (
          <div className="project-browser__loading">
            <FontAwesomeIcon icon={faSpinner} spin size="2x" />
            <p>Loading...</p>
          </div>
        ) : (
          <>
            {currentFolderId && (
              <div
                className="project-browser__item project-browser__item--folder"
                onClick={handleGoUp}
              >
                <FontAwesomeIcon icon={faArrowUp} className="project-browser__item-icon" />
                <span className="project-browser__item-name">..</span>
              </div>
            )}

            {folders.map(folder => (
              <FolderCard
                key={folder.id}
                folder={folder}
                isDragOver={dragOverFolderId === folder.id}
                isBatchOptimizing={isBatchOptimizing}
                stats={folderStats.get(folder.id)}
                progress={folderProgress.get(folder.id)}
                isJustCompleted={justCompletedFolderIds.has(folder.id)}
                editingItem={editingItem}
                onOpen={handleOpenFolder}
                onRename={(folder) => setEditingItem({ type: 'folder', id: folder.id, name: folder.name })}
                onDelete={(folder) => handleDeleteFolder(folder, confirm)}
                onEditChange={name => setEditingItem(editingItem ? { ...editingItem, name } : null)}
                onEditConfirm={handleRenameItem}
                onEditCancel={() => setEditingItem(null)}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              />
            ))}

            {projects.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                isLoading={loadingProjectId === project.id}
                isDragging={draggedProject?.id === project.id}
                isLastOpened={lastOpenedProjectId === project.id}
                isOptimizing={optimizingProjectId === project.id}
                isQueued={queuedProjectIds.has(project.id)}
                isJustCompleted={justCompletedProjectIds.has(project.id)}
                batchResult={batchResults.get(project.id)}
                editingItem={editingItem}
                onOpen={(project) => handleOpenProject(project, onOpenProject)}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onCopy={openCopyModal}
                onMove={setMoveModalProject}
                onRename={(project) => setEditingItem({ type: 'project', id: project.id, name: project.name })}
                onDelete={(project) => handleDeleteProject(project, confirm)}
                onEditChange={name => setEditingItem(editingItem ? { ...editingItem, name } : null)}
                onEditConfirm={handleRenameItem}
                onEditCancel={() => setEditingItem(null)}
                formatDate={formatDate}
              />
            ))}

            {/* Getting Started section - always shown at root, collapsible when there are projects */}
            {!currentFolderId && (() => {
              const hasContent = folders.length > 0 || projects.length > 0
              const isExpanded = gettingStartedExpanded ?? !hasContent

              return (
                <div className={`project-browser__getting-started ${hasContent ? 'project-browser__getting-started--collapsible' : ''}`}>
                  {hasContent ? (
                    <button
                      className="project-browser__getting-started-header"
                      onClick={() => setGettingStartedExpanded(!isExpanded)}
                    >
                      <FontAwesomeIcon
                        icon={isExpanded ? faChevronDown : faChevronRight}
                        className="project-browser__getting-started-chevron"
                      />
                      <span>Getting Started</span>
                    </button>
                  ) : (
                    <div className="project-browser__getting-started-header project-browser__getting-started-header--static">
                      <h2>No projects yet</h2>
                      <p>Get started by creating a new project or loading examples</p>
                    </div>
                  )}
                  {isExpanded && (
                    <div className="project-browser__getting-started-content">
                      <div className="project-browser__empty-card">
                        <div className="project-browser__empty-card-icon">
                          <FontAwesomeIcon icon={faPlus} />
                        </div>
                        <h3>New Project</h3>
                        <p>Start fresh with your own photos</p>
                        <button
                          className="project-browser__btn project-browser__btn--primary project-browser__btn--large"
                          onClick={onCreateProject}
                        >
                          Create Project
                        </button>
                      </div>
                      <div className="project-browser__empty-card">
                        <div className="project-browser__empty-card-icon project-browser__empty-card-icon--examples">
                          <FontAwesomeIcon icon={faBookOpen} />
                        </div>
                        <h3>Example Projects</h3>
                        <p>Learn with pre-built demos</p>
                        <button
                          className="project-browser__btn project-browser__btn--large"
                          onClick={() => setShowExamplesModal(true)}
                        >
                          Import Examples
                        </button>
                      </div>
                      <div className="project-browser__empty-card">
                        <div className="project-browser__empty-card-icon project-browser__empty-card-icon--help">
                          <FontAwesomeIcon icon={faQuestionCircle} />
                        </div>
                        <h3>What is Rotera?</h3>
                        <p>Learn how it works</p>
                        <button
                          className="project-browser__btn project-browser__btn--large"
                          onClick={() => setShowAboutModal(true)}
                        >
                          Read Guide
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {folders.length === 0 && projects.length === 0 && currentFolderId && (
              <div className="project-browser__empty">
                <p>This folder is empty</p>
              </div>
            )}
          </>
        )}
      </div>

      <MoveDialog
        project={moveModalProject}
        allFolders={allFolders}
        onMove={handleMoveProject}
        onClose={() => setMoveModalProject(null)}
        buildFolderPath={buildFolderPath}
      />

      <CopyDialog
        project={copyModalProject}
        copyName={copyName}
        onCopyNameChange={setCopyName}
        onCopy={handleCopyProject}
        onClose={() => setCopyModalProject(null)}
      />

      <ExportDialog
        isVisible={showExportModal}
        projectCount={totalProjectCount}
        excludeImages={exportExcludeImages}
        isExporting={isExporting}
        onExcludeImagesChange={setExportExcludeImages}
        onExport={handleExportFolder}
        onClose={() => setShowExportModal(false)}
      />

      <ImportDialog
        isVisible={showImportModal}
        isImporting={isImportingFolder}
        progress={importProgress}
        onImport={handleImportFolder}
        onClose={() => setShowImportModal(false)}
      />

      <ExamplesModal
        isVisible={showExamplesModal}
        onClose={() => setShowExamplesModal(false)}
        onImportComplete={loadContents}
      />

      <AboutModal
        isVisible={showAboutModal}
        onClose={() => setShowAboutModal(false)}
      />

      {dialog}
    </div>
  )
})
