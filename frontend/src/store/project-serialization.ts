// Simple JSON serialization for EntityProject

import type { EntityProject } from '../types/project-entities'
import type { WorldPointDto } from '../entities/world-point'
import type { LineDto } from '../entities/line'
import type { ViewpointDto } from '../entities/viewpoint'
import { WorldPoint } from '../entities/world-point'
import { Line } from '../entities/line'
import { Viewpoint } from '../entities/viewpoint'

// Storage DTO (JSON-serializable)
export interface ProjectDto {
  id: string
  name: string
  worldPoints: Record<string, WorldPointDto>
  lines: Record<string, LineDto>
  viewpoints: Record<string, ViewpointDto>
  constraints: any[] // TODO: constraint DTOs
  settings: EntityProject['settings']
  createdAt: string
  updatedAt: string
}

// Convert EntityProject to DTO (for saving)
export function projectToDto(project: EntityProject): ProjectDto {
  const worldPoints: Record<string, WorldPointDto> = {}
  project.worldPoints.forEach((point, id) => {
    worldPoints[id] = point.toDTO()
  })

  const lines: Record<string, LineDto> = {}
  project.lines.forEach((line, id) => {
    lines[id] = line.toDTO()
  })

  const viewpoints: Record<string, ViewpointDto> = {}
  project.viewpoints.forEach((viewpoint, id) => {
    viewpoints[id] = viewpoint.toDTO()
  })

  return {
    id: project.id,
    name: project.name,
    worldPoints,
    lines,
    viewpoints,
    constraints: [], // TODO: serialize constraints
    settings: project.settings,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  }
}

// Convert DTO to EntityProject (for loading)
export function dtoToProject(dto: ProjectDto): EntityProject {
  const worldPoints = new Map<string, WorldPoint>()
  Object.entries(dto.worldPoints).forEach(([id, pointDto]) => {
    worldPoints.set(id, WorldPoint.fromDTO(pointDto))
  })

  const lines = new Map<string, Line>()
  Object.entries(dto.lines).forEach(([id, lineDto]) => {
    const pointA = worldPoints.get(lineDto.pointA)
    const pointB = worldPoints.get(lineDto.pointB)
    if (pointA && pointB) {
      lines.set(id, Line.fromDTO(lineDto, pointA, pointB))
    }
  })

  const viewpoints = new Map<string, Viewpoint>()
  Object.entries(dto.viewpoints).forEach(([id, viewpointDto]) => {
    viewpoints.set(id, Viewpoint.fromDTO(viewpointDto))
  })

  return {
    id: dto.id,
    name: dto.name,
    worldPoints,
    lines,
    viewpoints,
    constraints: [], // TODO: deserialize constraints
    settings: dto.settings,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt
  }
}

// Save to JSON string
export function saveProjectToJson(project: EntityProject): string {
  const dto = projectToDto(project)
  return JSON.stringify(dto, null, 2)
}

// Load from JSON string
export function loadProjectFromJson(json: string): EntityProject {
  const dto = JSON.parse(json) as ProjectDto
  return dtoToProject(dto)
}

// Save to localStorage
export function saveToLocalStorage(project: EntityProject, key: string = 'pictorigo-project'): void {
  const json = saveProjectToJson(project)
  localStorage.setItem(key, json)
  localStorage.setItem(`${key}-timestamp`, new Date().toISOString())
}

// Load from localStorage
export function loadFromLocalStorage(key: string = 'pictorigo-project'): EntityProject | null {
  const json = localStorage.getItem(key)
  if (!json) return null

  try {
    return loadProjectFromJson(json)
  } catch (e) {
    console.error('Failed to load project from localStorage:', e)
    return null
  }
}

// Auto-save utilities
let autoSaveTimeout: NodeJS.Timeout | null = null

export function enableAutoSave(project: EntityProject, intervalMs: number = 30000): void {
  if (autoSaveTimeout) {
    clearInterval(autoSaveTimeout)
  }

  autoSaveTimeout = setInterval(() => {
    saveToLocalStorage(project)
    console.log('Auto-saved project')
  }, intervalMs)
}

export function disableAutoSave(): void {
  if (autoSaveTimeout) {
    clearInterval(autoSaveTimeout)
    autoSaveTimeout = null
  }
}
