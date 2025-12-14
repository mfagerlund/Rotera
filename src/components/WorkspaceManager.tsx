// Enhanced workspace management with better separation and state management

import React, { useState, useCallback, useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCamera, faCheck, faCircleXmark, faCube, faColumns, faRotate, faSpinner, faCircleDot, faGripLines, faGripLinesVertical } from '@fortawesome/free-solid-svg-icons'
import { faCircle } from '@fortawesome/free-regular-svg-icons'
import type { Viewpoint } from '../entities/viewpoint'

// Workspace state type (moved from deleted enhanced-project.ts)
export interface WorkspaceState {
  currentWorkspace: 'image' | 'world' | 'split'
  imageWorkspace: {
    currentViewpoint: Viewpoint | null
    scale: number
    pan: { x: number; y: number }
    showImagePoints: boolean
    showProjections: boolean
  }
  worldWorkspace: {
    viewMatrix: {
      scale: number
      rotation: { x: number; y: number; z: number }
      translation: { x: number; y: number; z: number }
    }
    renderMode: 'wireframe' | 'solid' | 'shaded'
    showAxes: boolean
    showGrid: boolean
    showCameras: boolean
  }
  splitWorkspace: {
    splitDirection: 'horizontal' | 'vertical'
    splitRatio: number
    syncSelection: boolean
    syncNavigation: boolean
  }
}

interface WorkspaceManagerProps {
  workspaceState: WorkspaceState
  onWorkspaceStateChange: (updates: Partial<WorkspaceState>) => void
  children: (
    currentWorkspace: 'image' | 'world' | 'split',
    workspaceActions: WorkspaceActions
  ) => React.ReactNode
}

interface WorkspaceActions {
  setWorkspace: (workspace: 'image' | 'world' | 'split') => void
  toggleWorkspace: () => void
  updateImageWorkspace: (updates: Partial<WorkspaceState['imageWorkspace']>) => void
  updateWorldWorkspace: (updates: Partial<WorkspaceState['worldWorkspace']>) => void
  updateSplitWorkspace: (updates: Partial<WorkspaceState['splitWorkspace']>) => void
  resetWorkspace: (workspace: 'image' | 'world') => void
}

// Enhanced workspace switcher with visual indicators
interface WorkspaceSwitcherProps {
  currentWorkspace: 'image' | 'world' | 'split'
  onWorkspaceChange: (workspace: 'image' | 'world' | 'split') => void
  imageHasContent: boolean
  worldHasContent: boolean
  className?: string
}

export const WorkspaceSwitcher: React.FC<WorkspaceSwitcherProps> = observer(({
  currentWorkspace,
  onWorkspaceChange,
  imageHasContent,
  worldHasContent,
  className = ''
}) => {
  const workspaceConfigs = [
    {
      id: 'image' as const,
      name: 'Image View',
      icon: <FontAwesomeIcon icon={faCamera} />,
      description: 'Work with images and 2D measurements',
      hasContent: imageHasContent,
      shortcut: '1'
    },
    {
      id: 'world' as const,
      name: 'World View',
      icon: <FontAwesomeIcon icon={faCube} />,
      description: 'View 3D geometry and constraints',
      hasContent: worldHasContent,
      shortcut: '2'
    },
    {
      id: 'split' as const,
      name: 'Split View',
      icon: <FontAwesomeIcon icon={faColumns} />,
      description: 'Side-by-side image and world views',
      hasContent: imageHasContent && worldHasContent,
      shortcut: '3'
    }
  ]

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case '1':
            event.preventDefault()
            onWorkspaceChange('image')
            break
          case '2':
            event.preventDefault()
            onWorkspaceChange('world')
            break
          case '3':
            event.preventDefault()
            onWorkspaceChange('split')
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onWorkspaceChange])

  return (
    <div className={`workspace-switcher ${className}`}>
      <div className="workspace-tabs">
        {workspaceConfigs.map(config => (
          <button
            key={config.id}
            className={`workspace-tab ${currentWorkspace === config.id ? 'active' : ''} ${!config.hasContent ? 'disabled' : ''}`}
            onClick={() => config.hasContent && onWorkspaceChange(config.id)}
            title={`${config.description} (Ctrl+${config.shortcut})`}
            disabled={!config.hasContent}
          >
            <span className="workspace-icon">{config.icon}</span>
            <span className="workspace-name">{config.name}</span>
            {!config.hasContent && (
              <span className="workspace-indicator empty"><FontAwesomeIcon icon={faCircle} /></span>
            )}
            {config.hasContent && currentWorkspace === config.id && (
              <span className="workspace-indicator active"><FontAwesomeIcon icon={faCircleDot} /></span>
            )}
          </button>
        ))}
      </div>

      <div className="workspace-controls">
        <button
          className="btn-workspace-action"
          onClick={() => {
            const next = currentWorkspace === 'image' ? 'world' :
                        currentWorkspace === 'world' ? 'split' : 'image'
            // Note: This is a UI config ID, not an entity ID - safe to use
            const config = workspaceConfigs.find(c => c.id === next)
            if (config?.hasContent) {
              onWorkspaceChange(next)
            }
          }}
          title="Cycle through workspaces (Tab)"
        >
          <FontAwesomeIcon icon={faRotate} />
        </button>
      </div>
    </div>
  )
})

