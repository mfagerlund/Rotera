import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

export interface FloatingWindowPosition {
  x: number
  y: number
}

interface FloatingWindowProps {
  title: string
  isOpen: boolean
  onClose: () => void
  onOk?: () => void
  onCancel?: () => void
  children: React.ReactNode
  initialPosition?: FloatingWindowPosition
  width?: number
  height?: number
  minWidth?: number
  minHeight?: number
  storageKey?: string // For position persistence
  className?: string
  showOkCancel?: boolean
  okText?: string
  cancelText?: string
  okDisabled?: boolean
}

// Global z-index manager for floating windows
let globalZIndex = 1000
const windowStack: string[] = []

export const FloatingWindow: React.FC<FloatingWindowProps> = ({
  title,
  isOpen,
  onClose,
  onOk,
  onCancel,
  children,
  initialPosition,
  width = 400,
  height = 300,
  minWidth = 300,
  minHeight = 200,
  storageKey,
  className = '',
  showOkCancel = true,
  okText = 'OK',
  cancelText = 'Cancel',
  okDisabled = false
}) => {
  const windowRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<FloatingWindowPosition>(initialPosition || { x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [zIndex, setZIndex] = useState(globalZIndex)
  const windowId = useRef(`window-${Date.now()}-${Math.random()}`)

  // Load saved position from localStorage
  useEffect(() => {
    if (storageKey && isOpen) {
      const savedPosition = localStorage.getItem(`floating-window-${storageKey}`)
      if (savedPosition) {
        try {
          const parsed = JSON.parse(savedPosition)
          setPosition(parsed)
        } catch (e) {
          console.warn('Failed to parse saved window position:', e)
        }
      }
    }
  }, [storageKey, isOpen])

  // Save position to localStorage
  const savePosition = useCallback((newPosition: FloatingWindowPosition) => {
    if (storageKey) {
      localStorage.setItem(`floating-window-${storageKey}`, JSON.stringify(newPosition))
    }
  }, [storageKey])

  // Manage window stack for z-index
  useEffect(() => {
    if (isOpen) {
      const id = windowId.current
      // Remove if already in stack
      const index = windowStack.indexOf(id)
      if (index > -1) {
        windowStack.splice(index, 1)
      }
      // Add to top of stack
      windowStack.push(id)
      setZIndex(globalZIndex + windowStack.length)

      return () => {
        const cleanupIndex = windowStack.indexOf(id)
        if (cleanupIndex > -1) {
          windowStack.splice(cleanupIndex, 1)
        }
      }
    }
  }, [isOpen])

  // Bring window to front when clicked
  const bringToFront = useCallback(() => {
    const id = windowId.current
    const currentIndex = windowStack.indexOf(id)
    if (currentIndex > -1 && currentIndex < windowStack.length - 1) {
      windowStack.splice(currentIndex, 1)
      windowStack.push(id)
      setZIndex(globalZIndex + windowStack.length)
    }
  }, [])

  // Handle dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!headerRef.current || !windowRef.current) return

    const rect = windowRef.current.getBoundingClientRect()
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
    setIsDragging(true)
    bringToFront()

    e.preventDefault()
    e.stopPropagation()
  }, [bringToFront])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return

    const newPosition = {
      x: e.clientX - dragOffset.x,
      y: e.clientY - dragOffset.y
    }

    // Keep window within viewport bounds
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    }

    newPosition.x = Math.max(0, Math.min(newPosition.x, viewport.width - (width || 300)))
    newPosition.y = Math.max(0, Math.min(newPosition.y, viewport.height - 100)) // Keep title bar visible

    setPosition(newPosition)
  }, [isDragging, dragOffset, width])

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false)
      savePosition(position)
    }
  }, [isDragging, position, savePosition])

  // Mouse event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // ESC key handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (onCancel) {
          onCancel()
        } else {
          onClose()
        }
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose, onCancel])

  // Smart initial positioning to center window
  useEffect(() => {
    if (isOpen && !storageKey) {
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
      }

      // Center the window in the viewport
      const centeredPosition = {
        x: Math.max(20, (viewport.width - width) / 2),
        y: Math.max(20, (viewport.height - height) / 2)
      }

      setPosition(centeredPosition)
    } else if (isOpen && storageKey) {
      // Use saved position or center if no saved position
      const savedPosition = localStorage.getItem(`floating-window-${storageKey}`)
      if (!savedPosition) {
        const viewport = {
          width: window.innerWidth,
          height: window.innerHeight
        }
        const centeredPosition = {
          x: Math.max(20, (viewport.width - width) / 2),
          y: Math.max(20, (viewport.height - height) / 2)
        }
        setPosition(centeredPosition)
      }
    }
  }, [isOpen, width, height, storageKey])

  if (!isOpen) return null

  const windowContent = (
    <div
      ref={windowRef}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: width ? `${width}px` : undefined,
        height: height ? `${height}px` : 'auto',
        minWidth: minWidth ? `${minWidth}px` : undefined,
        minHeight: minHeight ? `${minHeight}px` : undefined,
        zIndex,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        pointerEvents: 'auto'
      }}
      onClick={bringToFront}
    >
        <div
          ref={headerRef}
          className="floating-window-header"
          onMouseDown={handleMouseDown}
          style={{padding: '4px 8px', minHeight: 'auto'}}
        >
          <h3 className="floating-window-title">{title}</h3>
          <button
            className="floating-window-close"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="floating-window-content">
          {children}
        </div>

        {showOkCancel && (
          <div className="floating-window-footer">
            <div className="floating-window-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={(e) => {
                  e.stopPropagation()
                  if (onCancel) onCancel()
                  else onClose()
                }}
              >
                {cancelText}
              </button>
              {onOk && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOk()
                  }}
                  disabled={okDisabled}
                >
                  {okText}
                </button>
              )}
            </div>
          </div>
        )}
    </div>
  )

  // Render using Portal to escape DOM hierarchy completely
  return createPortal(windowContent, document.body)
}

export default FloatingWindow