import { Project } from '../entities/project'
import { Serialization } from '../entities/Serialization'

export function saveProjectToJson(project: Project): string {
  return Serialization.serialize(project)
}

export function loadProjectFromJson(json: string): Project {
  return Serialization.deserialize(json)
}

export function saveToLocalStorage(project: Project, key: string = 'pictorigo-project'): void {
  Serialization.saveToLocalStorage(project, key)
}

export function loadFromLocalStorage(key: string = 'pictorigo-project'): Project | null {
  return Serialization.loadFromLocalStorage(key)
}

let autoSaveTimeout: NodeJS.Timeout | null = null

export function enableAutoSave(project: Project, intervalMs: number = 30000): void {
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
