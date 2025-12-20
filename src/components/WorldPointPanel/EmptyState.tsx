import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBullseye, faDraftingCompass } from '@fortawesome/free-solid-svg-icons'

export const EmptyState: React.FC = () => {
  return (
    <div className="world-point-empty">
      <div className="empty-icon"><FontAwesomeIcon icon={faBullseye} /></div>
      <div className="empty-text">No world points yet</div>
      <div className="empty-hint">Click on images to create world points and start building your 3D model</div>
      <div className="empty-tips">
        <div><span>💡</span> Pro tip: Create points on distinct features</div>
        <div><FontAwesomeIcon icon={faDraftingCompass} /> Points help align multiple images</div>
        <div><FontAwesomeIcon icon={faBullseye} /> More points = better accuracy</div>
      </div>
    </div>
  )
}
