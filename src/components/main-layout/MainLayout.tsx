import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { useEntityProject } from '../../hooks/useEntityProject'
import { useDomainOperations } from '../../hooks/useDomainOperations'
import { useSelection, useSelectionKeyboard } from '../../hooks/useSelection'
import { useConstraints } from '../../hooks/useConstraints'
import { useMainLayoutState } from '../../hooks/useMainLayoutState'
import { useMainLayoutHandlers } from '../../hooks/useMainLayoutHandlers'
import { useMainLayoutKeyboard } from '../../hooks/useMainLayoutKeyboard'
import { useLayoutState } from './hooks/useLayoutState'
import { useBottomPanelHandlers } from './hooks/useBottomPanelHandlers'
import { usePanelHandlers } from './hooks/usePanelHandlers'
import { ConstructionPreview } from '../image-viewer/types'
import { Line as LineEntity, LineDirection } from '../../entities/line'
import { WorldPoint } from '../../entities/world-point'
import { VanishingLine } from '../../entities/vanishing-line'
import { Plane } from '../../entities/plane'
import type { Constraint } from '../../entities/constraints'
import { CoplanarPointsConstraint } from '../../entities/constraints/coplanar-points-constraint'
import type { ISelectable } from '../../types/selectable'
import { COMPONENT_OVERLAY_EVENT, isComponentOverlayEnabled, setComponentOverlayEnabled } from '../../utils/componentNameOverlay'
import { useConfirm } from '../ConfirmDialog'
import { getEntityKey } from '../../utils/entityKeys'
import { generateWorldPointColor, getNextWorldPointNumber } from '../../utils/colorGenerator'
import type { ImageViewerRef } from '../ImageViewer'
import type { WorldViewRef } from '../WorldView'
import { WorkspaceManager, WorkspaceStatus } from '../WorkspaceManager'
import { MainToolbar } from './MainToolbar'
import ImageWorkspace from './ImageWorkspace'
import WorldWorkspace from './WorldWorkspace'
import SplitWorkspace from './SplitWorkspace'
import { LeftPanel, LeftPanelRef } from './LeftPanel'
import { RightPanel } from './RightPanel'
import { BottomPanel } from './BottomPanel'
import { StatusBar } from './StatusBar'
import { VisibilitySettings, LockSettings, DEFAULT_VIEW_SETTINGS } from '../../types/visibility'
import { ToolContext, SELECT_TOOL_CONTEXT, LINE_TOOL_CONTEXT, VANISHING_LINE_TOOL_CONTEXT, LOOP_TOOL_CONTEXT } from '../../types/tool-context'
import { ProjectDB } from '../../services/project-db'
import { getIsDirty, markClean, markDirty } from '../../store/project-store'
import { reaction } from 'mobx'
import { Serialization } from '../../entities/Serialization'
// Auto-save removed - user wants explicit saves only

import '../../styles/enhanced-workspace.css'
import '../../styles/tools.css'

interface MainLayoutProps {
  onReturnToBrowser?: () => void
}