// Workspace status indicator
interface WorkspaceStatusProps {
  workspace: 'image' | 'world' | 'split'
  imageInfo?: {
    currentImage?: string
    totalImages: number
    pointsInCurrentImage: number
  }
  worldInfo?: {
    totalPoints: number
    totalConstraints: number
    optimizationStatus: string
  }
}

export const WorkspaceStatus: React.FC<WorkspaceStatusProps> = observer(({
  workspace,
  imageInfo,
  worldInfo
}) => {
  return (
    <div className="workspace-status">
      <div className="workspace-status-section">
        <span className="status-label">Workspace:</span>
        <span className="status-value workspace-name">
          {workspace === 'image' ? <><FontAwesomeIcon icon={faCamera} /> Image View</> :
           workspace === 'world' ? <><FontAwesomeIcon icon={faCube} /> World View</> :
           <><FontAwesomeIcon icon={faColumns} /> Split View</>}
        </span>
      </div>

      {workspace !== 'world' && imageInfo && (
        <div className="workspace-status-section">
          <span className="status-label">Image:</span>
          <span className="status-value">
            {imageInfo.currentImage || 'None'}
            {imageInfo.totalImages > 1 && ` (${imageInfo.totalImages} total)`}
          </span>
          {imageInfo.pointsInCurrentImage > 0 && (
            <span className="status-count">{imageInfo.pointsInCurrentImage} pts</span>
          )}
        </div>
      )}

      {workspace !== 'image' && worldInfo && (
        <div className="workspace-status-section">
          <span className="status-label">World:</span>
          <span className="status-value">
            {worldInfo.totalPoints} points, {worldInfo.totalConstraints} constraints
          </span>
          <span className="status-indicator optimization">
            {worldInfo.optimizationStatus === 'converged' ? <FontAwesomeIcon icon={faCheck} /> :
             worldInfo.optimizationStatus === 'failed' ? <FontAwesomeIcon icon={faCircleXmark} /> :
             worldInfo.optimizationStatus === 'running' ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faCircle} />}
          </span>
        </div>
      )}
    </div>
  )
})

