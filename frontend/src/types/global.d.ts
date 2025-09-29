declare global {
  interface Window {
    pictorigoComponentLabels?: {
      isEnabled: () => boolean
      setEnabled: (value: boolean) => void
      toggle: () => void
      refresh: () => void
    }
    toggleComponentNameOverlay?: (value?: boolean) => void
  }

  interface DocumentEventMap {
    'pictorigo:component-overlay-change': CustomEvent<{ enabled: boolean }>
  }

  interface WindowEventMap {
    'pictorigo:component-overlay-change': CustomEvent<{ enabled: boolean }>
  }
}

export {}
