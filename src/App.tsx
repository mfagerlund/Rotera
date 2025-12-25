import React, { useState, useEffect, useCallback } from 'react'
import MainLayout from './components/MainLayout'
import { ProjectBrowser } from './components/ProjectBrowser'
import { ProjectNameModal } from './components/ProjectNameModal'
import { ProjectDB } from './services/project-db'
import { Project } from './entities/project'
import { loadProject, getIsDirty, getProject } from './store/project-store'
import { SessionStore } from './services/session-store'
import './styles/rotera.css'
import './styles/enhanced-workspace.css'
import './styles/workspace.css'
import './styles/project-browser.css'

type AppView = 'browser' | 'editor'

function App() {
  const [view, setView] = useState<AppView>('browser')
  const [isInitializing, setIsInitializing] = useState(true)
  const [showNameModal, setShowNameModal] = useState(false)

  useEffect(() => {
    const init = async () => {
      try {
        // Migration from localStorage
        const migratedId = await ProjectDB.migrateFromLocalStorage()
        if (migratedId) {
          console.log('Migrated project from localStorage, id:', migratedId)
        }

        // Session restore
        const sessionProjectId = SessionStore.getProjectId()
        if (sessionProjectId) {
          try {
            const project = await ProjectDB.loadProject(sessionProjectId)
            loadProject(project)
            setView('editor')
          } catch (error) {
            console.warn('Failed to restore session project:', error)
            SessionStore.clear()
          }
        }
      } catch (error) {
        console.error('Init error:', error)
      } finally {
        setIsInitializing(false)
      }
    }
    init()
  }, [])

  const handleOpenProject = useCallback((project: Project) => {
    loadProject(project)
    // Save session - get the _dbId from project
    const dbId = (project as any)._dbId
    if (dbId) {
      SessionStore.setProjectId(dbId)
    }
    setView('editor')
  }, [])

  const handleCreateProject = useCallback(() => {
    setShowNameModal(true)
  }, [])

  const handleNameModalSubmit = useCallback(async (name: string) => {
    const newProject = Project.create(name)
    // Save immediately to IndexedDB
    await ProjectDB.saveProject(newProject)
    loadProject(newProject)
    // Save session
    const dbId = (newProject as any)._dbId
    if (dbId) {
      SessionStore.setProjectId(dbId)
    }
    setShowNameModal(false)
    setView('editor')
  }, [])

  const handleNameModalCancel = useCallback(() => {
    setShowNameModal(false)
  }, [])

  const handleReturnToBrowser = useCallback(() => {
    SessionStore.clear()
    setView('browser')
  }, [])

  // Update document title based on view and project
  useEffect(() => {
    if (view === 'editor') {
      document.title = `Rotera: ${getProject().name}`
    } else {
      document.title = 'Rotera'
    }
  }, [view])

  // Task 5: beforeunload warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (getIsDirty()) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  if (isInitializing) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#1a1a1a',
        color: '#888'
      }}>
        Loading...
      </div>
    )
  }

  if (view === 'browser') {
    return (
      <>
        <ProjectBrowser
          onOpenProject={handleOpenProject}
          onCreateProject={handleCreateProject}
        />
        {showNameModal && (
          <ProjectNameModal
            isOpen={showNameModal}
            onSubmit={handleNameModalSubmit}
            onCancel={handleNameModalCancel}
          />
        )}
      </>
    )
  }

  return <MainLayout onReturnToBrowser={handleReturnToBrowser} />
}

export default App
