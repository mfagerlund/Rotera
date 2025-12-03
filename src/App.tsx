import React, { useState, useEffect, useCallback } from 'react'
import MainLayout from './components/MainLayout'
import { ProjectBrowser } from './components/ProjectBrowser'
import { ProjectDB } from './services/project-db'
import { Project } from './entities/project'
import { loadProject } from './store/project-store'
import './styles/pictorigo.css'
import './styles/enhanced-workspace.css'
import './styles/workspace.css'
import './styles/project-browser.css'

type AppView = 'browser' | 'editor'

function App() {
  const [view, setView] = useState<AppView>('browser')
  const [isInitializing, setIsInitializing] = useState(true)

  useEffect(() => {
    const init = async () => {
      try {
        const migratedId = await ProjectDB.migrateFromLocalStorage()
        if (migratedId) {
          console.log('Migrated project from localStorage, id:', migratedId)
        }
      } catch (error) {
        console.error('Migration error:', error)
      } finally {
        setIsInitializing(false)
      }
    }
    init()
  }, [])

  const handleOpenProject = useCallback((project: Project) => {
    loadProject(project)
    setView('editor')
  }, [])

  const handleCreateProject = useCallback(() => {
    const newProject = Project.create('Untitled Project')
    loadProject(newProject)
    setView('editor')
  }, [])

  const handleReturnToBrowser = useCallback(() => {
    setView('browser')
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
      <ProjectBrowser
        onOpenProject={handleOpenProject}
        onCreateProject={handleCreateProject}
      />
    )
  }

  return <MainLayout onReturnToBrowser={handleReturnToBrowser} />
}

export default App
