// Main Fusion 360-inspired layout for Pictorigo

import React, { useState, useEffect, useCallback } from 'react'
import { useProject } from '../hooks/useProject'
import { useSelection, useSelectionKeyboard } from '../hooks/useSelection'
import { useConstraints } from '../hooks/useConstraints'
import ConstraintToolbar from './ConstraintToolbar'
import ConstraintPropertyPanel from './ConstraintPropertyPanel'
import ImageNavigationToolbar from './ImageNavigationToolbar'
import ConstraintTimeline from './ConstraintTimeline'
import ImageViewer from './ImageViewer'
import WorldPointPanel from './WorldPointPanel'

export const MainLayout: React.FC = () => {
  const [selectedWorldPointIds, setSelectedWorldPointIds] = useState<string[]>([])
  const [highlightedWorldPointId, setHighlightedWorldPointId] = useState<string | null>(null)
  const [placementMode, setPlacementMode] = useState<{
    active: boolean
    worldPointId: string | null
  }>({ active: false, worldPointId: null })

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
    selectionSummary,
    handlePointClick,
    clearSelection,
    selectAll
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

  // World point selection handlers
  const handleWorldPointSelect = (id: string, multiSelect: boolean) => {
    if (multiSelect) {
      setSelectedWorldPointIds(prev =>
        prev.includes(id)
          ? prev.filter(wpId => wpId !== id)
          : [...prev, id]
      )
    } else {
      setSelectedWorldPointIds([id])
    }
  }

  const handleWorldPointHighlight = (id: string | null) => {
    setHighlightedWorldPointId(id)
  }

  // Enhanced point click handler that handles both constraint selection and WP selection
  const handleEnhancedPointClick = (pointId: string, ctrlKey: boolean, shiftKey: boolean) => {
    // Handle constraint selection
    handlePointClick(pointId, ctrlKey, shiftKey)

    // Also handle world point selection
    handleWorldPointSelect(pointId, ctrlKey || shiftKey)
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
    () => selectAll(Object.keys(worldPoints)), // Ctrl+A: select all points
    clearSelection, // Ctrl+D or Escape: clear selection
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
          availableConstraints={allConstraints}
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
            worldPoints={worldPoints}
            selectedWorldPointIds={selectedWorldPointIds}
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
                  selectedWorldPointIds={selectedWorldPointIds}
                  highlightedWorldPointId={highlightedWorldPointId}
                  hoveredConstraintId={hoveredConstraintId}
                  placementMode={placementMode}
                  activeConstraintType={activeConstraintType}
                  onPointClick={handleEnhancedPointClick}
                  onCreatePoint={handleImageClick}
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

          <WorldPointPanel
            worldPoints={worldPoints}
            constraints={constraints}
            selectedWorldPointIds={selectedWorldPointIds}
            currentImageId={currentImageId}
            placementMode={placementMode}
            onSelectWorldPoint={handleWorldPointSelect}
            onRenameWorldPoint={renameWorldPoint}
            onDeleteWorldPoint={deleteWorldPoint}
            onHighlightWorldPoint={handleWorldPointHighlight}
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