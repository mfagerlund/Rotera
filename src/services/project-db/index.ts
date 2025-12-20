// Re-export types
export type {
  OptimizationResultSummary,
  ProjectSummary,
  Folder,
  StoredImage,
  StoredProject,
  ThumbnailGeometry
} from './types'

// Re-export project operations
export {
  listProjects,
  listAllProjects,
  loadProject,
  saveProject,
  getStoredProject,
  getProjectCreatedAt,
  deleteProject,
  moveProject,
  renameProject,
  copyProject,
  hasProjects,
  saveOptimizationResult
} from './project-operations'

// Re-export folder operations
export {
  createFolder,
  listFolders,
  listAllFolders,
  renameFolder,
  deleteFolder,
  getProjectsRecursive,
  getFolderStats
} from './folder-operations'

// Re-export migration
export { migrateFromLocalStorage } from './migration'

// Main ProjectDB object for backward compatibility
import * as projectOps from './project-operations'
import * as folderOps from './folder-operations'
import { migrateFromLocalStorage } from './migration'

export const ProjectDB = {
  // Project operations
  listProjects: projectOps.listProjects,
  listAllProjects: projectOps.listAllProjects,
  loadProject: projectOps.loadProject,
  saveProject: projectOps.saveProject,
  getStoredProject: projectOps.getStoredProject,
  getProjectCreatedAt: projectOps.getProjectCreatedAt,
  deleteProject: projectOps.deleteProject,
  moveProject: projectOps.moveProject,
  renameProject: projectOps.renameProject,
  copyProject: projectOps.copyProject,
  hasProjects: projectOps.hasProjects,
  saveOptimizationResult: projectOps.saveOptimizationResult,

  // Folder operations
  createFolder: folderOps.createFolder,
  listFolders: folderOps.listFolders,
  listAllFolders: folderOps.listAllFolders,
  renameFolder: folderOps.renameFolder,
  deleteFolder: folderOps.deleteFolder,
  getProjectsRecursive: folderOps.getProjectsRecursive,
  getFolderStats: folderOps.getFolderStats,

  // Migration
  migrateFromLocalStorage
}
