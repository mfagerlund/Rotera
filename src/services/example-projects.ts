import { Project } from '../entities/project'
import { loadProjectFromJson } from '../store/project-serialization'
import { ProjectDB, Folder, ProjectSummary } from './project-db'

export interface ExampleProject {
  id: string
  name: string
  description: string
  file: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  concepts: string[]
}

export interface ExampleManifest {
  version: string
  examples: ExampleProject[]
}

const EXAMPLES_BASE_URL = '/examples'
const EXAMPLES_FOLDER_NAME = 'Examples'

export class ExampleProjectService {
  private static cachedManifest: ExampleManifest | null = null

  /**
   * Fetch the examples manifest from the server
   */
  static async getManifest(): Promise<ExampleManifest> {
    if (this.cachedManifest) {
      return this.cachedManifest
    }

    const response = await fetch(`${EXAMPLES_BASE_URL}/index.json`)
    if (!response.ok) {
      throw new Error(`Failed to fetch examples manifest: ${response.statusText}`)
    }

    this.cachedManifest = await response.json()
    return this.cachedManifest!
  }

  /**
   * Fetch and parse a single example project
   */
  static async fetchExample(example: ExampleProject): Promise<Project> {
    const response = await fetch(`${EXAMPLES_BASE_URL}/${example.file}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch example ${example.name}: ${response.statusText}`)
    }

    const json = await response.text()
    return loadProjectFromJson(json)
  }

  /**
   * Get or create the Examples folder
   */
  static async getOrCreateExamplesFolder(): Promise<string> {
    const folders = await ProjectDB.listFolders(null)
    const existingFolder = folders.find((f: Folder) => f.name === EXAMPLES_FOLDER_NAME)

    if (existingFolder) {
      return existingFolder.id
    }

    return await ProjectDB.createFolder(EXAMPLES_FOLDER_NAME, null)
  }

  /**
   * Import a single example into the Examples folder
   */
  static async importExample(example: ExampleProject): Promise<void> {
    const project = await this.fetchExample(example)
    const folderId = await this.getOrCreateExamplesFolder()

    // Save to database in the Examples folder
    await ProjectDB.saveProject(project, folderId)
  }

  /**
   * Import multiple examples
   */
  static async importExamples(
    examples: ExampleProject[],
    onProgress?: (current: number, total: number) => void
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const result = { success: 0, failed: 0, errors: [] as string[] }

    for (let i = 0; i < examples.length; i++) {
      const example = examples[i]
      onProgress?.(i + 1, examples.length)

      try {
        await this.importExample(example)
        result.success++
      } catch (error) {
        result.failed++
        result.errors.push(`${example.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    return result
  }

  /**
   * Check which examples are already imported (by name match in Examples folder)
   */
  static async getImportedExampleNames(): Promise<Set<string>> {
    const folders = await ProjectDB.listFolders(null)
    const examplesFolder = folders.find((f: Folder) => f.name === EXAMPLES_FOLDER_NAME)

    if (!examplesFolder) {
      return new Set()
    }

    const projects = await ProjectDB.listProjects(examplesFolder.id)
    return new Set(projects.map((p: ProjectSummary) => p.name))
  }
}
