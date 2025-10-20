// Image processing utilities for project management

// ViewpointDto is the DTO type used for serialization
import type { ViewpointDto } from '../entities/viewpoint/ViewpointDto'
import type { ViewpointId } from '../types/ids'

export interface ImageLoadResult {
  id: ViewpointId
  name: string
  url: string
  imageWidth: number
  imageHeight: number
}

export class ImageUtils {
  static async loadImageFile(file: File): Promise<ImageLoadResult> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      const img = new Image()

      reader.onload = (e) => {
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')!

          // Resize if too large to save storage space
          const maxSize = 1920
          let { width, height } = img

          if (width > maxSize || height > maxSize) {
            const scale = maxSize / Math.max(width, height)
            width *= scale
            height *= scale
          }

          canvas.width = width
          canvas.height = height
          ctx.drawImage(img, 0, 0, width, height)

          resolve({
            id: crypto.randomUUID() as ViewpointId,
            name: file.name.replace(/\.[^/.]+$/, ''), // Remove file extension
            url: canvas.toDataURL('image/jpeg', 0.8),
            imageWidth: width,
            imageHeight: height
          })
        }

        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = e.target?.result as string
      }

      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  static createThumbnail(imageBlob: string, maxSize: number = 150): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image()

      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!

        // Calculate thumbnail size maintaining aspect ratio
        const scale = Math.min(maxSize / img.width, maxSize / img.height)
        const width = img.width * scale
        const height = img.height * scale

        canvas.width = width
        canvas.height = height
        ctx.drawImage(img, 0, 0, width, height)

        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }

      img.onerror = () => reject(new Error('Failed to create thumbnail'))
      img.src = imageBlob
    })
  }

  static validateImageFile(file: File): { valid: boolean, error?: string } {
    // Check file type
    if (!file.type.startsWith('image/')) {
      return { valid: false, error: 'File must be an image' }
    }

    // Check file size (50MB limit)
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      return { valid: false, error: 'Image file too large (max 50MB)' }
    }

    return { valid: true }
  }

  static getImageDimensions(imageBlob: string): Promise<{ width: number, height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image()

      img.onload = () => {
        resolve({ width: img.width, height: img.height })
      }

      img.onerror = () => reject(new Error('Failed to get image dimensions'))
      img.src = imageBlob
    })
  }
}