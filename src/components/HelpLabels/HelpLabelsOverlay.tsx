import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { observer } from 'mobx-react-lite'
import { helpLabelsStore } from '../../store/help-labels-store'

interface TargetRect {
  left: number
  right: number
  top: number
  bottom: number
}

interface Label {
  id: string
  text: string
  targetX: number
  targetY: number
  targetRect: TargetRect
  x: number
  y: number
  width: number
  height: number
  // Animation: start position
  startX: number
  startY: number
  // Animation progress (0-1)
  progress: number
}

function scanForTitleElements(): { element: HTMLElement; title: string; rect: DOMRect }[] {
  const results: { element: HTMLElement; title: string; rect: DOMRect }[] = []
  const elements = document.querySelectorAll('[title]')

  for (const el of elements) {
    const htmlEl = el as HTMLElement
    const title = htmlEl.getAttribute('title')

    if (!title || title.trim() === '') continue

    // Skip hidden elements
    const style = window.getComputedStyle(htmlEl)
    if (style.display === 'none' || style.visibility === 'hidden') continue

    // Skip elements with zero size or outside viewport
    const rect = htmlEl.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) continue
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue
    if (rect.right < 0 || rect.left > window.innerWidth) continue

    // Skip elements inside help overlay itself
    if (htmlEl.closest('.help-labels-overlay')) continue

    // Skip data visualization elements (not UI controls)
    if (htmlEl.closest('.wp-locations-overlay')) continue
    if (htmlEl.closest('.lines-overlay')) continue
    if (htmlEl.closest('.vanishing-lines-overlay')) continue

    results.push({ element: htmlEl, title, rect })
  }

  return results
}

function createInitialLabels(elements: { element: HTMLElement; title: string; rect: DOMRect }[]): Label[] {
  return elements.map((el, index) => {
    const centerX = el.rect.left + el.rect.width / 2
    const centerY = el.rect.top + el.rect.height / 2

    // Estimate label size
    const estimatedWidth = Math.min(220, el.title.length * 7 + 24)
    const estimatedHeight = 28

    // Start position: right at the target (will animate outward)
    const startX = centerX - estimatedWidth / 2
    const startY = centerY - estimatedHeight / 2

    // Initial position for layout: offset slightly from target
    const angle = (index / elements.length) * Math.PI * 2
    const offsetDist = 40
    const initialX = centerX + Math.cos(angle) * offsetDist - estimatedWidth / 2
    const initialY = centerY + Math.sin(angle) * offsetDist - estimatedHeight / 2

    return {
      id: `label-${index}`,
      text: el.title,
      targetX: centerX,
      targetY: centerY,
      targetRect: {
        left: el.rect.left,
        right: el.rect.right,
        top: el.rect.top,
        bottom: el.rect.bottom,
      },
      x: initialX,
      y: initialY,
      width: estimatedWidth,
      height: estimatedHeight,
      startX,
      startY,
      progress: 0,
    }
  })
}

function labelsOverlap(a: Label, b: Label, padding: number): boolean {
  return !(
    a.x + a.width + padding < b.x ||
    b.x + b.width + padding < a.x ||
    a.y + a.height + padding < b.y ||
    b.y + b.height + padding < a.y
  )
}

function labelOverlapsRect(label: Label, rect: TargetRect, padding: number): boolean {
  return !(
    label.x + label.width + padding < rect.left ||
    rect.right + padding < label.x ||
    label.y + label.height + padding < rect.top ||
    rect.bottom + padding < label.y
  )
}

