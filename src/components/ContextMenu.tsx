import React, { useEffect, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { IconDefinition } from '@fortawesome/fontawesome-svg-core'

export interface ContextMenuItem {
  id: string
  label: string
  icon?: IconDefinition
  onClick: () => void
  disabled?: boolean
  separator?: boolean
}

interface ContextMenuProps {
  isOpen: boolean
  position: { x: number; y: number }
  items: ContextMenuItem[]
  onClose: () => void
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  isOpen,
  position,
  items,
  onClose
}) => {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Adjust position to prevent menu from going off-screen
  const adjustedPosition = { ...position }
  if (menuRef.current) {
    const rect = menuRef.current.getBoundingClientRect()
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    }

    if (position.x + rect.width > viewport.width) {
      adjustedPosition.x = viewport.width - rect.width - 10
    }
    if (position.y + rect.height > viewport.height) {
      adjustedPosition.y = viewport.height - rect.height - 10
    }
  }

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        position: 'fixed',
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        zIndex: 1000
      }}
    >
      {items.map((item, index) => (
        <div key={item.id || index}>
          {item.separator ? (
            <div className="context-menu-separator" />
          ) : (
            <button
              className={`context-menu-item ${item.disabled ? 'disabled' : ''}`}
              onClick={() => {
                if (!item.disabled) {
                  item.onClick()
                  onClose()
                }
              }}
              disabled={item.disabled}
            >
              {item.icon && (
                <span className="context-menu-icon">
                  <FontAwesomeIcon icon={item.icon} />
                </span>
              )}
              <span className="context-menu-label">{item.label}</span>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export default ContextMenu