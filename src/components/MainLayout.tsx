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
import { AvailableConstraint } from '../types/ui-types'
import { ConstructionPreview, LineData } from './image-viewer/types'
import { Line as LineEntity } from '../entities/line'
import { WorldPoint } from '../entities/world-point'
import { Viewpoint } from '../entities/viewpoint'
import { Plane } from '../entities/plane'
import type { ISelectable } from '../types/selectable'
import { COMPONENT_OVERLAY_EVENT, isComponentOverlayEnabled, setComponentOverlayEnabled } from '../utils/componentNameOverlay'
import { useConfirm } from './ConfirmDialog'
import { filterImageBlobs } from '../types/optimization-export'
import { getEntityKey } from '../utils/entityKeys'


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
import {
  WorkspaceManager,
  WorkspaceSwitcher,
  WorkspaceStatus
} from './WorkspaceManager'
import { MainToolbar } from './main-layout/MainToolbar'

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
import OptimizationPanel from './OptimizationPanel'

// Styles
import '../styles/enhanced-workspace.css'
import '../styles/tools.css'

type ActiveTool = 'select' | 'point' | 'line' | 'plane' | 'circle' | 'loop'

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

  // Tool state management
  const [activeTool, setActiveTool] = useState<ActiveTool>('select')
  const [constructionPreview, setConstructionPreview] = useState<ConstructionPreview | null>(null)

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

  // Create visual language manager with minimal settings
  const [showComponentNames, setShowComponentNames] = useState(() => isComponentOverlayEnabled())

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<{ enabled: boolean }>
      if (typeof customEvent.detail?.enabled === 'boolean') {
        setShowComponentNames(customEvent.detail.enabled)
      }
    }

    window.addEventListener(COMPONENT_OVERLAY_EVENT, listener)
    return () => {
      window.removeEventListener(COMPONENT_OVERLAY_EVENT, listener)
    }
  }, [])

  const handleComponentOverlayToggle = useCallback(() => {
    const nextValue = !showComponentNames
    setShowComponentNames(nextValue)
    setComponentOverlayEnabled(nextValue)
  }, [showComponentNames])

  // UI state
  const [placementMode, setPlacementMode] = useState<{
    active: boolean
    worldPoint: WorldPoint | null
  }>({ active: false, worldPoint: null })

  // Hover state for world points
  const [hoveredWorldPoint, setHoveredWorldPoint] = useState<WorldPoint | null>(null)

  // Sidebar width state with persistence
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('pictorigo-left-sidebar-width')
    return saved ? parseInt(saved, 10) : 180
  })

  // Image heights state with persistence
  const [imageHeights, setImageHeights] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('pictorigo-image-heights')
    return saved ? JSON.parse(saved) : {}
  })

  const handleImageHeightChange = (viewpoint: Viewpoint, height: number) => {
    const newHeights = { ...imageHeights, [viewpoint.getName()]: height }
    setImageHeights(newHeights)
    localStorage.setItem('pictorigo-image-heights', JSON.stringify(newHeights))
  }

  // Image sort order state with project persistence
  const [imageSortOrder, setImageSortOrder] = useState<string[]>(() => {
    // Try to get from project settings first, then localStorage
    const projectOrder = project?.imageSortOrder
    if (projectOrder) return projectOrder

    const saved = localStorage.getItem('pictorigo-image-sort-order')
    return saved ? JSON.parse(saved) : []
  })

  const handleImageReorder = (newOrder: string[]) => {
    setImageSortOrder(newOrder)
    // Save to localStorage for immediate persistence
    localStorage.setItem('pictorigo-image-sort-order', JSON.stringify(newOrder))
    // TODO: Also save to project settings when project update is available
  }

  // Edit Line state - integrated with line tool
  const [editingLine, setEditingLine] = useState<LineEntity | null>(null)

  // Entity popup states
  const [showLinesPopup, setShowLinesPopup] = useState(false)
  const [showPlanesPopup, setShowPlanesPopup] = useState(false)
  const [showImagePointsPopup, setShowImagePointsPopup] = useState(false)
  const [showConstraintsPopup, setShowConstraintsPopup] = useState(false)
  const [showOptimizationPanel, setShowOptimizationPanel] = useState(false)

  // World point edit window state
  const [worldPointEditWindow, setWorldPointEditWindow] = useState<{
    isOpen: boolean
    worldPoint: WorldPoint | null
  }>({ isOpen: false, worldPoint: null })

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

  // Combined selected entities for components that accept ISelectable[]
  const selectedEntities = [...selectedPointEntities, ...selectedLineEntities, ...selectedPlaneEntities] as ISelectable[]

  const viewerLines = new Map<string, LineData>()
  if (project?.lines) {
    for (const line of project.lines) {
      const viewerLine: LineData = {
        id: line.getName(),
        name: line.name,
        pointA: line.pointA,
        pointB: line.pointB,
        color: line.color,
        isVisible: line.isVisible,
        isConstruction: line.isConstruction,
        length: line.length() ?? undefined,
        constraints: {
          direction: line.direction,
          targetLength: line.targetLength ?? undefined,
          tolerance: line.tolerance
        }
      }
      viewerLines.set(line.getName(), viewerLine)
    }
  }


  // Constraint system uses entity objects directly (intrinsic + extrinsic)
  const allConstraints: AvailableConstraint[] = []
  const availableConstraints: AvailableConstraint[] = []


  // Point interaction handlers
  const handleEnhancedPointClick = (worldPoint: WorldPoint, ctrlKey: boolean, shiftKey: boolean) => {
    // If Line tool is active, dispatch event for slot filling
    if (activeTool === 'line') {
      const event = new CustomEvent('lineToolPointClick', { detail: { worldPoint } })
      window.dispatchEvent(event)
      return
    }

    // If Loop tool is active, treat normal clicks as additive only
    // shift+click removes from selection
    if (activeTool === 'loop') {
      if (shiftKey) {
        // Shift removes from selection
        handleEntityClick(worldPoint, false, true)
      } else {
        // Check if clicking the first selected point (to close loop)
        const firstSelected = selectedPointEntities.length > 0 ? selectedPointEntities[0] : null
        if (firstSelected && worldPoint === firstSelected && selectedPointEntities.length >= 3) {
          // Dispatch event to toggle closed loop
          window.dispatchEvent(new CustomEvent('loopToolSetClosed', { detail: { closed: true } }))
        } else {
          // Normal click: only add if not already selected (don't toggle)
          addToSelection(worldPoint)
        }
      }
      return
    }

    // Normal selection behavior - call selection handler with entity
    handleEntityClick(worldPoint, ctrlKey, shiftKey)
  }

  // Placement mode handlers
  const startPlacementMode = (worldPoint: WorldPoint) => {
    setPlacementMode({ active: true, worldPoint })
  }

  const cancelPlacementMode = () => {
    setPlacementMode({ active: false, worldPoint: null })
  }

  const handleImageClick = (u: number, v: number) => {
    if (placementMode.active && placementMode.worldPoint && currentImage) {
      // Legacy placement mode (adding IP to existing WP)
      addImagePointToWorldPoint(placementMode.worldPoint, currentImage, u, v)
      cancelPlacementMode()
    } else if (activeTool === 'point' && currentImage) {
      // NEW: Only create world point when WP tool is explicitly active
      const wpCount = worldPointsArray.length + 1
      const newWp = createWorldPoint(`WP${wpCount}`, [0, 0, 0], { color: '#ff0000' })
      // Add image point to the world point
      addImagePointToWorldPoint(newWp, currentImage, u, v)
      // Auto-deactivate tool after point creation
      setActiveTool('select')
    } else if (activeTool === 'loop' && currentImage) {
      // Create world point and auto-select it for loop tool
      const wpCount = worldPointsArray.length + 1
      const newWp = createWorldPoint(`WP${wpCount}`, [0, 0, 0], { color: '#ff0000' })
      // Add image point to the world point
      addImagePointToWorldPoint(newWp, currentImage, u, v)
      // Add to selection
      addToSelection(newWp)
    }
    // Default behavior: do nothing (selection only)
  }

  const handleMovePoint = (worldPoint: WorldPoint, u: number, v: number) => {
    if (currentImage) {
      const imagePoint = currentImage.getImagePointsForWorldPoint(worldPoint)[0]
      if (imagePoint) {
        moveImagePoint(imagePoint as any, u, v)
      }
    }
  }

  const handleRequestAddImage = useCallback(() => {
    // TODO: Trigger image add dialog when project update flow lands
  }, [])


  // EditLineWindow handlers - now integrated with line tool
  const handleEditLineOpen = (line: LineEntity) => {
    setEditingLine(line)
    setActiveTool('line')
  }

  const handleEditLineClose = () => {
    setEditingLine(null)
    setActiveTool('select')
  }

  const handleEditLineSave = (lineEntity: LineEntity, updatedLine: { name?: string; color?: string; isVisible?: boolean }) => {
    updateLine(lineEntity, updatedLine)
    setEditingLine(null)
    setActiveTool('select')
  }

  const handleEditLineDelete = (line: LineEntity) => {
    deleteLine(line)
    setEditingLine(null)
    setActiveTool('select')
  }

  // World point edit handlers
  const handleWorldPointEdit = useCallback((worldPoint: WorldPoint) => {
    // Don't allow editing while line tool is active
    if (activeTool === 'line') {
      return
    }
    setWorldPointEditWindow({ isOpen: true, worldPoint })
  }, [activeTool])

  const handleWorldPointUpdate = (updatedPoint: WorldPoint) => {
    // For now, just update the name if that's different
    if (updatedPoint.getName() !== updatedPoint.getName()) {
      renameWorldPoint(updatedPoint, updatedPoint.getName())
    }
    // TODO: Implement full world point update when available
  }

  const handleWorldPointEditClose = () => {
    setWorldPointEditWindow({ isOpen: false, worldPoint: null })
  }

  // Enhanced line click handler for selection and editing
  const handleEnhancedLineClick = (line: LineEntity, ctrlKey: boolean, shiftKey: boolean) => {
    // Don't allow line switching during edit mode
    if (editingLine && line !== editingLine) {
      return
    }

    if (ctrlKey || shiftKey) {
      // Selection behavior with modifiers
      handleEntityClick(line, ctrlKey, shiftKey)
    } else {
      // No modifiers - both select the line AND open edit window for immediate editing
      handleEntityClick(line, false, false) // Select the line first
      handleEditLineOpen(line) // Then open edit window
    }
  }

  const handlePlaneClick = (plane: Plane, ctrlKey: boolean, shiftKey: boolean) => {
    // TODO: Implement plane selection/editing
  }

  const handleEmptySpaceClick = useCallback((shiftKey: boolean) => {
    // Don't clear selection if loop tool is active (creating new points)
    if (activeTool === 'loop') {
      return
    }
    // Clear selection unless holding shift
    if (!shiftKey) {
      clearSelection()
    }
  }, [clearSelection, activeTool])

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

  // Keyboard shortcuts for tools and escape handling
  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      // Don't handle keyboard shortcuts if confirm dialog is open
      if (isConfirmDialogOpen) {
        return
      }

      // Escape key handling
      if (event.key === 'Escape') {
        if (placementMode.active) {
          cancelPlacementMode()
        } else if (activeTool !== 'select') {
          setActiveTool('select')
        }
        return
      }

      // Delete key handling
      if (event.key === 'Delete' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        const selectedPoints = selectedPointEntities
        const selectedLines = selectedLineEntities
        const selectedPlanes = selectedPlaneEntities
        const selectedConstraints = getSelectedByType<any>('constraint')

        const totalSelected = selectedPoints.length + selectedLines.length + selectedPlanes.length + selectedConstraints.length

        if (totalSelected === 0) return

        // Build message
        const parts: string[] = []
        if (selectedPoints.length > 0) parts.push(`${selectedPoints.length} point${selectedPoints.length > 1 ? 's' : ''}`)
        if (selectedLines.length > 0) parts.push(`${selectedLines.length} line${selectedLines.length > 1 ? 's' : ''}`)
        if (selectedPlanes.length > 0) parts.push(`${selectedPlanes.length} plane${selectedPlanes.length > 1 ? 's' : ''}`)
        if (selectedConstraints.length > 0) parts.push(`${selectedConstraints.length} constraint${selectedConstraints.length > 1 ? 's' : ''}`)

        const message = `Delete ${parts.join(', ')}?`

        if (await confirm(message, { variant: 'danger', confirmLabel: 'Delete', cancelLabel: 'Cancel' })) {
          // Delete all selected entities
          selectedConstraints.forEach(constraint => deleteConstraint(constraint))
          selectedLineEntities.forEach(line => deleteLine(line))
          selectedPlanes.forEach(id => {
            // TODO: Implement deletePlane when available
            console.warn('Plane deletion not yet implemented')
          })
          selectedPointEntities.forEach(point => deleteWorldPoint(point))

          // Clear selection
          clearSelection()
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
            if (selectedPointEntities.length <= 2) { // Only activate if valid selection
              if (activeTool === 'line') {
                setActiveTool('select')
                setEditingLine(null)
              } else {
                setEditingLine(null) // Clear editing mode for creation
                setActiveTool('line')
              }
            }
            break
          case 'o':
            setActiveTool(activeTool === 'loop' ? 'select' : 'loop')
            break
          // Add more shortcuts later for P (plane), C (circle), etc.
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [placementMode.active, activeTool, selectedPointEntities, selectedLineEntities, selectedPlaneEntities, getSelectedByType, confirm, deleteConstraint, deleteLine, deleteWorldPoint, clearSelection, isConfirmDialogOpen])

  // Content for different workspaces
  const renderImageWorkspace = useCallback(() => (
    <ImageWorkspace
      image={currentImage || null}
      imageViewerRef={imageViewerRef}
      worldPoints={worldPointsMap}
      lines={viewerLines}
      lineEntities={linesMap}
      selectedPoints={selectedPointEntities}
      selectedLines={selectedLineEntities}
      hoveredConstraintId={hoveredConstraintId}
      hoveredWorldPoint={hoveredWorldPoint}
      placementMode={placementMode}
      activeConstraintType={activeConstraintType}
      constructionPreview={constructionPreview}
      isPointCreationActive={activeTool === 'point'}
      isLoopTraceActive={activeTool === 'loop'}
      onPointClick={handleEnhancedPointClick}
      onLineClick={handleEnhancedLineClick}
      onCreatePoint={handleImageClick}
      onMovePoint={handleMovePoint}
      onPointHover={setHoveredWorldPoint}
      onPointRightClick={handleWorldPointEdit}
      onLineRightClick={handleEditLineOpen}
      onEmptySpaceClick={handleEmptySpaceClick}
      onRequestAddImage={handleRequestAddImage}
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
    handleWorldPointEdit,
    handleEditLineOpen,
    handleEmptySpaceClick,
    placementMode,
    selectedLineEntities,
    selectedPointEntities,
    setHoveredWorldPoint,
    hoveredConstraintId,
    hoveredWorldPoint,
    viewerLines,
    worldPointsArray,
    linesArray,
    handleRequestAddImage
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
            <div
              className="sidebar-left"
              style={{ width: `${leftSidebarWidth}px` }}
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
                onImageDelete={deleteImage}
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
              {/* Resize handle */}
              <div
                className="sidebar-resize-handle sidebar-resize-handle-right"
                onMouseDown={(e) => {
                  e.preventDefault()
                  const startX = e.clientX
                  const startWidth = leftSidebarWidth

                  let currentWidth = startWidth

                  const handleMouseMove = (e: MouseEvent) => {
                    currentWidth = Math.max(120, Math.min(400, startWidth + (e.clientX - startX)))
                    setLeftSidebarWidth(currentWidth)
                  }

                  const handleMouseUp = () => {
                    document.removeEventListener('mousemove', handleMouseMove)
                    document.removeEventListener('mouseup', handleMouseUp)
                    // Save the final width to localStorage
                    localStorage.setItem('pictorigo-left-sidebar-width', currentWidth.toString())
                  }

                  document.addEventListener('mousemove', handleMouseMove)
                  document.addEventListener('mouseup', handleMouseUp)
                }}
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
                        isConstruction: lineConstraints?.isConstruction
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
                onEditWorldPoint={handleWorldPointEdit}
                onStartPlacement={startPlacementMode}
                onCancelPlacement={cancelPlacementMode}
              />

              {/* Entity Management Buttons */}
              <div className="entity-management-panel" style={{ padding: '4px', marginTop: '8px' }}>
                <div className="entity-buttons" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <button
                    className="entity-button"
                    onClick={() => setShowLinesPopup(true)}
                    title="Manage lines"
                    style={{ padding: '2px 6px', fontSize: '11px', minHeight: 'auto' }}
                  >
                    <span className="button-icon" style={{ fontSize: '10px' }}><FontAwesomeIcon icon={faRuler} /></span>
                    <span className="button-label">Lines</span>
                    <span className="button-count">{project?.lines.size || 0}</span>
                  </button>

                  <button
                    className="entity-button"
                    onClick={() => setShowPlanesPopup(true)}
                    title="Manage planes"
                    style={{ padding: '2px 6px', fontSize: '11px', minHeight: 'auto' }}
                  >
                    <span className="button-icon" style={{ fontSize: '10px' }}><FontAwesomeIcon icon={faSquare} /></span>
                    <span className="button-label">Planes</span>
                    <span className="button-count">{0}</span>
                  </button>

                  <button
                    className="entity-button"
                    onClick={() => setShowImagePointsPopup(true)}
                    title="Manage image points"
                    style={{ padding: '2px 6px', fontSize: '11px', minHeight: 'auto' }}
                  >
                    <span className="button-icon" style={{ fontSize: '10px' }}><FontAwesomeIcon icon={faCamera} /></span>
                    <span className="button-label">IPs</span>
                    <span className="button-count">{Array.from(project?.viewpoints || []).reduce((total, vp) => total + vp.imagePoints.size, 0)}</span>
                  </button>

                  <button
                    className="entity-button"
                    onClick={() => setShowConstraintsPopup(true)}
                    title="Manage constraints"
                    style={{ padding: '2px 6px', fontSize: '11px', minHeight: 'auto' }}
                  >
                    <span className="button-icon" style={{ fontSize: '10px' }}><FontAwesomeIcon icon={faGear} /></span>
                    <span className="button-count">{project?.constraints.size || 0}</span>
                  </button>

                  <button
                    className="entity-button"
                    onClick={() => setShowOptimizationPanel(true)}
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

            <span style={{ marginLeft: '12px', color: '#888' }}>v0.3-ENHANCED</span>
          </div>
        </div>
      )}
    </WorkspaceManager>

    {/* Edit Line Window removed - now integrated into CreationToolsManager */}

    {/* Entity Management Popups */}
    <LinesManager
      isOpen={showLinesPopup}
      onClose={() => setShowLinesPopup(false)}
      lines={linesMap}
      allWorldPoints={worldPointsArray}
      selectedLines={selectedLineEntities}
      onEditLine={(line) => {
        handleEditLineOpen(line)
        setShowLinesPopup(false)
      }}
      onDeleteLine={(line) => {
        deleteLine(line)
      }}
      onDeleteAllLines={() => {
        Array.from(project?.lines || []).forEach(line => {
          deleteLine(line)
        })
      }}
      onUpdateLine={(updatedLine) => {
        // TODO: Implement line update through enhanced project
      }}
      onToggleLineVisibility={(line) => {
        // TODO: Implement line visibility toggle
      }}
      onSelectLine={(line) => {
        handleEntityClick(line, false, false)
      }}
      onCreateLine={(pointA, pointB, lineConstraints) => {
        createLine(pointA, pointB, lineConstraints)
      }}
    />

    <PlanesManager
      isOpen={showPlanesPopup}
      onClose={() => setShowPlanesPopup(false)}
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
      isOpen={showImagePointsPopup}
      onClose={() => setShowImagePointsPopup(false)}
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
      isOpen={showConstraintsPopup}
      onClose={() => setShowConstraintsPopup(false)}
      constraints={constraints as any}
      allWorldPoints={worldPointsArray}
      allLines={linesArray}
      onEditConstraint={(constraint) => {
        // TODO: Implement constraint editing
      }}
      onDeleteConstraint={(constraint) => {
        deleteConstraint(constraint)
      }}
      onToggleConstraint={(constraint) => {
        toggleConstraint(constraint)
      }}
      onSelectConstraint={(constraint) => {
        // TODO: Implement constraint selection
      }}
    />

    {/* Optimization Panel */}
    {showOptimizationPanel && (
      <FloatingWindow
        title="Bundle Adjustment Optimization"
        isOpen={showOptimizationPanel}
        onClose={() => setShowOptimizationPanel(false)}
        width={500}
        height={600}
      >
        {project && (
          <OptimizationPanel
            project={project}
            onOptimizationComplete={(success, message) => {
              console.log(`Optimization ${success ? 'succeeded' : 'failed'}: ${message}`)
              // Entities are modified in-place during optimization
              // Trigger re-render to show updated values
              saveProject()
              setProject({ ...project } as Project) // Force re-render
            }}
          />
        )}
      </FloatingWindow>
    )}

    {/* World Point Edit Window */}
    {worldPointEditWindow.worldPoint && (
      <WorldPointEditor
        isOpen={worldPointEditWindow.isOpen}
        onClose={handleWorldPointEditClose}
        worldPoint={worldPointEditWindow.worldPoint}
        onUpdateWorldPoint={handleWorldPointUpdate}
        onDeleteWorldPoint={(worldPoint) => {
          deleteWorldPoint(worldPoint)
          handleWorldPointEditClose()
        }}
        images={viewpointsMap}
      />
    )}
    {dialog}
  </>
  )
})

export default MainLayout



