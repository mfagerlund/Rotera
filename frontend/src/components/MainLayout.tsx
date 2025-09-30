// Main layout with new workspace paradigm

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFolderOpen, faFloppyDisk, faFileExport, faTrash, faRuler, faGear, faArrowRight, faCamera } from '@fortawesome/free-solid-svg-icons'
import { useProject } from '../hooks/useProject'
import { useSelection, useSelectionKeyboard } from '../hooks/useSelection'
import { useConstraints } from '../hooks/useConstraints'
import { Line, AvailableConstraint, WorldPoint as LegacyWorldPoint } from '../types/project'
import { ConstructionPreview, LineData } from './image-viewer/types'
import { Line as LineEntity } from '../entities/line'
import { WorldPoint } from '../entities/world-point'
import { EnhancedConstraint, ConstraintType as GeometryConstraintType } from '../types/geometry'
import { COMPONENT_OVERLAY_EVENT, isComponentOverlayEnabled, setComponentOverlayEnabled } from '../utils/componentNameOverlay'


// UI Components
import ConstraintToolbar from './ConstraintToolbar'
import ConstraintPropertyPanel from './ConstraintPropertyPanel'
import ImageNavigationToolbar from './ImageNavigationToolbar'
import ConstraintTimeline from './ConstraintTimeline'
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

import ImageWorkspace from './main-layout/ImageWorkspace'
import WorldWorkspace from './main-layout/WorldWorkspace'
import SplitWorkspace from './main-layout/SplitWorkspace'

// Creation Tools
import CreationToolsManager from './tools/CreationToolsManager'
import LinesPopup from './LinesPopup'
import PlanesPopup from './PlanesPopup'
import ImagePointsPopup from './ImagePointsPopup'
import ConstraintsPopup from './ConstraintsPopup'
import WorldPointEditWindow from './WorldPointEditWindow'

// Styles
import '../styles/enhanced-workspace.css'
import '../styles/tools.css'

type ActiveTool = 'select' | 'point' | 'line' | 'plane' | 'circle'

