import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBullseye, faXmark } from '@fortawesome/free-solid-svg-icons'
import type { WorldPoint } from '../../entities/world-point'

interface PlacementModeHeaderProps {
  worldPoint: WorldPoint | null
  onCancelPlacement: () => void
}

export const PlacementModeHeader: React.FC<PlacementModeHeaderProps> = ({
  worldPoint,
  onCancelPlacement
}) => {
  if (!worldPoint) return null

  return (
    <div className="placement-mode-header constraint-step">
      <div className="placement-info">
        <span className="placement-icon"><FontAwesomeIcon icon={faBullseye} /></span>
        <span>Click on image to place "{worldPoint.getName()}"</span>
      </div>
      <button
        onClick={onCancelPlacement}
        className="btn-cancel-placement"
        title="Press Escape to cancel"
      >
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </div>
  )
}