function resolveOverlaps(labels: Label[], allTargetRects: TargetRect[]): Label[] {
  const result = labels.map((l) => ({ ...l }))
  const labelPadding = 6
  const targetPadding = 4
  const iterations = 80

  for (let iter = 0; iter < iterations; iter++) {
    let anyOverlap = false

    for (let i = 0; i < result.length; i++) {
      const label = result[i]
      const labelCenterX = label.x + label.width / 2
      const labelCenterY = label.y + label.height / 2

      // Push away from other labels
      for (let j = 0; j < result.length; j++) {
        if (i === j) continue
        const other = result[j]

        if (labelsOverlap(label, other, labelPadding)) {
          anyOverlap = true
          const otherCenterX = other.x + other.width / 2
          const otherCenterY = other.y + other.height / 2

          let dx = labelCenterX - otherCenterX
          let dy = labelCenterY - otherCenterY
          const dist = Math.sqrt(dx * dx + dy * dy) || 1

          // Normalize and push apart
          dx = (dx / dist) * 2
          dy = (dy / dist) * 2

          label.x += dx
          label.y += dy
          other.x -= dx
          other.y -= dy
        }
      }

      // Push away from ALL target elements (buttons)
      for (const rect of allTargetRects) {
        if (labelOverlapsRect(label, rect, targetPadding)) {
          anyOverlap = true
          const rectCenterX = (rect.left + rect.right) / 2
          const rectCenterY = (rect.top + rect.bottom) / 2

          let dx = labelCenterX - rectCenterX
          let dy = labelCenterY - rectCenterY
          const dist = Math.sqrt(dx * dx + dy * dy) || 1

          dx = (dx / dist) * 3
          dy = (dy / dist) * 3

          label.x += dx
          label.y += dy
        }
      }

      // Constrain to viewport
      label.x = Math.max(8, Math.min(label.x, window.innerWidth - label.width - 8))
      label.y = Math.max(8, Math.min(label.y, window.innerHeight - label.height - 8))
    }

    if (!anyOverlap) break
  }

  return result
}

function findClosestLabelEdge(label: Label, targetX: number, targetY: number): { x: number; y: number } {
  const { x, y, width, height } = label

  const edges = [
    { x: x + width / 2, y: y }, // Top center
    { x: x + width / 2, y: y + height }, // Bottom center
    { x: x, y: y + height / 2 }, // Left center
    { x: x + width, y: y + height / 2 }, // Right center
  ]

  let closest = edges[0]
  let minDist = Infinity

  for (const edge of edges) {
    const dist = Math.sqrt((edge.x - targetX) ** 2 + (edge.y - targetY) ** 2)
    if (dist < minDist) {
      minDist = dist
      closest = edge
    }
  }

  return closest
}

// Easing function for smooth animation
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

interface ConnectorProps {
  label: Label
  currentX: number
  currentY: number
}

function CurvedConnector({ label, currentX, currentY }: ConnectorProps) {
  const { targetX, targetY, width, height } = label

  // Use current animated position for edge calculation
  const currentLabel = { ...label, x: currentX, y: currentY }
  const start = findClosestLabelEdge(currentLabel, targetX, targetY)

  // Control point for curve
  const midX = (start.x + targetX) / 2
  const midY = (start.y + targetY) / 2

  const dx = targetX - start.x
  const dy = targetY - start.y
  const len = Math.sqrt(dx * dx + dy * dy)

  // Slight curvature perpendicular to the line
  const perpX = len > 0 ? (-dy / len) * 12 : 0
  const perpY = len > 0 ? (dx / len) * 12 : 0

  const ctrlX = midX + perpX
  const ctrlY = midY + perpY

  const path = `M ${start.x} ${start.y} Q ${ctrlX} ${ctrlY} ${targetX} ${targetY}`

  return (
    <g className="help-label-connector">
      <path d={path} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth={2} strokeLinecap="round" />
      <path d={path} fill="none" stroke="rgba(100,160,255,0.45)" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={targetX} cy={targetY} r={3} fill="rgba(100,160,255,0.6)" />
    </g>
  )
}

