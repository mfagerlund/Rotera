const SESSION_KEY = 'pictorigo-session'

interface SessionState {
  currentProjectId: string | null
  view: 'browser' | 'editor'
  currentFolderId: string | null
  lastOpenedProjectId: string | null
}

export const SessionStore = {
  save(state: SessionState): void {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state))
  },

  load(): SessionState | null {
    const json = sessionStorage.getItem(SESSION_KEY)
    if (!json) return null
    try {
      return JSON.parse(json)
    } catch {
      return null
    }
  },

  clear(): void {
    const current = this.load()
    // Preserve folder and last opened project when clearing session
    this.save({
      currentProjectId: null,
      view: 'browser',
      currentFolderId: current?.currentFolderId || null,
      lastOpenedProjectId: current?.lastOpenedProjectId || null
    })
  },

  setProjectId(id: string | null): void {
    const current = this.load() || { currentProjectId: null, view: 'browser' as const, currentFolderId: null, lastOpenedProjectId: null }
    this.save({
      ...current,
      currentProjectId: id,
      view: id ? 'editor' : 'browser',
      lastOpenedProjectId: id || current.lastOpenedProjectId
    })
  },

  getProjectId(): string | null {
    return this.load()?.currentProjectId || null
  },

  setCurrentFolderId(folderId: string | null): void {
    const current = this.load() || { currentProjectId: null, view: 'browser' as const, currentFolderId: null, lastOpenedProjectId: null }
    this.save({ ...current, currentFolderId: folderId })
  },

  getCurrentFolderId(): string | null {
    return this.load()?.currentFolderId || null
  },

  getLastOpenedProjectId(): string | null {
    return this.load()?.lastOpenedProjectId || null
  }
}
