import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import type { WorldPoint } from '../../entities/world-point'

interface MissingPointsNoticeProps {
  missingCount: number
  latestMissingWP: WorldPoint | null
  onPlaceLatest: () => void
}

export const MissingPointsNotice: React.FC<MissingPointsNoticeProps> = ({
  missingCount,
  latestMissingWP,
  onPlaceLatest
}) => {
  if (missingCount === 0) return null

  return (
    <div className="missing-points-notice help-hint">
      <span className="notice-icon"><FontAwesomeIcon icon={faTriangleExclamation} /></span>
      <span>{missingCount} point{missingCount !== 1 ? 's' : ''} not in this image</span>
      {latestMissingWP && (
        <button
          onClick={onPlaceLatest}
          className="btn-quick-place"
          title={`Place ${latestMissingWP.getName()} in this image`}
        >
          Place Latest ({latestMissingWP.getName()})
        </button>
      )}
    </div>
  )
}
