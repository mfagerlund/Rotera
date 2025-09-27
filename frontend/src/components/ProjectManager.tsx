import { useState, useEffect } from 'react'

interface Project {
  version: string
  world_points: Record<string, any>
  images: Record<string, any>
  cameras: Record<string, any>
  constraints: any[]
  settings: any
  diagnostics?: any
}

interface ProjectSummary {
  world_points: number
  images: number
  cameras: number
  constraints: number
  constraint_types: Record<string, number>
}

interface ProjectManagerProps {
  currentProjectId: string | null
  onProjectSelected: (projectId: string | null) => void
}

export default function ProjectManager({ currentProjectId, onProjectSelected }: ProjectManagerProps) {
  const [projects, setProjects] = useState<string[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [summary, setSummary] = useState<ProjectSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createProject = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/projects/', {
        method: 'POST',
      })
      const data = await response.json()

      if (response.ok) {
        setProjects([...projects, data.project_id])
        onProjectSelected(data.project_id)
      } else {
        setError('Failed to create project')
      }
    } catch (err) {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const loadProject = async (projectId: string) => {
    setLoading(true)
    try {
      const [projectResponse, summaryResponse] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/summary`)
      ])

      if (projectResponse.ok && summaryResponse.ok) {
        const projectData = await projectResponse.json()
        const summaryData = await summaryResponse.json()

        setProject(projectData)
        setSummary(summaryData)
        onProjectSelected(projectId)
      } else {
        setError('Failed to load project')
      }
    } catch (err) {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const validateProject = async (projectId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/validate`)
      const data = await response.json()

      if (data.valid) {
        alert('Project is valid!')
      } else {
        alert(`Project has issues:\n${data.issues.join('\n')}`)
      }
    } catch (err) {
      setError('Failed to validate project')
    }
  }

  useEffect(() => {
    if (currentProjectId) {
      loadProject(currentProjectId)
    }
  }, [currentProjectId])

  return (
    <div className="row">
      <div className="col-md-4">
        <div className="card">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h5 className="mb-0">Projects</h5>
            <button
              className="btn btn-primary btn-sm"
              onClick={createProject}
              disabled={loading}
            >
              New Project
            </button>
          </div>
          <div className="card-body">
            {projects.length === 0 ? (
              <p className="text-muted">No projects yet. Create one to get started.</p>
            ) : (
              <div className="list-group">
                {projects.map((projectId) => (
                  <button
                    key={projectId}
                    className={`list-group-item list-group-item-action ${
                      currentProjectId === projectId ? 'active' : ''
                    }`}
                    onClick={() => loadProject(projectId)}
                  >
                    {projectId}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="col-md-8">
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        {loading && (
          <div className="d-flex justify-content-center">
            <div className="spinner-border" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        )}

        {currentProjectId && summary && (
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Project: {currentProjectId}</h5>
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={() => validateProject(currentProjectId)}
              >
                Validate
              </button>
            </div>
            <div className="card-body">
              <div className="row">
                <div className="col-md-6">
                  <h6>Summary</h6>
                  <ul className="list-unstyled">
                    <li><strong>World Points:</strong> {summary.world_points}</li>
                    <li><strong>Images:</strong> {summary.images}</li>
                    <li><strong>Cameras:</strong> {summary.cameras}</li>
                    <li><strong>Constraints:</strong> {summary.constraints}</li>
                  </ul>
                </div>
                <div className="col-md-6">
                  <h6>Constraint Types</h6>
                  {Object.keys(summary.constraint_types).length > 0 ? (
                    <ul className="list-unstyled">
                      {Object.entries(summary.constraint_types).map(([type, count]) => (
                        <li key={type}>
                          <strong>{type}:</strong> {count}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted">No constraints</p>
                  )}
                </div>
              </div>

              {project?.diagnostics && (
                <div className="mt-4">
                  <h6>Last Solve Results</h6>
                  <div className="row">
                    <div className="col-md-6">
                      <ul className="list-unstyled">
                        <li><strong>Success:</strong> {project.diagnostics.success ? 'Yes' : 'No'}</li>
                        <li><strong>Iterations:</strong> {project.diagnostics.iterations}</li>
                        <li><strong>Final Cost:</strong> {project.diagnostics.final_cost.toFixed(6)}</li>
                      </ul>
                    </div>
                    <div className="col-md-6">
                      <ul className="list-unstyled">
                        <li><strong>Convergence:</strong> {project.diagnostics.convergence_reason}</li>
                        <li><strong>Computation Time:</strong> {project.diagnostics.computation_time?.toFixed(2)}s</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {!currentProjectId && !loading && (
          <div className="card">
            <div className="card-body text-center">
              <h5>No Project Selected</h5>
              <p className="text-muted">
                Create a new project or select an existing one to view details.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}