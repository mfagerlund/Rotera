// Main layout with new workspace paradigm

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFolderOpen, faFloppyDisk, faFileExport, faTrash, faRuler, faGear, faArrowRight, faCamera, faSquare, faBullseye } from '@fortawesome/free-solid-svg-icons'
import { Project } from '../entities/project'
import { useEntityProject } from '../hooks/useEntityProject'
import { useDomainOperations } from '../hooks/useDomainOperations'
import { useSelection, useSelectionKeyboard } from '../hooks/useSelection'
import { useConstraints } from '../hooks/useConstraints'
import { useMainLayoutState } from '../hooks/useMainLayoutState'
import { useMainLayoutHandlers } from '../hooks/useMainLayoutHandlers'
import { useMainLayoutKeyboard } from '../hooks/useMainLayoutKeyboard'
import { AvailableConstraint } from '../types/ui-types'
import { ConstructionPreview } from './image-viewer/types'
import { Line as LineEntity } from '../entities/line'
import { WorldPoint } from '../entities/world-point'
import { Viewpoint } from '../entities/viewpoint'
import { Plane } from '../entities/plane'
import { VanishingLine } from '../entities/vanishing-line'
import type { ISelectable } from '../types/selectable'
import { COMPONENT_OVERLAY_EVENT, isComponentOverlayEnabled, setComponentOverlayEnabled } from '../utils/componentNameOverlay'
import { useConfirm } from './ConfirmDialog'
import { filterImageBlobs } from '../types/optimization-export'
import { getEntityKey } from '../utils/entityKeys'
import { generateWorldPointColor } from '../utils/colorGenerator'

// UI Components
import ConstraintToolbar from './ConstraintToolbar'
import ConstraintPropertyPanel from './ConstraintPropertyPanel'
import ImageNavigationToolbar from './ImageNavigationToolbar'
import type { ImageViewerRef } from './ImageViewer'
import type { WorldViewRef } from './WorldView'
import WorldPointPanel from './WorldPointPanel'
import LineCreationTool from './tools/LineCreationTool'
import FloatingWindow from './FloatingWindow'

// Enhanced workspace components
import { WorkspaceManager, WorkspaceStatus } from './WorkspaceManager'
import { MainToolbar } from './main-layout/MainToolbar'
import { ResizableSidebar } from './main-layout/ResizableSidebar'
import ImageWorkspace from './main-layout/ImageWorkspace'
import WorldWorkspace from './main-layout/WorldWorkspace'
import SplitWorkspace from './main-layout/SplitWorkspace'

// Creation Tools
import CreationToolsManager from './tools/CreationToolsManager'
import LinesManager from './LinesManager'
import PlanesManager from './PlanesManager'
import ImagePointsManager from './ImagePointsManager'
import ConstraintsManager from './ConstraintsManager'
import WorldPointEditor from './WorldPointEditor'
import { VanishingPointQualityWindow } from './VanishingPointQualityWindow'
import OptimizationPanel from './OptimizationPanel'
import { VisibilityPanel } from './VisibilityPanel'
import { ViewSettings, VisibilitySettings, LockSettings, DEFAULT_VIEW_SETTINGS } from '../types/visibility'
import { ToolContext, SELECT_TOOL_CONTEXT, LINE_TOOL_CONTEXT, VANISHING_LINE_TOOL_CONTEXT, LOOP_TOOL_CONTEXT } from '../types/tool-context'

// Styles
import '../styles/enhanced-workspace.css'
import '../styles/tools.css'

