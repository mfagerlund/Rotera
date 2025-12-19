import { Project } from '../entities/project'
import { Serialization } from '../entities/Serialization'

const DB_NAME = 'pictorigo-db'
const DB_VERSION = 1

const PROJECTS_STORE = 'projects'
const IMAGES_STORE = 'images'
const FOLDERS_STORE = 'folders'

export interface OptimizationResultSummary {
  error: number | null
  converged: boolean
  solveTimeMs: number
  errorMessage?: string
  optimizedAt: Date
}

export interface ProjectSummary {
  id: string
  name: string
  folderId: string | null
  createdAt: Date
  updatedAt: Date
  thumbnailUrl?: string
  viewpointCount: number
  worldPointCount: number
  optimizationResult?: OptimizationResultSummary
}

export interface Folder {
  id: string
  name: string
  parentId: string | null
  createdAt: Date
}

export interface StoredImage {
  id: string
  projectId: string
  blob: Blob
  metadata: {
    width: number
    height: number
    mimeType: string
    originalFilename: string
  }
}

interface StoredProject {
  id: string
  name: string
  folderId: string | null
  createdAt: Date
  updatedAt: Date
  data: string
  thumbnailUrl?: string
  viewpointCount: number
  worldPointCount: number
  optimizationResult?: OptimizationResultSummary
}

function generateId(): string {
  return crypto.randomUUID()
}

// Helper function to get all items from a store
function getAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.getAll()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result as T[])
  })
}

// Helper function to convert StoredProject to ProjectSummary
function toProjectSummary(p: StoredProject): ProjectSummary {
  return {
    id: p.id,
    name: p.name,
    folderId: p.folderId,
    createdAt: new Date(p.createdAt),
    updatedAt: new Date(p.updatedAt),
    thumbnailUrl: p.thumbnailUrl,
    viewpointCount: p.viewpointCount,
    worldPointCount: p.worldPointCount,
    optimizationResult: p.optimizationResult ? {
      ...p.optimizationResult,
      optimizedAt: new Date(p.optimizationResult.optimizedAt)
    } : undefined
  }
}

// Helper function to create a transaction with PROJECTS_STORE and IMAGES_STORE
function createProjectAndImagesTransaction(
  db: IDBDatabase,
  mode: IDBTransactionMode
): Promise<{ tx: IDBTransaction; projectStore: IDBObjectStore; imageStore: IDBObjectStore }> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PROJECTS_STORE, IMAGES_STORE], mode)
    const projectStore = tx.objectStore(PROJECTS_STORE)
    const imageStore = tx.objectStore(IMAGES_STORE)

    tx.onerror = () => reject(tx.error)

    resolve({ tx, projectStore, imageStore })
  })
}

// Helper function to get and update a project in a transaction
async function getAndUpdateProject(
  db: IDBDatabase,
  id: string,
  updateFn: (project: StoredProject) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readwrite')
    const store = tx.objectStore(PROJECTS_STORE)

    const getRequest = store.get(id)
    getRequest.onsuccess = () => {
      const project = getRequest.result as StoredProject
      if (project) {
        updateFn(project)
        store.put(project)
      }
    }

    tx.onerror = () => reject(tx.error)
    tx.oncomplete = () => resolve()
  })
}

// Helper function to get and update a folder in a transaction
async function getAndUpdateFolder(
  db: IDBDatabase,
  id: string,
  updateFn: (folder: Folder) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FOLDERS_STORE, 'readwrite')
    const store = tx.objectStore(FOLDERS_STORE)

    const getRequest = store.get(id)
    getRequest.onsuccess = () => {
      const folder = getRequest.result as Folder
      if (folder) {
        updateFn(folder)
        store.put(folder)
      }
    }

    tx.onerror = () => reject(tx.error)
    tx.oncomplete = () => resolve()
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        const projectStore = db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' })
        projectStore.createIndex('folderId', 'folderId', { unique: false })
        projectStore.createIndex('updatedAt', 'updatedAt', { unique: false })
      }

      if (!db.objectStoreNames.contains(IMAGES_STORE)) {
        const imageStore = db.createObjectStore(IMAGES_STORE, { keyPath: 'id' })
        imageStore.createIndex('projectId', 'projectId', { unique: false })
      }

      if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        const folderStore = db.createObjectStore(FOLDERS_STORE, { keyPath: 'id' })
        folderStore.createIndex('parentId', 'parentId', { unique: false })
      }
    }
  })
}

