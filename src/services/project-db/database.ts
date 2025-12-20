import { DB_NAME, DB_VERSION, PROJECTS_STORE, IMAGES_STORE, FOLDERS_STORE } from './constants'
import { StoredProject, Folder } from './types'

export function openDatabase(): Promise<IDBDatabase> {
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

// Helper function to get all items from a store
export function getAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.getAll()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result as T[])
  })
}

// Helper function to create a transaction with PROJECTS_STORE and IMAGES_STORE
export function createProjectAndImagesTransaction(
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
export async function getAndUpdateProject(
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
export async function getAndUpdateFolder(
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
