// Workspace manager for separating Image View and World View
import React, { useState, useEffect } from 'react'
import { WorkspaceType, ViewMode } from '../types/project'

interface WorkspaceManagerProps {
  defaultWorkspace: WorkspaceType
  children: (workspace: WorkspaceType, setWorkspace: (workspace: WorkspaceType) => void) => React.ReactNode
}

export const WorkspaceManager: React.FC<WorkspaceManagerProps> = ({
  defaultWorkspace,
  children
}) => {
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceType>(defaultWorkspace)

  // Keyboard shortcuts for workspace switching
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Tab or 1/2 keys to switch workspaces
      if (event.key === 'Tab' && !event.ctrlKey && !event.shiftKey) {
        event.preventDefault()
        setCurrentWorkspace(current => current === 'image' ? 'world' : 'image')
      } else if (event.key === '1' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        setCurrentWorkspace('image')
      } else if (event.key === '2' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        setCurrentWorkspace('world')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      {children(currentWorkspace, setCurrentWorkspace)}
    </>
  )
}

interface WorkspaceSwitcherProps {
  currentWorkspace: WorkspaceType
  onWorkspaceChange: (workspace: WorkspaceType) => void
}

export const WorkspaceSwitcher: React.FC<WorkspaceSwitcherProps> = ({
  currentWorkspace,
  onWorkspaceChange
}) => {
  return (
    <div className="workspace-switcher">
      <button
        className={`workspace-btn ${currentWorkspace === 'image' ? 'active' : ''}`}
        onClick={() => onWorkspaceChange('image')}
        title="Image View (Ctrl+1)"
      >
        📷 Image View
      </button>
      <button
        className={`workspace-btn ${currentWorkspace === 'world' ? 'active' : ''}`}
        onClick={() => onWorkspaceChange('world')}
        title="World View (Ctrl+2)"
      >
        🌐 World View
      </button>
      <div className="workspace-indicator">
        Current: {currentWorkspace === 'image' ? 'Image' : 'World'} View
        <span className="shortcut-hint">Tab to switch</span>
      </div>
    </div>
  )
}

export default WorkspaceManager