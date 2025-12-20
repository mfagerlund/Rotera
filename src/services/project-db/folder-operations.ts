import { Folder, ProjectSummary } from './types'
import { FOLDERS_STORE } from './constants'
import { openDatabase, getAllFromStore, getAndUpdateFolder } from './database'
import { generateId } from './utils'
import { listProjects } from './project-operations'

export async function createFolder(name: string, parentId: string | null = null): Promise<string> {
  const db = await openDatabase()
  const id = generateId()

  const folder: Folder = {
    id,
    name,
    parentId,
    createdAt: new Date()
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FOLDERS_STORE, 'readwrite')
    const store = tx.objectStore(FOLDERS_STORE)
    store.add(folder)

    tx.onerror = () => reject(tx.error)
    tx.oncomplete = () => resolve()
  })

  return id
}

export async function listFolders(parentId: string | null = null): Promise<Folder[]> {
  const db = await openDatabase()
  const allFolders = await getAllFromStore<Folder>(db, FOLDERS_STORE)
  const filtered = allFolders.filter(f => f.parentId === parentId)
  return filtered.map((f: Folder) => ({
    ...f,
    createdAt: new Date(f.createdAt)
  }))
}

export async function listAllFolders(): Promise<Folder[]> {
  const db = await openDatabase()
  const folders = await getAllFromStore<Folder>(db, FOLDERS_STORE)
  return folders.map((f: Folder) => ({
    ...f,
    createdAt: new Date(f.createdAt)
  }))
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const db = await openDatabase()
  await getAndUpdateFolder(db, id, (folder) => {
    folder.name = name
  })
}

export async function deleteFolder(id: string): Promise<void> {
  const db = await openDatabase()

  const projects = await listProjects(id)
  if (projects.length > 0) {
    throw new Error('Cannot delete folder with projects. Move or delete projects first.')
  }

  const subfolders = await listFolders(id)
  if (subfolders.length > 0) {
    throw new Error('Cannot delete folder with subfolders. Delete subfolders first.')
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FOLDERS_STORE, 'readwrite')
    const store = tx.objectStore(FOLDERS_STORE)
    store.delete(id)

    tx.onerror = () => reject(tx.error)
    tx.oncomplete = () => resolve()
  })
}

export async function getProjectsRecursive(folderId: string | null): Promise<ProjectSummary[]> {
  const allProjects: ProjectSummary[] = []

  // Get projects in this folder
  const projects = await listProjects(folderId)
  allProjects.push(...projects)

  // Get subfolders and recursively get their projects
  const subfolders = await listFolders(folderId)
  for (const subfolder of subfolders) {
    const subProjects = await getProjectsRecursive(subfolder.id)
    allProjects.push(...subProjects)
  }

  return allProjects
}

export async function getFolderStats(folderId: string): Promise<{ projectCount: number; minError: number | null; maxError: number | null; avgError: number | null }> {
  const projects = await getProjectsRecursive(folderId)

  const errors: number[] = []
  for (const project of projects) {
    if (project.optimizationResult?.error !== null && project.optimizationResult?.error !== undefined) {
      errors.push(project.optimizationResult.error)
    }
  }

  if (errors.length === 0) {
    return { projectCount: projects.length, minError: null, maxError: null, avgError: null }
  }

  const minError = Math.min(...errors)
  const maxError = Math.max(...errors)
  const avgError = errors.reduce((a, b) => a + b, 0) / errors.length

  return { projectCount: projects.length, minError, maxError, avgError }
}
