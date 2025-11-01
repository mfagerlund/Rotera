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
import { AvailableConstraint } from '../../types/ui-types'
import { ConstructionPreview } from '../image-viewer/types'
import { Line as LineEntity } from '../../entities/line'
import { WorldPoint } from '../../entities/world-point'
import { VanishingLine } from '../../entities/vanishing-line'
import type { ISelectable } from '../../types/selectable'
import { COMPONENT_OVERLAY_EVENT, isComponentOverlayEnabled, setComponentOverlayEnabled } from '../../utils/componentNameOverlay'
import { useConfirm } from '../ConfirmDialog'
import { getEntityKey } from '../../utils/entityKeys'
import { generateWorldPointColor } from '../../utils/colorGenerator'
import type { ImageViewerRef } from '../ImageViewer'
import type { WorldViewRef } from '../WorldView'
import { WorkspaceManager, WorkspaceStatus } from '../WorkspaceManager'
import { MainToolbar } from './MainToolbar'
import ImageWorkspace from './ImageWorkspace'
import WorldWorkspace from './WorldWorkspace'
import SplitWorkspace from './SplitWorkspace'
import { LeftPanel } from './LeftPanel'
import { RightPanel } from './RightPanel'
import { BottomPanel } from './BottomPanel'
import { VisibilityPanel } from '../VisibilityPanel'
import { VisibilitySettings, LockSettings, DEFAULT_VIEW_SETTINGS } from '../../types/visibility'
import { ToolContext, SELECT_TOOL_CONTEXT, LINE_TOOL_CONTEXT, VANISHING_LINE_TOOL_CONTEXT, LOOP_TOOL_CONTEXT } from '../../types/tool-context'

import '../../styles/enhanced-workspace.css'
import '../../styles/tools.css'

