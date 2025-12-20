// Optimization panel - works with ENTITIES only
// NO DTOs

import React, { useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBolt, faGear, faStop, faClipboard } from '@fortawesome/free-solid-svg-icons'
import { Project } from '../entities/project'
import FloatingWindow, { HeaderButton } from './FloatingWindow'
import { WorldPoint } from '../entities/world-point'
import { Line } from '../entities/line'
import { CoplanarPointsConstraint } from '../entities/constraints/coplanar-points-constraint'
import { optimizationLogs } from '../optimization/optimize-project'
import { OptimizationStatus } from './OptimizationPanel/OptimizationStatus'
import { OptimizationSettings } from './OptimizationPanel/OptimizationSettings'
import { OptimizationResults } from './OptimizationPanel/OptimizationResults'
import { useOptimizationPanel } from './OptimizationPanel/useOptimizationPanel'

interface OptimizationPanelProps {
  isOpen: boolean
  onClose: () => void
  project: Project
  onOptimizationComplete: (success: boolean, message: string) => void
  onSelectWorldPoint?: (worldPoint: WorldPoint) => void
  onSelectLine?: (line: Line) => void
  onSelectCoplanarConstraint?: (constraint: CoplanarPointsConstraint) => void
  onHoverWorldPoint?: (worldPoint: WorldPoint | null) => void
  onHoverLine?: (line: Line | null) => void
  onHoverCoplanarConstraint?: (constraint: CoplanarPointsConstraint | null) => void
  isWorldPointSelected?: (worldPoint: WorldPoint) => boolean
  isLineSelected?: (line: Line) => boolean
  isCoplanarConstraintSelected?: (constraint: CoplanarPointsConstraint) => boolean
  hoveredWorldPoint?: WorldPoint | null
  hoveredCoplanarConstraint?: CoplanarPointsConstraint | null
  /** If true, automatically start optimization when panel opens */
  autoStart?: boolean
  /** Counter that triggers optimization when incremented (used by toolbar button) */
  optimizeTrigger?: number
  /** Called when optimization starts (before any changes) */
  onOptimizationStart?: () => void
}

export const OptimizationPanel: React.FC<OptimizationPanelProps> = observer(({
  isOpen,
  onClose,
  project,
  onOptimizationComplete,
  onSelectWorldPoint,
  onSelectLine,
  onSelectCoplanarConstraint,
  onHoverWorldPoint,
  onHoverLine,
  onHoverCoplanarConstraint,
  isWorldPointSelected,
  isLineSelected,
  isCoplanarConstraintSelected,
  hoveredWorldPoint,
  hoveredCoplanarConstraint,
  autoStart = false,
  optimizeTrigger,
  onOptimizationStart
}) => {
  const {
    isOptimizing,
    settings,
    results,
    showAdvanced,
    pnpResults,
    statusMessage,
    stats,
    canOptimize,
    handleOptimize,
    handleStop,
    handleSettingChange,
    resetToDefaults,
    toggleAdvanced
  } = useOptimizationPanel({
    project,
    isOpen,
    autoStart,
    optimizeTrigger,
    onOptimizationComplete,
    onOptimizationStart
  })

  const headerButtons: HeaderButton[] = useMemo(() => [
    {
      icon: <FontAwesomeIcon icon={faBolt} />,
      label: 'Optimize',
      onClick: handleOptimize,
      disabled: !canOptimize() || isOptimizing,
      title: 'Run bundle adjustment optimization',
      className: 'btn-optimize'
    },
    {
      icon: <FontAwesomeIcon icon={faStop} />,
      onClick: handleStop,
      disabled: !isOptimizing,
      title: 'Stop optimization (may take a moment to respond)'
    },
    {
      icon: <FontAwesomeIcon icon={faGear} />,
      onClick: toggleAdvanced,
      disabled: isOptimizing,
      title: 'Toggle settings'
    },
    {
      icon: <FontAwesomeIcon icon={faClipboard} />,
      onClick: () => {
        const logText = optimizationLogs.join('\n')
        navigator.clipboard.writeText(logText)
      },
      disabled: isOptimizing,
      title: 'Copy optimization logs to clipboard'
    }
  ], [handleOptimize, canOptimize, isOptimizing, handleStop, toggleAdvanced])

  return (
    <FloatingWindow
      title="Bundle Adjustment Optimization"
      isOpen={isOpen}
      onClose={onClose}
      width={530}
      maxHeight={600}
      storageKey="optimization-panel"
      showOkCancel={false}
      headerButtons={headerButtons}
    >
    <div className="optimization-panel">
      <OptimizationStatus
        stats={stats}
        isOptimizing={isOptimizing}
        statusMessage={statusMessage}
      />

      {showAdvanced && (
        <OptimizationSettings
          settings={settings}
          onSettingChange={handleSettingChange}
          onResetToDefaults={resetToDefaults}
        />
      )}

      <OptimizationResults
        project={project}
        pnpResults={pnpResults}
        results={results}
        onSelectWorldPoint={onSelectWorldPoint}
        onSelectLine={onSelectLine}
        onSelectCoplanarConstraint={onSelectCoplanarConstraint}
        onHoverWorldPoint={onHoverWorldPoint}
        onHoverLine={onHoverLine}
        onHoverCoplanarConstraint={onHoverCoplanarConstraint}
        isWorldPointSelected={isWorldPointSelected}
        isLineSelected={isLineSelected}
        isCoplanarConstraintSelected={isCoplanarConstraintSelected}
      />
    </div>
    </FloatingWindow>
  )
})

export default OptimizationPanel
