import { WorldPoint } from '../entities/world-point'

interface DragContext {
  worldPoint: WorldPoint | null
  action: 'place' | 'move' | null
}

const dragContext: DragContext = {
  worldPoint: null,
  action: null
}

export function setDraggingWorldPoint(worldPoint: WorldPoint, action: 'place' | 'move'): void {
  dragContext.worldPoint = worldPoint
  dragContext.action = action
}

export function getDraggingWorldPoint(): WorldPoint | null {
  return dragContext.worldPoint
}

export function getDragAction(): 'place' | 'move' | null {
  return dragContext.action
}

export function clearDraggingWorldPoint(): void {
  dragContext.worldPoint = null
  dragContext.action = null
}
