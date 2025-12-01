// WorldView types and interfaces

import type { WorldPoint } from '../../entities/world-point/WorldPoint'
import type { Line } from '../../entities/line/Line'
import type { Plane } from '../../entities/plane'
import type { ISelectable } from '../../types/selectable'
import type { Project } from '../../entities/project'
import type { Viewpoint } from '../../entities/viewpoint'

export interface WorldViewProps {
  project: Project
  selectedEntities: ISelectable[]
  hoveredConstraintId?: string | null
  onPointClick: (worldPoint: WorldPoint, ctrlKey: boolean, shiftKey: boolean) => void
  onLineClick?: (line: Line, ctrlKey: boolean, shiftKey: boolean) => void
  onPlaneClick?: (plane: Plane, ctrlKey: boolean, shiftKey: boolean) => void
  onCreatePoint?: (x: number, y: number, z: number) => void
  onMovePoint?: (point: WorldPoint, x: number, y: number, z: number) => void
  onLineHover?: (line: Line | null) => void
  onPointHover?: (point: WorldPoint | null) => void
}

export interface WorldViewRef {
  zoomFit: () => void
  zoomSelection: () => void
  resetView: () => void
  lookFromCamera: (viewpoint: Viewpoint) => void
}

export interface ViewMatrix {
  scale: number
  rotation: { x: number; y: number; z: number }
  translation: { x: number; y: number; z: number }
}

export interface DragState {
  isDragging: boolean
  lastX: number
  lastY: number
  dragType: 'rotate' | 'pan' | 'point'
  draggedPoint?: WorldPoint
}

export interface HoverState {
  hoveredPoint: WorldPoint | null
  hoveredLine: Line | null
}

export interface ProjectedPoint {
  x: number
  y: number
  depth?: number
}
