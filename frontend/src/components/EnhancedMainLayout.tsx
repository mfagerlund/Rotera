// Enhanced main layout with new workspace paradigm

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useProject } from '../hooks/useProject'
import { useSelection, useSelectionKeyboard } from '../hooks/useSelection'
import { useConstraints } from '../hooks/useConstraints'
import { useEnhancedProject } from '../hooks/useEnhancedProject'
import { useLines } from '../hooks/useLines'
import { Line } from '../types/project'

// UI Components
import ConstraintToolbar from './ConstraintToolbar'
import ConstraintPropertyPanel from './ConstraintPropertyPanel'
import ImageNavigationToolbar from './ImageNavigationToolbar'
import ConstraintTimeline from './ConstraintTimeline'
import ImageViewer, { ImageViewerRef } from './ImageViewer'
import WorldView, { WorldViewRef } from './WorldView'
import WorldPointPanel from './WorldPointPanel'
import EditLineWindow from './EditLineWindow'

// Enhanced workspace components
import {
  EnhancedWorkspaceManager,
  EnhancedWorkspaceSwitcher,
  WorkspaceStatus,
  SplitViewContainer
} from './EnhancedWorkspaceManager'

// Creation Tools
import CreationToolsManager from './tools/CreationToolsManager'

// Styles
import '../styles/enhanced-workspace.css'
import '../styles/tools.css'

type ActiveTool = 'select' | 'point' | 'line' | 'plane' | 'circle'

