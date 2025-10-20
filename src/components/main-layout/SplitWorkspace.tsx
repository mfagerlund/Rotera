import React from 'react'

import { SplitViewContainer } from '../WorkspaceManager'

type SplitDirection = 'horizontal' | 'vertical'

interface SplitWorkspaceState {
  splitDirection: SplitDirection
  splitRatio: number
}

interface SplitWorkspaceProps {
  splitState: SplitWorkspaceState
  onSplitRatioChange: (ratio: number) => void
  imageContent: React.ReactNode
  worldContent: React.ReactNode
}

const SplitWorkspace: React.FC<SplitWorkspaceProps> = ({
  splitState,
  onSplitRatioChange,
  imageContent,
  worldContent
}) => (
  <div className="workspace-split-view">
    <SplitViewContainer
      splitDirection={splitState.splitDirection}
      splitRatio={splitState.splitRatio}
      onSplitRatioChange={onSplitRatioChange}
      leftContent={imageContent}
      rightContent={worldContent}
    />
  </div>
)

export default SplitWorkspace
