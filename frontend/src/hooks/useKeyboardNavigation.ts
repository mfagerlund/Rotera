// Keyboard navigation hook for enhanced user experience

import { useCallback, useEffect, useRef } from 'react'

export interface KeyboardNavigationConfig {
  // Navigation
  onNavigateUp?: () => void
  onNavigateDown?: () => void
  onNavigateLeft?: () => void
  onNavigateRight?: () => void
  onNavigateHome?: () => void
  onNavigateEnd?: () => void

  // Selection
  onSelectNext?: () => void
  onSelectPrevious?: () => void
  onSelectAll?: () => void
  onSelectNone?: () => void
  onToggleSelection?: () => void

  // Actions
  onDelete?: () => void
  onCopy?: () => void
  onPaste?: () => void
  onUndo?: () => void
  onRedo?: () => void
  onSave?: () => void
  onFind?: () => void

  // View
  onZoomIn?: () => void
  onZoomOut?: () => void
  onZoomFit?: () => void
  onZoomToSelection?: () => void
  onToggleView?: () => void

  // Tools
  onEscapeAction?: () => void
  onEnterAction?: () => void
  onSpaceAction?: () => void

  // Custom shortcuts
  customShortcuts?: Record<string, () => void>

  // Options
  enabled?: boolean
  preventDefaultOnMatch?: boolean
  requireModifier?: boolean
}

interface KeyShortcut {
  key: string
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  meta?: boolean
  action: () => void
  preventDefault?: boolean
}

export const useKeyboardNavigation = (config: KeyboardNavigationConfig) => {
  const configRef = useRef(config)
  configRef.current = config

  // Build shortcuts map
  const shortcuts = useRef<KeyShortcut[]>([])

  useEffect(() => {
    const newShortcuts: KeyShortcut[] = []

    // Navigation shortcuts
    if (config.onNavigateUp) {
      newShortcuts.push({ key: 'ArrowUp', action: config.onNavigateUp })
    }
    if (config.onNavigateDown) {
      newShortcuts.push({ key: 'ArrowDown', action: config.onNavigateDown })
    }
    if (config.onNavigateLeft) {
      newShortcuts.push({ key: 'ArrowLeft', action: config.onNavigateLeft })
    }
    if (config.onNavigateRight) {
      newShortcuts.push({ key: 'ArrowRight', action: config.onNavigateRight })
    }
    if (config.onNavigateHome) {
      newShortcuts.push({ key: 'Home', action: config.onNavigateHome })
    }
    if (config.onNavigateEnd) {
      newShortcuts.push({ key: 'End', action: config.onNavigateEnd })
    }

    // Selection shortcuts
    if (config.onSelectNext) {
      newShortcuts.push({ key: 'Tab', action: config.onSelectNext, preventDefault: true })
    }
    if (config.onSelectPrevious) {
      newShortcuts.push({ key: 'Tab', shift: true, action: config.onSelectPrevious, preventDefault: true })
    }
    if (config.onSelectAll) {
      newShortcuts.push({ key: 'a', ctrl: true, action: config.onSelectAll, preventDefault: true })
    }
    if (config.onSelectNone) {
      newShortcuts.push({ key: 'd', ctrl: true, action: config.onSelectNone, preventDefault: true })
    }
    if (config.onToggleSelection) {
      newShortcuts.push({ key: ' ', action: config.onToggleSelection, preventDefault: true })
    }

    // Action shortcuts
    if (config.onDelete) {
      newShortcuts.push({ key: 'Delete', action: config.onDelete })
      newShortcuts.push({ key: 'Backspace', action: config.onDelete })
    }
    if (config.onCopy) {
      newShortcuts.push({ key: 'c', ctrl: true, action: config.onCopy, preventDefault: true })
    }
    if (config.onPaste) {
      newShortcuts.push({ key: 'v', ctrl: true, action: config.onPaste, preventDefault: true })
    }
    if (config.onUndo) {
      newShortcuts.push({ key: 'z', ctrl: true, action: config.onUndo, preventDefault: true })
    }
    if (config.onRedo) {
      newShortcuts.push({ key: 'z', ctrl: true, shift: true, action: config.onRedo, preventDefault: true })
      newShortcuts.push({ key: 'y', ctrl: true, action: config.onRedo, preventDefault: true })
    }
    if (config.onSave) {
      newShortcuts.push({ key: 's', ctrl: true, action: config.onSave, preventDefault: true })
    }
    if (config.onFind) {
      newShortcuts.push({ key: 'f', ctrl: true, action: config.onFind, preventDefault: true })
    }

    // View shortcuts
    if (config.onZoomIn) {
      newShortcuts.push({ key: '=', action: config.onZoomIn })
      newShortcuts.push({ key: '+', action: config.onZoomIn })
      newShortcuts.push({ key: '=', ctrl: true, action: config.onZoomIn, preventDefault: true })
    }
    if (config.onZoomOut) {
      newShortcuts.push({ key: '-', action: config.onZoomOut })
      newShortcuts.push({ key: '-', ctrl: true, action: config.onZoomOut, preventDefault: true })
    }
    if (config.onZoomFit) {
      newShortcuts.push({ key: '0', action: config.onZoomFit })
      newShortcuts.push({ key: 'f', action: config.onZoomFit })
    }
    if (config.onZoomToSelection) {
      newShortcuts.push({ key: 's', action: config.onZoomToSelection })
    }
    if (config.onToggleView) {
      newShortcuts.push({ key: 't', action: config.onToggleView })
    }

    // Tool shortcuts
    if (config.onEscapeAction) {
      newShortcuts.push({ key: 'Escape', action: config.onEscapeAction })
    }
    if (config.onEnterAction) {
      newShortcuts.push({ key: 'Enter', action: config.onEnterAction })
    }
    if (config.onSpaceAction) {
      newShortcuts.push({ key: ' ', action: config.onSpaceAction })
    }

    // Custom shortcuts
    if (config.customShortcuts) {
      Object.entries(config.customShortcuts).forEach(([keyCombo, action]) => {
        const parts = keyCombo.toLowerCase().split('+')
        const key = parts[parts.length - 1]
        const ctrl = parts.includes('ctrl') || parts.includes('cmd')
        const alt = parts.includes('alt')
        const shift = parts.includes('shift')
        const meta = parts.includes('meta')

        newShortcuts.push({
          key,
          ctrl,
          alt,
          shift,
          meta,
          action,
          preventDefault: config.preventDefaultOnMatch
        })
      })
    }

    shortcuts.current = newShortcuts
  }, [config])

  // Handle keydown events
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!configRef.current.enabled && configRef.current.enabled !== undefined) {
      return
    }

    // Skip if user is typing in an input field
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
      return
    }

    // Find matching shortcut
    const matchingShortcut = shortcuts.current.find(shortcut => {
      const keyMatch = shortcut.key.toLowerCase() === event.key.toLowerCase()
      const ctrlMatch = !shortcut.ctrl || event.ctrlKey || event.metaKey
      const altMatch = !shortcut.alt || event.altKey
      const shiftMatch = !shortcut.shift || event.shiftKey
      const metaMatch = !shortcut.meta || event.metaKey

      // If ctrl is required but not pressed
      if (shortcut.ctrl && !event.ctrlKey && !event.metaKey) return false
      // If alt is required but not pressed
      if (shortcut.alt && !event.altKey) return false
      // If shift is required but not pressed
      if (shortcut.shift && !event.shiftKey) return false
      // If meta is required but not pressed
      if (shortcut.meta && !event.metaKey) return false

      return keyMatch && ctrlMatch && altMatch && shiftMatch && metaMatch
    })

    if (matchingShortcut) {
      if (matchingShortcut.preventDefault || configRef.current.preventDefaultOnMatch) {
        event.preventDefault()
        event.stopPropagation()
      }

      try {
        matchingShortcut.action()
      } catch (error) {
        console.error('Error executing keyboard shortcut:', error)
      }
    }
  }, [])

  // Attach event listener
  useEffect(() => {
    if (config.enabled !== false) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown, config.enabled])

  // Return helper functions
  return {
    // Helper to check if a shortcut exists
    hasShortcut: useCallback((key: string) => {
      return shortcuts.current.some(shortcut =>
        shortcut.key.toLowerCase() === key.toLowerCase()
      )
    }, []),

    // Helper to get all shortcuts
    getShortcuts: useCallback(() => {
      return shortcuts.current.map(shortcut => ({
        key: shortcut.key,
        ctrl: shortcut.ctrl,
        alt: shortcut.alt,
        shift: shortcut.shift,
        meta: shortcut.meta
      }))
    }, []),

    // Helper to format shortcut for display
    formatShortcut: useCallback((key: string, modifiers: {
      ctrl?: boolean
      alt?: boolean
      shift?: boolean
      meta?: boolean
    } = {}) => {
      const parts: string[] = []

      if (modifiers.ctrl || modifiers.meta) {
        parts.push(navigator.platform.includes('Mac') ? '⌘' : 'Ctrl')
      }
      if (modifiers.alt) {
        parts.push(navigator.platform.includes('Mac') ? '⌥' : 'Alt')
      }
      if (modifiers.shift) {
        parts.push('⇧')
      }

      parts.push(key.toUpperCase())

      return parts.join('+')
    }, [])
  }
}

