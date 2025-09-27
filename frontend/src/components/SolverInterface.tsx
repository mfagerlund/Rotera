import { useState } from 'react'

interface SolverInterfaceProps {
  projectId: string | null
}

interface SolveRequest {
  method: string
  max_iterations: number
  tolerance: number
  use_incremental: boolean
  robust_loss: string
  robust_loss_params: Record<string, number>
}

interface SolveResult {
  success: boolean
  iterations: number
  final_cost: number
  convergence_reason: string
  computation_time?: number
  residuals?: Record<string, number>
  uncertainties?: Record<string, number[]>
  unconstrained_dofs?: string[]
  largest_residuals?: [string, number][]
}

export default function SolverInterface({ projectId }: SolverInterfaceProps) {
  const [solveConfig, setSolveConfig] = useState<SolveRequest>({
    method: 'lm',
    max_iterations: 100,
    tolerance: 1e-6,
    use_incremental: false,
    robust_loss: 'none',
    robust_loss_params: {},
  })

  const [solveResult, setSolveResult] = useState<SolveResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runSolver = async () => {
    if (!projectId) {
      setError('No project selected')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/solve/${projectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(solveConfig),
      })

      const data = await response.json()

      if (response.ok) {
        setSolveResult(data)
      } else {
        setError(`Solve failed: ${data.detail}`)
      }
    } catch (err) {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const getDiagnostics = async () => {
    if (!projectId) {
      setError('No project selected')
      return
    }

    try {
      const response = await fetch(`/api/solve/${projectId}/diagnostics`)
      const data = await response.json()

      if (response.ok) {
        alert(`Diagnostics:\n${JSON.stringify(data, null, 2)}`)
      } else {
        setError(`Failed to get diagnostics: ${data.detail}`)
      }
    } catch (err) {
      setError('Network error')
    }
  }

  if (!projectId) {
    return (
      <div className="card">
        <div className="card-body text-center">
          <h5>No Project Selected</h5>
          <p className="text-muted">
            Select a project from the Projects tab to use the solver.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="row">
      <div className="col-md-6">
        <div className="card">
          <div className="card-header">
            <h5 className="mb-0">Solver Configuration</h5>
          </div>
          <div className="card-body">
            {error && (
              <div className="alert alert-danger" role="alert">
                {error}
              </div>
            )}

            <div className="mb-3">
              <label className="form-label">Solver Method</label>
              <select
                className="form-select"
                value={solveConfig.method}
                onChange={(e) => setSolveConfig({
                  ...solveConfig,
                  method: e.target.value
                })}
              >
                <option value="lm">Levenberg-Marquardt</option>
                <option value="trf">Trust Region Reflective</option>
                <option value="dogbox">Dogbox</option>
              </select>
            </div>

            <div className="mb-3">
              <label className="form-label">Max Iterations</label>
              <input
                type="number"
                className="form-control"
                value={solveConfig.max_iterations}
                onChange={(e) => setSolveConfig({
                  ...solveConfig,
                  max_iterations: +e.target.value
                })}
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Tolerance</label>
              <input
                type="number"
                step="1e-8"
                className="form-control"
                value={solveConfig.tolerance}
                onChange={(e) => setSolveConfig({
                  ...solveConfig,
                  tolerance: +e.target.value
                })}
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Robust Loss</label>
              <select
                className="form-select"
                value={solveConfig.robust_loss}
                onChange={(e) => setSolveConfig({
                  ...solveConfig,
                  robust_loss: e.target.value
                })}
              >
                <option value="none">None</option>
                <option value="huber">Huber</option>
                <option value="cauchy">Cauchy</option>
              </select>
            </div>

            <div className="form-check mb-3">
              <input
                className="form-check-input"
                type="checkbox"
                id="incrementalCheck"
                checked={solveConfig.use_incremental}
                onChange={(e) => setSolveConfig({
                  ...solveConfig,
                  use_incremental: e.target.checked
                })}
              />
              <label className="form-check-label" htmlFor="incrementalCheck">
                Use Incremental Solver
              </label>
            </div>

            <div className="d-grid gap-2">
              <button
                className="btn btn-primary"
                onClick={runSolver}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Solving...
                  </>
                ) : (
                  'Run Solver'
                )}
              </button>

              <button
                className="btn btn-outline-secondary"
                onClick={getDiagnostics}
                disabled={!solveResult}
              >
                Get Diagnostics
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="col-md-6">
        {solveResult && (
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">Solve Results</h5>
            </div>
            <div className="card-body">
              <div className="row">
                <div className="col-md-6">
                  <h6>Status</h6>
                  <ul className="list-unstyled">
                    <li>
                      <strong>Success:</strong>{' '}
                      <span className={`badge ${solveResult.success ? 'bg-success' : 'bg-danger'}`}>
                        {solveResult.success ? 'Yes' : 'No'}
                      </span>
                    </li>
                    <li><strong>Iterations:</strong> {solveResult.iterations}</li>
                    <li><strong>Final Cost:</strong> {solveResult.final_cost.toExponential(3)}</li>
                    {solveResult.computation_time && (
                      <li><strong>Time:</strong> {solveResult.computation_time.toFixed(2)}s</li>
                    )}
                  </ul>
                </div>
                <div className="col-md-6">
                  <h6>Convergence</h6>
                  <p className="small">{solveResult.convergence_reason}</p>
                </div>
              </div>

              {solveResult.largest_residuals && solveResult.largest_residuals.length > 0 && (
                <div className="mt-3">
                  <h6>Largest Residuals</h6>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Constraint</th>
                          <th>Residual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {solveResult.largest_residuals.slice(0, 10).map(([constraint, residual], idx) => (
                          <tr key={idx}>
                            <td className="small">{constraint}</td>
                            <td className="small">{residual.toExponential(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {solveResult.unconstrained_dofs && solveResult.unconstrained_dofs.length > 0 && (
                <div className="mt-3">
                  <h6 className="text-warning">Unconstrained DOFs</h6>
                  <div className="alert alert-warning">
                    <ul className="mb-0">
                      {solveResult.unconstrained_dofs.map((dof, idx) => (
                        <li key={idx} className="small">{dof}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {!solveResult && (
          <div className="card">
            <div className="card-body text-center">
              <h5>No Results Yet</h5>
              <p className="text-muted">
                Configure solver settings and click "Run Solver" to see results.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}