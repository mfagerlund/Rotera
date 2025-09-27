// Core project data types for Fusion 360-inspired UI

export interface WorldPoint {
  id: string           // UUID for backend
  name: string         // Display name: "WP1", "WP2", etc.
  xyz?: [number, number, number]  // 3D coordinates (optional)
  imagePoints: ImagePoint[]       // Associated image observations
  isVisible: boolean   // Show/hide in UI
  color?: string       // Visual distinction
}

export interface ImagePoint {
  imageId: string
  u: number           // Pixel x coordinate
  v: number           // Pixel y coordinate
  wpId: string        // Associated world point
}

export interface ProjectImage {
  id: string
  name: string
  blob: string          // Base64 encoded image data
  width: number
  height: number
  cameraId?: string
}

export interface Camera {
  id: string
  name: string
  intrinsics?: {
    fx: number
    fy: number
    cx: number
    cy: number
    k1?: number
    k2?: number
    k3?: number
    p1?: number
    p2?: number
  }
  extrinsics?: {
    rotation: [number, number, number]     // Rodrigues rotation vector
    translation: [number, number, number] // Translation vector
  }
}

export interface Constraint {
  id: string
  type: string
  enabled: boolean
  [key: string]: any  // Constraint-specific parameters
}

export interface ProjectSettings {
  showPointNames: boolean
  autoSave: boolean
  theme: 'dark' | 'light'
}

export interface Project {
  id: string
  name: string
  worldPoints: Record<string, WorldPoint>
  images: Record<string, ProjectImage>
  cameras: Record<string, Camera>
  constraints: Constraint[]
  nextWpNumber: number    // For auto-naming WP1, WP2...
  settings: ProjectSettings
  createdAt: string
  updatedAt: string
}

// Selection and interaction types
export interface Line {
  pointA: string
  pointB: string
}

export interface SelectionState {
  selectedPoints: string[]
  selectedLines: Line[]
  selectionMode: 'points' | 'lines' | 'auto'
}

// Constraint creation types
export interface ConstraintCreationState {
  type: string | null
  selectedPoints: string[]
  selectedLines: Line[]
  parameters: Record<string, any>
  isActive: boolean
}

// Available constraint definition
export interface AvailableConstraint {
  type: string
  icon: string
  tooltip: string
  enabled: boolean
}