// Predefined keyboard navigation presets
export const keyboardPresets = {
  // Basic navigation preset
  basic: {
    onSelectAll: undefined, // Will be provided by component
    onSelectNone: undefined,
    onDelete: undefined,
    onUndo: undefined,
    onRedo: undefined,
    onSave: undefined,
    onFind: undefined,
    onEscapeAction: undefined,
    enabled: true,
    preventDefaultOnMatch: true
  },

  // Image viewer preset
  imageViewer: {
    onZoomIn: undefined,
    onZoomOut: undefined,
    onZoomFit: undefined,
    onNavigateLeft: undefined, // Previous image
    onNavigateRight: undefined, // Next image
    onToggleView: undefined, // Toggle between views
    enabled: true,
    preventDefaultOnMatch: true
  },

  // Point selection preset
  pointSelection: {
    onSelectNext: undefined,
    onSelectPrevious: undefined,
    onSelectAll: undefined,
    onSelectNone: undefined,
    onToggleSelection: undefined,
    onDelete: undefined,
    onCopy: undefined,
    onPaste: undefined,
    enabled: true,
    preventDefaultOnMatch: true
  },

  // Measurement tools preset
  measurementTools: {
    onEscapeAction: undefined, // Cancel current measurement
    onEnterAction: undefined, // Complete current measurement
    onDelete: undefined, // Delete selected measurements
    customShortcuts: {
      'd': undefined, // Distance tool
      'a': undefined, // Angle tool
      'r': undefined, // Area tool
      'p': undefined  // Perimeter tool
    },
    enabled: true,
    preventDefaultOnMatch: true
  },

  // Global application preset
  global: {
    onUndo: undefined,
    onRedo: undefined,
    onSave: undefined,
    onFind: undefined,
    onZoomIn: undefined,
    onZoomOut: undefined,
    onZoomFit: undefined,
    customShortcuts: {
      'ctrl+shift+d': undefined, // Toggle debug mode
      'ctrl+shift+h': undefined, // Show help
      'ctrl+,': undefined        // Open settings
    },
    enabled: true,
    preventDefaultOnMatch: true
  }
}

export default useKeyboardNavigation