/*
 * Component name overlay utility for development debugging.
 * Provides a global toggle that reveals the React component responsible for each rendered region.
 */

const overlayContainerId = 'pictorigo-component-overlay-root'
const overlayStyleId = 'pictorigo-component-overlay-style'
const changeEventName = 'pictorigo:component-overlay-change'

let overlayRoot: HTMLDivElement | null = null
let overlayStyleElement: HTMLStyleElement | null = null
let mutationObserver: MutationObserver | null = null
let enabled = false
let refreshScheduled = false

const MIN_LABEL_SIZE = 18
const LABEL_MARGIN = 6
const VIEWPORT_PADDING = 4
const MAX_POSITION_ITERATIONS = 12
const COPY_FEEDBACK_DURATION = 1200

interface FiberNode {
  tag?: number
  type?: any
  elementType?: any
  return?: FiberNode | null
  child?: FiberNode | null
  sibling?: FiberNode | null
  stateNode?: any
}

interface OverlayApi {
  isEnabled: () => boolean
  setEnabled: (value: boolean) => void
  toggle: () => void
  refresh: () => void
}

interface PlacedLabel {
  top: number
  left: number
  width: number
  height: number
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min
  }
  return Math.min(Math.max(value, min), max)
}

function rectanglesOverlap(a: PlacedLabel, b: PlacedLabel): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  )
}

function ensureOverlayRoot(): HTMLDivElement | null {
  if (typeof document === 'undefined') {
    return null
  }

  if (!overlayRoot) {
    overlayRoot = document.createElement('div')
    overlayRoot.id = overlayContainerId
    overlayRoot.style.position = 'fixed'
    overlayRoot.style.top = '0'
    overlayRoot.style.left = '0'
    overlayRoot.style.width = '100%'
    overlayRoot.style.height = '100%'
    overlayRoot.style.pointerEvents = 'none'
    overlayRoot.style.zIndex = '9999'
    overlayRoot.style.fontFamily = "'JetBrains Mono', 'Fira Code', 'SFMono-Regular', Consolas, monospace"
    overlayRoot.style.fontSize = '11px'
    overlayRoot.style.lineHeight = '1.3'
    overlayRoot.style.letterSpacing = '0.4px'
    overlayRoot.style.mixBlendMode = 'difference'
    document.body.appendChild(overlayRoot)
  }

  if (!overlayStyleElement) {
    overlayStyleElement = document.createElement('style')
    overlayStyleElement.id = overlayStyleId
    overlayStyleElement.textContent = `#${overlayContainerId} .component-overlay-label{position:absolute;padding:2px 8px;border-radius:6px;background:rgba(12,58,105,0.88);color:#f5f8ff;pointer-events:auto;box-shadow:0 6px 16px rgba(0,0,0,0.35);white-space:nowrap;border:1px solid rgba(255,255,255,0.18);cursor:copy;user-select:none;transition:transform 0.18s ease,background 0.18s ease,color 0.18s ease,opacity 0.18s ease;}#${overlayContainerId} .component-overlay-label::before{content:'';position:absolute;left:12px;bottom:-5px;width:8px;height:8px;background:inherit;border-bottom:inherit;border-right:inherit;transform:rotate(45deg);}#${overlayContainerId} .component-overlay-label.is-small{opacity:0.75;font-size:10px;}#${overlayContainerId} .component-overlay-label.copied{background:rgba(48,199,129,0.92);color:#05140a;border-color:rgba(48,199,129,0.92);}#${overlayContainerId} .component-overlay-label.copied::before{background:rgba(48,199,129,0.92);border-bottom-color:rgba(48,199,129,0.92);border-right-color:rgba(48,199,129,0.92);}`
    document.head.appendChild(overlayStyleElement)
  }

  return overlayRoot
}

