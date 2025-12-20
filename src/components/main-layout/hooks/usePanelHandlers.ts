import { useCallback } from 'react'
import type { Viewpoint } from '../../../entities/viewpoint'
import type { WorldPoint } from '../../../entities/world-point'
import type { Line } from '../../../entities/line'
import type { LineOptions } from '../../../hooks/useDomainOperations'
import type { WorldViewRef } from '../../WorldView'
import type { Project } from '../../../entities/project'

interface UsePanelHandlersProps {
  project: Project | null
  currentViewpoint: Viewpoint | null
  deleteImage: (viewpoint: Viewpoint) => void
  setCurrentViewpoint: (viewpoint: Viewpoint | null) => void
  copyPointsFromImageToImage: (source: Viewpoint, target: Viewpoint) => void
  createLine: (pointA: WorldPoint, pointB: WorldPoint, options?: LineOptions) => Line
  worldViewRef: React.RefObject<WorldViewRef>
  setConstructionPreview: (preview: React.SetStateAction<import('../../image-viewer/types').ConstructionPreview | null>) => void
}

export const usePanelHandlers = ({
  project,
  currentViewpoint,
  deleteImage,
  setCurrentViewpoint,
  copyPointsFromImageToImage,
  createLine,
  worldViewRef,
  setConstructionPreview
}: UsePanelHandlersProps) => {
  const handleImageDelete = useCallback((viewpoint: Viewpoint) => {
    const wasCurrentViewpoint = viewpoint === currentViewpoint
    deleteImage(viewpoint)

    if (wasCurrentViewpoint && project) {
      const remainingViewpoints = Array.from(project.viewpoints)
      if (remainingViewpoints.length > 0) {
        setCurrentViewpoint(remainingViewpoints[0])
      } else {
        setCurrentViewpoint(null)
      }
    }
  }, [currentViewpoint, deleteImage, project, setCurrentViewpoint])

  const handleViewFromCamera = useCallback((viewpoint: Viewpoint, workspaceActions: { setWorkspace: (workspace: 'image' | 'world' | 'split') => void }) => {
    workspaceActions.setWorkspace('world')
    setTimeout(() => worldViewRef.current?.lookFromCamera(viewpoint), 100)
  }, [worldViewRef])

  const handleCopyPointsToCurrentImage = useCallback((sourceViewpoint: Viewpoint) => {
    if (currentViewpoint) {
      copyPointsFromImageToImage(sourceViewpoint, currentViewpoint)
    }
  }, [currentViewpoint, copyPointsFromImageToImage])

  const handleShowInImageView = useCallback((viewpoint: Viewpoint, workspaceActions: { setWorkspace: (workspace: 'image' | 'world' | 'split') => void }) => {
    setCurrentViewpoint(viewpoint)
    workspaceActions.setWorkspace('image')
  }, [setCurrentViewpoint])

  const handleCreateLineFromPanel = useCallback((pointA: WorldPoint, pointB: WorldPoint, lineConstraints?: LineOptions) => {
    try {
      const lineEntity = createLine(pointA, pointB, lineConstraints)
      if (lineEntity) {
        setConstructionPreview(null)
      }
    } catch (error) {
      console.error('Error creating line:', error)
    }
  }, [createLine, setConstructionPreview])

  return {
    handleImageDelete,
    handleViewFromCamera,
    handleCopyPointsToCurrentImage,
    handleShowInImageView,
    handleCreateLineFromPanel
  }
}
