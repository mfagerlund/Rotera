import { useState, useEffect, useCallback } from 'react'
import { Viewpoint } from '../../../entities/viewpoint'

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

export function useLayoutState(currentViewpoint: Viewpoint | null) {
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>({
    currentWorkspace: 'image',
    imageWorkspace: {
      currentViewpoint: currentViewpoint,
      scale: 1.0,
      pan: { x: 0, y: 0 },
      showImagePoints: true,
      showProjections: true
    },
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
    },
    splitWorkspace: {
      splitDirection: 'horizontal',
      splitRatio: 0.5,
      syncSelection: true,
      syncNavigation: false
    }
  })

  useEffect(() => {
    setWorkspaceState(prev => ({
      ...prev,
      imageWorkspace: {
        ...prev.imageWorkspace,
        currentViewpoint: currentViewpoint
      }
    }))
  }, [currentViewpoint])

  const updateWorkspaceState = useCallback((updates: Partial<WorkspaceState>) => {
    setWorkspaceState(prev => ({ ...prev, ...updates }))
  }, [])

  return {
    workspaceState,
    updateWorkspaceState
  }
}
