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
        {/* Super 8 Camera body */}
        <rect x="8" y="8" width="18" height="14" rx="2" fill="#4a9eff"/>

        {/* Film reel housing (top) */}
        <circle cx="14" cy="8" r="4" fill="#3a8eef"/>
        <circle cx="14" cy="8" r="2.5" fill="#2a7edf"/>
        <circle cx="14" cy="8" r="1" fill="#1a6ecf"/>

        {/* Lens */}
        <circle cx="20" cy="15" r="4" fill="#3a8eef"/>
        <circle cx="20" cy="15" r="2.8" fill="#e8f4ff"/>
        <circle cx="20" cy="15" r="1.5" fill="#2a7edf"/>

        {/* Lens reflection */}
        <circle cx="18.8" cy="13.8" r="0.8" fill="#fff" opacity="0.8"/>

        {/* Grip/handle */}
        <rect x="8" y="18" width="4" height="6" rx="1" fill="#3a8eef"/>

        {/* Origin dot (bottom left) */}
        <circle cx="4" cy="28" r="3" fill="#ff9500"/>
        <circle cx="4" cy="28" r="1.5" fill="#ffb347"/>
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