export const MainLayout: React.FC = () => {
  // Legacy project system (for now)
  const legacyProject = useProject()

  // Enhanced project system (future)

  // Tool state management
  const [activeTool, setActiveTool] = useState<ActiveTool>('select')
  const [constructionPreview, setConstructionPreview] = useState<ConstructionPreview | null>(null)

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
    deleteLine,
    getWorldPointEntity,
    getLineEntity,
    clearProject
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
    worldPointId: string | null
  }>({ active: false, worldPointId: null })

  // Hover state for world points
  const [hoveredWorldPointId, setHoveredWorldPointId] = useState<string | null>(null)

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

  const handleImageHeightChange = (imageId: string, height: number) => {
    const newHeights = { ...imageHeights, [imageId]: height }
    setImageHeights(newHeights)
    localStorage.setItem('pictorigo-image-heights', JSON.stringify(newHeights))
  }

  // Image sort order state with project persistence
  const [imageSortOrder, setImageSortOrder] = useState<string[]>(() => {
    // Try to get from project settings first, then localStorage
    const projectOrder = project?.settings?.imageSortOrder
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
  const [editingLineId, setEditingLineId] = useState<string | null>(null)

  // Entity popup states
  const [showLinesPopup, setShowLinesPopup] = useState(false)
  const [showPlanesPopup, setShowPlanesPopup] = useState(false)
  const [showImagePointsPopup, setShowImagePointsPopup] = useState(false)
  const [showConstraintsPopup, setShowConstraintsPopup] = useState(false)

  // World point edit window state
  const [worldPointEditWindow, setWorldPointEditWindow] = useState<{
    isOpen: boolean
    worldPointId: string | null
  }>({ isOpen: false, worldPointId: null })

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
  const selectedPointIds = useMemo(() => selectedPointEntities.map(p => p.getId()), [selectedPointEntities])
  const selectedLineIds = useMemo(() => selectedLineEntities.map(l => l.getId()), [selectedLineEntities])
  const selectedPlaneIds = useMemo(() => selectedPlaneEntities.map(p => p.getId()), [selectedPlaneEntities])

  const viewerLines = useMemo<Record<string, LineData>>(() => {
    if (!project?.lines) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(project.lines).map(([id, line]) => {
        const legacyLine = line as Line & Partial<LineData>
        const viewerLine: LineData = {
          id: legacyLine.id,
          name: legacyLine.name,
          pointA: legacyLine.pointA,
          pointB: legacyLine.pointB,
          color: legacyLine.color,
          isVisible: legacyLine.isVisible,
          isConstruction: legacyLine.isConstruction ?? false,
          createdAt: legacyLine.createdAt ?? new Date().toISOString(),
          updatedAt: legacyLine.updatedAt,
          length: legacyLine.length,
          constraints: legacyLine.constraints
        }
        return [id, viewerLine]
      })
    )
  }, [project?.lines])


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

    // Normal selection behavior - get entity object and call selection handler
    const pointEntity = getWorldPointEntity(pointId)
    if (pointEntity) {
      handleEntityClick(pointEntity, ctrlKey, shiftKey)
    }
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

  const handleRequestAddImage = useCallback(() => {
    // TODO: Trigger image add dialog when project update flow lands
  }, [])


  // EditLineWindow handlers - now integrated with line tool
  const handleEditLineOpen = (lineId: string) => {
    setEditingLineId(lineId)
    setActiveTool('line')
  }

  const handleEditLineClose = () => {
    setEditingLineId(null)
    setActiveTool('select')
  }

  const handleEditLineSave = (updatedLine: Line) => {
    updateLine(updatedLine.id, updatedLine)
    setEditingLineId(null)
    setActiveTool('select')
  }

  const handleEditLineDelete = (lineId: string) => {
    deleteLine(lineId)
    setEditingLineId(null)
    setActiveTool('select')
  }

  // World point edit handlers
  const handleWorldPointEdit = useCallback((worldPointId: string) => {
    console.log('=== MainLayout: handleWorldPointEdit called ===')
    console.log('World point ID:', worldPointId)
    console.log('Active tool:', activeTool)

    // Don't allow editing while line tool is active
    if (activeTool === 'line') {
      console.log('✗ BLOCKED: Line tool is active')
      return
    }
    console.log('✓ Opening world point edit window')
    setWorldPointEditWindow({ isOpen: true, worldPointId })
  }, [activeTool])

  const handleWorldPointUpdate = (updatedPoint: LegacyWorldPoint) => {
    // For now, just update the name if that's different
    const currentPoint = Object.values(worldPoints).find(p => p.id === updatedPoint.id)
    if (currentPoint && currentPoint.name !== updatedPoint.name) {
      renameWorldPoint(updatedPoint.id, updatedPoint.name)
    }
    // TODO: Implement full world point update when available
  }

  const handleWorldPointEditClose = () => {
    setWorldPointEditWindow({ isOpen: false, worldPointId: null })
  }

  // Enhanced line click handler for selection and editing
  const handleEnhancedLineClick = (lineId: string, ctrlKey: boolean, shiftKey: boolean) => {
    const lineEntity = getLineEntity(lineId)
    if (!lineEntity) return

    if (ctrlKey || shiftKey) {
      // Selection behavior with modifiers
      handleEntityClick(lineEntity, ctrlKey, shiftKey)
    } else {
      // No modifiers - both select the line AND open edit window for immediate editing
      handleEntityClick(lineEntity, false, false) // Select the line first
      handleEditLineOpen(lineId) // Then open edit window
    }
  }

  const handlePlaneClick = (planeId: string, ctrlKey: boolean, shiftKey: boolean) => {
    // TODO: Implement plane selection/editing
    console.log('Plane clicked:', planeId, { ctrlKey, shiftKey })
  }

  const handleEmptySpaceClick = useCallback((shiftKey: boolean) => {
    // Clear selection unless holding shift
    if (!shiftKey) {
      clearSelection()
    }
  }, [clearSelection])

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
              if (activeTool === 'line') {
                setActiveTool('select')
                setEditingLineId(null)
              } else {
                setEditingLineId(null) // Clear editing mode for creation
                setActiveTool('line')
              }
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
  const renderImageWorkspace = useCallback(() => (
    <ImageWorkspace
      image={currentImage}
      imageViewerRef={imageViewerRef}
      worldPoints={worldPoints}
      lines={viewerLines}
      selectedPointIds={selectedPointIds}
      selectedLineIds={selectedLineIds}
      hoveredConstraintId={hoveredConstraintId}
      hoveredWorldPointId={hoveredWorldPointId}
      placementMode={placementMode}
      activeConstraintType={activeConstraintType}
      constructionPreview={constructionPreview}
      isPointCreationActive={activeTool === 'point'}
      onPointClick={handleEnhancedPointClick}
      onLineClick={handleEnhancedLineClick}
      onCreatePoint={handleImageClick}
      onMovePoint={handleMovePoint}
      onPointHover={setHoveredWorldPointId}
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
    selectedLineIds,
    selectedPointIds,
    setHoveredWorldPointId,
    hoveredConstraintId,
    hoveredWorldPointId,
    viewerLines,
    worldPoints,
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
        selectedPointIds={selectedPointIds}
        selectedLineIds={selectedLineIds}
        selectedPlaneIds={selectedPlaneIds}
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
    selectedLineIds,
    selectedPlaneIds,
    selectedPointIds
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
              <button className="btn-tool"><FontAwesomeIcon icon={faFolderOpen} /> Open</button>
              <button className="btn-tool"><FontAwesomeIcon icon={faFloppyDisk} /> Save</button>
              <button className="btn-tool"><FontAwesomeIcon icon={faFileExport} /> Export</button>
              <button
                className="btn-tool btn-clear-project"
                onClick={() => {
                  if (confirm('Are you sure you want to clear the entire project?\n\nThis will remove all world points, images, lines, planes, and constraints. This action cannot be undone.')) {
                    clearProject()
                  }
                }}
                title="Clear entire project"
              >
                <FontAwesomeIcon icon={faTrash} /> Clear
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
            <div
              className="sidebar-left"
              style={{ width: `${leftSidebarWidth}px` }}
            >
              <ImageNavigationToolbar
                images={project.images}
                currentImageId={currentImageId}
                worldPoints={worldPoints}
                selectedWorldPointIds={selectedPointEntities.map(p => p.getId())}
                hoveredWorldPointId={hoveredWorldPointId}
                isCreatingConstraint={!!activeConstraintType}
                onImageSelect={setCurrentImageId}
                onImageAdd={addImage}
                onImageRename={renameImage}
                onImageDelete={deleteImage}
                getImagePointCount={getImagePointCount}
                getSelectedPointsInImage={(imageId) => getSelectedPointsInImage(imageId, selectedPointEntities.map(p => p.getId()))}
                imageHeights={imageHeights}
                onImageHeightChange={handleImageHeightChange}
                imageSortOrder={imageSortOrder}
                onImageReorder={handleImageReorder}
                onWorldPointHover={setHoveredWorldPointId}
                onWorldPointClick={handleEnhancedPointClick}
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

              {/* Resize hint panel */}
              <div className="resize-hint-panel">
                Drag to resize <FontAwesomeIcon icon={faArrowRight} />
              </div>
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
                      // Clear construction preview
                      setConstructionPreview(null)
                      if (constraints) {
                        // TODO: Apply line-local constraints
                        console.log('Line created with constraints:', lineId, constraints)
                      }
                      // Beep on successful creation
                      console.log(' Line created successfully!')
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
                        console.log(`Warning: Line already exists: ${existingLine.name}`)
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
                editingLineId={editingLineId}
                onUpdateLine={handleEditLineSave}
                onDeleteLine={handleEditLineDelete}
                onClearEditingLine={() => setEditingLineId(null)}
                projectConstraints={project?.constraints || {}}
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
                hoveredWorldPointId={hoveredWorldPointId}
                currentImageId={currentImageId}
                placementMode={placementMode}
                onSelectWorldPoint={(pointId: string, ctrlKey: boolean, shiftKey: boolean) =>
                  handleEnhancedPointClick(pointId, ctrlKey, shiftKey)
                }
                onHighlightWorldPoint={() => {}}
                onHoverWorldPoint={setHoveredWorldPointId}
                onRenameWorldPoint={renameWorldPoint}
                onDeleteWorldPoint={deleteWorldPoint}
                onEditWorldPoint={handleWorldPointEdit}
                onStartPlacement={startPlacementMode}
                onCancelPlacement={cancelPlacementMode}
              />

              {/* Entity Management Buttons */}
              <div className="entity-management-panel">
                <div className="panel-header">
                  <h3>Entity Management</h3>
                </div>
                <div className="entity-buttons">
                  <button
                    className="entity-button"
                    onClick={() => setShowLinesPopup(true)}
                    title="Manage lines"
                  >
                    <span className="button-icon">??</span>
                    <span className="button-label">Lines</span>
                    <span className="button-count">{Object.keys(project?.lines || {}).length}</span>
                  </button>

                  <button
                    className="entity-button"
                    onClick={() => setShowPlanesPopup(true)}
                    title="Manage planes"
                  >
                    <span className="button-icon">??</span>
                    <span className="button-label">Planes</span>
                    <span className="button-count">{Object.keys(project?.planes || {}).length}</span>
                  </button>

                  <button
                    className="entity-button"
                    onClick={() => setShowImagePointsPopup(true)}
                    title="Manage image points"
                  >
                    <span className="button-icon">??</span>
                    <span className="button-label">Image Points</span>
                    <span className="button-count">{Object.values(worldPoints || {}).reduce((total, wp) => total + wp.imagePoints.length, 0)}</span>
                  </button>

                  <button
                    className="entity-button"
                    onClick={() => setShowConstraintsPopup(true)}
                    title="Manage constraints"
                  >
                    <span className="button-icon">??</span>
                    <span className="button-label">Constraints</span>
                    <span className="button-count">{constraints.length}</span>
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

            <span style={{ marginLeft: '12px', color: '#888' }}>v0.3-ENHANCED</span>
          </div>
        </div>
      )}
    </WorkspaceManager>

    {/* Edit Line Window removed - now integrated into CreationToolsManager */}

    {/* Entity Management Popups */}
    <LinesPopup
      isOpen={showLinesPopup}
      onClose={() => setShowLinesPopup(false)}
      lines={project?.lines || {}}
      worldPointNames={worldPointNames}
      selectedLines={selectedLineEntities.map(l => l.getId())}
      onEditLine={(lineId) => {
        handleEditLineOpen(lineId)
        setShowLinesPopup(false)
      }}
      onDeleteLine={(lineId) => {
        if (project?.lines[lineId]) {
          deleteLine(lineId)
        }
      }}
      onUpdateLine={(updatedLine) => {
        // TODO: Implement line update through enhanced project
        console.log('Update line:', updatedLine)
      }}
      onToggleLineVisibility={(lineId) => {
        // TODO: Implement line visibility toggle
        console.log('Toggle line visibility:', lineId)
      }}
      onSelectLine={(lineId) => {
        const lineEntity = getLineEntity(lineId)
        if (lineEntity) {
          handleEntityClick(lineEntity, false, false)
        }
      }}
      onCreateLine={(pointIds, constraints) => {
        const lineId = createLine(pointIds, 'segment')
        if (lineId && constraints) {
          // TODO: Apply constraints
          console.log('Line created with constraints:', lineId, constraints)
        }
      }}
    />

    <PlanesPopup
      isOpen={showPlanesPopup}
      onClose={() => setShowPlanesPopup(false)}
      planes={project?.planes || {}}
      worldPointNames={worldPointNames}
      selectedPlanes={selectedPlaneEntities.map(p => p.getId())}
      onEditPlane={(planeId) => {
        // TODO: Implement plane editing
        console.log('Edit plane:', planeId)
      }}
      onDeletePlane={(planeId) => {
        // TODO: Implement plane deletion
        console.log('Delete plane:', planeId)
      }}
      onTogglePlaneVisibility={(planeId) => {
        // TODO: Implement plane visibility toggle
        console.log('Toggle plane visibility:', planeId)
      }}
      onSelectPlane={(planeId) => {
        // TODO: Implement plane selection
        console.log('Select plane:', planeId)
      }}
    />

    <ImagePointsPopup
      isOpen={showImagePointsPopup}
      onClose={() => setShowImagePointsPopup(false)}
      worldPoints={worldPoints}
      images={project?.images || {}}
      onEditImagePoint={(imagePointId) => {
        // TODO: Implement image point editing
        console.log('Edit image point:', imagePointId)
      }}
      onDeleteImagePoint={(imagePointId) => {
        // TODO: Implement image point deletion
        console.log('Delete image point:', imagePointId)
      }}
      onSelectImagePoint={(imagePointId) => {
        // TODO: Implement image point selection
        console.log('Select image point:', imagePointId)
      }}
    />

    <ConstraintsPopup
      isOpen={showConstraintsPopup}
      onClose={() => setShowConstraintsPopup(false)}
      constraints={constraints}
      worldPointNames={worldPointNames}
      lineNames={Object.fromEntries(Object.entries(project?.lines || {}).map(([id, line]) => [id, line.name]))}
      onEditConstraint={(constraintId) => {
        // TODO: Implement constraint editing
        console.log('Edit constraint:', constraintId)
      }}
      onDeleteConstraint={(constraintId) => {
        deleteConstraint(constraintId)
      }}
      onToggleConstraint={(constraintId) => {
        toggleConstraint(constraintId)
      }}
      onSelectConstraint={(constraintId) => {
        // TODO: Implement constraint selection
        console.log('Select constraint:', constraintId)
      }}
    />

    {/* World Point Edit Window */}
    {worldPointEditWindow.worldPointId && (
      <WorldPointEditWindow
        isOpen={worldPointEditWindow.isOpen}
        onClose={handleWorldPointEditClose}
        worldPoint={Object.values(worldPoints).find(p => p.id === worldPointEditWindow.worldPointId)!}
        onUpdateWorldPoint={handleWorldPointUpdate}
        onDeleteWorldPoint={(pointId) => {
          deleteWorldPoint(pointId)
          handleWorldPointEditClose()
        }}
      />
    )}
  </>
  )
}

export default MainLayout



