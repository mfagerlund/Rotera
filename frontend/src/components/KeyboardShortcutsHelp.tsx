// Keyboard shortcuts help dialog

import React, { useState } from 'react'

interface KeyboardShortcut {
  category: string
  shortcuts: {
    keys: string
    description: string
    context?: string
  }[]
}

interface KeyboardShortcutsHelpProps {
  isOpen: boolean
  onClose: () => void
}

const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  {
    category: 'Navigation',
    shortcuts: [
      { keys: '← → ↑ ↓', description: 'Navigate between points/items' },
      { keys: 'Home', description: 'Go to first item' },
      { keys: 'End', description: 'Go to last item' },
      { keys: 'Tab', description: 'Next selectable item' },
      { keys: 'Shift+Tab', description: 'Previous selectable item' },
      { keys: 'Page Up/Down', description: 'Scroll image viewer', context: 'Image view' }
    ]
  },
  {
    category: 'Selection',
    shortcuts: [
      { keys: 'Ctrl+A', description: 'Select all points/constraints' },
      { keys: 'Ctrl+D', description: 'Deselect all' },
      { keys: 'Space', description: 'Toggle selection of current item' },
      { keys: 'Shift+Click', description: 'Multi-select items' },
      { keys: 'Ctrl+Click', description: 'Add/remove from selection' }
    ]
  },
  {
    category: 'Editing',
    shortcuts: [
      { keys: 'Delete', description: 'Delete selected items' },
      { keys: 'Backspace', description: 'Delete selected items' },
      { keys: 'Ctrl+C', description: 'Copy selected items' },
      { keys: 'Ctrl+V', description: 'Paste items' },
      { keys: 'Ctrl+Z', description: 'Undo last action' },
      { keys: 'Ctrl+Y', description: 'Redo last undone action' },
      { keys: 'Ctrl+Shift+Z', description: 'Redo last undone action' },
      { keys: 'F2', description: 'Rename selected point', context: 'Point selected' },
      { keys: 'Enter', description: 'Confirm current action' },
      { keys: 'Escape', description: 'Cancel current action' }
    ]
  },
  {
    category: 'View & Zoom',
    shortcuts: [
      { keys: '+/=', description: 'Zoom in' },
      { keys: '-', description: 'Zoom out' },
      { keys: 'Ctrl++', description: 'Zoom in (alternative)' },
      { keys: 'Ctrl+-', description: 'Zoom out (alternative)' },
      { keys: '0', description: 'Fit to screen' },
      { keys: 'F', description: 'Fit to screen (alternative)' },
      { keys: 'S', description: 'Zoom to selection', context: 'Items selected' },
      { keys: 'A', description: 'Zoom to all points', context: 'Image view' },
      { keys: 'T', description: 'Toggle between views' }
    ]
  },
  {
    category: 'Tools',
    shortcuts: [
      { keys: 'D', description: 'Distance measurement tool' },
      { keys: 'M', description: 'Angle measurement tool' },
      { keys: 'R', description: 'Area measurement tool' },
      { keys: 'P', description: 'Perimeter measurement tool' },
      { keys: 'L', description: 'Line constraint tool' },
      { keys: 'C', description: 'Circle constraint tool' },
      { keys: 'Ctrl+1', description: 'Switch to image view' },
      { keys: 'Ctrl+2', description: 'Switch to 3D view' },
      { keys: 'Ctrl+3', description: 'Switch to constraint view' }
    ]
  },
  {
    category: 'File Operations',
    shortcuts: [
      { keys: 'Ctrl+S', description: 'Save project' },
      { keys: 'Ctrl+O', description: 'Open project' },
      { keys: 'Ctrl+N', description: 'New project' },
      { keys: 'Ctrl+E', description: 'Export project' },
      { keys: 'Ctrl+I', description: 'Import images' },
      { keys: 'Ctrl+P', description: 'Print/Export report' }
    ]
  },
  {
    category: 'Search & Filter',
    shortcuts: [
      { keys: 'Ctrl+F', description: 'Find/search points' },
      { keys: 'Ctrl+G', description: 'Find next' },
      { keys: 'Ctrl+Shift+G', description: 'Find previous' },
      { keys: 'Ctrl+H', description: 'Replace/rename' },
      { keys: 'Ctrl+L', description: 'Filter by selection' }
    ]
  },
  {
    category: 'Application',
    shortcuts: [
      { keys: 'F1', description: 'Show help' },
      { keys: 'F5', description: 'Refresh/reload' },
      { keys: 'F11', description: 'Toggle fullscreen' },
      { keys: 'Ctrl+,', description: 'Open preferences' },
      { keys: 'Ctrl+Shift+D', description: 'Toggle debug mode' },
      { keys: 'Ctrl+Shift+H', description: 'Show keyboard shortcuts' },
      { keys: 'Alt+F4', description: 'Close application', context: 'Windows' },
      { keys: 'Cmd+Q', description: 'Quit application', context: 'macOS' }
    ]
  }
]

