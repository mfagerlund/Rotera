// localStorage-based project management system

import { Project } from '../entities/project'

const PROJECT_KEY = 'pictorigo_project'
const SETTINGS_KEY = 'pictorigo_settings'

export class ProjectStorage {
  static save(project: Project): void {
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

  static load(): Project | null {
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

  static loadSettings() {
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

  static createEmptyProject(): Project {
    return Project.create('New Project')
  }
}

export class StorageManager {
  static compressImages(project: Project): Project {
    // TODO: Implement image compression if storage is getting full
    console.warn('Image compression not yet implemented')
    return project
  }

  static estimateProjectSize(project: Project): number {
    return JSON.stringify(project).length
  }

  static canAddImage(imageSize: number): boolean {
    const storageInfo = ProjectStorage.checkStorageSize()
    return (storageInfo.used + imageSize) < storageInfo.available * 0.9
  }
}