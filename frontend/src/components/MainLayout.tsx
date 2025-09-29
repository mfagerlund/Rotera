// Main layout with new workspace paradigm

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useProject } from '../hooks/useProject'
import { useSelection, useSelectionKeyboard } from '../hooks/useSelection'
import { useConstraints } from '../hooks/useConstraints'
import { useEnhancedProject } from '../hooks/useEnhancedProject'
import { Line, AvailableConstraint } from '../types/project'
import { Line as LineEntity } from '../entities/line'
import { WorldPoint } from '../entities/world-point'
import { EnhancedConstraint, ConstraintType as GeometryConstraintType } from '../types/geometry'
import { VisualLanguageManager } from '../utils/visualLanguage'

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
  WorkspaceManager,
  WorkspaceSwitcher,
  WorkspaceStatus,
  SplitViewContainer
} from './WorkspaceManager'

// Creation Tools
import CreationToolsManager from './tools/CreationToolsManager'

// Styles
import '../styles/enhanced-workspace.css'
import '../styles/tools.css'

type ActiveTool = 'select' | 'point' | 'line' | 'plane' | 'circle'

export const MainLayout: React.FC = () => {
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

  // Lines are now managed by the project

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
    addImagePointToWorldPoint,
    createLine,
    updateLine,
    deleteLine
  } = legacyProject

  // Pure object-based selection
  const {
    selection,
    selectionSummary,
    handleEntityClick,
    clearSelection,
    selectAllByType,
    getSelectedByType,
    selectionStats
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

  // Convert legacy constraints to enhanced constraints
  const enhancedConstraints: EnhancedConstraint[] = constraints.map(constraint => ({
    id: constraint.id,
    type: constraint.type as GeometryConstraintType,
    name: constraint.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    description: undefined,
    entities: {
      points: constraint.entities?.points || [],
      lines: constraint.entities?.lines || [],
      planes: constraint.entities?.planes || [],
      circles: []
    },
    parameters: {},
    enabled: constraint.enabled,
    isDriving: constraint.isDriving,
    weight: constraint.weight,
    priority: 1,
    status: constraint.status,
    residual: constraint.residual,
    error: undefined,
    showGlyph: true,
    glyphPosition: undefined,
    color: undefined,
    createdAt: constraint.createdAt,
    updatedAt: undefined,
    createdBy: 'user',
    tags: undefined
  }))

  // Create visual language manager with minimal settings
  const visualManager = new VisualLanguageManager({
    showPointNames: true,
    showPointIds: false,
    showConstraintGlyphs: true,
    showMeasurements: true,
    showConstructionGeometry: true,
    theme: 'dark' as const,
    visualFeedbackLevel: 'standard' as const,
    entityColors: {} as any, // Minimal placeholder
    measurementUnits: 'meters' as const,
    precisionDigits: 3,
    anglePrecisionDigits: 1,
    defaultWorkspace: 'image' as const,
    autoSwitchWorkspace: true,
    enableSmartSnapping: true,
    snapTolerance: 5,
    constraintPreview: true,
    autoOptimize: false,
    solverMaxIterations: 100,
    solverTolerance: 1e-6,
    gridVisible: true,
    gridSize: 1,
    snapToGrid: false,
    showCoordinateAxes: true,
    showCameraPoses: true,
    maxVisibleEntities: 1000,
    levelOfDetail: true,
    renderQuality: 'medium' as const,
    autoSave: true,
    autoSaveInterval: 30,
    keepBackups: 5
  })

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

  // Get actual entity objects from selection
  const selectedLineEntities = getSelectedByType<LineEntity>('line')
  const selectedPointEntities = getSelectedByType<WorldPoint>('point')
  const selectedPlaneEntities = getSelectedByType('plane')

  // TODO: Remove this legacy function - use entity objects directly
  // TODO: Update constraint system to use entity objects
  // const allConstraints = getAllConstraints(selectedPointEntities.map(p => p.getId()), selectedLineEntities)
  // const availableConstraints = getAvailableConstraints(selectedPointEntities.map(p => p.getId()), selectedLineEntities)
  const allConstraints: AvailableConstraint[] = []
  const availableConstraints: AvailableConstraint[] = []

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

    // Normal selection behavior - need entity object, not ID
    // TODO: Get actual WorldPoint entity and call handleEntityClick
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
    // If not holding modifier keys, open edit window
    if (!ctrlKey && !shiftKey) {
      setEditLineState({ isOpen: true, lineId })
    } else {
      // Use constraint selection for multi-selection
      // TODO: Wire up line selection for constraints
    }
  }

  const handlePlaneClick = (planeId: string, ctrlKey: boolean, shiftKey: boolean) => {
    // TODO: Implement plane selection/editing
    console.log('Plane clicked:', planeId, { ctrlKey, shiftKey })
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
    () => {
      // TODO: Implement select all functionality with actual entity objects
      // For now, just clear selection as a safe fallback
      console.log('Select All not yet implemented - needs entity objects')
    },
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
            if (selectedPointEntities.map(p => p.getId()).length <= 2) { // Only activate if valid selection
              setActiveTool(activeTool === 'line' ? 'select' : 'line')
            }
            break
          // Add more shortcuts later for P (plane), C (circle), etc.
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [placementMode.active, activeTool, selectedPointEntities.map(p => p.getId()).length])

  // Content for different workspaces
  const renderImageWorkspace = () => (
    <div className="workspace-image-view">
      {currentImage ? (
        <div className="image-viewer-container">
          <ImageViewer
            ref={imageViewerRef}
            image={currentImage}
            worldPoints={worldPoints}
            lines={Object.fromEntries(
              Object.entries(project?.lines || {}).map(([id, line]) => [
                id,
                {
                  ...line,
                  geometry: line.type, // Convert 'type' to 'geometry' for ImageViewer
                  isConstruction: line.isConstruction ?? false,
                  createdAt: line.createdAt ?? new Date().toISOString()
                }
              ])
            )}
            selectedPoints={selectedPointEntities.map(p => p.getId())}
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
        selectedPoints={selectedPointEntities.map(p => p.getId())}
        selectedLines={selectedLineEntities.map(l => l.getId())}
        selectedPlanes={selectedPlaneEntities.map(p => p.getId())}
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
    <WorkspaceManager
      workspaceState={localWorkspaceState}
      onWorkspaceStateChange={(updates) =>
        setLocalWorkspaceState(prev => ({ ...prev, ...updates as any }))
      }
    >
      {(currentWorkspace, workspaceActions) => (
        <div className="app-layout enhanced-layout">
          {/* Enhanced top toolbar */}
          <div className="top-toolbar">
            <WorkspaceSwitcher
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
                  // Use first available line or create a test line entry
                  const lineIds = Object.keys(project?.lines || {})
                  const testLineId = lineIds.length > 0 ? lineIds[0] : 'test-line-123'
                  setEditLineState({ isOpen: true, lineId: testLineId })
                }}
              >
                🔥 TEST FLOAT
              </button>
            </div>

            {/* Context-sensitive constraint toolbar */}
            <ConstraintToolbar
              selectedPoints={selectedPointEntities.map(p => p.getId())}
              selectedLines={selectedLineEntities.map(l => ({
                id: l.getId(),
                name: l.name,
                pointA: l.pointA.getId(),
                pointB: l.pointB.getId(),
                type: 'segment' as const,
                isVisible: l.isVisible(),
                color: l.color,
                isConstruction: l.isConstruction
              }))}
              availableConstraints={allConstraints}
              selectionSummary="" // Remove redundant selection display
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
                selectedWorldPointIds={selectedPointEntities.map(p => p.getId())}
                isCreatingConstraint={!!activeConstraintType}
                onImageSelect={setCurrentImageId}
                onImageAdd={addImage}
                onImageRename={renameImage}
                onImageDelete={deleteImage}
                getImagePointCount={getImagePointCount}
                getSelectedPointsInImage={(imageId) => getSelectedPointsInImage(imageId, selectedPointEntities.map(p => p.getId()))}
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
                selectedPoints={selectedPointEntities.map(p => p.getId())}
                selectedLines={selectedLineEntities.map(l => l.getId())}
                selectedPlanes={selectedPlaneEntities.map(p => p.getId())}
                activeTool={activeTool}
                onToolChange={setActiveTool}
                worldPointNames={worldPointNames}
                existingLines={project?.lines || {}}
                onCreatePoint={(imageId: string, u: number, v: number) => handleImageClick(u, v)}
                onCreateLine={(pointIds, constraints) => {
                  try {
                    console.log('MainLayout: Creating line with points:', pointIds, 'constraints:', constraints)

                    // Enhanced line creation with constraints
                    const lineId = createLine(pointIds, 'segment')
                    console.log('MainLayout: createLine returned:', lineId)

                    if (lineId) {
                      console.log('MainLayout: Line created successfully with ID:', lineId)
                      if (constraints) {
                        // TODO: Apply line-local constraints
                        console.log('Line created with constraints:', lineId, constraints)
                      }
                      // Beep on successful creation
                      console.log('🔔 Line created successfully!')
                      // Sound notification for completed task
                      if (window.navigator.platform.startsWith('Win')) {
                        try {
                          // Use PowerShell beep for Windows
                          fetch('/api/beep', { method: 'POST' }).catch(() => {
                            // Fallback: browser beep
                            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
                            const oscillator = audioContext.createOscillator()
                            const gainNode = audioContext.createGain()
                            oscillator.connect(gainNode)
                            gainNode.connect(audioContext.destination)
                            oscillator.frequency.value = 800
                            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
                            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)
                            oscillator.start(audioContext.currentTime)
                            oscillator.stop(audioContext.currentTime + 0.2)
                          })
                        } catch (e) {
                          console.log('Could not play sound notification')
                        }
                      }
                    } else {
                      console.error('MainLayout: createLine failed - no line ID returned')
                      // Check if it's a duplicate line issue
                      const [pointA, pointB] = pointIds
                      const existingLine = Object.values(project?.lines || {}).find(line =>
                        (line.pointA === pointA && line.pointB === pointB) ||
                        (line.pointA === pointB && line.pointB === pointA)
                      )
                      if (existingLine) {
                        console.log(`⚠️ Line already exists: ${existingLine.name}`)
                        // TODO: Show user notification about existing line
                        // TODO: Optionally highlight the existing line
                      }
                    }
                  } catch (error) {
                    console.error('MainLayout: Error creating line:', error)
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
                currentImageId={currentImageId || undefined}
              />

              <ConstraintPropertyPanel
                activeConstraintType={activeConstraintType}
                selectedPoints={selectedPointEntities.map(p => p.getId())}
                selectedLines={selectedLineEntities.map(l => ({
                  id: l.getId(),
                  name: l.name,
                  pointA: l.pointA.getId(),
                  pointB: l.pointB.getId(),
                  type: 'segment' as const,
                  isVisible: l.isVisible(),
                  color: l.color,
                  isConstruction: l.isConstruction
                }))}
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
                selectedWorldPointIds={selectedPointEntities.map(p => p.getId())}
                currentImageId={currentImageId}
                placementMode={placementMode}
                onSelectWorldPoint={(pointId: string, ctrlKey: boolean, shiftKey: boolean) =>
                  handleEnhancedPointClick(pointId, ctrlKey, shiftKey)
                }
                onHighlightWorldPoint={() => {}}
                onRenameWorldPoint={renameWorldPoint}
                onDeleteWorldPoint={deleteWorldPoint}
                onStartPlacement={startPlacementMode}
                onCancelPlacement={cancelPlacementMode}
              />

              <ConstraintTimeline
                constraints={enhancedConstraints}
                hoveredConstraintId={hoveredConstraintId}
                onHover={setHoveredConstraintId}
                onEdit={(constraint) => {
                  // TODO: Implement constraint editing
                }}
                onDelete={deleteConstraint}
                onToggle={toggleConstraint}
                visualManager={visualManager}
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

            {/* Object counts */}
            <div style={{display: 'flex', gap: '12px', fontSize: '12px', color: '#888'}}>
              <span>World Points: {Object.keys(worldPoints || {}).length}</span>
              <span>Image Points: {Object.values(worldPoints || {}).reduce((total, wp) => total + wp.imagePoints.length, 0)}</span>
              <span>Lines: {Object.keys(project?.lines || {}).length}</span>
              <span>Planes: {Object.keys(project?.planes || {}).length}</span>
              <span>Constraints: {constraints.length}</span>
              {/* Enhanced selection stats */}
              {selection.count > 0 && (
                <span style={{ color: '#0696d7', fontWeight: 'bold' }}>
                  Selected: {selectionStats.point}p {selectionStats.line}l {selectionStats.plane}pl {selectionStats.constraint}c
                </span>
              )}
            </div>

            <span style={{marginLeft: 'auto', color: '#888'}}>v0.3-ENHANCED</span>
          </div>
        </div>
      )}
    </WorkspaceManager>

    {/* Edit Line Window - Truly free floating over entire viewport */}
    <EditLineWindow
      line={editLineState.lineId && project?.lines[editLineState.lineId] ? {
        ...project.lines[editLineState.lineId],
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

export default MainLayout