function destroyOverlayRoot() {
  if (overlayRoot?.parentNode) {
    overlayRoot.parentNode.removeChild(overlayRoot)
  }
  if (overlayStyleElement?.parentNode) {
    overlayStyleElement.parentNode.removeChild(overlayStyleElement)
  }
  overlayRoot = null
  overlayStyleElement = null
}

function scheduleRefresh() {
  if (!enabled || refreshScheduled) {
    return
  }

  refreshScheduled = true
  requestAnimationFrame(() => {
    refreshScheduled = false
    refreshOverlay()
  })
}

function refreshOverlay() {
  if (!enabled) {
    return
  }

  const rootElement = ensureOverlayRoot()
  if (!rootElement) {
    return
  }

  const appRoot = document.getElementById('root')
  if (!appRoot) {
    rootElement.innerHTML = ''
    return
  }

  rootElement.innerHTML = ''
  const renderedFibers = new WeakSet<FiberNode>()
  const placedLabels: PlacedLabel[] = []

  const walker = document.createTreeWalker(appRoot, NodeFilter.SHOW_ELEMENT)
  while (walker.nextNode()) {
    const element = walker.currentNode as HTMLElement
    if (!element || !element.offsetParent) {
      continue
    }

    const fiber = getFiber(element)
    if (!fiber) {
      continue
    }

    const ownerFiber = findNearestNamedFiber(fiber)
    if (!ownerFiber || renderedFibers.has(ownerFiber)) {
      continue
    }

    const componentName = getFiberDisplayName(ownerFiber)
    if (!componentName) {
      continue
    }

    const rect = element.getBoundingClientRect()
    if (rect.width < MIN_LABEL_SIZE && rect.height < MIN_LABEL_SIZE) {
      continue
    }

    const label = createLabelElement(componentName, rect, element, ownerFiber)
    if (!label) {
      continue
    }

    rootElement.appendChild(label)
    const placement = positionLabel(label, rect, placedLabels)
    placedLabels.push(placement)
    renderedFibers.add(ownerFiber)
  }
}

function createLabelElement(componentName: string, targetRect: DOMRect, element: HTMLElement, fiber: FiberNode): HTMLDivElement | null {
  if (typeof document === 'undefined') {
    return null
  }

  const label = document.createElement('div')
  label.className = 'component-overlay-label'
  label.dataset.componentName = componentName
  label.title = 'Click to copy name'
  label.style.top = '0px'
  label.style.left = '0px'
  label.style.visibility = 'hidden'
  label.style.display = 'flex'
  label.style.alignItems = 'center'
  label.style.gap = '6px'

  const nameSpan = document.createElement('span')
  nameSpan.textContent = componentName
  nameSpan.style.flex = '1'
  label.appendChild(nameSpan)

  const infoIcon = document.createElement('span')
  infoIcon.textContent = 'ⓘ'
  infoIcon.className = 'component-info-icon'
  infoIcon.title = 'Click for full info'
  infoIcon.style.opacity = '0.7'
  infoIcon.style.cursor = 'pointer'
  infoIcon.style.fontSize = '12px'
  label.appendChild(infoIcon)

  if (targetRect.width < 64 || targetRect.height < 32) {
    label.classList.add('is-small')
  }

  label.tabIndex = 0
  label.setAttribute('role', 'button')

  // Default click: copy name only
  nameSpan.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    void copyComponentName(label, componentName)
  })

  // Info icon click: copy full info
  infoIcon.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    void copyComponentInfo(label, element, fiber)
  })

  label.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      void copyComponentName(label, componentName)
    }
  })

  return label
}

async function copyComponentName(label: HTMLDivElement, componentName: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(componentName)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = componentName
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      textarea.style.pointerEvents = 'none'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }

    label.classList.add('copied')
    setTimeout(() => {
      label.classList.remove('copied')
    }, COPY_FEEDBACK_DURATION)
  } catch (error) {
    console.warn('Failed to copy component name', error)
  }
}

