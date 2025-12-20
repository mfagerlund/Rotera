import { Serialization } from '../../entities/Serialization'
import { saveProject } from './project-operations'

export async function migrateFromLocalStorage(): Promise<string | null> {
  const key = 'pictorigo-project'
  const json = localStorage.getItem(key)
  if (!json) return null

  try {
    const project = Serialization.deserialize(json)
    const id = await saveProject(project)

    localStorage.removeItem(key)
    localStorage.removeItem(`${key}-timestamp`)

    return id
  } catch {
    return null
  }
}
