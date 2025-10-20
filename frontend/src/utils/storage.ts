// localStorage-based project management system

import { EntityProject, ProjectSettings } from '../types/project-entities'

const PROJECT_KEY = 'pictorigo_project'
const SETTINGS_KEY = 'pictorigo_settings'

export class ProjectStorage {
  static save(project: EntityProject): void {
    try {
      project.updatedAt = new Date().toISOString()
      const projectData = JSON.stringify(project)

      // Check storage size before saving
      const storageInfo = this.checkStorageSize()
      if (storageInfo.warning) {
        console.warn(`Storage warning: Using ${(storageInfo.used / 1024 / 1024).toFixed(2)}MB of ${(storageInfo.available / 1024 / 1024).toFixed(2)}MB`)
      }

      localStorage.setItem(PROJECT_KEY, projectData)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        throw new Error('Storage quota exceeded. Please reduce image sizes or clear the project.')
      }
      throw error
    }
  }

  static load(): EntityProject | null {
    try {
      const data = localStorage.getItem(PROJECT_KEY)
      return data ? JSON.parse(data) : null
    } catch (error) {
      console.error('Failed to load project from storage:', error)
      return null
    }
  }

  static clear(): void {
    localStorage.removeItem(PROJECT_KEY)
  }

  static checkStorageSize(): { used: number, available: number, warning: boolean } {
    let used = 0

    // Calculate total localStorage usage
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        used += localStorage[key].length
      }
    }

    const available = 5 * 1024 * 1024 // 5MB typical limit
    const warning = used > available * 0.8 // Warn at 80%

    return { used, available, warning }
  }

  static saveSettings(settings: ProjectSettings): void {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  }

  static loadSettings(): ProjectSettings {
    try {
      const data = localStorage.getItem(SETTINGS_KEY)
      return data ? JSON.parse(data) : {
        showPointNames: true,
        autoSave: true,
        theme: 'dark',
        measurementUnits: 'meters',
        precisionDigits: 3,
        showConstraintGlyphs: true,
        showMeasurements: true,
        autoOptimize: false,
        gridVisible: true,
        snapToGrid: true,
        defaultWorkspace: 'image',
        showConstructionGeometry: true,
        enableSmartSnapping: true,
        constraintPreview: true,
        visualFeedbackLevel: 'standard'
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
      return {
        showPointNames: true,
        autoSave: true,
        theme: 'dark',
        measurementUnits: 'meters',
        precisionDigits: 3,
        showConstraintGlyphs: true,
        showMeasurements: true,
        autoOptimize: false,
        gridVisible: true,
        snapToGrid: true,
        defaultWorkspace: 'image',
        showConstructionGeometry: true,
        enableSmartSnapping: true,
        constraintPreview: true,
        visualFeedbackLevel: 'standard'
      }
    }
  }

  static createEmptyProject(): EntityProject {
    return {
      id: crypto.randomUUID(),
      name: 'New Project',
      worldPoints: new Map(),
      lines: new Map(),
      viewpoints: new Map(),
      constraints: [],
      history: [],
      settings: this.loadSettings(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }
}

export class StorageManager {
  static compressImages(project: EntityProject): EntityProject {
    // TODO: Implement image compression if storage is getting full
    console.warn('Image compression not yet implemented')
    return project
  }

  static estimateProjectSize(project: EntityProject): number {
    return JSON.stringify(project).length
  }

  static canAddImage(imageSize: number): boolean {
    const storageInfo = ProjectStorage.checkStorageSize()
    return (storageInfo.used + imageSize) < storageInfo.available * 0.9
  }
}