import { Serialization } from '../../entities/Serialization'
import { saveProject } from './project-operations'
import { DB_NAME, DB_VERSION, PROJECTS_STORE, IMAGES_STORE, FOLDERS_STORE } from './constants'
import { openDatabase } from './database'
import { StoredProject, StoredImage, Folder } from './types'

const OLD_DB_NAME = 'pictorigo-db'

export async function hasOldDatabase(): Promise<boolean> {
  const databases = await indexedDB.databases()
  return databases.some(db => db.name === OLD_DB_NAME)
}

export async function migrateFromLocalStorage(): Promise<string | null> {
  // Try both old and new localStorage keys
  for (const key of ['Rotera-project', 'Pictorigo-project']) {
    const json = localStorage.getItem(key)
    if (!json) continue

    try {
      const project = Serialization.deserialize(json)
      const id = await saveProject(project)

      localStorage.removeItem(key)
      localStorage.removeItem(`${key}-timestamp`)

      return id
    } catch {
      // Continue to next key
    }
  }
  return null
}

/**
 * Migrate all projects from the old Pictorigo-db to the new Rotera-db
 */
export async function migrateFromOldDatabase(): Promise<number> {
  // Check if old database exists
  const databases = await indexedDB.databases()
  const oldDbExists = databases.some(db => db.name === OLD_DB_NAME)

  if (!oldDbExists) {
    return 0
  }

  console.log('Found old pictorigo-db, starting migration...')

  let migratedCount = 0

  try {
    // Open old database
    const oldDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(OLD_DB_NAME)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })

    // Open new database
    const newDb = await openDatabase()

    // Migrate projects
    const oldProjects = await getAllFromOldStore<StoredProject>(oldDb, PROJECTS_STORE)
    const newProjects = await getAllFromNewStore<StoredProject>(newDb, PROJECTS_STORE)
    const existingIds = new Set(newProjects.map(p => p.id))

    for (const project of oldProjects) {
      if (!existingIds.has(project.id)) {
        await putInStore(newDb, PROJECTS_STORE, project)
        migratedCount++
      }
    }

    // Migrate images
    const oldImages = await getAllFromOldStore<StoredImage>(oldDb, IMAGES_STORE)
    const newImages = await getAllFromNewStore<StoredImage>(newDb, IMAGES_STORE)
    const existingImageIds = new Set(newImages.map(i => i.id))

    for (const image of oldImages) {
      if (!existingImageIds.has(image.id)) {
        await putInStore(newDb, IMAGES_STORE, image)
      }
    }

    // Migrate folders
    const oldFolders = await getAllFromOldStore<Folder>(oldDb, FOLDERS_STORE)
    const newFolders = await getAllFromNewStore<Folder>(newDb, FOLDERS_STORE)
    const existingFolderIds = new Set(newFolders.map(f => f.id))

    for (const folder of oldFolders) {
      if (!existingFolderIds.has(folder.id)) {
        await putInStore(newDb, FOLDERS_STORE, folder)
      }
    }

    // Close databases
    oldDb.close()
    newDb.close()

    // Delete old database after successful migration
    if (migratedCount > 0) {
      console.log(`Migrated ${migratedCount} projects from pictorigo-db`)
      await deleteOldDatabase()
    }

    return migratedCount
  } catch (error) {
    console.error('Migration from old database failed:', error)
    return 0
  }
}

async function getAllFromOldStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      resolve([])
      return
    }
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.getAll()
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result as T[])
  })
}

async function getAllFromNewStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.getAll()
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result as T[])
  })
}

async function putInStore<T>(db: IDBDatabase, storeName: string, item: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const request = store.put(item)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => resolve()
  })
}

async function deleteOldDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(OLD_DB_NAME)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      console.log('Deleted old pictorigo-db')
      resolve()
    }
  })
}
