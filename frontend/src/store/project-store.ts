// Simple global project store - no Repository pattern needed

import type { EntityProject } from '../types/project-entities'
import { WorldPoint } from '../entities/world-point'
import { Line } from '../entities/line'
import { Viewpoint } from '../entities/viewpoint'
import type { Constraint } from '../entities/constraints/base-constraint'

// Default project settings
const DEFAULT_SETTINGS = {
  showPointNames: true,
  autoSave: true,
  theme: 'dark' as const,
  measurementUnits: 'meters' as const,
  precisionDigits: 3,
  showConstraintGlyphs: true,
  showMeasurements: true,
  autoOptimize: false,
  gridVisible: true,
  snapToGrid: false,
  defaultWorkspace: 'world' as const,
  showConstructionGeometry: true,
  enableSmartSnapping: true,
  constraintPreview: true,
  visualFeedbackLevel: 'standard' as const
}

// Create empty project
function createEmptyProject(): EntityProject {
  return {
    id: crypto.randomUUID(),
    name: 'Untitled Project',
    worldPoints: new Map<string, WorldPoint>(),
    lines: new Map<string, Line>(),
    viewpoints: new Map<string, Viewpoint>(),
    constraints: [],
    history: [],
    settings: { ...DEFAULT_SETTINGS },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

// Global singleton
export let project: EntityProject = createEmptyProject()

// Project management functions
export function newProject(name?: string): EntityProject {
  project = createEmptyProject()
  if (name) {
    project.name = name
  }
  return project
}

export function loadProject(loadedProject: EntityProject): void {
  project = loadedProject
}

export function getProject(): EntityProject {
  return project
}

// Helper utilities for common operations
export function addWorldPoint(point: WorldPoint): void {
  project.worldPoints.set(point.getId(), point)
  project.updatedAt = new Date().toISOString()
}

export function addLine(line: Line): void {
  project.lines.set(line.getId(), line)
  project.updatedAt = new Date().toISOString()
}

export function addViewpoint(viewpoint: Viewpoint): void {
  project.viewpoints.set(viewpoint.getId(), viewpoint)
  project.updatedAt = new Date().toISOString()
}

export function addConstraint(constraint: Constraint): void {
  project.constraints.push(constraint)
  project.updatedAt = new Date().toISOString()
}

export function deleteWorldPoint(id: string): boolean {
  const deleted = project.worldPoints.delete(id)
  if (deleted) {
    project.updatedAt = new Date().toISOString()
  }
  return deleted
}

export function deleteLine(id: string): boolean {
  const deleted = project.lines.delete(id)
  if (deleted) {
    project.updatedAt = new Date().toISOString()
  }
  return deleted
}

export function deleteViewpoint(id: string): boolean {
  const deleted = project.viewpoints.delete(id)
  if (deleted) {
    project.updatedAt = new Date().toISOString()
  }
  return deleted
}

export function deleteConstraint(constraint: Constraint): boolean {
  const index = project.constraints.indexOf(constraint)
  if (index !== -1) {
    project.constraints.splice(index, 1)
    project.updatedAt = new Date().toISOString()
    return true
  }
  return false
}

// Validation helpers
export function worldPointExists(id: string): boolean {
  return project.worldPoints.has(id)
}

export function lineExists(id: string): boolean {
  return project.lines.has(id)
}

export function viewpointExists(id: string): boolean {
  return project.viewpoints.has(id)
}

export function entityExists(id: string): boolean {
  return worldPointExists(id) || lineExists(id) || viewpointExists(id)
}

// Get all entities as array
export function getAllWorldPoints(): WorldPoint[] {
  return Array.from(project.worldPoints.values())
}

export function getAllLines(): Line[] {
  return Array.from(project.lines.values())
}

export function getAllViewpoints(): Viewpoint[] {
  return Array.from(project.viewpoints.values())
}

export function getAllConstraints(): Constraint[] {
  return [...project.constraints]
}

// Clear project
export function clearProject(): void {
  project.worldPoints.clear()
  project.lines.clear()
  project.viewpoints.clear()
  project.constraints = []
  project.updatedAt = new Date().toISOString()
}

// Stats
export function getProjectStats() {
  return {
    worldPoints: project.worldPoints.size,
    lines: project.lines.size,
    viewpoints: project.viewpoints.size,
    constraints: project.constraints.length
  }
}
