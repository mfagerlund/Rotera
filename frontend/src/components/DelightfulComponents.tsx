// Delightful UI components for enhanced user experience

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBullseye, faCheck, faDraftingCompass, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'

// Achievement Toast Component
interface AchievementToastProps {
  title: string
  description: string
  icon: string
  duration?: number
  onClose: () => void
}

export const AchievementToast: React.FC<AchievementToastProps> = ({
  title,
  description,
  icon,
  duration = 4000,
  onClose
}) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose])

  return (
    <div className="achievement-toast">
      <div className="achievement-content">
        <div className="achievement-icon">{icon}</div>
        <div className="achievement-text">
          <div className="achievement-title">{title}</div>
          <div className="achievement-desc">{description}</div>
        </div>
      </div>
    </div>
  )
}

// Confetti Burst Component
interface ConfettiBurstProps {
  trigger: boolean
  onComplete: () => void
}

export const ConfettiBurst: React.FC<ConfettiBurstProps> = ({ trigger, onComplete }) => {
  const [pieces, setPieces] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([])

  useEffect(() => {
    if (trigger) {
      const newPieces = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        x: Math.random() * window.innerWidth,
        y: -10,
        delay: Math.random() * 1000
      }))
      setPieces(newPieces)

      const timer = setTimeout(() => {
        setPieces([])
        onComplete()
      }, 3000)

      return () => clearTimeout(timer)
    }
  }, [trigger, onComplete])

  if (pieces.length === 0) return null

  return (
    <div className="success-celebration">
      {pieces.map(piece => (
        <div
          key={piece.id}
          className="confetti-burst"
          style={{
            left: piece.x,
            top: piece.y,
            animationDelay: `${piece.delay}ms`
          }}
        />
      ))}
    </div>
  )
}

// Enhanced Loading Component
interface DelightfulLoadingProps {
  message?: string
  tips?: string[]
  showTips?: boolean
}

export const DelightfulLoading: React.FC<DelightfulLoadingProps> = ({
  message = "Setting up your photogrammetry workspace...",
  tips = [
    "💡 Pro tip: Use well-lit photos for better accuracy",
    "<FontAwesomeIcon icon={faDraftingCompass} /> Include calibration objects for scale reference",
    "<FontAwesomeIcon icon={faBullseye} /> Overlap your photos by at least 60%",
    "<FontAwesomeIcon icon={faMagnifyingGlass} /> Capture details from multiple angles"
  ],
  showTips = true
}) => {
  const [currentTipIndex, setCurrentTipIndex] = useState(0)

  useEffect(() => {
    if (showTips && tips.length > 0) {
      const interval = setInterval(() => {
        setCurrentTipIndex(prev => (prev + 1) % tips.length)
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [showTips, tips])

  return (
    <div className="loading-state">
      <div className="loading-spinner" />
      <div className="loading-message">{message}</div>
      {showTips && tips.length > 0 && (
        <div className="loading-tips">{tips[currentTipIndex]}</div>
      )}
    </div>
  )
}

// Progress Celebration Component
interface ProgressCelebrationProps {
  milestone: string
  description: string
  icon: string
  show: boolean
  onClose: () => void
}

export const ProgressCelebration: React.FC<ProgressCelebrationProps> = ({
  milestone,
  description,
  icon,
  show,
  onClose
}) => {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onClose, 3000)
      return () => clearTimeout(timer)
    }
  }, [show, onClose])

  if (!show) return null

  return (
    <div className="progress-celebration">
      <div className="progress-icon">{icon}</div>
      <div className="progress-title">{milestone}</div>
      <div className="progress-description">{description}</div>
    </div>
  )
}

// Enhanced Button with Ripple Effect
interface RippleButtonProps {
  children: React.ReactNode
  onClick: () => void
  className?: string
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'tool'
}

export const RippleButton: React.FC<RippleButtonProps> = ({
  children,
  onClick,
  className = '',
  disabled = false,
  variant = 'primary'
}) => {
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([])

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const newRipple = {
      id: Date.now(),
      x,
      y
    }

    setRipples(prev => [...prev, newRipple])

    setTimeout(() => {
      setRipples(prev => prev.filter(ripple => ripple.id !== newRipple.id))
    }, 600)

    onClick()
  }, [onClick, disabled])

  const baseClassName = `btn-micro-feedback btn-${variant}`

  return (
    <button
      className={`${baseClassName} ${className}`}
      onClick={handleClick}
      disabled={disabled}
    >
      {children}
      {ripples.map(ripple => (
        <span
          key={ripple.id}
          className="ripple-effect"
          style={{
            position: 'absolute',
            left: ripple.x,
            top: ripple.y,
            width: '20px',
            height: '20px',
            background: 'rgba(255, 255, 255, 0.6)',
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)',
            animation: 'ripple 0.6s ease-out',
            pointerEvents: 'none'
          }}
        />
      ))}
    </button>
  )
}