export const KeyboardShortcutsHelp: React.FC<KeyboardShortcutsHelpProps> = ({
  isOpen,
  onClose
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Filter shortcuts based on search query
  const filteredShortcuts = React.useMemo(() => {
    if (!searchQuery) return KEYBOARD_SHORTCUTS

    return KEYBOARD_SHORTCUTS
      .map(category => ({
        ...category,
        shortcuts: category.shortcuts.filter(shortcut =>
          shortcut.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          shortcut.keys.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (shortcut.context && shortcut.context.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      }))
      .filter(category => category.shortcuts.length > 0)
  }, [searchQuery])

  // Get platform-specific modifier key display
  const getModifierKey = (key: string) => {
    const isMac = navigator.platform.includes('Mac')
    return key
      .replace(/Ctrl/g, isMac ? '⌘' : 'Ctrl')
      .replace(/Alt/g, isMac ? '⌥' : 'Alt')
      .replace(/Shift/g, '⇧')
      .replace(/←/g, '←')
      .replace(/→/g, '→')
      .replace(/↑/g, '↑')
      .replace(/↓/g, '↓')
  }

  // Handle category selection
  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategory(selectedCategory === categoryName ? null : categoryName)
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="keyboard-shortcuts-dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="dialog-content">
          <div className="shortcuts-search">
            <input
              type="text"
              className="search-input"
              placeholder="Search shortcuts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="search-icon">🔍</div>
          </div>

          <div className="shortcuts-layout">
            <div className="categories-sidebar">
              <h3>Categories</h3>
              <div className="category-list">
                {filteredShortcuts.map(category => (
                  <button
                    key={category.category}
                    className={`category-item ${selectedCategory === category.category ? 'active' : ''}`}
                    onClick={() => handleCategoryClick(category.category)}
                  >
                    <span className="category-name">{category.category}</span>
                    <span className="category-count">({category.shortcuts.length})</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="shortcuts-content">
              {selectedCategory ? (
                // Show selected category
                (() => {
                  const category = filteredShortcuts.find(c => c.category === selectedCategory)
                  if (!category) return null

                  return (
                    <div className="category-shortcuts">
                      <h3>{category.category}</h3>
                      <div className="shortcuts-list">
                        {category.shortcuts.map((shortcut, index) => (
                          <div key={index} className="shortcut-item">
                            <div className="shortcut-keys">
                              {getModifierKey(shortcut.keys)}
                            </div>
                            <div className="shortcut-info">
                              <div className="shortcut-description">
                                {shortcut.description}
                              </div>
                              {shortcut.context && (
                                <div className="shortcut-context">
                                  {shortcut.context}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()
              ) : (
                // Show all categories
                <div className="all-shortcuts">
                  {filteredShortcuts.map(category => (
                    <div key={category.category} className="category-section">
                      <h3
                        className="category-header"
                        onClick={() => handleCategoryClick(category.category)}
                      >
                        {category.category}
                        <span className="category-toggle">▼</span>
                      </h3>
                      <div className="shortcuts-list">
                        {category.shortcuts.slice(0, 4).map((shortcut, index) => (
                          <div key={index} className="shortcut-item compact">
                            <div className="shortcut-keys">
                              {getModifierKey(shortcut.keys)}
                            </div>
                            <div className="shortcut-description">
                              {shortcut.description}
                            </div>
                          </div>
                        ))}
                        {category.shortcuts.length > 4 && (
                          <button
                            className="show-more-btn"
                            onClick={() => handleCategoryClick(category.category)}
                          >
                            +{category.shortcuts.length - 4} more
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {filteredShortcuts.length === 0 && (
                <div className="no-results">
                  <div className="no-results-icon">🔍</div>
                  <div className="no-results-text">No shortcuts found</div>
                  <div className="no-results-hint">
                    Try a different search term
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="dialog-footer">
          <div className="platform-note">
            Shortcuts shown for {navigator.platform.includes('Mac') ? 'macOS' : 'Windows/Linux'}
          </div>
          <button className="btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

export default KeyboardShortcutsHelp