function buildComponentPath(fiber: FiberNode | null): string[] {
  const path: string[] = []
  let current: FiberNode | null = fiber

  while (current) {
    const name = getFiberDisplayName(current)
    if (name) {
      path.unshift(name)
    }
    current = current.return ?? null
  }

  return path
}

function buildDOMPath(element: HTMLElement): string {
  const parts: string[] = []
  let current: HTMLElement | null = element

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase()

    if (current.id) {
      selector += `#${current.id}`
    } else if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).slice(0, 3)
      if (classes.length > 0 && classes[0]) {
        selector += '.' + classes.join('.')
      }
    }

    parts.unshift(selector)
    current = current.parentElement
  }

  return parts.join(' > ')
}

async function copyComponentInfo(label: HTMLDivElement, element: HTMLElement, fiber: FiberNode) {
  const componentName = label.dataset.componentName || label.textContent || ''
  if (!componentName) {
    return
  }

  const componentPath = buildComponentPath(fiber)
  const domPath = buildDOMPath(element)

  const info = [
    `Component: ${componentName}`,
    ``,
    `Component Path:`,
    componentPath.join(' > '),
    ``,
    `DOM Path:`,
    domPath
  ].join('\n')

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(info)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = info
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      textarea.style.pointerEvents = 'none'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }

    label.classList.add('copied')
    setTimeout(() => {
      label.classList.remove('copied')
    }, COPY_FEEDBACK_DURATION)
  } catch (error) {
    console.warn('Failed to copy component info', error)
  }
}

function positionLabel(label: HTMLDivElement, targetRect: DOMRect, placedLabels: PlacedLabel[]): PlacedLabel {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : targetRect.right
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : targetRect.bottom

  const labelRect = label.getBoundingClientRect()
  const width = labelRect.width
  const height = labelRect.height

  const preferredTopAbove = targetRect.top - height - LABEL_MARGIN
  const preferredTopBelow = targetRect.bottom + LABEL_MARGIN

  // Determine if label can fit above
  const canFitAbove = preferredTopAbove >= VIEWPORT_PADDING
  const canFitBelow = preferredTopBelow + height <= viewportHeight - VIEWPORT_PADDING

  let top: number
  if (!canFitAbove && canFitBelow) {
    // Can't fit above, must go below
    top = preferredTopBelow
  } else if (canFitAbove && !canFitBelow) {
    // Can't fit below, must go above
    top = preferredTopAbove
  } else if (canFitAbove && canFitBelow) {
    // Can fit both places, prefer above unless element is at very top
    top = targetRect.top < 100 ? preferredTopBelow : preferredTopAbove
  } else {
    // Can't fit either place comfortably, show inside element bounds at top
    top = targetRect.top + LABEL_MARGIN
  }

  top = clamp(top, VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING - height)

  let left = clamp(targetRect.left, VIEWPORT_PADDING, viewportWidth - VIEWPORT_PADDING - width)

  let iterations = 0
  while (iterations < MAX_POSITION_ITERATIONS) {
    let needsAdjustment = false

    for (const placed of placedLabels) {
      if (rectanglesOverlap({ top, left, width, height }, placed)) {
        needsAdjustment = true

        let newTop = placed.top + placed.height + LABEL_MARGIN
        if (newTop + height > viewportHeight - VIEWPORT_PADDING) {
          // Try above the conflicting label
          newTop = placed.top - height - LABEL_MARGIN
        }

        if (newTop < VIEWPORT_PADDING) {
          // Try shifting horizontally to the right first
          const shiftRight = placed.left + placed.width + LABEL_MARGIN
          if (shiftRight + width <= viewportWidth - VIEWPORT_PADDING) {
            left = shiftRight
            newTop = clamp(preferredTopAbove, VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING - height)
          } else {
            const shiftLeft = placed.left - width - LABEL_MARGIN
            if (shiftLeft >= VIEWPORT_PADDING) {
              left = shiftLeft
              newTop = clamp(preferredTopAbove, VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING - height)
            } else {
              newTop = clamp(preferredTopBelow, VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING - height)
            }
          }
        }

        top = clamp(newTop, VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING - height)
        break
      }
    }

    if (!needsAdjustment) {
      break
    }

    iterations += 1
  }

  left = clamp(left, VIEWPORT_PADDING, viewportWidth - VIEWPORT_PADDING - width)
  label.style.top = `${top}px`
  label.style.left = `${left}px`
  label.style.visibility = 'visible'

  return { top, left, width, height }
}

