import React, { useState, useEffect, useRef } from 'react'
import '../styles/confirm-dialog.css'

interface ConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'primary' | 'danger'
  position?: { x: number; y: number }
  targetElement?: HTMLElement
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  variant = 'danger',
  position,
  targetElement
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => {
      setIsVisible(true)
    })
  }, [])

  useEffect(() => {
    if (dialogRef.current && targetElement) {
      const rect = targetElement.getBoundingClientRect()
      const dialogRect = dialogRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      let x = rect.left + rect.width / 2 - dialogRect.width / 2
      let y = rect.bottom + 8

      if (x + dialogRect.width > viewportWidth - 20) {
        x = viewportWidth - dialogRect.width - 20
      }

      if (x < 20) {
        x = 20
      }

      if (y + dialogRect.height > viewportHeight - 20) {
        y = rect.top - dialogRect.height - 8
      }

      dialogRef.current.style.left = `${x}px`
      dialogRef.current.style.top = `${y}px`
    }
  }, [targetElement, isVisible])

  const handleConfirm = () => {
    setIsVisible(false)
    setTimeout(() => {
      onConfirm()
    }, 200)
  }

  const handleCancel = () => {
    setIsVisible(false)
    setTimeout(() => {
      onCancel()
    }, 200)
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCancel()
    }
  }

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel()
      } else if (e.key === 'Enter') {
        handleConfirm()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  })

  return (
    <div
      className="confirm-overlay"
      style={{
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none'
      }}
      onClick={handleOverlayClick}
    >
      <div
        ref={dialogRef}
        className="confirm-popover"
        style={{
          position: 'fixed',
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'scale(1)' : 'scale(0.8)'
        }}
      >
        <div className="confirm-buttons">
          <button className="btn-cancel" onClick={handleCancel} title={cancelLabel}>
            <span className="btn-icon">✕</span>
          </button>
          <button className={`btn-confirm ${variant}`} onClick={handleConfirm} title={confirmLabel}>
            <span className="btn-icon">✓</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// Hook for using confirm dialog
export const useConfirm = () => {
  const [dialogProps, setDialogProps] = useState<ConfirmDialogProps | null>(null)
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'BUTTON' || target.closest('button')) {
        setTargetElement(target.closest('button') || target)
      }
    }
    window.addEventListener('click', handleClick, true)
    return () => window.removeEventListener('click', handleClick, true)
  }, [])

  const confirm = (
    message: string,
    options: {
      confirmLabel?: string
      cancelLabel?: string
      variant?: 'primary' | 'danger'
    } = {}
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialogProps({
        message,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel,
        variant: options.variant,
        targetElement: targetElement || undefined,
        onConfirm: () => {
          setTimeout(() => {
            setDialogProps(null)
            resolve(true)
          }, 50)
        },
        onCancel: () => {
          setTimeout(() => {
            setDialogProps(null)
            resolve(false)
          }, 50)
        }
      })
    })
  }

  const dialog = dialogProps ? <ConfirmDialog {...dialogProps} /> : null

  return { confirm, dialog }
}