export const MainLayout: React.FC<MainLayoutProps> = observer(({ onReturnToBrowser }) => {
  const {
    project,
    setProject,
    currentViewpoint,
    setCurrentViewpoint,
    isLoading,
    error,
    saveProject
  } = useEntityProject()

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
    deleteImagePointFromViewpoint,
    getSelectedPointsInImage,
    copyPointsFromImageToImage,
    addConstraint,
    deleteConstraint,
    clearProject,
    removeDuplicateImagePoints
  } = useDomainOperations(project, setProject)

  // Constraint update function - constraints are MobX observables, so we just mutate them
  const updateConstraint = useCallback((constraint: Constraint, updates: { name?: string; parameters?: Record<string, unknown> }) => {
    if (updates.name !== undefined) {
      constraint.name = updates.name
    }
    if (updates.parameters !== undefined) {
      // Constraints don't have a generic parameters field - this is a legacy interface
      // In practice, we update specific constraint properties directly
    }
  }, [])

  // Dirty state tracking
  const [isDirty, setIsDirtyState] = useState(false)

  // Check dirty state periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setIsDirtyState(getIsDirty())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const handleSaveProject = useCallback(async () => {
    if (!project) return
    try {
      await ProjectDB.saveProject(project)
      markClean()
      setIsDirtyState(false)
      console.log('Project saved to IndexedDB')
    } catch (error) {
      console.error('Failed to save project:', error)
      alert('Failed to save project: ' + (error as Error).message)
    }
  }, [project])

  const handleSaveAsProject = useCallback(async (newName: string) => {
    if (!project) return
    try {
      // Get the current project's DB ID
      const currentDbId = (project as unknown as { _dbId?: string })._dbId
      if (!currentDbId) {
        // If the current project hasn't been saved yet, save it first
        await ProjectDB.saveProject(project)
      }
      const dbId = (project as unknown as { _dbId: string })._dbId
      // Copy the project with the new name
      const newId = await ProjectDB.copyProject(dbId, newName)
      // Load the new project
      const newProject = await ProjectDB.loadProject(newId)
      // Use setProject to update both global store AND trigger re-render
      setProject(newProject)
      markClean()
      setIsDirtyState(false)
      console.log('Project saved as:', newName)
    } catch (error) {
      console.error('Failed to save project as:', error)
      alert('Failed to save project as: ' + (error as Error).message)
    }
  }, [project, setProject])

  const { confirm, dialog, isOpen: isConfirmDialogOpen } = useConfirm()

  const handleOpenWorldPointEdit = useCallback(() => {
    project?.propagateInferences()
  }, [project])

  const {
    activeTool,
    setActiveTool,
    placementMode,
    startPlacementMode,
    cancelPlacementMode,
    hoveredWorldPoint,
    setHoveredWorldPoint,
    hoveredCoplanarConstraint,
    setHoveredCoplanarConstraint,
    leftSidebarWidth,
    setLeftSidebarWidth,
    imageHeights,
    handleImageHeightChange,
    imageSortOrder,
    handleImageReorder,
    editingLine,
    setEditingLine,
    editingCoplanarConstraint,
    setEditingCoplanarConstraint,
    entityPopups,
    setEntityPopup,
    optimizeTrigger,
    triggerOptimization,
    worldPointEditWindow,
    openWorldPointEdit,
    closeWorldPointEdit,
    showVPQualityWindow,
    openVPQualityWindow,
    closeVPQualityWindow
  } = useMainLayoutState({
    projectImageSortOrder: Array.isArray(project?.imageSortOrder) ? project.imageSortOrder : undefined,
    onOpenWorldPointEdit: handleOpenWorldPointEdit
  })

  const [constructionPreview, setConstructionPreview] = useState<ConstructionPreview | null>(null)
  const [currentVanishingLineAxis, setCurrentVanishingLineAxis] = useState<'x' | 'y' | 'z'>('x')
  const [orientationPaintDirection, setOrientationPaintDirection] = useState<LineDirection>('free')
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

  const toolContext = useMemo((): ToolContext => {
    if (activeTool === 'vanishing') return VANISHING_LINE_TOOL_CONTEXT
    if (activeTool === 'loop') return LOOP_TOOL_CONTEXT
    if (activeTool === 'point') return LINE_TOOL_CONTEXT
    return SELECT_TOOL_CONTEXT
  }, [activeTool])

  useEffect(() => {
    if (activeTool === 'vanishing') {
      openVPQualityWindow()
    }
  }, [activeTool, openVPQualityWindow])

  useEffect(() => {
    if (project) {
      (window as unknown as { removeDuplicateImagePoints?: typeof removeDuplicateImagePoints }).removeDuplicateImagePoints = removeDuplicateImagePoints
    }
    return () => {
      delete (window as unknown as { removeDuplicateImagePoints?: typeof removeDuplicateImagePoints }).removeDuplicateImagePoints
    }
  }, [project, removeDuplicateImagePoints])

  const currentImage = currentViewpoint
  const worldPointsMap = project?.worldPoints || new Set<WorldPoint>()

  const linesMap = new Map<string, LineEntity>()
  if (project?.lines) {
    for (const line of project.lines) {
      linesMap.set(getEntityKey(line), line)
    }
  }

  const viewpointsMap = new Map<string, import('../../entities/viewpoint').Viewpoint>()
  if (project?.viewpoints) {
    for (const vp of project.viewpoints) {
      viewpointsMap.set(getEntityKey(vp), vp)
    }
  }

  const constraints = Array.from(project?.constraints || [])
  const worldPointsArray = Array.from(worldPointsMap.values())
  const linesArray = Array.from(linesMap.values())
  const viewpointsArray = Array.from(viewpointsMap.values())

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

  const handleReloadProject = useCallback(async () => {
    if (!project) return
    const dbId = (project as unknown as { _dbId?: string })._dbId
    if (!dbId) {
      console.warn('Cannot reload: project has not been saved yet')
      return
    }
    try {
      const reloadedProject = await ProjectDB.loadProject(dbId)
      setProject(reloadedProject)
      markClean()
      setIsDirtyState(false)
      clearSelection()
      console.log('Project reloaded from saved state')
    } catch (error) {
      console.error('Failed to reload project:', error)
      alert('Failed to reload project: ' + (error as Error).message)
    }
  }, [project, setProject, clearSelection])

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
  )

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

  const imageViewerRef = useRef<ImageViewerRef>(null)
  const worldViewRef = useRef<WorldViewRef>(null)
  const leftPanelRef = useRef<LeftPanelRef>(null)

  // Panel handlers for LeftPanel and RightPanel
  const panelHandlers = usePanelHandlers({
    project,
    currentViewpoint,
    deleteImage,
    setCurrentViewpoint,
    copyPointsFromImageToImage,
    createLine,
    worldViewRef,
    setConstructionPreview
  })

  const { workspaceState, updateWorkspaceState } = useLayoutState(currentViewpoint)

  const selectedLineEntities = getSelectedByType<LineEntity>('line')
  const selectedPointEntities = getSelectedByType<WorldPoint>('point')
  const selectedPlaneEntities = getSelectedByType<Plane>('plane')
  const selectedVanishingLineEntities = getSelectedByType<VanishingLine>('vanishingLine')
  const selectedConstraintEntities = getSelectedByType<Constraint>('constraint')
  const selectedCoplanarConstraints = selectedConstraintEntities.filter(
    (c): c is CoplanarPointsConstraint => c instanceof CoplanarPointsConstraint
  )
  const constraintHighlightedPoints = useMemo(() => {
    const points = new Set<WorldPoint>()
    selectedCoplanarConstraints.forEach(c => c.points.forEach(p => points.add(p)))
    return Array.from(points)
  }, [selectedCoplanarConstraints])
  const selectedEntities = [...selectedPointEntities, ...selectedLineEntities, ...selectedPlaneEntities, ...selectedVanishingLineEntities] as ISelectable[]

  const handleEditLineOpen = useCallback((line: LineEntity) => {
    setEditingLine(line)
    setActiveTool('line')
  }, [setEditingLine, setActiveTool])

  const handleEditLineClose = useCallback(() => {
    setEditingLine(null)
    setActiveTool('select')
  }, [setEditingLine, setActiveTool])

  const handleEditLineSave = useCallback((lineEntity: LineEntity, updatedLine: { name?: string; color?: string }) => {
    updateLine(lineEntity, updatedLine)
    // Don't deactivate tool when using orientation paint (multi-use tool)
    if (activeTool !== 'orientationPaint') {
      setEditingLine(null)
      setActiveTool('select')
    }
  }, [updateLine, setEditingLine, setActiveTool, activeTool])

  const handleEditLineDelete = useCallback((line: LineEntity) => {
    deleteLine(line)
    setEditingLine(null)
    setActiveTool('select')
  }, [deleteLine, setEditingLine, setActiveTool])

  const handleWorldPointUpdate = useCallback((updatedPoint: WorldPoint) => {
    if (updatedPoint.getName() !== updatedPoint.getName()) {
      renameWorldPoint(updatedPoint, updatedPoint.getName())
    }
  }, [renameWorldPoint])

  // Bottom panel handlers
  const bottomPanelHandlers = useBottomPanelHandlers({
    project,
    deleteLine,
    deleteConstraint,
    deleteWorldPoint,
    handleEntityClick: (entity: unknown, ctrlKey: boolean, shiftKey: boolean) => handleEntityClick(entity as ISelectable, ctrlKey, shiftKey),
    handleEditLineOpen,
    setEntityPopup,
    setEditingCoplanarConstraint,
    setActiveTool,
    closeWorldPointEdit,
    saveProject,
    worldViewRef,
    setIsDirtyState
  })

  // Task 6: Mark dirty on changes using MobX reaction
  useEffect(() => {
    if (!project) return

    const dispose = reaction(
      () => Serialization.serialize(project),
      () => {
        // Don't mark dirty during optimization - optimization changes computed values,
        // not user data, so we preserve the pre-optimization dirty state
        if (!bottomPanelHandlers.isOptimizingRef.current) {
          markDirty()
          setIsDirtyState(true)
        }
      },
      { fireImmediately: false }
    )

    return () => dispose()
  }, [project, bottomPanelHandlers.isOptimizingRef])

  // Wrap triggerOptimization to capture dirty state before optimization starts
  const handleTriggerOptimization = useCallback(() => {
    bottomPanelHandlers.handleOptimizationStart()
    triggerOptimization()
  }, [triggerOptimization, bottomPanelHandlers])

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
      const wpNumber = getNextWorldPointNumber(worldPointsArray)
      const color = generateWorldPointColor(wpNumber - 1)
      const newWp = WorldPoint.create(`WP${wpNumber}`, { color, lockedXyz: [null, null, null] })
      project.addWorldPoint(newWp)
      addImagePointToWorldPoint(newWp, currentImage, u, v)
      setActiveTool('select')
    } else if (activeTool === 'loop' && currentImage) {
      const wpNumber = getNextWorldPointNumber(worldPointsArray)
      const color = generateWorldPointColor(wpNumber - 1)
      const newWp = WorldPoint.create(`WP${wpNumber}`, { color, lockedXyz: [null, null, null] })
      project.addWorldPoint(newWp)
      addImagePointToWorldPoint(newWp, currentImage, u, v)
      addToSelection(newWp)
    }
  }, [placementMode, currentImage, activeTool, project, worldPointsArray, addImagePointToWorldPoint, cancelPlacementMode, setActiveTool, addToSelection])

  const handleMovePoint = useCallback((worldPoint: WorldPoint, u: number, v: number) => {
    if (currentImage) {
      const imagePoint = currentImage.getImagePointsForWorldPoint(worldPoint)[0]
      if (imagePoint) {
        moveImagePoint(imagePoint, u, v)
      } else {
        // No ImagePoint on this image - create one
        addImagePointToWorldPoint(worldPoint, currentImage, u, v)
      }
    }
  }, [currentImage, moveImagePoint, addImagePointToWorldPoint])

  const handlePlaceWorldPoint = useCallback((worldPoint: WorldPoint, u: number, v: number) => {
    if (currentImage) {
      addImagePointToWorldPoint(worldPoint, currentImage, u, v)
    }
  }, [currentImage, addImagePointToWorldPoint])

  const handleCreateVanishingLine = useCallback((p1: { u: number; v: number }, p2: { u: number; v: number }) => {
    if (currentViewpoint) {
      VanishingLine.create(currentViewpoint, currentVanishingLineAxis, p1, p2)
      setActiveTool('select')
    }
  }, [currentViewpoint, currentVanishingLineAxis, setActiveTool])

  const handleRequestAddImage = useCallback(() => {
    leftPanelRef.current?.triggerAddImage()
  }, [])

  const handleMousePositionChange = useCallback((position: { u: number; v: number } | null) => {
    setMousePosition(position)
  }, [])

  const imageInfo = {
    currentImage: currentImage?.name,
    totalImages: project?.viewpoints.size || 0,
    pointsInCurrentImage: currentImage ? getImagePointCount(currentImage) : 0
  }

  const worldInfo = {
    totalPoints: project?.worldPoints.size || 0,
    totalConstraints: project?.constraints.size || 0,
    optimizationStatus: 'idle'
  }

  useSelectionKeyboard(
    () => {},
    clearSelection,
    () => {}
  )

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
    getSelectedByType,
    confirm,
    deleteConstraint,
    deleteLine,
    deleteWorldPoint,
    deleteImagePointFromViewpoint,
    deleteVanishingLine,
    clearSelection,
    setEditingLine,
    currentVanishingLineAxis,
    setCurrentVanishingLineAxis,
    currentViewpoint: currentViewpoint || null
  })

  const renderImageWorkspace = useCallback(() => (
    <ImageWorkspace
      image={currentImage || null}
      imageViewerRef={imageViewerRef}
      worldPoints={worldPointsMap}
      lines={linesMap}
      selectedPoints={selectedPointEntities}
      selectedLines={selectedLineEntities}
      constraintHighlightedPoints={constraintHighlightedPoints}
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
      onPlaceWorldPoint={handlePlaceWorldPoint}
      onPointHover={setHoveredWorldPoint}
      onPointRightClick={openWorldPointEdit}
      visibility={project?.viewSettings.visibility || DEFAULT_VIEW_SETTINGS.visibility}
      locking={project?.viewSettings.locking || DEFAULT_VIEW_SETTINGS.locking}
      toolContext={toolContext}
      onLineRightClick={handleEditLineOpen}
      onEmptySpaceClick={handleEmptySpaceClick}
      onRequestAddImage={handleRequestAddImage}
      onMousePositionChange={handleMousePositionChange}
      onEscapePressed={() => {
        setActiveTool('select')
        setConstructionPreview(null)
      }}
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
    handlePlaceWorldPoint,
    openWorldPointEdit,
    handleEditLineOpen,
    handleEmptySpaceClick,
    placementMode,
    selectedLineEntities,
    selectedPointEntities,
    constraintHighlightedPoints,
    setHoveredWorldPoint,
    hoveredConstraintId,
    hoveredWorldPoint,
    linesMap,
    handleRequestAddImage,
    handleVanishingLineClick,
    selectedVanishingLineEntities,
    handleCreateVanishingLine,
    currentVanishingLineAxis,
    project,
    toolContext,
    handleMousePositionChange,
    setActiveTool
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
        onPointRightClick={openWorldPointEdit}
        onLineRightClick={handleEditLineOpen}
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
    updateWorkspaceState({
      splitWorkspace: { ...workspaceState.splitWorkspace, splitRatio: ratio }
    })
  }, [updateWorkspaceState, workspaceState.splitWorkspace])

  const renderSplitWorkspace = useCallback(() => (
    <SplitWorkspace
      splitState={workspaceState.splitWorkspace}
      onSplitRatioChange={handleSplitRatioChange}
      imageContent={renderImageWorkspace()}
      worldContent={renderWorldWorkspace()}
    />
  ), [handleSplitRatioChange, workspaceState.splitWorkspace, renderImageWorkspace, renderWorldWorkspace])

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
        workspaceState={workspaceState}
        onWorkspaceStateChange={(updates) => updateWorkspaceState(updates)}
      >
        {(currentWorkspace, workspaceActions) => (
          <div className="app-layout enhanced-layout">
            <MainToolbar
              currentWorkspace={currentWorkspace}
              onWorkspaceChange={workspaceActions.setWorkspace}
              imageHasContent={imageInfo.totalImages > 0}
              worldHasContent={worldInfo.totalPoints > 0}
              project={project}
              onClearProject={clearProject}
              confirm={confirm}
              onReturnToBrowser={onReturnToBrowser}
              onSaveProject={handleSaveProject}
              onSaveAsProject={handleSaveAsProject}
              onReloadProject={handleReloadProject}
              onOpenOptimization={handleTriggerOptimization}
              isDirty={isDirty}
            />

            <div className="content-area">
              <LeftPanel
                ref={leftPanelRef}
                width={leftSidebarWidth}
                onWidthChange={setLeftSidebarWidth}
                images={viewpointsArray}
                currentViewpoint={currentViewpoint}
                worldPoints={worldPointsArray}
                selectedWorldPoints={selectedPointEntities}
                hoveredWorldPoint={hoveredWorldPoint}
                isCreatingConstraint={!!activeConstraintType}
                onImageSelect={(viewpoint) => setCurrentViewpoint(viewpoint)}
                onImageAdd={addImage}
                onImageRename={renameImage}
                onImageDelete={panelHandlers.handleImageDelete}
                getImagePointCount={getImagePointCount}
                getSelectedPointsInImage={(viewpoint) => getSelectedPointsInImage(viewpoint).length}
                imageHeights={imageHeights}
                onImageHeightChange={handleImageHeightChange}
                imageSortOrder={imageSortOrder}
                onImageReorder={handleImageReorder}
                onWorldPointHover={setHoveredWorldPoint}
                onWorldPointClick={handleEnhancedPointClick}
                onWorldPointRightClick={openWorldPointEdit}
                onViewFromCamera={(viewpoint) => panelHandlers.handleViewFromCamera(viewpoint, workspaceActions)}
                onCopyPointsToCurrentImage={panelHandlers.handleCopyPointsToCurrentImage}
                onShowInImageView={(viewpoint) => panelHandlers.handleShowInImageView(viewpoint, workspaceActions)}
              />

              <div className="viewer-area">
                {currentWorkspace === 'image' && renderImageWorkspace()}
                {currentWorkspace === 'world' && renderWorldWorkspace()}
                {currentWorkspace === 'split' && renderSplitWorkspace()}
              </div>

              <RightPanel
                selectedEntities={selectedEntities}
                activeTool={activeTool}
                onToolChange={setActiveTool}
                allWorldPoints={worldPointsArray}
                existingLines={linesMap}
                onCreatePoint={(imageId: string, u: number, v: number) => handleImageClick(u, v)}
                onCreateLine={panelHandlers.handleCreateLineFromPanel}
                onCreateConstraint={addConstraint}
                onCreatePlane={(definition) => {}}
                onCreateCircle={(definition) => {}}
                onConstructionPreviewChange={setConstructionPreview}
                onClearSelection={clearSelection}
                currentViewpoint={currentViewpoint || undefined}
                editingLine={editingLine}
                onUpdateLine={handleEditLineSave}
                onDeleteLine={handleEditLineDelete}
                onClearEditingLine={() => setEditingLine(null)}
                projectConstraints={constraints}
                editingCoplanarConstraint={editingCoplanarConstraint}
                onUpdateCoplanarConstraint={(constraint, updates) => {
                  constraint.name = updates.name
                  constraint.points = updates.points
                }}
                onDeleteCoplanarConstraint={(constraint) => {
                  deleteConstraint(constraint)
                }}
                onClearEditingCoplanarConstraint={() => setEditingCoplanarConstraint(null)}
                currentVanishingLineAxis={currentVanishingLineAxis}
                onVanishingLineAxisChange={setCurrentVanishingLineAxis}
                orientationPaintDirection={orientationPaintDirection}
                onOrientationPaintDirectionChange={setOrientationPaintDirection}
                activeConstraintType={activeConstraintType}
                selectedPoints={selectedPointEntities}
                selectedLines={selectedLineEntities}
                constraintParameters={constraintParameters}
                isConstraintComplete={isConstraintComplete()}
                onParameterChange={updateParameter}
                onApplyConstraint={applyConstraint}
                onCancelConstraintCreation={cancelConstraintCreation}
              />
            </div>

            <StatusBar
              currentWorkspace={currentWorkspace}
              imageInfo={imageInfo}
              worldInfo={worldInfo}
              project={project}
              selectionStats={selectionStats}
              mousePosition={mousePosition}
              showComponentNames={showComponentNames}
              onEntityPopupOpen={(popup) => setEntityPopup(popup, true)}
              onComponentOverlayToggle={handleComponentOverlayToggle}
              onVisibilityChange={handleVisibilityChange}
              onLockingChange={handleLockingChange}
            />
          </div>
        )}
      </WorkspaceManager>

      <BottomPanel
        entityPopups={entityPopups}
        onClosePopup={(popup) => setEntityPopup(popup, false)}
        optimizeTrigger={optimizeTrigger}
        linesMap={linesMap}
        allWorldPoints={worldPointsArray}
        selectedLines={selectedLineEntities}
        onEditLine={bottomPanelHandlers.handleEditLine}
        onDeleteLine={deleteLine}
        onDeleteAllLines={bottomPanelHandlers.handleDeleteAllLines}
        onUpdateLine={bottomPanelHandlers.handleUpdateLine}
        onToggleLineVisibility={(line) => {}}
        onSelectLine={bottomPanelHandlers.handleSelectLine}
        onCreateLine={createLine}
        selectedPlanes={selectedPlaneEntities}
        onEditPlane={(plane) => {}}
        onDeletePlane={(plane) => {}}
        onTogglePlaneVisibility={(plane) => {}}
        onSelectPlane={(plane) => {}}
        worldPointsMap={worldPointsMap}
        viewpointsMap={viewpointsMap}
        onEditImagePoint={(ref) => {}}
        onDeleteAllImagePoints={bottomPanelHandlers.handleDeleteAllImagePoints}
        onSelectImagePoint={(ref) => {}}
        constraints={constraints}
        allLines={linesArray}
        onEditConstraint={(constraint) => {}}
        onDeleteConstraint={deleteConstraint}
        onDeleteAllConstraints={bottomPanelHandlers.handleDeleteAllConstraints}
        onSelectConstraint={(constraint) => {}}
        onEditCoplanarConstraint={bottomPanelHandlers.handleEditCoplanarConstraint}
        onDeleteCoplanarConstraint={deleteConstraint}
        onDeleteAllCoplanarConstraints={bottomPanelHandlers.handleDeleteAllCoplanarConstraints}
        onSelectCoplanarConstraint={bottomPanelHandlers.handleSelectCoplanarConstraint}
        onHoverCoplanarConstraint={setHoveredCoplanarConstraint}
        selectedCoplanarConstraints={selectedCoplanarConstraints}
        hoveredCoplanarConstraint={hoveredCoplanarConstraint}
        project={project}
        onOptimizationStart={bottomPanelHandlers.handleOptimizationStart}
        onOptimizationComplete={bottomPanelHandlers.handleOptimizationComplete}
        onSelectWorldPoint={bottomPanelHandlers.handleSelectWorldPoint}
        onHoverWorldPoint={setHoveredWorldPoint}
        isWorldPointSelected={(wp) => selection.has(wp)}
        isLineSelected={(line) => selection.has(line)}
        hoveredWorldPoint={hoveredWorldPoint}
        worldPointEditWindow={worldPointEditWindow}
        onCloseWorldPointEdit={closeWorldPointEdit}
        onUpdateWorldPoint={handleWorldPointUpdate}
        onDeleteWorldPoint={bottomPanelHandlers.handleDeleteWorldPoint}
        onDeleteAllWorldPoints={bottomPanelHandlers.handleDeleteAllWorldPoints}
        onEditWorldPointFromManager={openWorldPointEdit}
        selectedWorldPoints={selectedPointEntities}
        onDeleteImagePoint={bottomPanelHandlers.handleDeleteImagePoint}
        showVPQualityWindow={showVPQualityWindow}
        onCloseVPQualityWindow={closeVPQualityWindow}
        currentViewpoint={currentViewpoint}
      />

      {dialog}
    </>
  )
})

export default MainLayout