export const EnhancedMainLayout: React.FC = () => {
  // Legacy project system (for now)
  const legacyProject = useProject()

  // Enhanced project system (future)
  const enhancedProject = useEnhancedProject()

  // Tool state management
  const [activeTool, setActiveTool] = useState<ActiveTool>('select')
  const [constructionPreview, setConstructionPreview] = useState<{
    type: 'line'
    pointA?: string
    pointB?: string
    showToCursor?: boolean
  } | null>(null)

  // Line management
  const {
    lines,
    createLine,
    updateLine,
    deleteLine,
    toggleLineVisibility,
    getLinesForPoints,
    getLineById,
    lineCount
  } = useLines()

  // Use legacy project for now, but prepare for enhanced
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
  } = legacyProject

  // Selection and constraints
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

  // UI state
  const [placementMode, setPlacementMode] = useState<{
    active: boolean
    worldPointId: string | null
  }>({ active: false, worldPointId: null })

  // Edit Line Window state
  const [editLineState, setEditLineState] = useState<{
    isOpen: boolean
    lineId: string | null
  }>({ isOpen: false, lineId: null })

  // Refs for viewer components
  const imageViewerRef = useRef<ImageViewerRef>(null)
  const worldViewRef = useRef<WorldViewRef>(null)

  // Workspace state (using enhanced project when ready, fallback to local state)
  const [localWorkspaceState, setLocalWorkspaceState] = useState({
    currentWorkspace: 'image' as 'image' | 'world' | 'split',
    imageWorkspace: {
      currentImageId: currentImageId,
      scale: 1.0,
      pan: { x: 0, y: 0 },
      showImagePoints: true,
      showProjections: true
    },
    worldWorkspace: {
      viewMatrix: {
        scale: 100,
        rotation: { x: 0, y: 0, z: 0 },
        translation: { x: 0, y: 0, z: 0 }
      },
      renderMode: 'wireframe' as const,
      showAxes: true,
      showGrid: true,
      showCameras: true
    },
    splitWorkspace: {
      splitDirection: 'horizontal' as const,
      splitRatio: 0.5,
      syncSelection: true,
      syncNavigation: false
    }
  })

  // Update local workspace when current image changes
  useEffect(() => {
    setLocalWorkspaceState(prev => ({
      ...prev,
      imageWorkspace: {
        ...prev.imageWorkspace,
        currentImageId: currentImageId
      }
    }))
  }, [currentImageId])

  // Constraint logic - Convert selectedLines to both IDs and objects
  const selectedLineIds = selectedLines.map(lineObj => lineObj.id)

  // Helper to convert LineData to Line interface with defaults
  const createLineFromData = (lineData: any, lineObj: any): Line => ({
    id: lineObj.id,
    name: lineData?.name || `L${lineObj.id.slice(-4)}`,
    pointA: lineObj.pointA,
    pointB: lineObj.pointB,
    type: lineData?.type || 'segment',
    isVisible: lineData?.isVisible ?? true,
    color: lineData?.color || '#0696d7',
    isConstruction: lineData?.isConstruction || false,
    createdAt: lineData?.createdAt || new Date().toISOString()
  })

  const selectedLineObjects = selectedLines.map(lineObj => {
    const lineData = lines[lineObj.id]
    return createLineFromData(lineData, lineObj)
  })
  const allConstraints = getAllConstraints(selectedPoints, selectedLineObjects)
  const availableConstraints = getAvailableConstraints(selectedPoints, selectedLineObjects)

  const worldPointNames = Object.fromEntries(
    Object.entries(worldPoints).map(([id, wp]) => [id, wp.name])
  )

  // Point interaction handlers
  const handleEnhancedPointClick = (pointId: string, ctrlKey: boolean, shiftKey: boolean) => {
    // If Line tool is active, dispatch event for slot filling
    if (activeTool === 'line') {
      const event = new CustomEvent('lineToolPointClick', { detail: { pointId } })
      window.dispatchEvent(event)
      return // Don't do normal selection when line tool is active
    }

    // Normal selection behavior
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
      // Legacy placement mode (adding IP to existing WP)
      addImagePointToWorldPoint(placementMode.worldPointId, currentImage.id, u, v)
      cancelPlacementMode()
    } else if (activeTool === 'point' && currentImage) {
      // NEW: Only create world point when WP tool is explicitly active
      createWorldPoint(currentImage.id, u, v)
      // Auto-deactivate tool after point creation
      setActiveTool('select')
    }
    // Default behavior: do nothing (selection only)
  }

  const handleMovePoint = (worldPointId: string, u: number, v: number) => {
    if (currentImage) {
      addImagePointToWorldPoint(worldPointId, currentImage.id, u, v)
    }
  }

  // EditLineWindow handlers
  const handleEditLineClose = () => {
    setEditLineState({ isOpen: false, lineId: null })
  }

  const handleEditLineSave = (updatedLine: Line) => {
    updateLine(updatedLine.id, updatedLine)
  }

  const handleEditLineDelete = (lineId: string) => {
    deleteLine(lineId)
  }

  // Enhanced line click handler to open EditLineWindow
  const handleEnhancedLineClick = (lineId: string, ctrlKey: boolean, shiftKey: boolean) => {
    console.log('🔥 ENHANCED LINE CLICK DEBUG:')
    console.log('  - lineId:', lineId)
    console.log('  - ctrlKey:', ctrlKey)
    console.log('  - shiftKey:', shiftKey)
    console.log('  - lines available:', Object.keys(lines).length)
    console.log('  - line exists:', !!lines[lineId])

    // If not holding modifier keys, open edit window
    if (!ctrlKey && !shiftKey) {
      console.log('  - Opening edit window for line:', lineId)
      setEditLineState({ isOpen: true, lineId })
      console.log('  - Edit state set to:', { isOpen: true, lineId })
    } else {
      // Use constraint selection for multi-selection
      // TODO: Wire up line selection for constraints
      console.log('  - Multi-selection not yet implemented in Enhanced layout')
    }
  }

  // Workspace data for status display
  const imageInfo = {
    currentImage: currentImage?.name,
    totalImages: Object.keys(project?.images || {}).length,
    pointsInCurrentImage: currentImage ? getImagePointCount(currentImage.id) : 0
  }

  const worldInfo = {
    totalPoints: Object.keys(worldPoints).length,
    totalConstraints: constraints.length,
    optimizationStatus: 'idle' // TODO: Get from actual optimization state
  }

  // Keyboard shortcuts
  useSelectionKeyboard(
    () => selectAllPoints(Object.keys(worldPoints)),
    clearSelection,
    () => {} // Delete handler
  )

  // Keyboard shortcuts for tools and escape handling
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape key handling
      if (event.key === 'Escape') {
        if (placementMode.active) {
          cancelPlacementMode()
        } else if (activeTool !== 'select') {
          setActiveTool('select')
        }
        return
      }

      // Tool activation shortcuts (only if no input is focused)
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        switch (event.key.toLowerCase()) {
          case 'w':
            setActiveTool(activeTool === 'point' ? 'select' : 'point')
            break
          case 'l':
            if (selectedPoints.length <= 2) { // Only activate if valid selection
              setActiveTool(activeTool === 'line' ? 'select' : 'line')
            }
            break
          // Add more shortcuts later for P (plane), C (circle), etc.
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [placementMode.active, activeTool, selectedPoints.length])

  // Content for different workspaces
  const renderImageWorkspace = () => (
    <div className="workspace-image-view">
      {currentImage ? (
        <div className="image-viewer-container">
          <ImageViewer
            ref={imageViewerRef}
            image={currentImage}
            worldPoints={worldPoints}
            lines={lines}
            selectedPoints={selectedPoints}
            hoveredConstraintId={hoveredConstraintId}
            placementMode={placementMode}
            activeConstraintType={activeConstraintType}
            constructionPreview={constructionPreview}
            onPointClick={handleEnhancedPointClick}
            onCreatePoint={handleImageClick}
            onMovePoint={handleMovePoint}
          />
        </div>
      ) : (
        <div className="no-image-state">
          <div className="empty-state-content">
            <h3>No Image Selected</h3>
            <p>Add images using the sidebar to get started</p>
            <button
              className="btn-primary"
              onClick={() => {
                // TODO: Trigger image add dialog
              }}
            >
              📷 Add First Image
            </button>
          </div>
        </div>
      )}
    </div>
  )

  const renderWorldWorkspace = () => (
    <div className="workspace-world-view">
      <WorldView
        ref={worldViewRef}
        project={project!}
        selectedPoints={selectedPoints}
        selectedLines={selectedLineIds}
        selectedPlanes={selectedPlanes}
        hoveredConstraintId={hoveredConstraintId}
        onPointClick={handleEnhancedPointClick}
        onLineClick={handleEnhancedLineClick}
        onPlaneClick={handlePlaneClick}
      />
    </div>
  )

  const renderSplitWorkspace = () => (
    <div className="workspace-split-view">
      <SplitViewContainer
        splitDirection={localWorkspaceState.splitWorkspace.splitDirection}
        splitRatio={localWorkspaceState.splitWorkspace.splitRatio}
        onSplitRatioChange={(ratio) =>
          setLocalWorkspaceState(prev => ({
            ...prev,
            splitWorkspace: { ...prev.splitWorkspace, splitRatio: ratio }
          }))
        }
        leftContent={renderImageWorkspace()}
        rightContent={renderWorldWorkspace()}
      />
    </div>
  )

  // Loading state
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
    <>
    <EnhancedWorkspaceManager
      workspaceState={localWorkspaceState}
      onWorkspaceStateChange={(updates) =>
        setLocalWorkspaceState(prev => ({ ...prev, ...updates as any }))
      }
    >
      {(currentWorkspace, workspaceActions) => (
        <div className="app-layout enhanced-layout">
          {/* Enhanced top toolbar */}
          <div className="top-toolbar">
            <EnhancedWorkspaceSwitcher
              currentWorkspace={currentWorkspace}
              onWorkspaceChange={workspaceActions.setWorkspace}
              imageHasContent={imageInfo.totalImages > 0}
              worldHasContent={worldInfo.totalPoints > 0}
            />

            <div className="toolbar-section">
              <button className="btn-tool">📁 Open</button>
              <button className="btn-tool">💾 Save</button>
              <button className="btn-tool">📤 Export</button>

              {/* DEBUG: Manual trigger for floating window */}
              <button
                className="btn-tool"
                onClick={() => {
                  console.log('🔥 ENHANCED MANUAL TRIGGER CLICKED')
                  // Use first available line or create a test line entry
                  const lineIds = Object.keys(lines)
                  const testLineId = lineIds.length > 0 ? lineIds[0] : 'test-line-123'
                  setEditLineState({ isOpen: true, lineId: testLineId })
                }}
              >
                🔥 TEST FLOAT
              </button>
            </div>

            {/* Context-sensitive constraint toolbar */}
            <ConstraintToolbar
              selectedPoints={selectedPoints}
              selectedLines={selectedLineObjects}
              availableConstraints={allConstraints}
              selectionSummary={selectionSummary}
              onConstraintClick={startConstraintCreation}
            />

            <div className="toolbar-section">
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
              {currentWorkspace === 'image' && renderImageWorkspace()}
              {currentWorkspace === 'world' && renderWorldWorkspace()}
              {currentWorkspace === 'split' && renderSplitWorkspace()}
            </div>

            {/* Right sidebar: Properties & Timeline */}
            <div className="sidebar-right">
              {/* Creation Tools */}
              <CreationToolsManager
                selectedPoints={selectedPoints}
                selectedLines={selectedLineIds}
                selectedPlanes={selectedPlanes}
                activeTool={activeTool}
                onToolChange={setActiveTool}
                worldPointNames={worldPointNames}
                onCreatePoint={(imageId: string, u: number, v: number) => handleImageClick(u, v)}
                onCreateLine={(pointIds, constraints) => {
                  // Enhanced line creation with constraints
                  const lineId = createLine(pointIds, 'segment')
                  if (lineId && constraints) {
                    // TODO: Apply line-local constraints
                    console.log('Line created with constraints:', lineId, constraints)
                  }
                }}
                onCreatePlane={(definition) => {
                  // TODO: Implement plane creation
                  console.log('Create plane:', definition)
                }}
                onCreateCircle={(definition) => {
                  // TODO: Implement circle creation
                  console.log('Create circle:', definition)
                }}
                onConstructionPreviewChange={setConstructionPreview}
                currentImageId={currentImageId}
              />

              <ConstraintPropertyPanel
                activeConstraintType={activeConstraintType}
                selectedPoints={selectedPoints}
                selectedLines={selectedLineObjects}
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
                onSelectWorldPoint={(pointId: string, ctrlKey: boolean, shiftKey: boolean) =>
                  handlePointClick(pointId, ctrlKey, shiftKey)
                }
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

          {/* Enhanced bottom status bar */}
          <div className="status-bar">
            <WorkspaceStatus
              workspace={currentWorkspace}
              imageInfo={imageInfo}
              worldInfo={worldInfo}
            />
            <span className="selection-summary">{selectionSummary}</span>
            <span style={{marginLeft: 'auto', color: '#888'}}>v0.3-ENHANCED</span>
          </div>
        </div>
      )}
    </EnhancedWorkspaceManager>

    {/* Edit Line Window - Truly free floating over entire viewport */}
    <EditLineWindow
      line={editLineState.lineId && lines[editLineState.lineId] ? {
        ...lines[editLineState.lineId],
        type: 'segment' as const
      } : null}
      isOpen={editLineState.isOpen}
      onClose={handleEditLineClose}
      onSave={handleEditLineSave}
      onDelete={handleEditLineDelete}
    />
  </>
  )
}

export default EnhancedMainLayout