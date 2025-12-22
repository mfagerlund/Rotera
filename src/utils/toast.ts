/**
 * Simple toast notification utility
 */

let toastContainer: HTMLDivElement | null = null

function ensureContainer(): HTMLDivElement {
  if (!toastContainer) {
    toastContainer = document.createElement('div')
    toastContainer.id = 'toast-container'
    toastContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    `
    document.body.appendChild(toastContainer)
  }
  return toastContainer
}

export function showToast(message: string, duration: number = 4000): void {
  const container = ensureContainer()

  const toast = document.createElement('div')
  toast.style.cssText = `
    background: #323232;
    color: #fff;
    padding: 12px 20px;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    max-width: 400px;
    pointer-events: auto;
    opacity: 0;
    transform: translateX(100%);
    transition: opacity 0.3s, transform 0.3s;
  `
  toast.textContent = message

  container.appendChild(toast)

  // Trigger animation
  requestAnimationFrame(() => {
    toast.style.opacity = '1'
    toast.style.transform = 'translateX(0)'
  })

  // Remove after duration
  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateX(100%)'
    setTimeout(() => {
      toast.remove()
    }, 300)
  }, duration)
}
