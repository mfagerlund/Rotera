import { Project } from '../entities/project'
import { saveProjectToJson, loadProjectFromJson } from '../store/project-serialization'
import { errorToMessage } from '../types/utils'

export interface ProjectFileMetadata {
  name: string
  description?: string
  version: string
  createdAt: string
  modifiedAt: string
  author?: string
  tags?: string[]
  thumbnailUrl?: string
}

export interface ProjectFile {
  metadata: ProjectFileMetadata
  project: Project
}

export class FileManagerService {
  private static readonly CURRENT_VERSION = '1.0.0'
  private static readonly FILE_EXTENSION = '.pictorigo'
  private static readonly MIME_TYPE = 'application/json'

  static async saveProjectToFile(
    project: Project,
    metadata: Partial<ProjectFileMetadata> = {}
  ): Promise<void> {
    try {
      const projectJson = saveProjectToJson(project)

      const projectFile = {
        metadata: {
          name: metadata.name || project.name || 'Untitled Project',
          description: metadata.description,
          version: this.CURRENT_VERSION,
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
          author: metadata.author,
          tags: metadata.tags || [],
          thumbnailUrl: metadata.thumbnailUrl
        },
        project: JSON.parse(projectJson)
      }

      const jsonString = JSON.stringify(projectFile, null, 2)
      const blob = new Blob([jsonString], { type: this.MIME_TYPE })

      const filename = this.sanitizeFilename(projectFile.metadata.name) + this.FILE_EXTENSION

      // Create download link
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      console.log('Project saved to file:', filename)
    } catch (error) {
      console.error('Error saving project to file:', error)
      throw new Error('Failed to save project to file')
    }
  }

  // Load project from file
  static async loadProjectFromFile(file: File): Promise<ProjectFile> {
    try {
      if (!file.name.endsWith(this.FILE_EXTENSION)) {
        throw new Error(`Invalid file type. Expected ${this.FILE_EXTENSION} file.`)
      }

      const text = await file.text()
      const rawFile = JSON.parse(text)

      // Validate file structure
      if (!rawFile.metadata || !rawFile.project) {
        throw new Error('Invalid project file structure')
      }

      // Check version compatibility
      if (!this.isVersionCompatible(rawFile.metadata.version)) {
        throw new Error(`Incompatible project version: ${rawFile.metadata.version}`)
      }

      const migratedDto = this.migrateProjectDto(rawFile.project, rawFile.metadata.version)
      const entityProject = loadProjectFromJson(JSON.stringify(migratedDto))

      return {
        metadata: {
          ...rawFile.metadata,
          modifiedAt: new Date().toISOString()
        },
        project: entityProject
      }
    } catch (error) {
      console.error('Error loading project from file:', error)
      throw new Error(`Failed to load project: ${errorToMessage(error)}`)
    }
  }