export const MainLayout: React.FC = observer(() => {
  // Entity-based project system (CLEAN - NO LEGACY)
  const {
    project,
    setProject,
    currentViewpoint,
    setCurrentViewpoint,
    isLoading,
    error,
    saveProject
  } = useEntityProject()

  // Domain operations
  const {
    createWorldPoint,
    renameWorldPoint,
    deleteWorldPoint,
    createLine,
    updateLine,
    deleteLine,
    deleteVanishingLine,
    addImage,
    renameImage,
    deleteImage,
    getImagePointCount,
    addImagePointToWorldPoint,
    moveImagePoint,
    getSelectedPointsInImage,
    copyPointsFromImageToImage,
    addConstraint,
    updateConstraint,
    deleteConstraint,
    toggleConstraint,
    clearProject,
    exportOptimizationDto
  } = useDomainOperations(project, setProject)

  // Confirm dialog
  const { confirm, dialog, isOpen: isConfirmDialogOpen } = useConfirm()

  // Main layout state (extracted to custom hook)
  const {
    activeTool,
    setActiveTool,
    placementMode,
    startPlacementMode,
    cancelPlacementMode,
    hoveredWorldPoint,
    setHoveredWorldPoint,
    leftSidebarWidth,
    setLeftSidebarWidth,
    imageHeights,
    handleImageHeightChange,
    imageSortOrder,
    handleImageReorder,
    editingLine,
    setEditingLine,
    entityPopups,
    setEntityPopup,
    worldPointEditWindow,
    openWorldPointEdit,
    closeWorldPointEdit,
    showVPQualityWindow,
    openVPQualityWindow,
    closeVPQualityWindow
  } = useMainLayoutState(Array.isArray(project?.imageSortOrder) ? project.imageSortOrder : undefined)

  // Construction preview state
  const [constructionPreview, setConstructionPreview] = useState<ConstructionPreview | null>(null)

  // Vanishing line state
  const [currentVanishingLineAxis, setCurrentVanishingLineAxis] = useState<'x' | 'y' | 'z'>('x')

  // Mouse position tracking
  const [mousePosition, setMousePosition] = useState<{ u: number; v: number } | null>(null)

  const handleVisibilityChange = useCallback((key: keyof VisibilitySettings, value: boolean) => {
    if (project) {
      project.viewSettings.visibility[key] = value
    }
  }, [project])

  const handleLockingChange = useCallback((key: keyof LockSettings, value: boolean) => {
    if (project) {
      project.viewSettings.locking[key] = value
    }
  }, [project])

  // Compute tool context based on active tools
  const toolContext = useMemo((): ToolContext => {
    if (activeTool === 'vanishing') return VANISHING_LINE_TOOL_CONTEXT
    if (activeTool === 'loop') return LOOP_TOOL_CONTEXT
    if (activeTool === 'point') return LINE_TOOL_CONTEXT
    return SELECT_TOOL_CONTEXT
  }, [activeTool])

  // Open VP quality window when vanishing tool is activated
  useEffect(() => {
    if (activeTool === 'vanishing') {
      openVPQualityWindow()
    }
  }, [activeTool, openVPQualityWindow])

  // Derived data from project (convert Sets to Maps for lookup)
  // No useMemo - just rebuild on every render (fast enough for typical dataset sizes)
  const currentImage = currentViewpoint
  const worldPointsMap = new Map<string, WorldPoint>()
  if (project?.worldPoints) {
    for (const wp of project.worldPoints) {
      worldPointsMap.set(getEntityKey(wp), wp)
    }
  }

  const linesMap = new Map<string, LineEntity>()
  if (project?.lines) {
    for (const line of project.lines) {
      linesMap.set(getEntityKey(line), line)
    }
  }

  const viewpointsMap = new Map<string, Viewpoint>()
  if (project?.viewpoints) {
    for (const vp of project.viewpoints) {
      viewpointsMap.set(getEntityKey(vp), vp)
    }
  }

  const constraints = Array.from(project?.constraints || [])

  // Arrays for components that need them
  const worldPointsArray = Array.from(worldPointsMap.values())
  const linesArray = Array.from(linesMap.values())
  const viewpointsArray = Array.from(viewpointsMap.values())

  // Pure object-based selection
  const {
    selection,
    selectionSummary,
    handleEntityClick,
    addToSelection,
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
    constraints as any, // Entity constraints -> legacy constraints bridge
    addConstraint,
    updateConstraint,
    deleteConstraint,
    toggleConstraint
  )

  // Component overlay state
  const [showComponentNames, setShowComponentNames] = useState(() => isComponentOverlayEnabled())

  useEffect(() => {
    if (typeof window === 'undefined') return

    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<{ enabled: boolean }>
      if (typeof customEvent.detail?.enabled === 'boolean') {
        setShowComponentNames(customEvent.detail.enabled)
      }
    }

    window.addEventListener(COMPONENT_OVERLAY_EVENT, listener)
    return () => window.removeEventListener(COMPONENT_OVERLAY_EVENT, listener)
  }, [])

  const handleComponentOverlayToggle = useCallback(() => {
    const nextValue = !showComponentNames
    setShowComponentNames(nextValue)
    setComponentOverlayEnabled(nextValue)
  }, [showComponentNames])

  // Refs for viewer components
  const imageViewerRef = useRef<ImageViewerRef>(null)
  const worldViewRef = useRef<WorldViewRef>(null)

  // Workspace state (using enhanced project when ready, fallback to local state)
  const [localWorkspaceState, setLocalWorkspaceState] = useState({
    currentWorkspace: 'image' as 'image' | 'world' | 'split',
    imageWorkspace: {
      currentViewpoint: currentViewpoint,
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
        currentViewpoint: currentViewpoint
      }
    }))
  }, [currentViewpoint])

  // Get actual entity objects from selection
  const selectedLineEntities = getSelectedByType<LineEntity>('line')
  const selectedPointEntities = getSelectedByType<WorldPoint>('point')
  const selectedPlaneEntities = getSelectedByType('plane')
  const selectedVanishingLineEntities = getSelectedByType<VanishingLine>('vanishingLine')

  // Combined selected entities for components that accept ISelectable[]
  const selectedEntities = [...selectedPointEntities, ...selectedLineEntities, ...selectedPlaneEntities, ...selectedVanishingLineEntities] as ISelectable[]



  // Constraint system uses entity objects directly (intrinsic + extrinsic)
  const allConstraints: AvailableConstraint[] = []
  const availableConstraints: AvailableConstraint[] = []

  // Line edit handlers (must be defined before useMainLayoutHandlers)
  const handleEditLineOpen = useCallback((line: LineEntity) => {
    setEditingLine(line)
    setActiveTool('line')
  }, [setEditingLine, setActiveTool])

  const handleEditLineClose = useCallback(() => {
    setEditingLine(null)
    setActiveTool('select')
  }, [setEditingLine, setActiveTool])

  const handleEditLineSave = useCallback((lineEntity: LineEntity, updatedLine: { name?: string; color?: string; isVisible?: boolean }) => {
    updateLine(lineEntity, updatedLine)
    setEditingLine(null)
    setActiveTool('select')
  }, [updateLine, setEditingLine, setActiveTool])

  const handleEditLineDelete = useCallback((line: LineEntity) => {
    deleteLine(line)
    setEditingLine(null)
    setActiveTool('select')
  }, [deleteLine, setEditingLine, setActiveTool])

  // World point edit handlers
  const handleWorldPointUpdate = useCallback((updatedPoint: WorldPoint) => {
    if (updatedPoint.getName() !== updatedPoint.getName()) {
      renameWorldPoint(updatedPoint, updatedPoint.getName())
    }
  }, [renameWorldPoint])

  // Event handlers (extracted to custom hook)
  const { handleEnhancedPointClick, handleEnhancedLineClick, handlePlaneClick, handleEmptySpaceClick } = useMainLayoutHandlers({
    activeTool,
    setActiveTool,
    selectedPointEntities,
    addToSelection,
    handleEntityClick,
    clearSelection,
    editingLine,
    setEditingLine
  })

  // Vanishing line click handler
  const handleVanishingLineClick = useCallback((vanishingLine: VanishingLine, ctrlKey: boolean, shiftKey: boolean) => {
    handleEntityClick(vanishingLine, ctrlKey, shiftKey)
    openVPQualityWindow()
  }, [handleEntityClick, openVPQualityWindow])

  const handleImageClick = useCallback((u: number, v: number) => {
    if (!project) return

    if (placementMode.active && placementMode.worldPoint && currentImage) {
      addImagePointToWorldPoint(placementMode.worldPoint, currentImage, u, v)
      cancelPlacementMode()
    } else if (activeTool === 'point' && currentImage) {
      const wpCount = worldPointsArray.length + 1
      const color = generateWorldPointColor(worldPointsArray.length)
      const newWp = WorldPoint.create(`WP${wpCount}`, { color, lockedXyz: [null, null, null] })
      project.addWorldPoint(newWp)
      addImagePointToWorldPoint(newWp, currentImage, u, v)
      setActiveTool('select')
    } else if (activeTool === 'loop' && currentImage) {
      const wpCount = worldPointsArray.length + 1
      const color = generateWorldPointColor(worldPointsArray.length)
      const newWp = WorldPoint.create(`WP${wpCount}`, { color, lockedXyz: [null, null, null] })
      project.addWorldPoint(newWp)
      addImagePointToWorldPoint(newWp, currentImage, u, v)
      addToSelection(newWp)
    }
  }, [placementMode, currentImage, activeTool, project, worldPointsArray, addImagePointToWorldPoint, cancelPlacementMode, setActiveTool, addToSelection])

  const handleMovePoint = useCallback((worldPoint: WorldPoint, u: number, v: number) => {
    if (currentImage) {
      const imagePoint = currentImage.getImagePointsForWorldPoint(worldPoint)[0]
      if (imagePoint) {
        moveImagePoint(imagePoint as any, u, v)
      }
    }
  }, [currentImage, moveImagePoint])

  const handleCreateVanishingLine = useCallback((p1: { u: number; v: number }, p2: { u: number; v: number }) => {
    if (currentViewpoint) {
      VanishingLine.create(currentViewpoint, currentVanishingLineAxis, p1, p2)
      setActiveTool('select')
    }
  }, [currentViewpoint, currentVanishingLineAxis, setActiveTool])

  const handleRequestAddImage = useCallback(() => {
    // TODO: Trigger image add dialog when project update flow lands
  }, [])

  const handleMousePositionChange = useCallback((position: { u: number; v: number } | null) => {
    setMousePosition(position)
  }, [])

  // Workspace data for status display
  const imageInfo = {
    currentImage: currentImage?.name,
    totalImages: project?.viewpoints.size || 0,
    pointsInCurrentImage: currentImage ? getImagePointCount(currentImage) : 0
  }

  const worldInfo = {
    totalPoints: project?.worldPoints.size || 0,
    totalConstraints: project?.constraints.size || 0,
    optimizationStatus: 'idle' // TODO: Get from actual optimization state
  }

  // Keyboard shortcuts
  useSelectionKeyboard(
    () => {
      // TODO: Implement select all functionality with actual entity objects
    },
    clearSelection,
    () => {} // Delete handler
  )

  // Keyboard shortcuts (extracted to custom hook)
  useMainLayoutKeyboard({
    isConfirmDialogOpen,
    placementMode,
    cancelPlacementMode,
    activeTool,
    setActiveTool,
    selectedPointEntities,
    selectedLineEntities,
    selectedPlaneEntities,
    selectedVanishingLineEntities,
    getSelectedByType: getSelectedByType as any,
    confirm,
    deleteConstraint,
    deleteLine,
    deleteWorldPoint,
    deleteVanishingLine,
    clearSelection,
    setEditingLine,
    currentVanishingLineAxis,
    setCurrentVanishingLineAxis
  })

  // Content for different workspaces
  const renderImageWorkspace = useCallback(() => (
    <ImageWorkspace
      image={currentImage || null}
      imageViewerRef={imageViewerRef}
      worldPoints={worldPointsMap}
      lines={linesMap}
      selectedPoints={selectedPointEntities}
      selectedLines={selectedLineEntities}
      hoveredConstraintId={hoveredConstraintId}
      hoveredWorldPoint={hoveredWorldPoint}
      placementMode={placementMode}
      activeConstraintType={activeConstraintType}
      constructionPreview={constructionPreview}
      isPointCreationActive={activeTool === 'point'}
      isLoopTraceActive={activeTool === 'loop'}
      isVanishingLineActive={activeTool === 'vanishing'}
      currentVanishingLineAxis={currentVanishingLineAxis}
      onCreateVanishingLine={handleCreateVanishingLine}
      onPointClick={handleEnhancedPointClick}
      onLineClick={handleEnhancedLineClick}
      onVanishingLineClick={handleVanishingLineClick}
      selectedVanishingLines={selectedVanishingLineEntities}
      onCreatePoint={handleImageClick}
      onMovePoint={handleMovePoint}
      onPointHover={setHoveredWorldPoint}
      onPointRightClick={openWorldPointEdit}
      visibility={project?.viewSettings.visibility || DEFAULT_VIEW_SETTINGS.visibility}
      locking={project?.viewSettings.locking || DEFAULT_VIEW_SETTINGS.locking}
      toolContext={toolContext}
      onLineRightClick={handleEditLineOpen}
      onEmptySpaceClick={handleEmptySpaceClick}
      onRequestAddImage={handleRequestAddImage}
      onMousePositionChange={handleMousePositionChange}
    />
  ), [
    activeConstraintType,
    constructionPreview,
    currentImage,
    activeTool,
    handleEnhancedLineClick,
    handleEnhancedPointClick,
    handleImageClick,
    handleMovePoint,
    openWorldPointEdit,
    handleEditLineOpen,
    handleEmptySpaceClick,
    placementMode,
    selectedLineEntities,
    selectedPointEntities,
    setHoveredWorldPoint,
    hoveredConstraintId,
    hoveredWorldPoint,
    linesMap,
    worldPointsArray,
    linesArray,
    handleRequestAddImage,
    handleVanishingLineClick,
    selectedVanishingLineEntities,
    handleCreateVanishingLine,
    currentVanishingLineAxis,
    project,
    toolContext,
    handleMousePositionChange
  ])

  const renderWorldWorkspace = useCallback(() => {
    if (!project) {
      return null
    }

    return (
      <WorldWorkspace
        project={project}
        worldViewRef={worldViewRef}
        selectedEntities={selectedEntities}
        hoveredConstraintId={hoveredConstraintId}
        onPointClick={handleEnhancedPointClick}
        onLineClick={handleEnhancedLineClick}
        onPlaneClick={handlePlaneClick}
      />
    )
  }, [
    handleEnhancedLineClick,
    handleEnhancedPointClick,
    handlePlaneClick,
    hoveredConstraintId,
    project,
    selectedEntities
  ])

  const handleSplitRatioChange = useCallback((ratio: number) => {
    setLocalWorkspaceState(prev => ({
      ...prev,
      splitWorkspace: { ...prev.splitWorkspace, splitRatio: ratio }
    }))
  }, [])

  const renderSplitWorkspace = useCallback(() => (
    <SplitWorkspace
      splitState={localWorkspaceState.splitWorkspace}
      onSplitRatioChange={handleSplitRatioChange}
      imageContent={renderImageWorkspace()}
      worldContent={renderWorldWorkspace()}
    />
  ), [handleSplitRatioChange, localWorkspaceState.splitWorkspace, renderImageWorkspace, renderWorldWorkspace])


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
    {dialog}
    <WorkspaceManager
      workspaceState={localWorkspaceState}
      onWorkspaceStateChange={(updates) =>
        setLocalWorkspaceState(prev => ({ ...prev, ...updates as any }))
      }
    >
      {(currentWorkspace, workspaceActions) => (
        <div className="app-layout enhanced-layout">
          {/* Enhanced top toolbar */}
          <MainToolbar
            currentWorkspace={currentWorkspace}
            onWorkspaceChange={workspaceActions.setWorkspace}
            imageHasContent={imageInfo.totalImages > 0}
            worldHasContent={worldInfo.totalPoints > 0}
            project={project as any}
            onExportOptimization={exportOptimizationDto}
            onClearProject={clearProject}
            selectedPoints={selectedPointEntities}
            selectedLines={selectedLineEntities}
            allConstraints={allConstraints}
            onConstraintClick={() => {/* TODO: Implement constraint creation */}}
            showPointNames={project!.showPointNames}
            onTogglePointNames={() => {/* TODO: Update project settings */}}
            showComponentOverlay={showComponentNames}
            onToggleComponentOverlay={handleComponentOverlayToggle}
            visualFeedbackLevel={project!.visualFeedbackLevel || 'standard'}
            onVisualFeedbackChange={() => {/* TODO: Update visual feedback */}}
            confirm={confirm}
          />

          {/* Main content area */}
          <div className="content-area">
            {/* Left sidebar: Image Navigation */}
            <ResizableSidebar
              width={leftSidebarWidth}
              onWidthChange={setLeftSidebarWidth}
              side="left"
              persistKey="pictorigo-left-sidebar-width"
            >
              <ImageNavigationToolbar
                images={viewpointsArray}
                currentViewpoint={currentViewpoint}
                worldPoints={worldPointsArray}
                selectedWorldPoints={selectedPointEntities}
                hoveredWorldPoint={hoveredWorldPoint}
                isCreatingConstraint={!!activeConstraintType}
                onImageSelect={(viewpoint) => setCurrentViewpoint(viewpoint)}
                onImageAdd={addImage}
                onImageRename={renameImage}
                onImageDelete={(viewpoint) => {
                  const wasCurrentViewpoint = viewpoint === currentViewpoint
                  deleteImage(viewpoint)

                  if (wasCurrentViewpoint && project) {
                    const remainingViewpoints = Array.from(project.viewpoints)
                    if (remainingViewpoints.length > 0) {
                      setCurrentViewpoint(remainingViewpoints[0])
                    } else {
                      setCurrentViewpoint(null)
                    }
                  }
                }}
                getImagePointCount={getImagePointCount}
                getSelectedPointsInImage={(viewpoint) => getSelectedPointsInImage(viewpoint).length}
                imageHeights={imageHeights}
                onImageHeightChange={handleImageHeightChange}
                imageSortOrder={imageSortOrder}
                onImageReorder={handleImageReorder}
                onWorldPointHover={setHoveredWorldPoint}
                onWorldPointClick={handleEnhancedPointClick}
                onCopyPointsToCurrentImage={(sourceViewpoint) => {
                  if (currentImage) {
                    copyPointsFromImageToImage(sourceViewpoint, currentImage)
                  }
                }}
              />
            </ResizableSidebar>

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
                selectedEntities={selectedEntities}
                activeTool={activeTool}
                onToolChange={setActiveTool}
                allWorldPoints={worldPointsArray}
                existingLines={linesMap}
                onCreatePoint={(imageId: string, u: number, v: number) => handleImageClick(u, v)}
                onCreateLine={(pointA, pointB, lineConstraints) => {
                  try {
                    // Enhanced line creation with constraints
                    const lineEntity = createLine(
                      pointA,
                      pointB,
                      {
                        name: lineConstraints?.name,
                        color: lineConstraints?.color,
                        isConstruction: lineConstraints?.isConstruction,
                        direction: lineConstraints?.direction,
                        targetLength: lineConstraints?.targetLength,
                        tolerance: lineConstraints?.tolerance
                      }
                    )

                    if (lineEntity) {
                      // Clear construction preview
                      setConstructionPreview(null)
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
                          // Silently fail
                        }
                      }
                    }
                  } catch (error) {
                    // Silently fail
                  }
                }}
                onCreateConstraint={addConstraint}
                onCreatePlane={(definition) => {
                  // TODO: Implement plane creation
                }}
                onCreateCircle={(definition) => {
                  // TODO: Implement circle creation
                }}
                onConstructionPreviewChange={setConstructionPreview}
                onClearSelection={clearSelection}
                currentViewpoint={currentViewpoint || undefined}
                editingLine={editingLine}
                onUpdateLine={handleEditLineSave}
                onDeleteLine={handleEditLineDelete}
                onClearEditingLine={() => setEditingLine(null)}
                projectConstraints={constraints}
                currentVanishingLineAxis={currentVanishingLineAxis}
                onVanishingLineAxisChange={setCurrentVanishingLineAxis}
              />

              <ConstraintPropertyPanel
                activeConstraintType={activeConstraintType}
                selectedPoints={selectedPointEntities}
                selectedLines={selectedLineEntities}
                parameters={constraintParameters}
                isComplete={isConstraintComplete()}
                allWorldPoints={worldPointsArray}
                onParameterChange={updateParameter}
                onApply={applyConstraint}
                onCancel={cancelConstraintCreation}
              />

              <WorldPointPanel
                worldPoints={worldPointsMap}
                viewpoints={viewpointsMap}
                constraints={constraints as any}
                selectedWorldPoints={selectedPointEntities}
                hoveredWorldPoint={hoveredWorldPoint}
                currentImageId={currentViewpoint ? getEntityKey(currentViewpoint) : null}
                placementMode={placementMode}
                onSelectWorldPoint={(worldPoint: WorldPoint, ctrlKey: boolean, shiftKey: boolean) => {
                  handleEntityClick(worldPoint, ctrlKey, shiftKey)
                }}
                onHighlightWorldPoint={setHoveredWorldPoint}
                onHoverWorldPoint={setHoveredWorldPoint}
                onRenameWorldPoint={renameWorldPoint}
                onDeleteWorldPoint={deleteWorldPoint}
                onEditWorldPoint={openWorldPointEdit}
                onStartPlacement={startPlacementMode}
                onCancelPlacement={cancelPlacementMode}
              />

              {/* Entity Management Buttons */}
              <div className="entity-management-panel" style={{ padding: '4px', marginTop: '8px' }}>
                <div className="entity-buttons" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <button
                    className="entity-button"
                    onClick={() => setEntityPopup('showLinesPopup', true)}
                    title="Manage lines"
                    style={{ padding: '2px 6px', fontSize: '11px', minHeight: 'auto' }}
                  >
                    <span className="button-icon" style={{ fontSize: '10px' }}><FontAwesomeIcon icon={faRuler} /></span>
                    <span className="button-label">Lines</span>
                    <span className="button-count">{project?.lines.size || 0}</span>
                  </button>

                  <button
                    className="entity-button"
                    onClick={() => setEntityPopup('showPlanesPopup', true)}
                    title="Manage planes"
                    style={{ padding: '2px 6px', fontSize: '11px', minHeight: 'auto' }}
                  >
                    <span className="button-icon" style={{ fontSize: '10px' }}><FontAwesomeIcon icon={faSquare} /></span>
                    <span className="button-label">Planes</span>
                    <span className="button-count">{0}</span>
                  </button>

                  <button
                    className="entity-button"
                    onClick={() => setEntityPopup('showImagePointsPopup', true)}
                    title="Manage image points"
                    style={{ padding: '2px 6px', fontSize: '11px', minHeight: 'auto' }}
                  >
                    <span className="button-icon" style={{ fontSize: '10px' }}><FontAwesomeIcon icon={faCamera} /></span>
                    <span className="button-label">IPs</span>
                    <span className="button-count">{Array.from(project?.viewpoints || []).reduce((total, vp) => total + vp.imagePoints.size, 0)}</span>
                  </button>

                  <button
                    className="entity-button"
                    onClick={() => setEntityPopup('showConstraintsPopup', true)}
                    title="Manage constraints"
                    style={{ padding: '2px 6px', fontSize: '11px', minHeight: 'auto' }}
                  >
                    <span className="button-icon" style={{ fontSize: '10px' }}><FontAwesomeIcon icon={faGear} /></span>
                    <span className="button-count">{project?.constraints.size || 0}</span>
                  </button>

                  <button
                    className="entity-button"
                    onClick={() => setEntityPopup('showOptimizationPanel', true)}
                    title="Bundle adjustment optimization"
                    style={{ padding: '2px 6px', fontSize: '11px', minHeight: 'auto' }}
                  >
                    <span className="button-icon" style={{ fontSize: '10px' }}><FontAwesomeIcon icon={faBullseye} /></span>
                    <span className="button-label">Optimize</span>
                  </button>
                </div>
              </div>
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
              <span>World Points: {project?.worldPoints.size || 0}</span>
              <span>Image Points: {Array.from(project?.viewpoints || []).reduce((total, vp) => total + vp.imagePoints.size, 0)}</span>
              <span>Lines: {project?.lines.size || 0}</span>
              <span>Planes: {0}</span>
              <span>Constraints: {project?.constraints.size || 0}</span>
              {/* Mouse position */}
              {mousePosition && (
                <span style={{ color: '#4a9eff', fontWeight: 'bold' }}>
                  Mouse: ({mousePosition.u.toFixed(1)}, {mousePosition.v.toFixed(1)})
                </span>
              )}
              {/* Enhanced selection stats */}
              {selection.count > 0 && (
                <span style={{ color: '#0696d7', fontWeight: 'bold' }}>
                  Selected: {selectionStats.point}p {selectionStats.line}l {selectionStats.plane}pl {selectionStats.constraint}c
                </span>
              )}
            </div>

            <button
              type="button"
              className="status-bar__toggle"
              data-active={showComponentNames}
              aria-pressed={showComponentNames}
              onClick={handleComponentOverlayToggle}
              title="Toggle component label overlay"
            >
              <span className="status-bar__toggle-indicator" aria-hidden="true" />
              <span className="status-bar__toggle-label">Component labels</span>
              <span className="status-bar__toggle-state">{showComponentNames ? 'ON' : 'OFF'}</span>
            </button>

            {/* Worktree Identifier Badge */}
            <div style={{
              marginLeft: '12px',
              padding: '4px 12px',
              backgroundColor: __WORKTREE_NAME__ === 'main' ? '#1a4d2e' : '#8b4513',
              color: '#fff',
              borderRadius: '4px',
              fontWeight: 'bold',
              fontSize: '13px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              border: '2px solid ' + (__WORKTREE_NAME__ === 'main' ? '#2d7a4d' : '#d2691e')
            }}>
              {__WORKTREE_NAME__ === 'main' ? __WORKTREE_NAME__ : __WORKTREE_NAME__.replace('Pictorigo-', '')}
            </div>

            <span style={{ marginLeft: '12px', color: '#888' }}>v0.4-ENHANCED</span>

            {/* Visibility Panel - integrated into footer */}
            {project && (
              <VisibilityPanel
                viewSettings={project.viewSettings}
                onVisibilityChange={handleVisibilityChange}
                onLockingChange={handleLockingChange}
              />
            )}
          </div>
        </div>
      )}
    </WorkspaceManager>

    {/* Edit Line Window removed - now integrated into CreationToolsManager */}

    {/* Entity Management Popups */}
    <LinesManager
      isOpen={entityPopups.showLinesPopup}
      onClose={() => setEntityPopup('showLinesPopup', false)}
      lines={linesMap}
      allWorldPoints={worldPointsArray}
      selectedLines={selectedLineEntities}
      onEditLine={(line) => {
        handleEditLineOpen(line)
        setEntityPopup('showLinesPopup', false)
      }}
      onDeleteLine={(line) => deleteLine(line)}
      onDeleteAllLines={() => {
        Array.from(project?.lines || []).forEach(line => deleteLine(line))
      }}
      onUpdateLine={(updatedLine) => {
        // Line is already updated via MobX, just trigger save
        saveProject()
      }}
      onToggleLineVisibility={(line) => {
        // TODO: Implement line visibility toggle
      }}
      onSelectLine={(line) => handleEntityClick(line, false, false)}
      onCreateLine={(pointA, pointB, lineConstraints) => {
        createLine(pointA, pointB, lineConstraints)
      }}
    />

    <PlanesManager
      isOpen={entityPopups.showPlanesPopup}
      onClose={() => setEntityPopup('showPlanesPopup', false)}
      planes={{}}
      allWorldPoints={worldPointsArray}
      selectedPlanes={selectedPlaneEntities}
      onEditPlane={(plane) => {
        // TODO: Implement plane editing
      }}
      onDeletePlane={(plane) => {
        // TODO: Implement plane deletion
      }}
      onTogglePlaneVisibility={(plane) => {
        // TODO: Implement plane visibility toggle
      }}
      onSelectPlane={(plane) => {
        // TODO: Implement plane selection
      }}
    />

    <ImagePointsManager
      isOpen={entityPopups.showImagePointsPopup}
      onClose={() => setEntityPopup('showImagePointsPopup', false)}
      worldPoints={worldPointsMap}
      images={viewpointsMap}
      onEditImagePoint={(imagePointId) => {
        // TODO: Implement image point editing
      }}
      onDeleteImagePoint={(imagePointId) => {
        // TODO: Implement image point deletion
      }}
      onSelectImagePoint={(imagePointId) => {
        // TODO: Implement image point selection
      }}
    />

    <ConstraintsManager
      isOpen={entityPopups.showConstraintsPopup}
      onClose={() => setEntityPopup('showConstraintsPopup', false)}
      constraints={constraints as any}
      allWorldPoints={worldPointsArray}
      allLines={linesArray}
      onEditConstraint={(constraint) => {
        // TODO: Implement constraint editing
      }}
      onDeleteConstraint={(constraint) => deleteConstraint(constraint)}
      onToggleConstraint={(constraint) => toggleConstraint(constraint)}
      onSelectConstraint={(constraint) => {
        // TODO: Implement constraint selection
      }}
    />

    {/* Optimization Panel */}
    {entityPopups.showOptimizationPanel && (
      <FloatingWindow
        title="Bundle Adjustment Optimization"
        isOpen={entityPopups.showOptimizationPanel}
        onClose={() => setEntityPopup('showOptimizationPanel', false)}
        width={500}
        height={600}
      >
        {project && (
          <OptimizationPanel
            project={project}
            onOptimizationComplete={(success, message) => {
              console.log(`Optimization ${success ? 'succeeded' : 'failed'}: ${message}`)
              saveProject()
            }}
          />
        )}
      </FloatingWindow>
    )}

    {/* World Point Edit Window */}
    {worldPointEditWindow.worldPoint && (
      <WorldPointEditor
        isOpen={worldPointEditWindow.isOpen}
        onClose={closeWorldPointEdit}
        worldPoint={worldPointEditWindow.worldPoint}
        onUpdateWorldPoint={handleWorldPointUpdate}
        onDeleteWorldPoint={(worldPoint) => {
          deleteWorldPoint(worldPoint)
          closeWorldPointEdit()
        }}
        images={viewpointsMap}
      />
    )}

    {/* Vanishing Point Quality Window */}
    <VanishingPointQualityWindow
      isOpen={showVPQualityWindow}
      onClose={closeVPQualityWindow}
      currentViewpoint={currentViewpoint}
    />

    {dialog}
  </>
  )
})

export default MainLayout



