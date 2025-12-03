const SESSION_KEY = 'pictorigo-session'

interface SessionState {
  currentProjectId: string | null
  view: 'browser' | 'editor'
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
    sessionStorage.removeItem(SESSION_KEY)
  },

  setProjectId(id: string | null): void {
    const current = this.load() || { currentProjectId: null, view: 'browser' as const }
    this.save({ ...current, currentProjectId: id, view: id ? 'editor' : 'browser' })
  },

  getProjectId(): string | null {
    return this.load()?.currentProjectId || null
  }
}
