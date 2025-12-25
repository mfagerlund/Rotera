import React from 'react'

interface AppBrandingProps {
  onClick?: () => void
  showName?: boolean
  size?: 'small' | 'medium' | 'large'
}

export const AppBranding: React.FC<AppBrandingProps> = ({
  onClick,
  showName = true,
  size = 'medium'
}) => {
  const sizeMap = {
    small: { icon: 20, fontSize: 14 },
    medium: { icon: 28, fontSize: 18 },
    large: { icon: 36, fontSize: 24 }
  }

  const { icon: iconSize, fontSize } = sizeMap[size]

  const content = (
    <>
      <svg
        viewBox="0 0 32 32"
        width={iconSize}
        height={iconSize}
        className="app-branding__icon"
      >
        {/* 3D Cube with rotation indicator */}

        {/* Rotation arc */}
        <path d="M5 25 A14 14 0 0 1 5 7" fill="none" stroke="#ff8c00" strokeWidth="1.5" strokeLinecap="round" opacity="0.8"/>
        <polygon points="5,5 3,9 7,9" fill="#ff8c00" opacity="0.8"/>

        {/* Top face (lightest) */}
        <polygon points="16,6 26,12 16,18 6,12" fill="#0696d7"/>

        {/* Left face (medium) */}
        <polygon points="6,12 16,18 16,28 6,22" fill="#0585c5"/>

        {/* Right face (darkest) */}
        <polygon points="26,12 26,22 16,28 16,18" fill="#046aa0"/>

        {/* Edge highlights */}
        <line x1="16" y1="6" x2="16" y2="18" stroke="#08a5e8" strokeWidth="0.5" opacity="0.6"/>
      </svg>
      {showName && (
        <span className="app-branding__name" style={{ fontSize }}>
          Rotera
        </span>
      )}
    </>
  )

  if (onClick) {
    return (
      <button
        className="app-branding app-branding--clickable"
        onClick={onClick}
        title="Return to project browser"
      >
        {content}
      </button>
    )
  }

  return (
    <div className="app-branding">
      {content}
    </div>
  )
}