// Floating Action Button with Success State
interface FloatingActionButtonProps {
  icon: string
  onClick: () => void
  successIcon?: string
  tooltip?: string
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  icon,
  onClick,
  successIcon = '<FontAwesomeIcon icon={faCheck} />',
  tooltip
}) => {
  const [showSuccess, setShowSuccess] = useState(false)

  const handleClick = useCallback(() => {
    onClick()
    setShowSuccess(true)
    setTimeout(() => setShowSuccess(false), 1500)
  }, [onClick])

  return (
    <button
      className={`fab-feedback ${showSuccess ? 'success' : ''}`}
      onClick={handleClick}
      title={tooltip}
    >
      {showSuccess ? successIcon : icon}
    </button>
  )
}

// Enhanced Empty State Component
interface DelightfulEmptyStateProps {
  icon: string
  title: string
  description: string
  actionText?: string
  onAction?: () => void
  tips?: string[]
}

export const DelightfulEmptyState: React.FC<DelightfulEmptyStateProps> = ({
  icon,
  title,
  description,
  actionText,
  onAction,
  tips = []
}) => {
  return (
    <div className="empty-images-state">
      <div className="empty-icon">{icon}</div>
      <div className="empty-text">{title}</div>
      <div className="empty-hint">{description}</div>
      {actionText && onAction && (
        <div className="empty-cta">
          <RippleButton onClick={onAction} variant="primary">
            {actionText}
          </RippleButton>
        </div>
      )}
      {tips.length > 0 && (
        <div className="empty-tips" style={{ marginTop: '24px', fontSize: '12px', opacity: 0.7 }}>
          {tips.map((tip, index) => (
            <div key={index} style={{ margin: '4px 0' }}>{tip}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// Delightful Tooltip Component
interface DelightfulTooltipProps {
  children: React.ReactNode
  content: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export const DelightfulTooltip: React.FC<DelightfulTooltipProps> = ({
  children,
  content,
  position = 'top'
}) => {
  const [show, setShow] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => {
      setShow(true)
    }, 300) // 300ms delay
  }

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setShow(false)
  }

  return (
    <div
      className="tooltip-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {show && (
        <div className={`tooltip-delightful tooltip-${position}`}>
          {content}
        </div>
      )}
    </div>
  )
}

// Satisfaction Meter Component
interface SatisfactionMeterProps {
  level: number // 0-5
  onChange?: (level: number) => void
  readonly?: boolean
}

export const SatisfactionMeter: React.FC<SatisfactionMeterProps> = ({
  level,
  onChange,
  readonly = false
}) => {
  return (
    <div className="satisfaction-meter">
      {Array.from({ length: 5 }, (_, i) => (
        <button
          key={i}
          className={`satisfaction-dot ${i < level ? 'active' : ''} ${i === 4 && level === 5 ? 'excellent' : ''}`}
          onClick={() => !readonly && onChange?.(i + 1)}
          disabled={readonly}
        />
      ))}
    </div>
  )
}

// Optimistic Feedback Wrapper
interface OptimisticFeedbackProps {
  children: React.ReactNode
  trigger: boolean
}

export const OptimisticFeedback: React.FC<OptimisticFeedbackProps> = ({
  children,
  trigger
}) => {
  return (
    <div className={`optimistic-feedback ${trigger ? 'active' : ''}`}>
      {children}
    </div>
  )
}

// Error State Component
interface DelightfulErrorStateProps {
  icon: string
  title: string
  message: string
  primaryAction?: {
    text: string
    onClick: () => void
  }
  secondaryAction?: {
    text: string
    onClick: () => void
  }
}

export const DelightfulErrorState: React.FC<DelightfulErrorStateProps> = ({
  icon,
  title,
  message,
  primaryAction,
  secondaryAction
}) => {
  return (
    <div className="error-state">
      <div className="error-icon">{icon}</div>
      <div className="error-title">{title}</div>
      <div className="error-message">{message}</div>
      {(primaryAction || secondaryAction) && (
        <div className="error-actions">
          {primaryAction && (
            <RippleButton onClick={primaryAction.onClick} variant="primary">
              {primaryAction.text}
            </RippleButton>
          )}
          {secondaryAction && (
            <RippleButton onClick={secondaryAction.onClick} variant="secondary">
              {secondaryAction.text}
            </RippleButton>
          )}
        </div>
      )}
    </div>
  )
}

// Custom Hook for Celebration Management
export const useCelebration = () => {
  const [celebrations, setCelebrations] = useState<Array<{
    id: number
    type: 'achievement' | 'progress' | 'confetti'
    data: any
  }>>([])

  const triggerAchievement = useCallback((title: string, description: string, icon: string) => {
    const id = Date.now()
    setCelebrations(prev => [...prev, {
      id,
      type: 'achievement',
      data: { title, description, icon }
    }])
  }, [])

  const triggerProgress = useCallback((milestone: string, description: string, icon: string) => {
    const id = Date.now()
    setCelebrations(prev => [...prev, {
      id,
      type: 'progress',
      data: { milestone, description, icon }
    }])
  }, [])

  const triggerConfetti = useCallback(() => {
    const id = Date.now()
    setCelebrations(prev => [...prev, {
      id,
      type: 'confetti',
      data: {}
    }])
  }, [])

  const removeCelebration = useCallback((id: number) => {
    setCelebrations(prev => prev.filter(c => c.id !== id))
  }, [])

  return {
    celebrations,
    triggerAchievement,
    triggerProgress,
    triggerConfetti,
    removeCelebration
  }
}