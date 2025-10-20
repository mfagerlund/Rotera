// Unified selection interface for co-selecting entities like points, lines, planes

import type { EntityId, PointId, LineId, PlaneId, CameraId, ImageId, ConstraintId } from './ids'

export type SelectableType = 'point' | 'line' | 'plane' | 'viewpoint' | 'camera' | 'image' | 'constraint'

export interface ISelectable {
  // Core identification
  getId(): EntityId
  getType(): SelectableType
  getName(): string

  // Direct field access (not methods)
  isVisible: boolean

  // Methods
  isLocked(): boolean

  // Dependency tracking for referential integrity
  getDependencies(): EntityId[]  // What this entity depends on
  getDependents(): EntityId[]    // What depends on this entity

  // Selection state
  isSelected(): boolean
  setSelected(selected: boolean): void

  // Validation
  canDelete(): boolean  // Check if safe to delete (no dependents)
  getDeleteWarning(): string | null  // Warning message if deletion has consequences
}

// Selection management
export interface EntitySelection {
  readonly items: ReadonlyArray<ISelectable>
  readonly count: number

  // Basic operations
  add(item: ISelectable): void
  addMultiple(items: ISelectable[]): void
  remove(item: ISelectable): void
  removeMultiple(items: ISelectable[]): void
  toggle(item: ISelectable): void
  clear(): void

  // Query operations
  has(item: ISelectable): boolean
  hasId(id: EntityId): boolean
  getById(id: EntityId): ISelectable | undefined
  getByType<T extends ISelectable>(type: SelectableType): T[]

  // Bulk operations
  selectAll(items: ISelectable[]): void
  selectByType(type: SelectableType, items: ISelectable[]): void
  selectByPredicate(predicate: (item: ISelectable) => boolean, items: ISelectable[]): void

  // Dependency operations
  selectWithDependencies(item: ISelectable): void  // Select item and all its dependencies
  selectWithDependents(item: ISelectable): void    // Select item and all dependents
  getSelectionDependencies(): EntityId[]          // All dependencies of selected items
  getSelectionDependents(): EntityId[]            // All dependents of selected items

  // Validation
  canDeleteSelection(): boolean
  getDeleteWarnings(): string[]

  // Events
  onChange(callback: (selection: EntitySelection) => void): () => void  // Returns unsubscribe
}

// Implementation of EntitySelection
export class EntitySelectionImpl implements EntitySelection {
  private selectedItems = new Set<ISelectable>()
  private callbacks = new Set<(selection: EntitySelection) => void>()

  get items(): ReadonlyArray<ISelectable> {
    return Array.from(this.selectedItems)
  }

  get count(): number {
    return this.selectedItems.size
  }

  add(item: ISelectable): void {
    if (!this.selectedItems.has(item)) {
      this.selectedItems.add(item)
      item.setSelected(true)
      this.notifyChange()
    }
  }

  addMultiple(items: ISelectable[]): void {
    let changed = false
    for (const item of items) {
      if (!this.selectedItems.has(item)) {
        this.selectedItems.add(item)
        item.setSelected(true)
        changed = true
      }
    }
    if (changed) {
      this.notifyChange()
    }
  }

  remove(item: ISelectable): void {
    if (this.selectedItems.has(item)) {
      this.selectedItems.delete(item)
      item.setSelected(false)
      this.notifyChange()
    }
  }

  removeMultiple(items: ISelectable[]): void {
    let changed = false
    for (const item of items) {
      if (this.selectedItems.has(item)) {
        this.selectedItems.delete(item)
        item.setSelected(false)
        changed = true
      }
    }
    if (changed) {
      this.notifyChange()
    }
  }

  toggle(item: ISelectable): void {
    if (this.selectedItems.has(item)) {
      this.remove(item)
    } else {
      this.add(item)
    }
  }

  clear(): void {
    if (this.selectedItems.size > 0) {
      for (const item of this.selectedItems) {
        item.setSelected(false)
      }
      this.selectedItems.clear()
      this.notifyChange()
    }
  }

  has(item: ISelectable): boolean {
    return this.selectedItems.has(item)
  }

  hasId(id: EntityId): boolean {
    return Array.from(this.selectedItems).some(item => item.getId() === id)
  }

  getById(id: EntityId): ISelectable | undefined {
    return Array.from(this.selectedItems).find(item => item.getId() === id)
  }

  getByType<T extends ISelectable>(type: SelectableType): T[] {
    return Array.from(this.selectedItems).filter(item => item.getType() === type) as T[]
  }

  selectAll(items: ISelectable[]): void {
    this.clear()
    this.addMultiple(items)
  }

  selectByType(type: SelectableType, items: ISelectable[]): void {
    const itemsOfType = items.filter(item => item.getType() === type)
    this.addMultiple(itemsOfType)
  }

  selectByPredicate(predicate: (item: ISelectable) => boolean, items: ISelectable[]): void {
    const matchingItems = items.filter(predicate)
    this.addMultiple(matchingItems)
  }

  selectWithDependencies(item: ISelectable): void {
    const dependencies = item.getDependencies()
    // Note: Would need repository access to resolve EntityId to ISelectable
    // This is a placeholder for the interface
    this.add(item)
  }

  selectWithDependents(item: ISelectable): void {
    const dependents = item.getDependents()
    // Note: Would need repository access to resolve EntityId to ISelectable
    // This is a placeholder for the interface
    this.add(item)
  }

  getSelectionDependencies(): EntityId[] {
    const dependencies = new Set<EntityId>()
    for (const item of this.selectedItems) {
      for (const dep of item.getDependencies()) {
        dependencies.add(dep)
      }
    }
    return Array.from(dependencies)
  }

  getSelectionDependents(): EntityId[] {
    const dependents = new Set<EntityId>()
    for (const item of this.selectedItems) {
      for (const dep of item.getDependents()) {
        dependents.add(dep)
      }
    }
    return Array.from(dependents)
  }

  canDeleteSelection(): boolean {
    return Array.from(this.selectedItems).every(item => item.canDelete())
  }

  getDeleteWarnings(): string[] {
    const warnings: string[] = []
    for (const item of this.selectedItems) {
      const warning = item.getDeleteWarning()
      if (warning) {
        warnings.push(warning)
      }
    }
    return warnings
  }

  onChange(callback: (selection: EntitySelection) => void): () => void {
    this.callbacks.add(callback)
    return () => {
      this.callbacks.delete(callback)
    }
  }

  private notifyChange(): void {
    for (const callback of this.callbacks) {
      callback(this)
    }
  }
}

// Helper types for selection operations
export interface SelectionContext {
  getAllItems(): ISelectable[]
  getItemById(id: EntityId): ISelectable | undefined
  getItemsByType(type: SelectableType): ISelectable[]
}

// Selection utility functions
export function createSelection(): EntitySelection {
  return new EntitySelectionImpl()
}

export function getSelectionStats(selection: EntitySelection): Record<SelectableType, number> {
  const stats: Record<SelectableType, number> = {
    point: 0,
    line: 0,
    plane: 0,
    viewpoint: 0,
    camera: 0,
    image: 0,
    constraint: 0
  }

  for (const item of selection.items) {
    stats[item.getType()]++
  }

  return stats
}

export function canDeleteSelectionSafely(selection: EntitySelection): { canDelete: boolean; warnings: string[] } {
  const warnings = selection.getDeleteWarnings()
  return {
    canDelete: selection.canDeleteSelection(),
    warnings
  }
}