function getFiber(node: HTMLElement): FiberNode | null {
  const keys = Object.keys(node)
  for (const key of keys) {
    if (key.startsWith('__reactFiber$')) {
      return (node as any)[key] as FiberNode
    }
  }
  return null
}

function findNearestNamedFiber(fiber: FiberNode | null | undefined): FiberNode | null {
  let current: FiberNode | null | undefined = fiber
  while (current) {
    if (getFiberDisplayName(current)) {
      return current
    }
    current = current.return
  }
  return null
}

function getFiberDisplayName(fiber: FiberNode | null | undefined): string | null {
  if (!fiber) {
    return null
  }

  const type = fiber.elementType ?? fiber.type
  return resolveComponentName(type)
}

function resolveComponentName(type: any): string | null {
  if (!type) {
    return null
  }

  if (typeof type === 'string') {
    return null
  }

  if (typeof type === 'function') {
    return type.displayName || type.name || null
  }

  if (typeof type === 'object') {
    if (type.displayName) {
      return type.displayName
    }
    if (type.render) {
      return resolveComponentName(type.render)
    }
    if (type.type) {
      return resolveComponentName(type.type)
    }
  }

  return null
}

function setupObservers() {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return
  }

  const appRoot = document.getElementById('root')
  if (!appRoot) {
    return
  }

  if (!mutationObserver) {
    mutationObserver = new MutationObserver(() => scheduleRefresh())
    mutationObserver.observe(appRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: false
    })
  }

  window.addEventListener('resize', scheduleRefresh, true)
  window.addEventListener('scroll', scheduleRefresh, true)
}

function teardownObservers() {
  if (mutationObserver) {
    mutationObserver.disconnect()
  }
  mutationObserver = null

  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', scheduleRefresh, true)
    window.removeEventListener('scroll', scheduleRefresh, true)
  }
}

function broadcastChange() {
  if (typeof window === 'undefined') {
    return
  }
  const event = new CustomEvent(changeEventName, { detail: { enabled } })
  window.dispatchEvent(event)
}

export function setComponentOverlayEnabled(value: boolean) {
  if (value === enabled) {
    return
  }

  enabled = value

  if (enabled) {
    ensureOverlayRoot()
    setupObservers()
    scheduleRefresh()
  } else {
    teardownObservers()
    destroyOverlayRoot()
  }

  broadcastChange()
}

export function isComponentOverlayEnabled(): boolean {
  return enabled
}

export function toggleComponentOverlay() {
  setComponentOverlayEnabled(!enabled)
}

export function refreshComponentOverlay() {
  if (!enabled) {
    return
  }
  refreshOverlay()
}

const api: OverlayApi = {
  isEnabled: () => isComponentOverlayEnabled(),
  setEnabled: (value: boolean) => setComponentOverlayEnabled(value),
  toggle: () => toggleComponentOverlay(),
  refresh: () => scheduleRefresh()
}

if (typeof window !== 'undefined') {
  (window as any).pictorigoComponentLabels = api
  ;(window as any).toggleComponentNameOverlay = (value?: boolean) => {
    if (typeof value === 'boolean') {
      setComponentOverlayEnabled(value)
    } else {
      toggleComponentOverlay()
    }
  }
}

export const COMPONENT_OVERLAY_EVENT = changeEventName
