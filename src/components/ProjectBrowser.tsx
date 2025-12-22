import React from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowUp,
  faSpinner,
  faPlus,
  faFolderPlus,
  faFileExport,
  faBolt
} from '@fortawesome/free-solid-svg-icons'
import { Project } from '../entities/project'
import { useConfirm } from './ConfirmDialog'
import { AppBranding } from './AppBranding'
import { useProjectBrowser } from './ProjectBrowser/useProjectBrowser'
import { ProjectCard } from './ProjectBrowser/ProjectCard'
import { FolderCard } from './ProjectBrowser/FolderCard'
import { MoveDialog, CopyDialog, ExportDialog } from './ProjectBrowser/ProjectDialogs'

interface ProjectBrowserProps {
  onOpenProject: (project: Project) => void
  onCreateProject: () => void
}

export const ProjectBrowser: React.FC<ProjectBrowserProps> = observer(({
  onOpenProject,
  onCreateProject
}) => {
  const { confirm, dialog } = useConfirm()
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

    // Setters
    setCurrentFolderId,
    setEditingItem,
    setNewFolderName,
    setIsCreatingFolder,
    setMoveModalProject,
    setCopyModalProject,
    setCopyName,
    setShowExportModal,
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
    handleBatchOptimize,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    buildFolderPath,
    formatDate,
  } = useProjectBrowser()

  return (
    <div className="project-browser">
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
            disabled={projects.length === 0}
            title="Export all projects in this folder"
          >
            <FontAwesomeIcon icon={faFileExport} /> Export Folder
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

            {folders.length === 0 && projects.length === 0 && !currentFolderId && (
              <div className="project-browser__empty">
                <h2>No projects yet</h2>
                <p>Create a new project to get started</p>
                <button
                  className="project-browser__btn project-browser__btn--primary project-browser__btn--large"
                  onClick={onCreateProject}
                >
                  <FontAwesomeIcon icon={faPlus} /> Create First Project
                </button>
              </div>
            )}

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
        projectCount={projects.length}
        excludeImages={exportExcludeImages}
        isExporting={isExporting}
        onExcludeImagesChange={setExportExcludeImages}
        onExport={handleExportFolder}
        onClose={() => setShowExportModal(false)}
      />

      {dialog}
    </div>
  )
})
