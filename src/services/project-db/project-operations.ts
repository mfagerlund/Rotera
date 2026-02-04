import { Project } from '../../entities/project'
import { Serialization } from '../../entities/Serialization'
import { ProjectSummary, StoredProject, StoredImage, ThumbnailGeometry, OptimizationResultSummary } from './types'
import { PROJECTS_STORE, IMAGES_STORE } from './constants'
import { openDatabase, getAllFromStore, createProjectAndImagesTransaction, getAndUpdateProject } from './database'
import { generateId, extractImageFromDataUrl, blobToDataUrl, createThumbnail } from './utils'

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

export async function listProjects(folderId: string | null = null): Promise<ProjectSummary[]> {
  const db = await openDatabase()
  const allProjects = await getAllFromStore<StoredProject>(db, PROJECTS_STORE)
  const filtered = allProjects.filter(p => p.folderId === folderId)
  return filtered.map(toProjectSummary)
}

export async function listAllProjects(): Promise<ProjectSummary[]> {
  const db = await openDatabase()
  const projects = await getAllFromStore<StoredProject>(db, PROJECTS_STORE)
  return projects.map(toProjectSummary)
}

export async function loadProject(id: string): Promise<Project> {
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
}

export async function saveProject(project: Project, folderId?: string | null): Promise<string> {
  const db = await openDatabase()

  const existingId = project._dbId
  const id = existingId || generateId()

  // If folderId is not explicitly provided and project already exists, preserve the existing folderId
  let effectiveFolderId: string | null = folderId ?? null
  if (folderId === undefined && existingId) {
    const existingProject = await getStoredProject(id)
    if (existingProject) {
      effectiveFolderId = existingProject.folderId
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
    } catch {
      // Thumbnail creation failed, continue without thumbnail
    }
  }

  // Compute optimization result summary from entity lastResiduals
  let optimizationResult: OptimizationResultSummary | undefined
  const hasOptimizationData = Array.from(project.worldPoints.values()).some(
    wp => wp.lastResiduals && wp.lastResiduals.length > 0
  )

  if (hasOptimizationData) {
    // Compute total error from all entities' residuals
    let totalSquaredError = 0
    let residualCount = 0

    for (const wp of project.worldPoints.values()) {
      if (wp.lastResiduals && wp.lastResiduals.length > 0) {
        for (const r of wp.lastResiduals) {
          totalSquaredError += r * r
          residualCount++
        }
      }
    }

    for (const ip of project.imagePoints.values()) {
      if (ip.lastResiduals && ip.lastResiduals.length > 0) {
        for (const r of ip.lastResiduals) {
          totalSquaredError += r * r
          residualCount++
        }
      }
    }

    // Compute RMS reprojection error from image points only (the normalized metric)
    let reprojSquaredError = 0
    let reprojCount = 0
    for (const ip of project.imagePoints.values()) {
      if (ip.lastResiduals && ip.lastResiduals.length === 2) {
        const pixelError = Math.sqrt(ip.lastResiduals[0] ** 2 + ip.lastResiduals[1] ** 2)
        reprojSquaredError += pixelError ** 2
        reprojCount++
      }
    }
    const rmsReprojectionError = reprojCount > 0 ? Math.sqrt(reprojSquaredError / reprojCount) : undefined

    const totalError = residualCount > 0 ? Math.sqrt(totalSquaredError) : 0

    optimizationResult = {
      error: totalError,
      rmsReprojectionError,
      converged: true,
      solveTimeMs: 0,
      optimizedAt: new Date()
    }
  }

  const storedProject: StoredProject = {
    id,
    name: project.name,
    folderId: effectiveFolderId,
    createdAt: existingId ? (await getProjectCreatedAt(id)) : now,
    updatedAt: now,
    data: projectData,
    thumbnailUrl,
    viewpointCount: project.viewpoints.size,
    worldPointCount: project.worldPoints.size,
    optimizationResult
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

  return id
}

export async function getStoredProject(id: string): Promise<StoredProject | null> {
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
}

export async function getProjectCreatedAt(id: string): Promise<Date> {
  const stored = await getStoredProject(id)
  return stored ? new Date(stored.createdAt) : new Date()
}

export async function deleteProject(id: string): Promise<void> {
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
}

export async function moveProject(id: string, folderId: string | null): Promise<void> {
  const db = await openDatabase()
  await getAndUpdateProject(db, id, (project) => {
    project.folderId = folderId
  })
}

export async function renameProject(id: string, name: string): Promise<void> {
  const db = await openDatabase()
  await getAndUpdateProject(db, id, (storedProject) => {
    // Also update the name in the serialized project data to keep them in sync
    const projectData = Serialization.deserialize(storedProject.data)
    projectData.name = name
    storedProject.data = Serialization.serialize(projectData)
    storedProject.name = name
    storedProject.updatedAt = new Date()
  })
}

export async function copyProject(id: string, newName: string): Promise<string> {
  const db = await openDatabase()
  const newId = generateId()
  const now = new Date()

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
        folderId: original.folderId, // Explicitly preserve folder location
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

  return newId
}

export async function hasProjects(): Promise<boolean> {
  const projects = await listAllProjects()
  return projects.length > 0
}

export async function saveOptimizationResult(projectId: string, result: OptimizationResultSummary): Promise<void> {
  const db = await openDatabase()
  await getAndUpdateProject(db, projectId, (project) => {
    project.optimizationResult = result
  })
}