async function extractImageFromDataUrl(dataUrl: string): Promise<{ blob: Blob; mimeType: string } | null> {
  if (!dataUrl.startsWith('data:')) {
    return null
  }

  try {
    const response = await fetch(dataUrl)
    const blob = await response.blob()
    return { blob, mimeType: blob.type }
  } catch {
    return null
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

interface ThumbnailGeometry {
  imageWidth: number
  imageHeight: number
  points: Array<{ u: number; v: number; color: string }>
  lines: Array<{ p1: { u: number; v: number }; p2: { u: number; v: number }; color: string; isConstruction: boolean }>
  vanishingLines: Array<{ p1: { u: number; v: number }; p2: { u: number; v: number }; axis: 'x' | 'y' | 'z' }>
}

const AXIS_COLORS: Record<'x' | 'y' | 'z', string> = {
  x: '#ff0000',
  y: '#00ff00',
  z: '#0000ff'
}

async function createThumbnail(imageUrl: string, geometry?: ThumbnailGeometry, maxSize: number = 120): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not get canvas context'))
        return
      }

      let width = img.width
      let height = img.height

      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width
          width = maxSize
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height
          height = maxSize
        }
      }

      canvas.width = width
      canvas.height = height
      ctx.drawImage(img, 0, 0, width, height)

      // Draw geometry if provided
      if (geometry) {
        const scaleX = width / geometry.imageWidth
        const scaleY = height / geometry.imageHeight

        // Draw lines first (behind points)
        for (const line of geometry.lines) {
          ctx.beginPath()
          ctx.moveTo(line.p1.u * scaleX, line.p1.v * scaleY)
          ctx.lineTo(line.p2.u * scaleX, line.p2.v * scaleY)
          ctx.strokeStyle = line.color
          ctx.lineWidth = 1
          ctx.globalAlpha = 0.7
          if (line.isConstruction) {
            ctx.setLineDash([3, 2])
          } else {
            ctx.setLineDash([])
          }
          ctx.stroke()
        }

        // Draw vanishing lines
        ctx.setLineDash([])
        for (const vl of geometry.vanishingLines) {
          ctx.beginPath()
          ctx.moveTo(vl.p1.u * scaleX, vl.p1.v * scaleY)
          ctx.lineTo(vl.p2.u * scaleX, vl.p2.v * scaleY)
          ctx.strokeStyle = AXIS_COLORS[vl.axis]
          ctx.lineWidth = 1
          ctx.globalAlpha = 0.8
          ctx.stroke()
        }

        // Draw points on top
        ctx.globalAlpha = 1.0
        for (const point of geometry.points) {
          const x = point.u * scaleX
          const y = point.v * scaleY

          ctx.beginPath()
          ctx.arc(x, y, 3, 0, 2 * Math.PI)
          ctx.fillStyle = point.color
          ctx.fill()
          ctx.strokeStyle = 'white'
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }

      resolve(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = imageUrl
  })
}

