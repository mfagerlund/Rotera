// Optimization Export DTOs for Python testing
// This file defines the export format for sending project data to the optimization backend

import type { ConstraintDto } from '../entities/constraints/base-constraint'

// DTO types for optimization export (serialized format)
type WorldPointDto = any
type LineDto = any
type ViewpointDto = any

// Lightweight viewpoint DTO without base64 image blob
export interface ViewpointDtoLight {
  url: string
  id: string
  name: string
  filename: string
  imageWidth: number
  imageHeight: number
  focalLength: number
  principalPointX: number
  principalPointY: number
  skewCoefficient: number
  aspectRatio: number
  radialDistortion: [number, number, number]
  tangentialDistortion: [number, number]
  position: [number, number, number]
  rotation: [number, number, number, number]
  imagePoints: Record<string, any>
  calibrationAccuracy: number
  calibrationDate?: string
  calibrationNotes?: string
  isProcessed: boolean
  processingNotes?: string
  metadata?: any
  isVisible: boolean
  opacity: number
  color: string
  group?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}

// Main export structure for optimization
export interface OptimizationExportDto {
  version: string
  exportedAt: string

  // Core entities
  worldPoints: WorldPointDto[]
  lines: LineDto[]
  viewpoints: ViewpointDto[]
  constraints: ConstraintDto[]

  // Project metadata
  metadata: {
    projectName: string
    projectId: string
    totalWorldPoints: number
    totalLines: number
    totalViewpoints: number
    totalConstraints: number
    totalImagePoints: number
  }

  // Coordinate system information
  coordinateSystem?: {
    origin?: string // World point ID marked as origin
    scale?: number
    groundPlane?: {
      pointA: string
      pointB: string
      pointC: string
    }
  }

  // Statistics for validation
  statistics: {
    worldPointsWithCoordinates: number
    worldPointsWithoutCoordinates: number
    averageImagePointsPerWorldPoint: number
    constraintsByType: Record<string, number>
    imagePointsPerImage: Record<string, number>
  }
}

// Filtered export without image blobs (for server upload)
export interface OptimizationExportDtoFiltered extends Omit<OptimizationExportDto, 'viewpoints'> {
  viewpoints: ViewpointDtoLight[]
}

// Helper to filter out image blobs
export function filterImageBlobs(exportDto: OptimizationExportDto): OptimizationExportDtoFiltered {
  return {
    ...exportDto,
    viewpoints: exportDto.viewpoints.map(vp => ({
      ...vp,
      url: vp.filename // Use filename instead of base64 blob
    }))
  }
}

// Helper to calculate statistics
export function calculateExportStatistics(
  worldPoints: WorldPointDto[],
  lines: LineDto[],
  viewpoints: (ViewpointDto | ViewpointDtoLight)[],
  constraints: ConstraintDto[]
): OptimizationExportDto['statistics'] {
  const worldPointsWithCoordinates = worldPoints.filter(wp =>
    wp.xyz && wp.xyz.some((coord: number | null) => coord !== null)
  ).length

  const worldPointsWithoutCoordinates = worldPoints.length - worldPointsWithCoordinates

  const totalImagePoints = viewpoints.reduce((sum, vp) =>
    sum + Object.keys(vp.imagePoints).length, 0
  )

  const averageImagePointsPerWorldPoint = worldPoints.length > 0
    ? totalImagePoints / worldPoints.length
    : 0

  const constraintsByType: Record<string, number> = {}
  constraints.forEach(c => {
    constraintsByType[c.type] = (constraintsByType[c.type] || 0) + 1
  })

  const imagePointsPerImage: Record<string, number> = {}
  viewpoints.forEach(vp => {
    imagePointsPerImage[vp.id] = Object.keys(vp.imagePoints).length
  })

  return {
    worldPointsWithCoordinates,
    worldPointsWithoutCoordinates,
    averageImagePointsPerWorldPoint,
    constraintsByType,
    imagePointsPerImage
  }
}