// Enhanced workspace manager with better state management
export const WorkspaceManager: React.FC<WorkspaceManagerProps> = observer(({
  workspaceState,
  onWorkspaceStateChange,
  children
}) => {
  const [transitionState, setTransitionState] = useState<{
    isTransitioning: boolean
    fromWorkspace?: 'image' | 'world' | 'split'
    toWorkspace?: 'image' | 'world' | 'split'
  }>({ isTransitioning: false })

  const workspaceActions: WorkspaceActions = {
    setWorkspace: useCallback((workspace: 'image' | 'world' | 'split') => {
      if (workspace === workspaceState.currentWorkspace) return

      setTransitionState({
        isTransitioning: true,
        fromWorkspace: workspaceState.currentWorkspace,
        toWorkspace: workspace
      })

      // Smooth transition
      setTimeout(() => {
        onWorkspaceStateChange({
          currentWorkspace: workspace
        })

        setTimeout(() => {
          setTransitionState({ isTransitioning: false })
        }, 100)
      }, 50)
    }, [workspaceState.currentWorkspace, onWorkspaceStateChange]),

    toggleWorkspace: useCallback(() => {
      const next = workspaceState.currentWorkspace === 'image' ? 'world' : 'image'
      workspaceActions.setWorkspace(next)
    }, [workspaceState.currentWorkspace]),

    updateImageWorkspace: useCallback((updates: Partial<WorkspaceState['imageWorkspace']>) => {
      onWorkspaceStateChange({
        imageWorkspace: {
          ...workspaceState.imageWorkspace,
          ...updates
        }
      })
    }, [workspaceState.imageWorkspace, onWorkspaceStateChange]),

    updateWorldWorkspace: useCallback((updates: Partial<WorkspaceState['worldWorkspace']>) => {
      onWorkspaceStateChange({
        worldWorkspace: {
          ...workspaceState.worldWorkspace,
          ...updates
        }
      })
    }, [workspaceState.worldWorkspace, onWorkspaceStateChange]),

    updateSplitWorkspace: useCallback((updates: Partial<WorkspaceState['splitWorkspace']>) => {
      onWorkspaceStateChange({
        splitWorkspace: {
          ...workspaceState.splitWorkspace,
          ...updates
        }
      })
    }, [workspaceState.splitWorkspace, onWorkspaceStateChange]),

    resetWorkspace: useCallback((workspace: 'image' | 'world') => {
      if (workspace === 'image') {
        onWorkspaceStateChange({
          imageWorkspace: {
            currentViewpoint: null,
            scale: 1.0,
            pan: { x: 0, y: 0 },
            showImagePoints: true,
            showProjections: true
          }
        })
      } else {
        onWorkspaceStateChange({
          worldWorkspace: {
            viewMatrix: {
              scale: 100,
              rotation: { x: 0, y: 0, z: 0 },
              translation: { x: 0, y: 0, z: 0 }
            },
            renderMode: 'wireframe',
            showAxes: true,
            showGrid: true,
            showCameras: true
          }
        })
      }
    }, [onWorkspaceStateChange])
  }

  // Tab key handling for workspace switching
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        // Only if not in an input field
        if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
          event.preventDefault()
          workspaceActions.toggleWorkspace()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [workspaceActions])

  return (
    <div className={`enhanced-workspace-manager ${transitionState.isTransitioning ? 'transitioning' : ''}`}>
      {children(workspaceState.currentWorkspace, workspaceActions)}
    </div>
  )
})

// Split view container for side-by-side layout
interface SplitViewContainerProps {
  splitDirection: 'horizontal' | 'vertical'
  splitRatio: number
  onSplitRatioChange: (ratio: number) => void
  leftContent: React.ReactNode
  rightContent: React.ReactNode
  className?: string
}

export const SplitViewContainer: React.FC<SplitViewContainerProps> = observer(({
  splitDirection,
  splitRatio,
  onSplitRatioChange,
  leftContent,
  rightContent,
  className = ''
}) => {
  const [isDragging, setIsDragging] = useState(false)

  const handleMouseDown = (event: React.MouseEvent) => {
    setIsDragging(true)
    event.preventDefault()
  }

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!isDragging) return

    const container = event.currentTarget as HTMLElement
    const rect = container.getBoundingClientRect()

    let newRatio: number
    if (splitDirection === 'horizontal') {
      newRatio = (event.clientX - rect.left) / rect.width
    } else {
      newRatio = (event.clientY - rect.top) / rect.height
    }

    // Clamp between 0.1 and 0.9
    newRatio = Math.max(0.1, Math.min(0.9, newRatio))
    onSplitRatioChange(newRatio)
  }, [isDragging, splitDirection, onSplitRatioChange])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  const splitStyle = splitDirection === 'horizontal'
    ? { gridTemplateColumns: `${splitRatio * 100}% 4px ${(1 - splitRatio) * 100}%` }
    : { gridTemplateRows: `${splitRatio * 100}% 4px ${(1 - splitRatio) * 100}%` }

  return (
    <div
      className={`split-view-container ${splitDirection} ${className}`}
      style={splitStyle}
    >
      <div className="split-panel left-panel">
        {leftContent}
      </div>

      <div
        className={`split-divider ${isDragging ? 'dragging' : ''}`}
        onMouseDown={handleMouseDown}
      >
        <div className="split-handle">
          <FontAwesomeIcon icon={splitDirection === 'horizontal' ? faGripLinesVertical : faGripLines} />
        </div>
      </div>

      <div className="split-panel right-panel">
        {rightContent}
      </div>
    </div>
  )
})

export default WorkspaceManager