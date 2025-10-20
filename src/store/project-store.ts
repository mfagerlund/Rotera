import { Project } from '../entities/project'
import type { WorldPoint } from '../entities/world-point'
import type { Line } from '../entities/line'
import type { Viewpoint } from '../entities/viewpoint'
import type { Constraint } from '../entities/constraints'

export let project: Project = Project.create('Untitled Project')

export function newProject(name?: string): Project {
  project = Project.create(name || 'Untitled Project')
  return project
}

export function loadProject(loadedProject: Project): void {
  project = loadedProject
}

export function getProject(): Project {
  return project
}

export function addWorldPoint(point: WorldPoint): void {
  project.addWorldPoint(point)
}

export function addLine(line: Line): void {
  project.addLine(line)
}

export function addViewpoint(viewpoint: Viewpoint): void {
  project.addViewpoint(viewpoint)
}

export function addConstraint(constraint: Constraint): void {
  project.addConstraint(constraint)
}

export function deleteWorldPoint(point: WorldPoint): boolean {
  project.removeWorldPoint(point)
  return true
}

export function deleteLine(line: Line): boolean {
  project.removeLine(line)
  return true
}

export function deleteViewpoint(viewpoint: Viewpoint): boolean {
  project.removeViewpoint(viewpoint)
  return true
}

export function deleteConstraint(constraint: Constraint): boolean {
  project.removeConstraint(constraint)
  return true
}

export function worldPointExists(point: WorldPoint): boolean {
  return project.worldPoints.has(point)
}

export function lineExists(line: Line): boolean {
  return project.lines.has(line)
}

export function viewpointExists(viewpoint: Viewpoint): boolean {
  return project.viewpoints.has(viewpoint)
}

export function getAllWorldPoints(): WorldPoint[] {
  return Array.from(project.worldPoints)
}

export function getAllLines(): Line[] {
  return Array.from(project.lines)
}

export function getAllViewpoints(): Viewpoint[] {
  return Array.from(project.viewpoints)
}

export function getAllConstraints(): Constraint[] {
  return [...project.constraints]
}

export function clearProject(): void {
  project.clear()
}

export function getProjectStats() {
  return project.getStats()
}
