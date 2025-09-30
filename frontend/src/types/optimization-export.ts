// Optimization Export DTOs for Python testing
// This file defines the export format for sending project data to the optimization backend

import type { WorldPointDto } from '../entities/world-point/WorldPointDto'
import type { LineDto } from '../entities/line/LineDto'
import type { CameraDto } from '../entities/camera'
import type { ImageDto, ImagePointDto } from '../entities/image'
import type { ConstraintDto } from '../entities/constraints/base-constraint'

// Lightweight image DTO without base64 blob
export interface ImageDtoLight extends Omit<ImageDto, 'url'> {
  url: string // Just filename or placeholder, not base64 data
}

// Main export structure for optimization
export interface OptimizationExportDto {
  version: string
  exportedAt: string

  // Core entities
  worldPoints: WorldPointDto[]
  lines: LineDto[]
  cameras: CameraDto[]
  images: ImageDto[]
  constraints: ConstraintDto[]

  // Project metadata
  metadata: {
    projectName: string
    projectId: string
    totalWorldPoints: number
    totalLines: number
    totalCameras: number
    totalImages: number
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
export interface OptimizationExportDtoFiltered extends Omit<OptimizationExportDto, 'images'> {
  images: ImageDtoLight[]
}

// Helper to filter out image blobs
export function filterImageBlobs(exportDto: OptimizationExportDto): OptimizationExportDtoFiltered {
  return {
    ...exportDto,
    images: exportDto.images.map(img => ({
      ...img,
      url: img.filename // Use filename instead of base64 blob
    }))
  }
}

// Helper to calculate statistics
export function calculateExportStatistics(
  worldPoints: WorldPointDto[],
  lines: LineDto[],
  images: (ImageDto | ImageDtoLight)[],
  constraints: ConstraintDto[]
): OptimizationExportDto['statistics'] {
  const worldPointsWithCoordinates = worldPoints.filter(wp =>
    wp.xyz && wp.xyz.some(coord => coord !== null)
  ).length

  const worldPointsWithoutCoordinates = worldPoints.length - worldPointsWithCoordinates

  const totalImagePoints = images.reduce((sum, img) =>
    sum + Object.keys(img.imagePoints).length, 0
  )

  const averageImagePointsPerWorldPoint = worldPoints.length > 0
    ? totalImagePoints / worldPoints.length
    : 0

  const constraintsByType: Record<string, number> = {}
  constraints.forEach(c => {
    constraintsByType[c.type] = (constraintsByType[c.type] || 0) + 1
  })

  const imagePointsPerImage: Record<string, number> = {}
  images.forEach(img => {
    imagePointsPerImage[img.id] = Object.keys(img.imagePoints).length
  })

  return {
    worldPointsWithCoordinates,
    worldPointsWithoutCoordinates,
    averageImagePointsPerWorldPoint,
    constraintsByType,
    imagePointsPerImage
  }
}
