declare global {
  interface Window {
    RoteraComponentLabels?: {
      isEnabled: () => boolean
      setEnabled: (value: boolean) => void
      toggle: () => void
      refresh: () => void
    }
    toggleComponentNameOverlay?: (value?: boolean) => void
  }

  interface DocumentEventMap {
    'Rotera:component-overlay-change': CustomEvent<{ enabled: boolean }>
  }

  interface WindowEventMap {
    'Rotera:component-overlay-change': CustomEvent<{ enabled: boolean }>
  }
}

export {}