  static async exportProjectData(
    project: Project,
    format: 'json' | 'backup' = 'json'
  ): Promise<void> {
    try {
      const projectJson = saveProjectToJson(project)
      let data: string
      let filename: string
      let mimeType: string

      switch (format) {
        case 'json':
          data = projectJson
          filename = `${this.sanitizeFilename(project.name || 'project')}_data.json`
          mimeType = 'application/json'
          break
        case 'backup':
          data = JSON.stringify({
            version: this.CURRENT_VERSION,
            exportedAt: new Date().toISOString(),
            project: JSON.parse(projectJson)
          }, null, 2)
          filename = `${this.sanitizeFilename(project.name || 'project')}_backup.json`
          mimeType = 'application/json'
          break
        default:
          throw new Error(`Unsupported export format: ${format}`)
      }

      const blob = new Blob([data], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      console.log('Project data exported:', filename)
    } catch (error) {
      console.error('Error exporting project data:', error)
      throw new Error('Failed to export project data')
    }
  }

  static async importProjectData(file: File): Promise<Project> {
    try {
      const text = await file.text()

      if (file.name.endsWith('.json')) {
        const parsedData = JSON.parse(text)

        // Handle different JSON formats - all contain DTOs
        let jsonToLoad: string
        if (parsedData.project && !parsedData.version) {
          // Full project file format
          jsonToLoad = JSON.stringify(parsedData.project)
        } else if (parsedData.version && parsedData.project) {
          // Backup format
          jsonToLoad = JSON.stringify(parsedData.project)
        } else if (parsedData.id || parsedData.name || parsedData.worldPoints) {
          // Direct project data (DTO)
          jsonToLoad = JSON.stringify(parsedData)
        } else {
          throw new Error('Unrecognized JSON format')
        }

        return loadProjectFromJson(jsonToLoad)
      } else {
        throw new Error('Unsupported file format for import')
      }
    } catch (error) {
      console.error('Error importing project data:', error)
      throw new Error(`Failed to import project data: ${errorToMessage(error)}`)
    }
  }

  static async createProjectThumbnail(
    project: Project,
    canvasElement?: HTMLCanvasElement
  ): Promise<string | null> {
    try {
      if (!canvasElement) {
        // Create a simple text-based thumbnail
        const canvas = document.createElement('canvas')
        canvas.width = 200
        canvas.height = 150
        const ctx = canvas.getContext('2d')

        if (!ctx) return null

        // Background
        ctx.fillStyle = '#f0f0f0'
        ctx.fillRect(0, 0, 200, 150)

        // Project info
        ctx.fillStyle = '#333'
        ctx.font = '14px Arial'
        ctx.textAlign = 'center'

        const pointCount = project.worldPoints.size
        const imageCount = (project as any).images ? Object.keys((project as any).images).length : project.viewpoints.size
        const constraintCount = project.constraints?.size || 0

        ctx.fillText(project.name || 'Untitled', 100, 30)
        ctx.font = '12px Arial'
        ctx.fillText(`${pointCount} points`, 100, 60)
        ctx.fillText(`${imageCount} images`, 100, 80)
        ctx.fillText(`${constraintCount} constraints`, 100, 100)

        return canvas.toDataURL('image/png')
      } else {
        // Use provided canvas element
        return canvasElement.toDataURL('image/png')
      }
    } catch (error) {
      console.error('Error creating thumbnail:', error)
      return null
    }
  }

  // Validate project file integrity
  static validateProjectFile(projectFile: ProjectFile): boolean {
    try {
      // Check required metadata fields
      if (!projectFile.metadata.name || !projectFile.metadata.version) {
        return false
      }

      const proj = projectFile.project
      if (!proj.worldPoints || !(proj.worldPoints instanceof Set)) {
        return false
      }

      if (!proj.viewpoints || !(proj.viewpoints instanceof Set)) {
        return false
      }

      if (!Array.isArray(proj.constraints)) {
        return false
      }

      return true
    } catch (error) {
      return false
    }
  }

  // Get file size in human readable format
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes'

    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Private helper methods
  private static sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-z0-9\-_\s]/gi, '_').trim()
  }

  private static isVersionCompatible(version: string): boolean {
    const [major] = version.split('.').map(Number)
    const [currentMajor] = this.CURRENT_VERSION.split('.').map(Number)

    return major <= currentMajor
  }

  private static migrateProjectDto(dto: any, fromVersion: string): any {
    return {
      id: dto.id || crypto.randomUUID(),
      name: dto.name || 'Migrated Project',
      worldPoints: dto.worldPoints || {},
      lines: dto.lines || {},
      viewpoints: dto.viewpoints || {},
      constraints: dto.constraints || [],
      settings: dto.settings || this.getDefaultSettings(),
      createdAt: dto.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }

  private static getDefaultSettings() {
    return {
      showPointNames: true,
      autoSave: false,
      theme: 'light' as const,
      measurementUnits: 'meters' as const,
      precisionDigits: 2,
      showConstraintGlyphs: true,
      showMeasurements: true,
      autoOptimize: false,
      gridVisible: true,
      snapToGrid: false,
      defaultWorkspace: 'image' as const,
      showConstructionGeometry: true,
      enableSmartSnapping: true,
      constraintPreview: true,
      visualFeedbackLevel: 'standard' as const
    }
  }

  static enableAutoSave(
    project: Project,
    intervalMs: number = 30000
  ): () => void {
    const saveToLocalStorage = () => {
      try {
        const projectJson = saveProjectToJson(project)
        const autoSaveData = {
          project: JSON.parse(projectJson),
          savedAt: new Date().toISOString()
        }
        localStorage.setItem('pictorigo_autosave', JSON.stringify(autoSaveData))
        console.log('Auto-saved project to localStorage')
      } catch (error) {
        console.warn('Failed to auto-save project:', error)
      }
    }

    const intervalId = setInterval(saveToLocalStorage, intervalMs)

    // Return cleanup function
    return () => {
      clearInterval(intervalId)
    }
  }

  static recoverAutoSavedProject(): { project: Project; savedAt: string } | null {
    try {
      const autoSaveData = localStorage.getItem('pictorigo_autosave')
      if (!autoSaveData) return null

      const data = JSON.parse(autoSaveData)
      if (!data.project || !data.savedAt) return null

      const entityProject = loadProjectFromJson(JSON.stringify(data.project))

      return {
        project: entityProject,
        savedAt: data.savedAt
      }
    } catch (error) {
      console.warn('Failed to recover auto-saved project:', error)
      return null
    }
  }

  // Clear auto-save data
  static clearAutoSave(): void {
    try {
      localStorage.removeItem('pictorigo_autosave')
      console.log('Auto-save data cleared')
    } catch (error) {
      console.warn('Failed to clear auto-save data:', error)
    }
  }
}

export default FileManagerService