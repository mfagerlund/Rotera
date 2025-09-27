import { useState } from 'react'

interface SyntheticSceneGeneratorProps {
  onProjectCreated: (projectId: string) => void
}

type SceneType = 'box_room' | 'grid_plane' | 'two_view'

interface BoxRoomConfig {
  room_size: [number, number, number]
  n_cameras: number
  camera_height: number
  camera_radius: number
  seed?: number
}

interface GridPlaneConfig {
  grid_size: [number, number]
  spacing: number
  n_cameras: number
  seed?: number
}

interface TwoViewConfig {
  n_points: number
  baseline: number
  seed?: number
}

export default function SyntheticSceneGenerator({ onProjectCreated }: SyntheticSceneGeneratorProps) {
  const [sceneType, setSceneType] = useState<SceneType>('two_view')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Box room configuration
  const [boxRoomConfig, setBoxRoomConfig] = useState<BoxRoomConfig>({
    room_size: [5.0, 4.0, 3.0],
    n_cameras: 4,
    camera_height: 1.5,
    camera_radius: 2.0,
  })

  // Grid plane configuration
  const [gridPlaneConfig, setGridPlaneConfig] = useState<GridPlaneConfig>({
    grid_size: [5, 5],
    spacing: 1.0,
    n_cameras: 3,
  })

  // Two view configuration
  const [twoViewConfig, setTwoViewConfig] = useState<TwoViewConfig>({
    n_points: 20,
    baseline: 2.0,
  })

  const generateScene = async () => {
    setLoading(true)
    setError(null)

    try {
      let endpoint = ''
      let body = {}

      switch (sceneType) {
        case 'box_room':
          endpoint = '/api/synthetic/box-room'
          body = boxRoomConfig
          break
        case 'grid_plane':
          endpoint = '/api/synthetic/grid-plane'
          body = gridPlaneConfig
          break
        case 'two_view':
          endpoint = '/api/synthetic/two-view'
          body = twoViewConfig
          break
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (response.ok) {
        onProjectCreated(data.project_id)
        alert(`Created synthetic ${data.type} scene: ${data.project_id}`)
      } else {
        setError(`Failed to create scene: ${data.detail}`)
      }
    } catch (err) {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h5 className="mb-0">Synthetic Scene Generator</h5>
      </div>
      <div className="card-body">
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        <div className="mb-3">
          <label className="form-label">Scene Type</label>
          <select
            className="form-select"
            value={sceneType}
            onChange={(e) => setSceneType(e.target.value as SceneType)}
          >
            <option value="two_view">Two-View Scene</option>
            <option value="box_room">Box Room</option>
            <option value="grid_plane">Grid Plane</option>
          </select>
        </div>

        {sceneType === 'box_room' && (
          <div className="row">
            <div className="col-md-6">
              <div className="mb-3">
                <label className="form-label">Room Size (W×D×H)</label>
                <div className="row">
                  <div className="col">
                    <input
                      type="number"
                      className="form-control"
                      placeholder="Width"
                      value={boxRoomConfig.room_size[0]}
                      onChange={(e) => setBoxRoomConfig({
                        ...boxRoomConfig,
                        room_size: [+e.target.value, boxRoomConfig.room_size[1], boxRoomConfig.room_size[2]]
                      })}
                    />
                  </div>
                  <div className="col">
                    <input
                      type="number"
                      className="form-control"
                      placeholder="Depth"
                      value={boxRoomConfig.room_size[1]}
                      onChange={(e) => setBoxRoomConfig({
                        ...boxRoomConfig,
                        room_size: [boxRoomConfig.room_size[0], +e.target.value, boxRoomConfig.room_size[2]]
                      })}
                    />
                  </div>
                  <div className="col">
                    <input
                      type="number"
                      className="form-control"
                      placeholder="Height"
                      value={boxRoomConfig.room_size[2]}
                      onChange={(e) => setBoxRoomConfig({
                        ...boxRoomConfig,
                        room_size: [boxRoomConfig.room_size[0], boxRoomConfig.room_size[1], +e.target.value]
                      })}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="mb-3">
                <label className="form-label">Number of Cameras</label>
                <input
                  type="number"
                  className="form-control"
                  value={boxRoomConfig.n_cameras}
                  onChange={(e) => setBoxRoomConfig({
                    ...boxRoomConfig,
                    n_cameras: +e.target.value
                  })}
                />
              </div>
            </div>
            <div className="col-md-6">
              <div className="mb-3">
                <label className="form-label">Camera Height</label>
                <input
                  type="number"
                  step="0.1"
                  className="form-control"
                  value={boxRoomConfig.camera_height}
                  onChange={(e) => setBoxRoomConfig({
                    ...boxRoomConfig,
                    camera_height: +e.target.value
                  })}
                />
              </div>
            </div>
            <div className="col-md-6">
              <div className="mb-3">
                <label className="form-label">Camera Radius</label>
                <input
                  type="number"
                  step="0.1"
                  className="form-control"
                  value={boxRoomConfig.camera_radius}
                  onChange={(e) => setBoxRoomConfig({
                    ...boxRoomConfig,
                    camera_radius: +e.target.value
                  })}
                />
              </div>
            </div>
          </div>
        )}

        {sceneType === 'grid_plane' && (
          <div className="row">
            <div className="col-md-6">
              <div className="mb-3">
                <label className="form-label">Grid Size (Rows×Cols)</label>
                <div className="row">
                  <div className="col">
                    <input
                      type="number"
                      className="form-control"
                      placeholder="Rows"
                      value={gridPlaneConfig.grid_size[0]}
                      onChange={(e) => setGridPlaneConfig({
                        ...gridPlaneConfig,
                        grid_size: [+e.target.value, gridPlaneConfig.grid_size[1]]
                      })}
                    />
                  </div>
                  <div className="col">
                    <input
                      type="number"
                      className="form-control"
                      placeholder="Cols"
                      value={gridPlaneConfig.grid_size[1]}
                      onChange={(e) => setGridPlaneConfig({
                        ...gridPlaneConfig,
                        grid_size: [gridPlaneConfig.grid_size[0], +e.target.value]
                      })}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="mb-3">
                <label className="form-label">Spacing</label>
                <input
                  type="number"
                  step="0.1"
                  className="form-control"
                  value={gridPlaneConfig.spacing}
                  onChange={(e) => setGridPlaneConfig({
                    ...gridPlaneConfig,
                    spacing: +e.target.value
                  })}
                />
              </div>
            </div>
            <div className="col-md-6">
              <div className="mb-3">
                <label className="form-label">Number of Cameras</label>
                <input
                  type="number"
                  className="form-control"
                  value={gridPlaneConfig.n_cameras}
                  onChange={(e) => setGridPlaneConfig({
                    ...gridPlaneConfig,
                    n_cameras: +e.target.value
                  })}
                />
              </div>
            </div>
          </div>
        )}

        {sceneType === 'two_view' && (
          <div className="row">
            <div className="col-md-6">
              <div className="mb-3">
                <label className="form-label">Number of Points</label>
                <input
                  type="number"
                  className="form-control"
                  value={twoViewConfig.n_points}
                  onChange={(e) => setTwoViewConfig({
                    ...twoViewConfig,
                    n_points: +e.target.value
                  })}
                />
              </div>
            </div>
            <div className="col-md-6">
              <div className="mb-3">
                <label className="form-label">Baseline</label>
                <input
                  type="number"
                  step="0.1"
                  className="form-control"
                  value={twoViewConfig.baseline}
                  onChange={(e) => setTwoViewConfig({
                    ...twoViewConfig,
                    baseline: +e.target.value
                  })}
                />
              </div>
            </div>
          </div>
        )}

        <div className="d-flex justify-content-end">
          <button
            className="btn btn-primary"
            onClick={generateScene}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Generating...
              </>
            ) : (
              'Generate Scene'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}