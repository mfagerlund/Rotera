// Resizable sidebar component with drag handle
import React, { ReactNode } from 'react'

interface ResizableSidebarProps {
  children: ReactNode
  width: number
  onWidthChange: (width: number) => void
  minWidth?: number
  maxWidth?: number
  side?: 'left' | 'right'
  persistKey?: string
}

export const ResizableSidebar: React.FC<ResizableSidebarProps> = ({
  children,
  width,
  onWidthChange,
  minWidth = 120,
  maxWidth = 800,
  side = 'left',
  persistKey
}) => {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width

    let currentWidth = startWidth

    const handleMouseMove = (e: MouseEvent) => {
      const delta = side === 'left' ? (e.clientX - startX) : (startX - e.clientX)
      currentWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta))
      onWidthChange(currentWidth)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)

      // Persist the final width if key is provided
      if (persistKey) {
        localStorage.setItem(persistKey, currentWidth.toString())
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div className={`sidebar-${side}`} style={{ width: `${width}px` }}>
      {children}
      <div
        className={`sidebar-resize-handle sidebar-resize-handle-${side === 'left' ? 'right' : 'left'}`}
        onMouseDown={handleMouseDown}
      />
    </div>
  )
}
