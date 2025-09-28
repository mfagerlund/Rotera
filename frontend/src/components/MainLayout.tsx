// Main Fusion 360-inspired layout for Pictorigo

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useProject } from '../hooks/useProject'
import { useSelection, useSelectionKeyboard } from '../hooks/useSelection'
import { useConstraints } from '../hooks/useConstraints'
import ConstraintToolbar from './ConstraintToolbar'
import ConstraintPropertyPanel from './ConstraintPropertyPanel'
import ImageNavigationToolbar from './ImageNavigationToolbar'
import ConstraintTimeline from './ConstraintTimeline'
import ImageViewer, { ImageViewerRef } from './ImageViewer'
import WorldView, { WorldViewRef } from './WorldView'
import WorldPointPanel from './WorldPointPanel'
import WorkspaceManager, { WorkspaceSwitcher } from './WorkspaceManager'
import { WorkspaceType } from '../types/project'

export const MainLayout: React.FC = () => {
  // Note: Removed selectedWorldPointIds and highlightedWorldPointId - using only constraint selection (blue circles)
  const [placementMode, setPlacementMode] = useState<{
    active: boolean
    worldPointId: string | null
  }>({ active: false, worldPointId: null })
  const [currentScale, setCurrentScale] = useState(1)

  const imageViewerRef = useRef<ImageViewerRef>(null)
  const worldViewRef = useRef<WorldViewRef>(null)

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
    createWorldPoint,
    renameWorldPoint,
    deleteWorldPoint,
    addImagePointToWorldPoint
  } = useProject()

  const {
    selectedPoints,
    selectedLines,
    selectedPlanes,
    selectionSummary,
    handlePointClick,
    handleLineClick,
    handlePlaneClick,
    clearSelection,
    selectAllPoints
  } = useSelection()

  const {
    getAvailableConstraints,
    getAllConstraints,
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

  const allConstraints = getAllConstraints(selectedPoints, selectedLines)
  const availableConstraints = getAvailableConstraints(selectedPoints, selectedLines)

  const worldPointNames = Object.fromEntries(
    Object.entries(worldPoints).map(([id, wp]) => [id, wp.name])
  )

  // Note: Removed world point selection handlers - using only constraint selection

  // Point click handler using constraint selection (blue circles only)
  const handleEnhancedPointClick = (pointId: string, ctrlKey: boolean, shiftKey: boolean) => {
    // Use constraint selection (blue circles with numbers) for all point interaction
    handlePointClick(pointId, ctrlKey, shiftKey)
  }

  // Placement mode handlers
  const startPlacementMode = (worldPointId: string) => {
    setPlacementMode({ active: true, worldPointId })
  }

  const cancelPlacementMode = () => {
    setPlacementMode({ active: false, worldPointId: null })
  }

  const handleImageClick = (u: number, v: number) => {
    if (placementMode.active && placementMode.worldPointId && currentImage) {
      // Place existing world point in current image
      addImagePointToWorldPoint(placementMode.worldPointId, currentImage.id, u, v)
      cancelPlacementMode()
    } else if (currentImage) {
      // Create new world point
      createWorldPoint(currentImage.id, u, v)
    }
  }

  const handleMovePoint = (worldPointId: string, u: number, v: number) => {
    if (currentImage) {
      // Update the world point's position in the current image
      addImagePointToWorldPoint(worldPointId, currentImage.id, u, v)
    }
  }

  // Zoom control handlers
  const handleZoomFit = () => {
    imageViewerRef.current?.zoomFit()
  }

  const handleZoomSelection = () => {
    imageViewerRef.current?.zoomSelection()
  }

  const handleScaleChange = (scale: number) => {
    setCurrentScale(scale)
  }

  // Check which world points are missing from current image
  const getMissingWorldPoints = () => {
    if (!currentImage) return []
    return Object.values(worldPoints).filter(wp =>
      !wp.imagePoints.some(ip => ip.imageId === currentImage.id)
    )
  }

  // Get the latest (most recently created) world point that's missing from current image
  const getLatestMissingWorldPoint = () => {
    const missingWPs = getMissingWorldPoints()
    if (missingWPs.length === 0) return null

    // Find the WP with the highest number in its name (latest created)
    return missingWPs.reduce((latest, wp) => {
      const currentNum = parseInt(wp.name.replace('WP', '')) || 0
      const latestNum = parseInt(latest.name.replace('WP', '')) || 0
      return currentNum > latestNum ? wp : latest
    })
  }

  // Auto-suggest placing latest WP when switching to an image without any WPs
  useEffect(() => {
    if (!currentImage || placementMode.active) return

    const missingWPs = getMissingWorldPoints()
    const imageHasAnyWPs = getImagePointCount(currentImage.id) > 0

    // No automatic prompts - user can use "Place Latest" button in WorldPointPanel instead
    // This provides a non-intrusive workflow
  }, [currentImageId, worldPoints, placementMode.active, currentImage, getImagePointCount])

  // Keyboard shortcuts for selection
  useSelectionKeyboard(
    () => selectAllPoints(Object.keys(worldPoints)), // Ctrl+A: select all points
    clearSelection, // Ctrl+D or Escape: clear constraint selection (blue circles)
    () => {} // Delete key: we'll handle deletion separately
  )

  // Escape key handler for canceling placement mode
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && placementMode.active) {
        cancelPlacementMode()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [placementMode.active])

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
    <WorkspaceManager defaultWorkspace={project.settings.defaultWorkspace || 'image'}>
      {(currentWorkspace, setCurrentWorkspace) => (
        <div className="app-layout">
          {/* Top toolbar with context-sensitive constraints */}
          <div className="top-toolbar">
            <WorkspaceSwitcher
              currentWorkspace={currentWorkspace}
              onWorkspaceChange={setCurrentWorkspace}
            />

            <div className="toolbar-section">
          <button className="btn-tool">📁 Open</button>
          <button className="btn-tool">💾 Save</button>
          <button className="btn-tool">📤 Export</button>
        </div>

        {/* Context-sensitive constraint toolbar */}
        <ConstraintToolbar
          selectedPoints={selectedPoints}
          selectedLines={selectedLines}
          availableConstraints={allConstraints}
          selectionSummary={selectionSummary}
          onConstraintClick={startConstraintCreation}
        />

        <div className="toolbar-section">
          <button className="btn-tool" onClick={handleZoomFit} title="Zoom to fit entire image">
            🔍 Zoom Fit
          </button>
          <button
            className="btn-tool"
            onClick={handleZoomSelection}
            title={selectedPoints.length > 0 ? "Zoom to selected points" : "Zoom to all points"}
          >
            🎯 Zoom Selection
          </button>
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
            worldPoints={worldPoints}
            selectedWorldPointIds={selectedPoints}
            isCreatingConstraint={!!activeConstraintType}
            onImageSelect={setCurrentImageId}
            onImageAdd={addImage}
            onImageRename={renameImage}
            onImageDelete={deleteImage}
            getImagePointCount={getImagePointCount}
            getSelectedPointsInImage={(imageId) => getSelectedPointsInImage(imageId, selectedPoints)}
          />
        </div>

        {/* Center: Workspace-specific viewer */}
        <div className="viewer-area">
          {currentWorkspace === 'image' ? (
            <div className="image-viewer-container">
              {currentImage ? (
                <>
                  <ImageViewer
                    ref={imageViewerRef}
                    image={currentImage}
                    worldPoints={worldPoints}
                    selectedPoints={selectedPoints}
                    hoveredConstraintId={hoveredConstraintId}
                    placementMode={placementMode}
                    activeConstraintType={activeConstraintType}
                    onPointClick={handleEnhancedPointClick}
                    onCreatePoint={handleImageClick}
                    onMovePoint={handleMovePoint}
                    onScaleChange={handleScaleChange}
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
          ) : (
            <div className="world-viewer-container">
              <WorldView
                ref={worldViewRef}
                project={project}
                selectedPoints={selectedPoints}
                selectedLines={selectedLines}
                selectedPlanes={selectedPlanes}
                hoveredConstraintId={hoveredConstraintId}
                onPointClick={handleEnhancedPointClick}
                onLineClick={handleLineClick}
                onPlaneClick={handlePlaneClick}
              />
            </div>
          )}
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

          <WorldPointPanel
            worldPoints={worldPoints}
            constraints={constraints}
            selectedWorldPointIds={selectedPoints}
            currentImageId={currentImageId}
            placementMode={placementMode}
            onSelectWorldPoint={(pointId: string, ctrlKey: boolean, shiftKey: boolean) => handlePointClick(pointId, ctrlKey, shiftKey)}
            onHighlightWorldPoint={() => {}}
            onRenameWorldPoint={renameWorldPoint}
            onDeleteWorldPoint={deleteWorldPoint}
            onStartPlacement={startPlacementMode}
            onCancelPlacement={cancelPlacementMode}
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
            <span>Workspace: {currentWorkspace === 'image' ? 'Image View' : 'World View'}</span>
            <span>Image: {currentImage?.name || 'None'}</span>
            <span>WP: {Object.keys(worldPoints).length}</span>
            <span>Constraints: {constraints.length}</span>
            <span>{getSelectionSummary()}</span>
            <span>Scale:</span>
            <input
              type="range"
              min="10"
              max="500"
              step="5"
              value={Math.round(currentScale * 100)}
              onChange={(e) => {
                const newScale = parseInt(e.target.value) / 100
                imageViewerRef.current?.setScale?.(newScale)
              }}
              className="scale-slider-footer"
              title="Zoom level"
            />
            <span>{Math.round(currentScale * 100)}%</span>
          </div>
        </div>
      )}
    </WorkspaceManager>
  )
}

export default MainLayout