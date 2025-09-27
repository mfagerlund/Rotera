// Main Fusion 360-inspired layout for Pictorigo

import React from 'react'
import { useProject } from '../hooks/useProject'
import { useSelection } from '../hooks/useSelection'
import { useConstraints } from '../hooks/useConstraints'
import ConstraintToolbar from './ConstraintToolbar'
import ConstraintPropertyPanel from './ConstraintPropertyPanel'
import ImageNavigationToolbar from './ImageNavigationToolbar'
import ConstraintTimeline from './ConstraintTimeline'
import ImageViewer from './ImageViewer'

export const MainLayout: React.FC = () => {
  const {
    project,
    currentImage,
    currentImageId,
    setCurrentImageId,
    worldPoints,
    constraints,
    addConstraint,
    updateConstraint,
    deleteConstraint,
    toggleConstraint,
    addImage,
    renameImage,
    deleteImage,
    getImagePointCount,
    getSelectedPointsInImage,
    createWorldPoint
  } = useProject()

  const {
    selectedPoints,
    selectedLines,
    selectionSummary,
    handlePointClick,
    clearSelection
  } = useSelection()

  const {
    getAvailableConstraints,
    startConstraintCreation,
    activeConstraintType,
    constraintParameters,
    updateParameter,
    applyConstraint,
    cancelConstraintCreation,
    isConstraintComplete,
    hoveredConstraintId,
    setHoveredConstraintId
  } = useConstraints(
    constraints,
    addConstraint,
    updateConstraint,
    deleteConstraint,
    toggleConstraint
  )

  const availableConstraints = getAvailableConstraints(selectedPoints, selectedLines)

  const worldPointNames = Object.fromEntries(
    Object.entries(worldPoints).map(([id, wp]) => [id, wp.name])
  )

  const getSelectionSummary = () => {
    if (!project) return ''

    const parts = []
    if (selectedPoints.length > 0) {
      parts.push(`${selectedPoints.length} point${selectedPoints.length !== 1 ? 's' : ''}`)
    }
    if (selectedLines.length > 0) {
      parts.push(`${selectedLines.length} line${selectedLines.length !== 1 ? 's' : ''}`)
    }

    return parts.length > 0 ? `Selection: ${parts.join(', ')}` : 'No selection'
  }

  if (!project) {
    return (
      <div className="app-layout">
        <div className="loading-state">
          <h3>Loading project...</h3>
        </div>
      </div>
    )
  }

  return (
    <div className="app-layout">
      {/* Top toolbar with context-sensitive constraints */}
      <div className="top-toolbar">
        <div className="toolbar-section">
          <button className="btn-tool">📁 Open</button>
          <button className="btn-tool">💾 Save</button>
          <button className="btn-tool">📤 Export</button>
        </div>

        {/* Context-sensitive constraint toolbar */}
        <ConstraintToolbar
          selectedPoints={selectedPoints}
          selectedLines={selectedLines}
          availableConstraints={availableConstraints}
          selectionSummary={selectionSummary}
          onConstraintClick={startConstraintCreation}
        />

        <div className="toolbar-section">
          <button className="btn-tool">🔍 Zoom Fit</button>
          <button className="btn-tool">🎯 Zoom Selection</button>
          <label className="toolbar-toggle">
            <input
              type="checkbox"
              checked={project.settings.showPointNames}
              onChange={(e) => {
                // TODO: Update project settings
              }}
            />
            Show Point Names
          </label>
        </div>
      </div>

      {/* Main content area */}
      <div className="content-area">
        {/* Left sidebar: Image Navigation */}
        <div className="sidebar-left">
          <ImageNavigationToolbar
            images={project.images}
            currentImageId={currentImageId}
            isCreatingConstraint={!!activeConstraintType}
            onImageSelect={setCurrentImageId}
            onImageAdd={addImage}
            onImageRename={renameImage}
            onImageDelete={deleteImage}
            getImagePointCount={getImagePointCount}
            getSelectedPointsInImage={(imageId) => getSelectedPointsInImage(imageId, selectedPoints)}
          />
        </div>

        {/* Center: Image viewer with overlays */}
        <div className="viewer-area">
          <div className="image-viewer-container">
            {currentImage ? (
              <>
                <ImageViewer
                  image={currentImage}
                  worldPoints={worldPoints}
                  selectedPoints={selectedPoints}
                  hoveredConstraintId={hoveredConstraintId}
                  onPointClick={handlePointClick}
                  onCreatePoint={(u, v) => createWorldPoint(currentImage.id, u, v)}
                />
                {/* Selection and constraint overlays will be part of ImageViewer */}
              </>
            ) : (
              <div className="no-image-state">
                <h3>No Image Selected</h3>
                <p>Add images using the sidebar to get started</p>
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar: Properties & Timeline */}
        <div className="sidebar-right">
          <ConstraintPropertyPanel
            activeConstraintType={activeConstraintType}
            selectedPoints={selectedPoints}
            selectedLines={selectedLines}
            parameters={constraintParameters}
            isComplete={isConstraintComplete()}
            worldPointNames={worldPointNames}
            onParameterChange={updateParameter}
            onApply={applyConstraint}
            onCancel={cancelConstraintCreation}
          />

          <ConstraintTimeline
            constraints={constraints}
            hoveredConstraintId={hoveredConstraintId}
            worldPointNames={worldPointNames}
            onHover={setHoveredConstraintId}
            onEdit={(constraint) => {
              // TODO: Implement constraint editing
            }}
            onDelete={deleteConstraint}
            onToggle={toggleConstraint}
          />
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="status-bar">
        <span>Image: {currentImage?.name || 'None'}</span>
        <span>WP: {Object.keys(worldPoints).length}</span>
        <span>Constraints: {constraints.length}</span>
        <span>{getSelectionSummary()}</span>
        <span>Scale: 1.00x</span> {/* TODO: Get actual scale from ImageViewer */}
      </div>
    </div>
  )
}

export default MainLayout