export const ProjectDB = {
  async listProjects(folderId: string | null = null): Promise<ProjectSummary[]> {
    const db = await openDatabase()
    console.log('[ProjectDB.listProjects] Listing projects in folder:', folderId)
    const allProjects = await getAllFromStore<StoredProject>(db, PROJECTS_STORE)
    console.log('[ProjectDB.listProjects] All projects in DB:', allProjects.length)
    const filtered = allProjects.filter(p => p.folderId === folderId)
    console.log('[ProjectDB.listProjects] Filtered for folderId', folderId, ':', filtered.length)
    return filtered.map(toProjectSummary)
  },

  async listAllProjects(): Promise<ProjectSummary[]> {
    const db = await openDatabase()
    const projects = await getAllFromStore<StoredProject>(db, PROJECTS_STORE)
    return projects.map(toProjectSummary)
  },

  async loadProject(id: string): Promise<Project> {
    const db = await openDatabase()

    const storedProject = await new Promise<StoredProject>((resolve, reject) => {
      const tx = db.transaction(PROJECTS_STORE, 'readonly')
      const store = tx.objectStore(PROJECTS_STORE)
      const request = store.get(id)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        if (!request.result) {
          reject(new Error(`Project not found: ${id}`))
        } else {
          resolve(request.result)
        }
      }
    })

    const project = Serialization.deserialize(storedProject.data)

    const images = await new Promise<StoredImage[]>((resolve, reject) => {
      const tx = db.transaction(IMAGES_STORE, 'readonly')
      const store = tx.objectStore(IMAGES_STORE)
      const index = store.index('projectId')
      const request = index.getAll(id)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || [])
    })

    for (const image of images) {
      const dataUrl = await blobToDataUrl(image.blob)
      for (const viewpoint of project.viewpoints) {
        if (viewpoint.filename === image.metadata.originalFilename) {
          viewpoint.url = dataUrl
          break
        }
      }
    }

    project._dbId = id

    return project
  },

  async saveProject(project: Project, folderId?: string | null): Promise<string> {
    const db = await openDatabase()
    console.log('[ProjectDB.saveProject] Saving project:', project.name, 'to folder:', folderId)

    const existingId = project._dbId
    console.log('[ProjectDB.saveProject] Existing _dbId:', existingId)
    const id = existingId || generateId()
    console.log('[ProjectDB.saveProject] Using id:', id)

    // If folderId is not explicitly provided and project already exists, preserve the existing folderId
    let effectiveFolderId: string | null = folderId ?? null
    if (folderId === undefined && existingId) {
      const existingProject = await this.getStoredProject(id)
      if (existingProject) {
        effectiveFolderId = existingProject.folderId
        console.log('[ProjectDB.saveProject] Preserving existing folderId:', effectiveFolderId)
      }
    }
    const now = new Date()

    const viewpointsArray = Array.from(project.viewpoints)

    const imageEntries: { viewpointIndex: number; blob: Blob; metadata: StoredImage['metadata'] }[] = []
    for (let i = 0; i < viewpointsArray.length; i++) {
      const viewpoint = viewpointsArray[i]
      if (viewpoint.url && viewpoint.url.startsWith('data:')) {
        const extracted = await extractImageFromDataUrl(viewpoint.url)
        if (extracted) {
          imageEntries.push({
            viewpointIndex: i,
            blob: extracted.blob,
            metadata: {
              width: viewpoint.imageWidth,
              height: viewpoint.imageHeight,
              mimeType: extracted.mimeType,
              originalFilename: viewpoint.filename
            }
          })
        }
      }
    }

    const projectCopy = Serialization.deserialize(Serialization.serialize(project))
    for (const viewpoint of projectCopy.viewpoints) {
      if (viewpoint.url && viewpoint.url.startsWith('data:')) {
        viewpoint.url = ''
      }
    }

    const projectData = Serialization.serialize(projectCopy)

    // Build thumbnail with geometry overlay
    let thumbnailUrl: string | undefined
    if (viewpointsArray.length > 0 && viewpointsArray[0].url) {
      try {
        const firstViewpoint = viewpointsArray[0]
        const imgWidth = firstViewpoint.imageWidth
        const imgHeight = firstViewpoint.imageHeight

        // Build geometry for thumbnail
        const points: ThumbnailGeometry['points'] = []
        const worldPointToImageCoords = new Map<unknown, { u: number; v: number }>()
        for (const ip of firstViewpoint.imagePoints) {
          const wp = ip.worldPoint
          points.push({ u: ip.u, v: ip.v, color: wp.color })
          worldPointToImageCoords.set(wp, { u: ip.u, v: ip.v })
        }

        // Lines (only those with both endpoints visible)
        const lines: ThumbnailGeometry['lines'] = []
        for (const line of project.lines) {
          const p1Coords = worldPointToImageCoords.get(line.pointA)
          const p2Coords = worldPointToImageCoords.get(line.pointB)
          if (p1Coords && p2Coords) {
            lines.push({
              p1: p1Coords,
              p2: p2Coords,
              color: line.color,
              isConstruction: line.isConstruction
            })
          }
        }

        // Vanishing lines
        const vanishingLines: ThumbnailGeometry['vanishingLines'] = []
        for (const vl of firstViewpoint.vanishingLines) {
          vanishingLines.push({
            p1: { u: vl.p1.u, v: vl.p1.v },
            p2: { u: vl.p2.u, v: vl.p2.v },
            axis: vl.axis
          })
        }

        const geometry: ThumbnailGeometry = {
          imageWidth: imgWidth,
          imageHeight: imgHeight,
          points,
          lines,
          vanishingLines
        }

        thumbnailUrl = await createThumbnail(firstViewpoint.url, geometry)
        console.log('[ProjectDB.saveProject] Created thumbnail, size:', thumbnailUrl.length)
      } catch (err) {
        console.warn('[ProjectDB.saveProject] Failed to create thumbnail:', err)
      }
    }

    const storedProject: StoredProject = {
      id,
      name: project.name,
      folderId: effectiveFolderId,
      createdAt: existingId ? (await this.getProjectCreatedAt(id)) : now,
      updatedAt: now,
      data: projectData,
      thumbnailUrl,
      viewpointCount: project.viewpoints.size,
      worldPointCount: project.worldPoints.size
    }

    const { tx, projectStore, imageStore } = await createProjectAndImagesTransaction(db, 'readwrite')

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()

      projectStore.put(storedProject)

      const deleteRequest = imageStore.index('projectId').getAllKeys(id)
      deleteRequest.onsuccess = () => {
        const existingKeys = deleteRequest.result
        for (const key of existingKeys) {
          imageStore.delete(key)
        }

        for (const entry of imageEntries) {
          const imageId = generateId()
          const storedImage: StoredImage = {
            id: imageId,
            projectId: id,
            blob: entry.blob,
            metadata: entry.metadata
          }
          imageStore.put(storedImage)
        }
      }
    })

    project._dbId = id
    console.log('[ProjectDB.saveProject] Save complete, assigned _dbId:', id)

    return id
  },

  async getStoredProject(id: string): Promise<StoredProject | null> {
    try {
      const db = await openDatabase()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PROJECTS_STORE, 'readonly')
        const store = tx.objectStore(PROJECTS_STORE)
        const request = store.get(id)

        request.onerror = () => resolve(null)
        request.onsuccess = () => {
          resolve(request.result || null)
        }
      })
    } catch {
      return null
    }
  },

  async getProjectCreatedAt(id: string): Promise<Date> {
    const stored = await this.getStoredProject(id)
    return stored ? new Date(stored.createdAt) : new Date()
  },

  async deleteProject(id: string): Promise<void> {
    const db = await openDatabase()
    const { tx, projectStore, imageStore } = await createProjectAndImagesTransaction(db, 'readwrite')

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()

      projectStore.delete(id)

      const index = imageStore.index('projectId')
      const request = index.getAllKeys(id)
      request.onsuccess = () => {
        for (const key of request.result) {
          imageStore.delete(key)
        }
      }
    })
  },

  async moveProject(id: string, folderId: string | null): Promise<void> {
    const db = await openDatabase()
    await getAndUpdateProject(db, id, (project) => {
      project.folderId = folderId
    })
  },

  async renameProject(id: string, name: string): Promise<void> {
    const db = await openDatabase()
    await getAndUpdateProject(db, id, (storedProject) => {
      // Also update the name in the serialized project data to keep them in sync
      const projectData = Serialization.deserialize(storedProject.data)
      projectData.name = name
      storedProject.data = Serialization.serialize(projectData)
      storedProject.name = name
      storedProject.updatedAt = new Date()
    })
  },

  async copyProject(id: string, newName: string): Promise<string> {
    const db = await openDatabase()
    const newId = generateId()
    const now = new Date()
    console.log('[ProjectDB.copyProject] Copying project:', id, 'as:', newName)

    const { tx, projectStore, imageStore } = await createProjectAndImagesTransaction(db, 'readwrite')

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()

      const getRequest = projectStore.get(id)
      getRequest.onsuccess = () => {
        const original = getRequest.result as StoredProject
        if (!original) {
          reject(new Error('Project not found'))
          return
        }

        // Deserialize the project data, update the name, and re-serialize
        // This ensures both StoredProject.name and the embedded Project.name are in sync
        const projectData = Serialization.deserialize(original.data)
        projectData.name = newName
        const updatedData = Serialization.serialize(projectData)

        const copy: StoredProject = {
          ...original,
          id: newId,
          name: newName,
          data: updatedData,
          createdAt: now,
          updatedAt: now
        }
        projectStore.put(copy)

        const imageIndex = imageStore.index('projectId')
        const imagesRequest = imageIndex.getAll(id)
        imagesRequest.onsuccess = () => {
          const images = imagesRequest.result as StoredImage[]
          for (const img of images) {
            const newImage: StoredImage = {
              ...img,
              id: generateId(),
              projectId: newId
            }
            imageStore.put(newImage)
          }
        }
      }
    })

    console.log('[ProjectDB.copyProject] Copy complete, new id:', newId)
    return newId
  },

  async createFolder(name: string, parentId: string | null = null): Promise<string> {
    const db = await openDatabase()
    const id = generateId()
    console.log('[ProjectDB.createFolder] Creating folder:', name, 'in parent:', parentId, 'with id:', id)

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
      tx.oncomplete = () => {
        console.log('[ProjectDB.createFolder] Folder created successfully:', id)
        resolve()
      }
    })

    return id
  },

  async listFolders(parentId: string | null = null): Promise<Folder[]> {
    const db = await openDatabase()
    console.log('[ProjectDB.listFolders] Listing folders in parent:', parentId)
    const allFolders = await getAllFromStore<Folder>(db, FOLDERS_STORE)
    console.log('[ProjectDB.listFolders] All folders in DB:', allFolders.length)
    const filtered = allFolders.filter(f => f.parentId === parentId)
    console.log('[ProjectDB.listFolders] Filtered for parentId', parentId, ':', filtered.length)
    return filtered.map((f: Folder) => ({
      ...f,
      createdAt: new Date(f.createdAt)
    }))
  },

  async listAllFolders(): Promise<Folder[]> {
    const db = await openDatabase()
    const folders = await getAllFromStore<Folder>(db, FOLDERS_STORE)
    return folders.map((f: Folder) => ({
      ...f,
      createdAt: new Date(f.createdAt)
    }))
  },

  async renameFolder(id: string, name: string): Promise<void> {
    const db = await openDatabase()
    await getAndUpdateFolder(db, id, (folder) => {
      folder.name = name
    })
  },

  async deleteFolder(id: string): Promise<void> {
    const db = await openDatabase()

    const projects = await this.listProjects(id)
    if (projects.length > 0) {
      throw new Error('Cannot delete folder with projects. Move or delete projects first.')
    }

    const subfolders = await this.listFolders(id)
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
  },

  async migrateFromLocalStorage(): Promise<string | null> {
    const key = 'pictorigo-project'
    const json = localStorage.getItem(key)
    if (!json) return null

    try {
      const project = Serialization.deserialize(json)
      const id = await this.saveProject(project)

      localStorage.removeItem(key)
      localStorage.removeItem(`${key}-timestamp`)

      console.log('Migrated project from localStorage to IndexedDB')
      return id
    } catch (error) {
      console.error('Failed to migrate from localStorage:', error)
      return null
    }
  },

  async hasProjects(): Promise<boolean> {
    const projects = await this.listAllProjects()
    return projects.length > 0
  },

  async saveOptimizationResult(projectId: string, result: OptimizationResultSummary): Promise<void> {
    const db = await openDatabase()
    await getAndUpdateProject(db, projectId, (project) => {
      project.optimizationResult = result
    })
  },

  async getProjectsRecursive(folderId: string | null): Promise<ProjectSummary[]> {
    const allProjects: ProjectSummary[] = []

    // Get projects in this folder
    const projects = await this.listProjects(folderId)
    allProjects.push(...projects)

    // Get subfolders and recursively get their projects
    const subfolders = await this.listFolders(folderId)
    for (const subfolder of subfolders) {
      const subProjects = await this.getProjectsRecursive(subfolder.id)
      allProjects.push(...subProjects)
    }

    return allProjects
  },

  async getFolderStats(folderId: string): Promise<{ projectCount: number; minError: number | null; maxError: number | null; avgError: number | null }> {
    const projects = await this.getProjectsRecursive(folderId)

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
}
