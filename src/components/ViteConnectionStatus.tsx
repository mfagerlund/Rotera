import { useState, useEffect, useRef } from 'react'

/**
 * Monitors Vite dev server connection and shows a warning banner when disconnected.
 * Only renders in development mode.
 * Only shows warning AFTER we've been connected and then lost connection.
 */
export function ViteConnectionStatus() {
  const [isDisconnected, setIsDisconnected] = useState(false)
  const hasBeenConnected = useRef(false)

  useEffect(() => {
    // Only run in development
    if (!import.meta.hot) return

    const handleDisconnect = () => {
      // Only show warning if we were previously connected
      if (hasBeenConnected.current) {
        setIsDisconnected(true)
      }
    }

    const handleConnect = () => {
      hasBeenConnected.current = true
      setIsDisconnected(false)
    }

    // Listen to Vite HMR events
    import.meta.hot.on('vite:ws:disconnect', handleDisconnect)
    import.meta.hot.on('vite:ws:connect', handleConnect)

    // HMR updates mean we're connected
    import.meta.hot.on('vite:beforeUpdate', handleConnect)

    // Mark as connected after a short delay if no disconnect event fires
    // This handles the case where we load with an active connection
    const timer = setTimeout(() => {
      hasBeenConnected.current = true
    }, 2000)

    return () => {
      clearTimeout(timer)
    }
  }, [])

  // Don't render in production or when connected
  if (!import.meta.hot || !isDisconnected) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 99999,
      background: '#dc2626',
      color: 'white',
      padding: '8px 16px',
      textAlign: 'center',
      fontWeight: 'bold',
      fontSize: '14px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      animation: 'pulse 2s infinite'
    }}>
      DEV SERVER DISCONNECTED - You may be viewing stale code! Restart with `npm run dev`
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  )
}