export const HelpLabelsOverlay: React.FC = observer(() => {
  const isEnabled = helpLabelsStore.isEnabled
  const [labels, setLabels] = useState<Label[]>([])
  const [animatedPositions, setAnimatedPositions] = useState<Map<string, { x: number; y: number }>>(new Map())
  const labelRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const animationRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)

  // F1 keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault()
        helpLabelsStore.toggle()
      } else if (e.key === 'Escape' && helpLabelsStore.isEnabled) {
        helpLabelsStore.disable()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Scan DOM and layout labels when enabled
  useEffect(() => {
    if (!isEnabled) {
      setLabels([])
      setAnimatedPositions(new Map())
      return
    }

    const elements = scanForTitleElements()
    const allTargetRects = elements.map((el) => ({
      left: el.rect.left,
      right: el.rect.right,
      top: el.rect.top,
      bottom: el.rect.bottom,
    }))
    const initialLabels = createInitialLabels(elements)
    const resolvedLabels = resolveOverlaps(initialLabels, allTargetRects)
    setLabels(resolvedLabels)

    // Initialize animated positions at start positions
    const initialPositions = new Map<string, { x: number; y: number }>()
    for (const label of resolvedLabels) {
      initialPositions.set(label.id, { x: label.startX, y: label.startY })
    }
    setAnimatedPositions(initialPositions)
    startTimeRef.current = performance.now()
  }, [isEnabled])

  // Animate labels to their final positions
  useEffect(() => {
    if (labels.length === 0) return

    const duration = 400 // ms
    const staggerDelay = 20 // ms between each label starting

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTimeRef.current

      setAnimatedPositions((prev) => {
        const next = new Map(prev)
        let allDone = true

        labels.forEach((label, index) => {
          const labelStartTime = index * staggerDelay
          const labelElapsed = Math.max(0, elapsed - labelStartTime)
          const progress = Math.min(1, labelElapsed / duration)
          const easedProgress = easeOutCubic(progress)

          if (progress < 1) allDone = false

          const currentX = label.startX + (label.x - label.startX) * easedProgress
          const currentY = label.startY + (label.y - label.startY) * easedProgress

          next.set(label.id, { x: currentX, y: currentY })
        })

        return next
      })

      const totalDuration = duration + labels.length * staggerDelay
      if (elapsed < totalDuration) {
        animationRef.current = requestAnimationFrame(animate)
      }
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [labels])

  // Measure actual label sizes after render and re-resolve
  useEffect(() => {
    if (labels.length === 0) return

    const frameId = requestAnimationFrame(() => {
      let needsUpdate = false
      const measured = labels.map((label) => {
        const el = labelRefs.current.get(label.id)
        if (el) {
          const rect = el.getBoundingClientRect()
          if (Math.abs(rect.width - label.width) > 2 || Math.abs(rect.height - label.height) > 2) {
            needsUpdate = true
            return { ...label, width: rect.width, height: rect.height }
          }
        }
        return label
      })

      if (needsUpdate) {
        const allTargetRects = measured.map((l) => l.targetRect)
        const resolved = resolveOverlaps(measured, allTargetRects)
        setLabels(resolved)
        startTimeRef.current = performance.now()
      }
    })

    return () => cancelAnimationFrame(frameId)
  }, [labels.length])

  // Handle resize/scroll - rescan positions
  useEffect(() => {
    if (!isEnabled) return

    let timeoutId: ReturnType<typeof setTimeout>
    const handleReposition = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        const elements = scanForTitleElements()
        const allTargetRects = elements.map((el) => ({
          left: el.rect.left,
          right: el.rect.right,
          top: el.rect.top,
          bottom: el.rect.bottom,
        }))
        const initialLabels = createInitialLabels(elements)
        const resolvedLabels = resolveOverlaps(initialLabels, allTargetRects)
        setLabels(resolvedLabels)

        // Reset animation
        const initialPositions = new Map<string, { x: number; y: number }>()
        for (const label of resolvedLabels) {
          initialPositions.set(label.id, { x: label.startX, y: label.startY })
        }
        setAnimatedPositions(initialPositions)
        startTimeRef.current = performance.now()
      }, 150)
    }

    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [isEnabled])

  const setLabelRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      labelRefs.current.set(id, el)
    } else {
      labelRefs.current.delete(id)
    }
  }, [])

  if (!isEnabled || labels.length === 0) return null

  return createPortal(
    <div className="help-labels-overlay">
      <svg className="help-labels-connectors">
        {labels.map((label) => {
          const pos = animatedPositions.get(label.id) || { x: label.startX, y: label.startY }
          return <CurvedConnector key={label.id} label={label} currentX={pos.x} currentY={pos.y} />
        })}
      </svg>
      {labels.map((label, index) => {
        const pos = animatedPositions.get(label.id) || { x: label.startX, y: label.startY }
        return (
          <div
            key={label.id}
            ref={(el) => setLabelRef(label.id, el)}
            className="help-label"
            style={{
              left: pos.x,
              top: pos.y,
              opacity: 1,
            }}
          >
            {label.text}
          </div>
        )
      })}
    </div>,
    document.body
  )
})
