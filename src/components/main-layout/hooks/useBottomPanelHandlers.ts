import { useCallback, useRef } from 'react'
import type { Project } from '../../../entities/project'
import type { Line } from '../../../entities/line'
import type { WorldPoint } from '../../../entities/world-point'
import type { Constraint } from '../../../entities/constraints'
import type { CoplanarPointsConstraint } from '../../../entities/constraints/coplanar-points-constraint'
import type { WorldViewRef } from '../../WorldView'
import type { ImagePointReference } from '../../ImagePointsManager'
import type { ActiveTool } from '../../../hooks/useMainLayoutState'
import { getIsDirty, markClean, markDirty } from '../../../store/project-store'

type EntityPopupKey = 'showWorldPointsPopup' | 'showLinesPopup' | 'showPlanesPopup' | 'showImagePointsPopup' | 'showConstraintsPopup' | 'showCoplanarConstraintsPopup' | 'showOptimizationPanel'

interface UseBottomPanelHandlersProps {
  project: Project | null
  deleteLine: (line: Line) => void
  deleteConstraint: (constraint: Constraint) => void
  deleteWorldPoint: (worldPoint: WorldPoint) => void
  handleEntityClick: (entity: unknown, ctrlKey: boolean, shiftKey: boolean) => void
  handleEditLineOpen: (line: Line) => void
  setEntityPopup: (popup: EntityPopupKey, value: boolean) => void
  setEditingCoplanarConstraint: (constraint: CoplanarPointsConstraint | null) => void
  setActiveTool: (tool: ActiveTool) => void
  closeWorldPointEdit: () => void
  saveProject: () => void
  worldViewRef: React.RefObject<WorldViewRef>
  setIsDirtyState: (isDirty: boolean) => void
}

export const useBottomPanelHandlers = ({
  project,
  deleteLine,
  deleteConstraint,
  deleteWorldPoint,
  handleEntityClick,
  handleEditLineOpen,
  setEntityPopup,
  setEditingCoplanarConstraint,
  setActiveTool,
  closeWorldPointEdit,
  saveProject,
  worldViewRef,
  setIsDirtyState
}: UseBottomPanelHandlersProps) => {
  const dirtyStateBeforeOptimizeRef = useRef(false)
  const isOptimizingRef = useRef(false)

  const handleEditLine = useCallback((line: Line) => {
    handleEditLineOpen(line)
    setEntityPopup('showLinesPopup', false)
  }, [handleEditLineOpen, setEntityPopup])

  const handleDeleteAllLines = useCallback(() => {
    if (!project) return
    Array.from(project.lines).forEach(line => deleteLine(line))
  }, [project, deleteLine])

  const handleUpdateLine = useCallback(() => {
    saveProject()
  }, [saveProject])

  const handleSelectLine = useCallback((line: Line) => {
    handleEntityClick(line, false, false)
  }, [handleEntityClick])

  const handleDeleteAllImagePoints = useCallback(() => {
    if (project) {
      Array.from(project.imagePoints).forEach(ip => project.removeImagePoint(ip))
    }
  }, [project])

  const handleDeleteAllConstraints = useCallback(() => {
    if (!project) return
    Array.from(project.constraints).forEach(c => deleteConstraint(c))
  }, [project, deleteConstraint])

  const handleEditCoplanarConstraint = useCallback((constraint: CoplanarPointsConstraint) => {
    setEditingCoplanarConstraint(constraint)
    setActiveTool('plane')
  }, [setEditingCoplanarConstraint, setActiveTool])

  const handleDeleteAllCoplanarConstraints = useCallback(() => {
    project?.coplanarConstraints.forEach(c => deleteConstraint(c))
  }, [project, deleteConstraint])

  const handleSelectCoplanarConstraint = useCallback((constraint: CoplanarPointsConstraint) => {
    handleEntityClick(constraint, false, false)
  }, [handleEntityClick])

  const handleOptimizationStart = useCallback(() => {
    dirtyStateBeforeOptimizeRef.current = getIsDirty()
    isOptimizingRef.current = true
  }, [])

  const handleOptimizationComplete = useCallback((success: boolean, message?: string) => {
    isOptimizingRef.current = false
    if (dirtyStateBeforeOptimizeRef.current) {
      markDirty()
    } else {
      markClean()
    }
    setIsDirtyState(dirtyStateBeforeOptimizeRef.current)
    if (success && worldViewRef.current) {
      worldViewRef.current.zoomFit()
    }
  }, [worldViewRef, setIsDirtyState])

  const handleSelectWorldPoint = useCallback((worldPoint: WorldPoint) => {
    handleEntityClick(worldPoint, false, false)
  }, [handleEntityClick])

  const handleDeleteWorldPoint = useCallback((worldPoint: WorldPoint) => {
    deleteWorldPoint(worldPoint)
    closeWorldPointEdit()
  }, [deleteWorldPoint, closeWorldPointEdit])

  const handleDeleteAllWorldPoints = useCallback(() => {
    if (!project) return
    Array.from(project.worldPoints).forEach(wp => deleteWorldPoint(wp))
  }, [project, deleteWorldPoint])

  const handleDeleteImagePoint = useCallback((ref: ImagePointReference) => {
    if (project) {
      const imagePoint = Array.from(project.imagePoints).find(
        (ip) => ip.worldPoint === ref.worldPoint && ip.viewpoint === ref.viewpoint
      )
      if (imagePoint) {
        project.removeImagePoint(imagePoint)
      }
    }
  }, [project])

  return {
    handleEditLine,
    handleDeleteAllLines,
    handleUpdateLine,
    handleSelectLine,
    handleDeleteAllImagePoints,
    handleDeleteAllConstraints,
    handleEditCoplanarConstraint,
    handleDeleteAllCoplanarConstraints,
    handleSelectCoplanarConstraint,
    handleOptimizationStart,
    handleOptimizationComplete,
    handleSelectWorldPoint,
    handleDeleteWorldPoint,
    handleDeleteAllWorldPoints,
    handleDeleteImagePoint,
    isOptimizingRef
  }
}
