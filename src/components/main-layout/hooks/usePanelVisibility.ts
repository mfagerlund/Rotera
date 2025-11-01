import { useState, useCallback } from 'react'

export interface PanelVisibilityState {
  showLinesPopup: boolean
  showPlanesPopup: boolean
  showImagePointsPopup: boolean
  showConstraintsPopup: boolean
  showOptimizationPanel: boolean
}

export function usePanelVisibility() {
  const [panelState, setPanelState] = useState<PanelVisibilityState>({
    showLinesPopup: false,
    showPlanesPopup: false,
    showImagePointsPopup: false,
    showConstraintsPopup: false,
    showOptimizationPanel: false
  })

  const setPanel = useCallback((panel: keyof PanelVisibilityState, value: boolean) => {
    setPanelState(prev => ({ ...prev, [panel]: value }))
  }, [])

  return {
    panelState,
    setPanel
  }
}
