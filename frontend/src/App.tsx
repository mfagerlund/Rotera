import { useState } from 'react'
import ProjectManager from './components/ProjectManager'
import SyntheticSceneGenerator from './components/SyntheticSceneGenerator'
import SolverInterface from './components/SolverInterface'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'

type ActiveTab = 'projects' | 'synthetic' | 'solver'

function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('projects')
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)

  return (
    <div className="container-fluid">
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark mb-4">
        <div className="container">
          <span className="navbar-brand">
            Pictorigo
            <small className="text-muted ms-2">Poor Man's Photogrammetry</small>
          </span>
        </div>
      </nav>

      <div className="container">
        <ul className="nav nav-tabs mb-4">
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'projects' ? 'active' : ''}`}
              onClick={() => setActiveTab('projects')}
            >
              Projects
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'synthetic' ? 'active' : ''}`}
              onClick={() => setActiveTab('synthetic')}
            >
              Synthetic Scenes
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'solver' ? 'active' : ''}`}
              onClick={() => setActiveTab('solver')}
            >
              Solver
            </button>
          </li>
        </ul>

        <div className="tab-content">
          {activeTab === 'projects' && (
            <ProjectManager
              currentProjectId={currentProjectId}
              onProjectSelected={setCurrentProjectId}
            />
          )}
          {activeTab === 'synthetic' && (
            <SyntheticSceneGenerator
              onProjectCreated={setCurrentProjectId}
            />
          )}
          {activeTab === 'solver' && (
            <SolverInterface
              projectId={currentProjectId}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default App