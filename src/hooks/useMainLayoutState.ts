// Central state management for MainLayout
import { useState, useCallback, useEffect } from 'react'
import { WorldPoint } from '../entities/world-point'
import { Line as LineEntity } from '../entities/line'
import { Viewpoint } from '../entities/viewpoint'

export type ActiveTool = 'select' | 'point' | 'line' | 'plane' | 'circle' | 'loop' | 'vanishing'

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

  // Entity popup states
  entityPopups: {
    showLinesPopup: boolean
    showPlanesPopup: boolean
    showImagePointsPopup: boolean
    showConstraintsPopup: boolean
    showOptimizationPanel: boolean
  }
  setEntityPopup: (popup: keyof MainLayoutState['entityPopups'], value: boolean) => void

  // World point edit window
  worldPointEditWindow: { isOpen: boolean; worldPoint: WorldPoint | null }
  openWorldPointEdit: (worldPoint: WorldPoint) => void
  closeWorldPointEdit: () => void

  // Vanishing point quality window
  showVPQualityWindow: boolean
  openVPQualityWindow: () => void
  closeVPQualityWindow: () => void
}

export function useMainLayoutState(projectImageSortOrder?: string[]): MainLayoutState {
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

  // Sidebar width with persistence
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('pictorigo-left-sidebar-width')
    return saved ? parseInt(saved, 10) : 180
  })

  // Image heights with persistence
  const [imageHeights, setImageHeights] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('pictorigo-image-heights')
    return saved ? JSON.parse(saved) : {}
  })

  const handleImageHeightChange = useCallback((viewpoint: Viewpoint, height: number) => {
    const newHeights = { ...imageHeights, [viewpoint.getName()]: height }
    setImageHeights(newHeights)
    localStorage.setItem('pictorigo-image-heights', JSON.stringify(newHeights))
  }, [imageHeights])

  // Image sort order with persistence
  const [imageSortOrder, setImageSortOrder] = useState<string[]>(() => {
    if (projectImageSortOrder) return projectImageSortOrder
    const saved = localStorage.getItem('pictorigo-image-sort-order')
    return saved ? JSON.parse(saved) : []
  })

  const handleImageReorder = useCallback((newOrder: string[]) => {
    setImageSortOrder(newOrder)
    localStorage.setItem('pictorigo-image-sort-order', JSON.stringify(newOrder))
  }, [])

  // Edit line state
  const [editingLine, setEditingLine] = useState<LineEntity | null>(null)

  // Entity popups
  const [entityPopups, setEntityPopups] = useState({
    showLinesPopup: false,
    showPlanesPopup: false,
    showImagePointsPopup: false,
    showConstraintsPopup: false,
    showOptimizationPanel: false
  })

  const setEntityPopup = useCallback((popup: keyof typeof entityPopups, value: boolean) => {
    setEntityPopups(prev => ({ ...prev, [popup]: value }))
  }, [])

  // World point edit window
  const [worldPointEditWindow, setWorldPointEditWindow] = useState<{
    isOpen: boolean
    worldPoint: WorldPoint | null
  }>({ isOpen: false, worldPoint: null })

  const openWorldPointEdit = useCallback((worldPoint: WorldPoint) => {
    setWorldPointEditWindow({ isOpen: true, worldPoint })
  }, [])

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
  }
}