export const MainLayout: React.FC = observer(() => {
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
    getSelectedPointsInImage,
    copyPointsFromImageToImage,
    addConstraint,
    updateConstraint,
    deleteConstraint,
    toggleConstraint,
    clearProject,
    exportOptimizationDto,
    removeDuplicateImagePoints
  } = useDomainOperations(project, setProject)

  const { confirm, dialog, isOpen: isConfirmDialogOpen } = useConfirm()

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

  const [constructionPreview, setConstructionPreview] = useState<ConstructionPreview | null>(null)
  const [currentVanishingLineAxis, setCurrentVanishingLineAxis] = useState<'x' | 'y' | 'z'>('x')
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
      (window as any).removeDuplicateImagePoints = removeDuplicateImagePoints
    }
    return () => {
      delete (window as any).removeDuplicateImagePoints
    }
  }, [project, removeDuplicateImagePoints])

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
    constraints as any,
    addConstraint,
    updateConstraint,
    deleteConstraint,
    toggleConstraint
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

  const { workspaceState, updateWorkspaceState } = useLayoutState(currentViewpoint)

  const selectedLineEntities = getSelectedByType<LineEntity>('line')
  const selectedPointEntities = getSelectedByType<WorldPoint>('point')
  const selectedPlaneEntities = getSelectedByType('plane')
  const selectedVanishingLineEntities = getSelectedByType<VanishingLine>('vanishingLine')
  const selectedEntities = [...selectedPointEntities, ...selectedLineEntities, ...selectedPlaneEntities, ...selectedVanishingLineEntities] as ISelectable[]

  const allConstraints: AvailableConstraint[] = []
  const availableConstraints: AvailableConstraint[] = []

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

  const handleWorldPointUpdate = useCallback((updatedPoint: WorldPoint) => {
    if (updatedPoint.getName() !== updatedPoint.getName()) {
      renameWorldPoint(updatedPoint, updatedPoint.getName())
    }
  }, [renameWorldPoint])

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
    updateWorkspaceState({
      splitWorkspace: { ...workspaceState.splitWorkspace, splitRatio: ratio }
    } as any)
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
        onWorkspaceStateChange={(updates) => updateWorkspaceState(updates as any)}
      >
        {(currentWorkspace, workspaceActions) => (
          <div className="app-layout enhanced-layout">
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
              onConstraintClick={() => {}}
              showPointNames={project!.showPointNames}
              onTogglePointNames={() => {}}
              showComponentOverlay={showComponentNames}
              onToggleComponentOverlay={handleComponentOverlayToggle}
              visualFeedbackLevel={project!.visualFeedbackLevel || 'standard'}
              onVisualFeedbackChange={() => {}}
              confirm={confirm}
            />

            <div className="content-area">
              <LeftPanel
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
                onCreateLine={(pointA, pointB, lineConstraints) => {
                  try {
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
                      setConstructionPreview(null)
                      if (window.navigator.platform.startsWith('Win')) {
                        try {
                          fetch('/api/beep', { method: 'POST' }).catch(() => {
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
                          // Ignore audio errors
                        }
                      }
                    }
                  } catch (error) {
                    // Ignore audio errors
                  }
                }}
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
                currentVanishingLineAxis={currentVanishingLineAxis}
                onVanishingLineAxisChange={setCurrentVanishingLineAxis}
                activeConstraintType={activeConstraintType}
                selectedPoints={selectedPointEntities}
                selectedLines={selectedLineEntities}
                constraintParameters={constraintParameters}
                isConstraintComplete={isConstraintComplete()}
                onParameterChange={updateParameter}
                onApplyConstraint={applyConstraint}
                onCancelConstraintCreation={cancelConstraintCreation}
                worldPointsMap={worldPointsMap}
                viewpointsMap={viewpointsMap}
                constraints={constraints as any}
                selectedWorldPoints={selectedPointEntities}
                hoveredWorldPoint={hoveredWorldPoint}
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
                project={project}
                onShowLinesPopup={() => setEntityPopup('showLinesPopup', true)}
                onShowPlanesPopup={() => setEntityPopup('showPlanesPopup', true)}
                onShowImagePointsPopup={() => setEntityPopup('showImagePointsPopup', true)}
                onShowConstraintsPopup={() => setEntityPopup('showConstraintsPopup', true)}
                onShowOptimizationPanel={() => setEntityPopup('showOptimizationPanel', true)}
              />
            </div>

            <div className="status-bar">
              <WorkspaceStatus
                workspace={currentWorkspace}
                imageInfo={imageInfo}
                worldInfo={worldInfo}
              />

              <div style={{display: 'flex', gap: '12px', fontSize: '12px', color: '#888'}}>
                <span>World Points: {project?.worldPoints.size || 0}</span>
                <span>Image Points: {Array.from(project?.viewpoints || []).reduce((total, vp) => total + vp.imagePoints.size, 0)}</span>
                <span>Lines: {project?.lines.size || 0}</span>
                <span>Planes: {0}</span>
                <span>Constraints: {project?.constraints.size || 0}</span>
                {mousePosition && (
                  <span style={{ color: '#4a9eff', fontWeight: 'bold' }}>
                    Mouse: ({mousePosition.u.toFixed(1)}, {mousePosition.v.toFixed(1)})
                  </span>
                )}
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
              </button>

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

      <BottomPanel
        entityPopups={entityPopups}
        onClosePopup={(popup) => setEntityPopup(popup as any, false)}
        linesMap={linesMap}
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
          saveProject()
        }}
        onToggleLineVisibility={(line) => {}}
        onSelectLine={(line) => handleEntityClick(line, false, false)}
        onCreateLine={(pointA, pointB, lineConstraints) => {
          createLine(pointA, pointB, lineConstraints)
        }}
        selectedPlanes={selectedPlaneEntities}
        onEditPlane={(plane) => {}}
        onDeletePlane={(plane) => {}}
        onTogglePlaneVisibility={(plane) => {}}
        onSelectPlane={(plane) => {}}
        worldPointsMap={worldPointsMap}
        viewpointsMap={viewpointsMap}
        onEditImagePoint={(ref) => {}}
        onSelectImagePoint={(ref) => {}}
        constraints={constraints as any}
        allLines={linesArray}
        onEditConstraint={(constraint) => {}}
        onDeleteConstraint={(constraint) => deleteConstraint(constraint)}
        onToggleConstraint={(constraint) => toggleConstraint(constraint)}
        onSelectConstraint={(constraint) => {}}
        project={project}
        onOptimizationComplete={(success, message) => {
          saveProject()
        }}
        worldPointEditWindow={worldPointEditWindow}
        onCloseWorldPointEdit={closeWorldPointEdit}
        onUpdateWorldPoint={handleWorldPointUpdate}
        onDeleteWorldPoint={(worldPoint) => {
          deleteWorldPoint(worldPoint)
          closeWorldPointEdit()
        }}
        onDeleteImagePoint={(ref) => {
          if (project) {
            const imagePoint = Array.from(project.imagePoints).find(
              (ip) => ip.worldPoint === ref.worldPoint && ip.viewpoint === ref.viewpoint
            )
            if (imagePoint) {
              project.removeImagePoint(imagePoint)
            }
          }
        }}
        showVPQualityWindow={showVPQualityWindow}
        onCloseVPQualityWindow={closeVPQualityWindow}
        currentViewpoint={currentViewpoint}
      />

      {dialog}
    </>
  )
})

export default MainLayout
