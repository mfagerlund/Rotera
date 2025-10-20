import type { ISelectable, SelectableType } from '../types/selectable'
import type { WorldPoint } from './world-point'

export class Plane implements ISelectable {
  selected = false
  name: string
  points: Set<WorldPoint>
  color: string
  isVisible: boolean
  opacity: number
  fillStyle: 'solid' | 'wireframe' | 'transparent'

  private constructor(
    name: string,
    points: Set<WorldPoint>,
    color: string,
    isVisible: boolean,
    opacity: number,
    fillStyle: 'solid' | 'wireframe' | 'transparent') {
    this.name = name
    this.points = points
    this.color = color
    this.isVisible = isVisible
    this.opacity = opacity
    this.fillStyle = fillStyle
  }

  static create(
    name: string,
    points: WorldPoint[],
    options: {
      color?: string
      isVisible?: boolean
      opacity?: number
      fillStyle?: 'solid' | 'wireframe' | 'transparent'
    } = {}
  ): Plane {
    if (points.length < 3) {
      throw new Error('Plane requires at least 3 points')
    }

    return new Plane(
      name,
      new Set(points),
      options.color || '#cccccc',
      options.isVisible ?? true,
      options.opacity ?? 0.5,
      options.fillStyle || 'transparent'
    )
  }
  
  getType(): SelectableType {
    return 'plane'
  }

  getName(): string {
    return this.name
  }

  isLocked(): boolean {
    return false
  }
  
  isSelected(): boolean {
    return this.selected
  }

  setSelected(selected: boolean): void {
    this.selected = selected
  }

  canDelete(): boolean {
    return true
  }

  getDeleteWarning(): string | null {
    return null
  }

  getPointCount(): number {
    return this.points.size
  }

  addPoint(point: WorldPoint): void {
    this.points.add(point)
  }

  removePoint(point: WorldPoint): void {
    this.points.delete(point)
  }

  hasPoint(point: WorldPoint): boolean {
    return this.points.has(point)
  }

  getPoints(): WorldPoint[] {
    return Array.from(this.points)
  }

  clone(newName?: string): Plane {
    const now = new Date().toISOString()
    return new Plane(
      newName || `${this.name} (copy)`,
      new Set(this.points),
      this.color,
      this.isVisible,
      this.opacity,
      this.fillStyle
    )
  }

  setVisible(visible: boolean): void {
    this.isVisible = visible
  }

  getNormal(): [number, number, number] | null {
    return null
  }

  getArea(): number | null {
    return null
  }

  isCoplanar(): boolean {
    return true
  }
}
