// Central state management for MainLayout
import { useState, useCallback } from 'react'
import { WorldPoint } from '../entities/world-point'
import { Line as LineEntity } from '../entities/line'
import { Viewpoint } from '../entities/viewpoint'
import { CoplanarPointsConstraint } from '../entities/constraints/coplanar-points-constraint'
import { getProject } from '../store/project-store'

export type ActiveTool = 'select' | 'point' | 'line' | 'plane' | 'circle' | 'loop' | 'vanishing' | 'orientationPaint'

export interface MainLayoutState {
  // Tool state
  activeTool: ActiveTool
  setActiveTool: (tool: ActiveTool) => void

  // Placement mode
  placementMode: { active: boolean; worldPoint: WorldPoint | null }
  startPlacementMode: (worldPoint: WorldPoint) => void
  cancelPlacementMode: () => void

  // Hover state
  hoveredWorldPoint: WorldPoint | null
  setHoveredWorldPoint: (worldPoint: WorldPoint | null) => void
  hoveredCoplanarConstraint: CoplanarPointsConstraint | null
  setHoveredCoplanarConstraint: (constraint: CoplanarPointsConstraint | null) => void

  // Sidebar width
  leftSidebarWidth: number
  setLeftSidebarWidth: (width: number) => void

  // Image heights
  imageHeights: Record<string, number>
  handleImageHeightChange: (viewpoint: Viewpoint, height: number) => void

  // Image sort order
  imageSortOrder: string[]
  handleImageReorder: (newOrder: string[]) => void

  // Edit line state
  editingLine: LineEntity | null
  setEditingLine: (line: LineEntity | null) => void

  // Edit coplanar constraint state
  editingCoplanarConstraint: CoplanarPointsConstraint | null
  setEditingCoplanarConstraint: (constraint: CoplanarPointsConstraint | null) => void

  // Entity popup states
  entityPopups: {
    showWorldPointsPopup: boolean
    showLinesPopup: boolean
    showPlanesPopup: boolean
    showImagePointsPopup: boolean
    showConstraintsPopup: boolean
    showCoplanarConstraintsPopup: boolean
    showOptimizationPanel: boolean
  }
  setEntityPopup: (popup: keyof MainLayoutState['entityPopups'], value: boolean) => void

  // Optimization trigger - increments to signal OptimizationPanel to run
  optimizeTrigger: number
  triggerOptimization: () => void

  // World point edit window
  worldPointEditWindow: { isOpen: boolean; worldPoint: WorldPoint | null }
  openWorldPointEdit: (worldPoint: WorldPoint) => void
  closeWorldPointEdit: () => void

  // Vanishing point quality window
  showVPQualityWindow: boolean
  openVPQualityWindow: () => void
  closeVPQualityWindow: () => void
}

export interface UseMainLayoutStateOptions {
  onOpenWorldPointEdit?: (worldPoint: WorldPoint) => void
}

export function useMainLayoutState(options: UseMainLayoutStateOptions = {}): MainLayoutState {
  const { onOpenWorldPointEdit } = options
  // Tool state
  const [activeTool, setActiveTool] = useState<ActiveTool>('select')

  // Placement mode
  const [placementMode, setPlacementMode] = useState<{
    active: boolean
    worldPoint: WorldPoint | null
  }>({ active: false, worldPoint: null })

  const startPlacementMode = useCallback((worldPoint: WorldPoint) => {
    setPlacementMode({ active: true, worldPoint })
  }, [])

  const cancelPlacementMode = useCallback(() => {
    setPlacementMode({ active: false, worldPoint: null })
  }, [])

  // Hover state
  const [hoveredWorldPoint, setHoveredWorldPoint] = useState<WorldPoint | null>(null)
  const [hoveredCoplanarConstraint, setHoveredCoplanarConstraint] = useState<CoplanarPointsConstraint | null>(null)

  // Sidebar width - stored in project
  const project = getProject()
  const [leftSidebarWidth, setLeftSidebarWidthState] = useState(() => project.leftSidebarWidth)

  const setLeftSidebarWidth = useCallback((width: number) => {
    setLeftSidebarWidthState(width)
    getProject().leftSidebarWidth = width
  }, [])

  // Image heights - stored in project
  const [imageHeights, setImageHeightsState] = useState<Record<string, number>>(() => project.imageHeights)

  const handleImageHeightChange = useCallback((viewpoint: Viewpoint, height: number) => {
    const proj = getProject()
    const newHeights = { ...proj.imageHeights, [viewpoint.getName()]: height }
    setImageHeightsState(newHeights)
    proj.imageHeights = newHeights
  }, [])

  // Image sort order - stored in project
  const [imageSortOrder, setImageSortOrderState] = useState<string[]>(() => {
    return project.imageSortOrder ?? []
  })

  const handleImageReorder = useCallback((newOrder: string[]) => {
    setImageSortOrderState(newOrder)
    getProject().imageSortOrder = newOrder
  }, [])

  // Edit line state
  const [editingLine, setEditingLine] = useState<LineEntity | null>(null)

  // Edit coplanar constraint state
  const [editingCoplanarConstraint, setEditingCoplanarConstraint] = useState<CoplanarPointsConstraint | null>(null)

  // Entity popups
  const [entityPopups, setEntityPopups] = useState({
    showWorldPointsPopup: false,
    showLinesPopup: false,
    showPlanesPopup: false,
    showImagePointsPopup: false,
    showConstraintsPopup: false,
    showCoplanarConstraintsPopup: false,
    showOptimizationPanel: false
  })

  const setEntityPopup = useCallback((popup: keyof typeof entityPopups, value: boolean) => {
    setEntityPopups(prev => ({ ...prev, [popup]: value }))
  }, [])

  // Optimization trigger
  const [optimizeTrigger, setOptimizeTrigger] = useState(0)
  const triggerOptimization = useCallback(() => {
    setEntityPopups(prev => ({ ...prev, showOptimizationPanel: true }))
    setOptimizeTrigger(prev => prev + 1)
  }, [])

  // World point edit window
  const [worldPointEditWindow, setWorldPointEditWindow] = useState<{
    isOpen: boolean
    worldPoint: WorldPoint | null
  }>({ isOpen: false, worldPoint: null })

  const openWorldPointEdit = useCallback((worldPoint: WorldPoint) => {
    onOpenWorldPointEdit?.(worldPoint)
    setWorldPointEditWindow({ isOpen: true, worldPoint })
  }, [onOpenWorldPointEdit])

  const closeWorldPointEdit = useCallback(() => {
    setWorldPointEditWindow({ isOpen: false, worldPoint: null })
  }, [])

  // Vanishing point quality window
  const [showVPQualityWindow, setShowVPQualityWindow] = useState(false)

  const openVPQualityWindow = useCallback(() => {
    setShowVPQualityWindow(true)
  }, [])

  const closeVPQualityWindow = useCallback(() => {
    setShowVPQualityWindow(false)
  }, [])

  return {
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
  }
}
