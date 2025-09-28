// Visual constraint glyph overlay component - shows constraint icons near points

import React, { useMemo } from 'react'
import { Constraint, WorldPoint, ProjectImage } from '../types/project'
import { getConstraintPointIds } from '../types/utils'

interface ConstraintGlyphsProps {
  image: ProjectImage
  worldPoints: Record<string, WorldPoint>
  constraints: Constraint[]
  scale: number
  offset: { x: number; y: number }
  hoveredConstraintId: string | null
  selectedPointId: string | null
}

export const ConstraintGlyphs: React.FC<ConstraintGlyphsProps> = ({
  image,
  worldPoints,
  constraints,
  scale,
  offset,
  hoveredConstraintId,
  selectedPointId
}) => {
  // Get constraints affecting each point
  const pointConstraints = useMemo(() => {
    const result: Record<string, Constraint[]> = {}

    constraints.forEach(constraint => {
      if (!constraint.enabled) return

      const pointIds = getConstraintPointIds(constraint)
      pointIds.forEach(pointId => {
        if (!result[pointId]) {
          result[pointId] = []
        }
        result[pointId].push(constraint)
      })
    })

    return result
  }, [constraints])

  // Get glyph position for a constraint around a point
  const getGlyphPosition = (pointX: number, pointY: number, index: number, total: number) => {
    const radius = 25 // Distance from point center
    const startAngle = -Math.PI / 2 // Start at top
    const angleStep = (Math.PI * 2) / Math.max(8, total) // Distribute around circle
    const angle = startAngle + angleStep * index

    return {
      x: pointX + Math.cos(angle) * radius,
      y: pointY + Math.sin(angle) * radius
    }
  }

  return (
    <div className="constraint-glyphs-overlay" style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 20
    }}>
      {Object.entries(worldPoints).map(([pointId, wp]) => {
        const imagePoint = wp.imagePoints.find(ip => ip.imageId === image.id)
        if (!imagePoint || !wp.isVisible) return null

        const wpConstraints = pointConstraints[pointId]
        if (!wpConstraints || wpConstraints.length === 0) return null

        const pointX = imagePoint.u * scale + offset.x
        const pointY = imagePoint.v * scale + offset.y

        // Only show glyphs for selected point or when hovering a constraint
        const shouldShow = pointId === selectedPointId ||
          wpConstraints.some(c => c.id === hoveredConstraintId)

        if (!shouldShow) return null

        return (
          <div key={pointId} className="point-constraint-glyphs">
            {wpConstraints.map((constraint, index) => {
              const glyphPos = getGlyphPosition(pointX, pointY, index, wpConstraints.length)
              const isHovered = constraint.id === hoveredConstraintId
              const icon = getConstraintIcon(constraint.type)
              const radius = 25 // Connection line radius

              return (
                <div
                  key={constraint.id}
                  className={`constraint-glyph ${isHovered ? 'hovered' : ''} ${!constraint.enabled ? 'disabled' : ''}`}
                  style={{
                    position: 'absolute',
                    left: `${glyphPos.x}px`,
                    top: `${glyphPos.y}px`,
                    transform: 'translate(-50%, -50%)'
                  }}
                  title={getConstraintTooltip(constraint)}
                >
                  <div className="glyph-background" />
                  <div className="glyph-icon">{icon}</div>
                  {/* Connection line to point */}
                  <svg
                    className="glyph-connection"
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: radius * 2,
                      height: radius * 2,
                      pointerEvents: 'none'
                    }}
                  >
                    <line
                      x1={radius}
                      y1={radius}
                      x2={radius + (pointX - glyphPos.x)}
                      y2={radius + (pointY - glyphPos.y)}
                      stroke="rgba(6, 150, 215, 0.2)"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                  </svg>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// Helper functions
function getConstraintIcon(type: string): string {
  const icons: Record<string, string> = {
    distance: '↔',
    angle: '∠',
    perpendicular: '⊥',
    parallel: '∥',
    collinear: '─',
    rectangle: '▭',
    circle: '○',
    fixed: '📌',
    horizontal: '⟷',
    vertical: '↕'
  }
  return icons[type] || '⚙'
}

function getConstraintTooltip(constraint: Constraint): string {
  switch (constraint.type) {
    case 'distance':
      return `Distance: ${constraint.distance}m`
    case 'angle':
      return `Angle: ${constraint.angle_degrees || constraint.angle}°`
    case 'fixed':
      return `Fixed at (${constraint.x?.toFixed(2)}, ${constraint.y?.toFixed(2)}, ${constraint.z?.toFixed(2)})`
    default:
      return `${constraint.type} constraint`
  }
}

export default ConstraintGlyphs