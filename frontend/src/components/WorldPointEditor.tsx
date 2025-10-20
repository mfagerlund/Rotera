// TODO: This component needs to be refactored to work with entity classes
// WorldPoint is now a class with private fields, can't be mutated like a plain object
// See WorldPointEditor.tsx.TODO for original implementation

import React from 'react'
import { WorldPoint } from '../entities/world-point'
import { Viewpoint } from '../entities/viewpoint'

type ProjectImage = Viewpoint

interface WorldPointEditorProps {
  isOpen: boolean
  onClose: () => void
  worldPoint: WorldPoint
  onUpdateWorldPoint: (updatedPoint: WorldPoint) => void
  onDeleteWorldPoint?: (worldPoint: WorldPoint) => void
  images: Map<string, ProjectImage>
}

export const WorldPointEditor: React.FC<WorldPointEditorProps> = ({
  isOpen,
  onClose
}) => {
  if (!isOpen) return null

  return (
    <div style={{ padding: '20px', background: '#fff', border: '1px solid #ccc' }}>
      <h3>WorldPoint Editor (TODO - Needs Refactor)</h3>
      <p>This component needs to be refactored to work with entity classes.</p>
      <button onClick={onClose}>Close</button>
    </div>
  )
}

export default WorldPointEditor
